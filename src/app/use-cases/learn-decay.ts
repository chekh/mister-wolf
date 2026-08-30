/**
 * Ф26: decay знаний по ПРОБЕГУ (единица — сессии, не календарь; спека §6, §16).
 * Всё детерминировано по сигнальному логу, без LLM и советов — только факты.
 *
 * Модель: delivery-событие (detail.name = id объекта) = срабатывание —
 * продлевает жизнь (штамп last_triggered_at). Объект, не сработавший TTL
 * сессий, получает review_state 'review_required' — это НЕ lifecycle-переход:
 * статус остаётся active, объект попадает в очередь пересмотра Стюарда
 * (дайджест §2.5). Реактивация: новый delivery после попадания в очередь.
 */
import { readSignals, type SignalEvent } from '../../adapters/fs/session-metrics-log.js';
import { loadWolfConfigSync } from '../../adapters/fs/config-file.js';
import { DEFAULT_ERROR_CLASS_RULES, UNCATEGORIZED_ERROR_CLASS } from '../../domain/error-class.js';
import type { MemoryStore } from '../../ports/memory-store.port.js';
import type { Clock } from '../../ports/clock.port.js';
import type { MemoryObject } from '../../domain/schemas/memory-object-schema.js';

/** TTL [ВА]-дефолты (§16): сессий без срабатывания; core ∞ — не в карте. */
export const DECAY_TTL_DEFAULT: Record<string, number> = {
  'session-summary': 30,
  lesson: 90,
  rule: 90,
  playbook: 90,
  decision: 180,
};

export const DECAY_TYPES = Object.keys(DECAY_TTL_DEFAULT);

/** Окно молчания правила для rule_utilization-дрейфа [ВА] (§16). */
const SILENT_RULE_WINDOW_SESSIONS = 30;
/** Минимум delivery-событий в логе, чтобы судить об утилизации правил [ВА] (§16). */
const SILENT_RULE_MIN_DELIVERIES = 20;

/**
 * Пробег = упорядоченные уникальные session_id из run-событий
 * (порядок первого появления в логе = хронология).
 */
export function countSessions(signals: SignalEvent[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ev of signals) {
    if (ev.event !== 'run' || ev.session_id === null) continue;
    if (!seen.has(ev.session_id)) {
      seen.add(ev.session_id);
      out.push(ev.session_id);
    }
  }
  return out;
}

/** ts первого run-события каждой сессии (точка отсчёта «сессия началась»). */
function sessionFirstRunTs(signals: SignalEvent[]): Map<string, string> {
  const first = new Map<string, string>();
  for (const ev of signals) {
    if (ev.event !== 'run' || ev.session_id === null) continue;
    if (!first.has(ev.session_id)) first.set(ev.session_id, ev.ts);
  }
  return first;
}

/** ts последнего delivery-события с detail.name === objectId (срабатывание); null — доставок нет. */
export function lastDeliveryTs(objectId: string, signals: SignalEvent[]): string | null {
  let last: string | null = null;
  for (const ev of signals) {
    if (ev.event === 'delivery' && ev.detail?.name === objectId) {
      if (last === null || ev.ts > last) last = ev.ts;
    }
  }
  return last;
}

/**
 * Пробег объекта: число сессий, чей ПЕРВЫЙ run-эvent имеет ts позже
 * (последней доставки ?? created_at). Нет доставок и сессий после
 * created_at → 0.
 */
export function sessionsSinceTrigger(object: Pick<MemoryObject, 'id' | 'created_at'>, signals: SignalEvent[]): number {
  const since = lastDeliveryTs(object.id, signals) ?? object.created_at;
  let n = 0;
  for (const ts of sessionFirstRunTs(signals).values()) {
    if (ts > since) n += 1;
  }
  return n;
}

/** Эффективный TTL: override из config learning.decay_ttl[type] ?? дефолт (§16); ∞ → Infinity. */
export function effectiveTtl(type: string, overrides?: Record<string, number>): number {
  if (type in DECAY_TTL_DEFAULT === false) return Infinity;
  return overrides?.[type] ?? DECAY_TTL_DEFAULT[type];
}

function decayTtlOverrides(baseDir: string): Record<string, number> | undefined {
  try {
    return loadWolfConfigSync(baseDir)?.learning?.decayTtl;
  } catch {
    return undefined; // битый конфиг — честно дефолты
  }
}

/** Молчащее правило: доставки были, но нет ни одной за последние 30 сессий
 * (при ≥20 delivery-событий в логе). ponytail: [ВА]-порог rule_utilization
 * <0.5 от baseline упрощён продукт-минимумом до «ноль доставок в окне» —
 * честный апгрейд: baseline-утилизация по delivery-stats (S20-09). */
function silentRuleIds(signals: SignalEvent[]): { ids: Set<string>; count: number } {
  const deliveries = signals.filter((s) => s.event === 'delivery');
  if (deliveries.length < SILENT_RULE_MIN_DELIVERIES) return { ids: new Set(), count: 0 };
  const sessions = countSessions(signals);
  if (sessions.length <= SILENT_RULE_WINDOW_SESSIONS) return { ids: new Set(), count: 0 };
  // граница окна: первый run сессии, открывающей последние 30
  const firstRun = sessionFirstRunTs(signals);
  const boundarySession = sessions[sessions.length - SILENT_RULE_WINDOW_SESSIONS]!;
  const boundaryTs = firstRun.get(boundarySession)!;
  const lastByObject = new Map<string, string>();
  for (const ev of deliveries) {
    const name = ev.detail?.name;
    if (typeof name !== 'string') continue;
    const cur = lastByObject.get(name);
    if (cur === undefined || ev.ts > cur) lastByObject.set(name, ev.ts);
  }
  const ids = new Set<string>();
  for (const [name, ts] of lastByObject) {
    if (ts < boundaryTs) ids.add(name);
  }
  return { ids, count: ids.size };
}

export interface DecayRunResult {
  /** Переведены в review_required по TTL в этом прогоне. */
  marked: number;
  /** Реактивировано (review_required → accepted после новой доставки) в этом прогоне. */
  reactivations: number;
  /** Правила, переведённые в review_required по rule_utilization-дрейфу. */
  silentRulesMarked: number;
  dryRun: boolean;
}

/**
 * Decay-прогон (фоновая часть `wolf learn digest`/`status`, без демона):
 * для каждого active-объекта decay-типов — пробег с последнего срабатывания;
 * при ≥ TTL → review_required (статус остаётся active, спека §6).
 * last_triggered_at — derived-кэш из лога доставок.
 */
export async function runDecayPass(
  deps: { store: MemoryStore; clock: Clock },
  baseDir: string,
  opts?: { dryRun?: boolean }
): Promise<DecayRunResult> {
  const signals = readSignals(baseDir);
  const overrides = decayTtlOverrides(baseDir);
  const dryRun = opts?.dryRun === true;
  let marked = 0;
  let reactivations = 0;

  const touched = new Set<string>();
  for (const type of DECAY_TYPES) {
    const objects = await deps.store.list({ type, status: 'active' });
    for (const obj of objects) {
      const rec = obj as Record<string, unknown>;
      const lastTrig = lastDeliveryTs(obj.id, signals);
      const n = sessionsSinceTrigger(obj, signals);
      const cachedLast = typeof rec.last_triggered_at === 'string' ? rec.last_triggered_at : undefined;

      if (obj.review_state === 'review_required') {
        // Реактивация: после попадания в очередь была новая доставка
        const hasNewDelivery = lastTrig !== null && (cachedLast === undefined || lastTrig > cachedLast);
        if (hasNewDelivery) {
          if (!dryRun) {
            await deps.store.update(obj.id, {
              review_state: 'accepted',
              sessions_since_last_trigger: n,
              last_triggered_at: lastTrig,
              // удаление: js-yaml пропускает undefined-ключи при dump
              decay_reason: undefined,
            } as Partial<MemoryObject>);
          }
          reactivations += 1;
        } else {
          const patch: Record<string, unknown> = {};
          if (rec.sessions_since_last_trigger !== n) patch.sessions_since_last_trigger = n;
          if (lastTrig !== null && lastTrig !== cachedLast) patch.last_triggered_at = lastTrig;
          if (!dryRun && Object.keys(patch).length > 0) {
            await deps.store.update(obj.id, patch as Partial<MemoryObject>);
          }
        }
        touched.add(obj.id);
        continue;
      }

      if (n >= effectiveTtl(type, overrides)) {
        if (!dryRun) {
          await deps.store.update(obj.id, {
            review_state: 'review_required',
            sessions_since_last_trigger: n,
            decay_reason: 'ttl',
            ...(lastTrig !== null ? { last_triggered_at: lastTrig } : {}),
          } as Partial<MemoryObject>);
        }
        marked += 1;
        touched.add(obj.id);
      }
    }
  }

  // Досрочный review: молчащие правила (rule_utilization-дрейф, §6/§16)
  let silentRulesMarked = 0;
  const { ids: silent } = silentRuleIds(signals);
  if (silent.size > 0) {
    const rules = await deps.store.list({ type: 'rule', status: 'active' });
    for (const rule of rules) {
      if (!silent.has(rule.id) || touched.has(rule.id)) continue;
      const lastTrig = lastDeliveryTs(rule.id, signals);
      if (!dryRun) {
        await deps.store.update(rule.id, {
          review_state: 'review_required',
          sessions_since_last_trigger: sessionsSinceTrigger(rule, signals),
          ...(lastTrig !== null ? { last_triggered_at: lastTrig } : {}),
          decay_reason: 'rule_utilization',
        } as Partial<MemoryObject>);
      }
      silentRulesMarked += 1;
    }
  }

  return { marked, reactivations, silentRulesMarked, dryRun };
}

export interface DecayStatus {
  /** Очередь пересмотра Стюарда: active-объекты в review_required. */
  reviewQueue: Array<{ id: string; type: string; sessions: number; reason: string }>;
  indicators: {
    /** Доля review_required среди active-объектов decay-типов. */
    decayShare: number;
    /** Объекты в очереди с новой доставкой — следующий прогон реактивирует. */
    reactivations: number;
    /** error_class_id из tool_error-событий вне проектной и дефолтной таксономий. */
    newErrorClasses: string[];
    /** Молчащие правила (ноль доставок за окно 30 сессий при ≥20 delivery). */
    silentRules: number;
  };
}

/** Drift-индикаторы и очередь пересмотра (только факты, без LLM; §6 + Ф26). */
export async function decayStatus(deps: { store: MemoryStore; clock: Clock }, baseDir: string): Promise<DecayStatus> {
  const signals = readSignals(baseDir);
  const lastTrigById = new Map<string, string>();
  for (const ev of signals) {
    if (ev.event === 'delivery' && typeof ev.detail?.name === 'string') {
      const cur = lastTrigById.get(ev.detail.name);
      if (cur === undefined || ev.ts > cur) lastTrigById.set(ev.detail.name, ev.ts);
    }
  }

  const reviewQueue: DecayStatus['reviewQueue'] = [];
  let activeTotal = 0;
  let reactivations = 0;
  for (const type of DECAY_TYPES) {
    const objects = await deps.store.list({ type, status: 'active' });
    activeTotal += objects.length;
    for (const obj of objects) {
      const rec = obj as Record<string, unknown>;
      const cachedLast = typeof rec.last_triggered_at === 'string' ? rec.last_triggered_at : undefined;
      const lastTrig = lastTrigById.get(obj.id);
      // pending-реактивация: та же детекция, что в runDecayPass (новая доставка после кэша)
      if (
        obj.review_state === 'review_required' &&
        lastTrig !== undefined &&
        (cachedLast === undefined || lastTrig > cachedLast)
      ) {
        reactivations += 1;
      }
      if (obj.review_state !== 'review_required') continue;
      reviewQueue.push({
        id: obj.id,
        type,
        sessions: sessionsSinceTrigger(obj, signals),
        reason: typeof rec.decay_reason === 'string' ? rec.decay_reason : 'unknown',
      });
    }
  }

  const knownClasses = new Set<string>(DEFAULT_ERROR_CLASS_RULES.map((r) => r.id));
  try {
    for (const r of loadWolfConfigSync(baseDir)?.errorClassTaxonomy ?? []) knownClasses.add(r.id);
  } catch {
    // битый конфиг — дефолтная таблица
  }
  const newErrorClasses = new Set<string>();
  for (const ev of signals) {
    if (ev.event !== 'tool_error') continue;
    const cls = ev.error_class_id ?? UNCATEGORIZED_ERROR_CLASS;
    // uncategorized — известный резервный класс (D2-Refiner), не «новый»
    if (cls !== UNCATEGORIZED_ERROR_CLASS && !knownClasses.has(cls)) newErrorClasses.add(cls);
  }

  return {
    reviewQueue,
    indicators: {
      decayShare: activeTotal > 0 ? reviewQueue.length / activeTotal : 0,
      reactivations,
      newErrorClasses: [...newErrorClasses].sort(),
      silentRules: silentRuleIds(signals).count,
    },
  };
}
