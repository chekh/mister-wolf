/**
 * E1.2: `wolf effectiveness` — сводная панель эффективности памяти по пробегу.
 * Только агрегация существующих данных (store, relations, event-log, signals,
 * run-log), без LLM и без выдуманных чисел: мало данных → null → панель печатает n/a.
 *
 * Методика шума: docs/planning/memory-audit-2026-08-29.md «пишется-но-не-читается» —
 * объект шум, если нет ни одной связи (relations) и ни одного события в event-log
 * кроме memory.added; memory.scan.updated = подтверждение актуальности сканом =
 * использование. Объекты document-ref — функциональный «индекс документов»
 * (использование = регистрация/обновление сканом), исключены из метрики шума
 * и показываются отдельной строкой documents (калибровка 2026-08-30).
 * Пороги статусов — config learning.effectiveness_thresholds.
 */
import type { MemoryStore } from '../../ports/memory-store.port.js';
import type { EventLog } from '../../ports/event-log.port.js';
import type { RelationLog } from '../../ports/relation-log.port.js';
import type { SignalEvent } from '../../adapters/fs/session-metrics-log.js';
import type { EconomyResult } from '../../domain/tool-economy.js';
import { median, parseRunLog } from '../../domain/tool-economy.js';
import { toolStats } from './tool-stats.js';
import {
  countSessions,
  silentRuleIds,
  SILENT_RULE_MIN_DELIVERIES,
  SILENT_RULE_WINDOW_SESSIONS,
} from './learn-decay.js';

/** Пороги статусов панели (проценты). */
export interface EffectivenessThresholds {
  noiseOk: number;
  noiseWarn: number;
  silentOk: number;
}

export const DEFAULT_EFFECTIVENESS_THRESHOLDS: EffectivenessThresholds = {
  noiseOk: 20,
  noiseWarn: 40,
  silentOk: 30,
};

export type BlockStatus = 'OK' | 'WARN' | 'BAD' | 'NO_DATA';

/** Шум: null → NO_DATA; <noiseOk → OK; <=noiseWarn → WARN; иначе BAD. */
export function classifyNoise(share: number | null, t: EffectivenessThresholds): BlockStatus {
  if (share === null) return 'NO_DATA';
  if (share < t.noiseOk) return 'OK';
  return share <= t.noiseWarn ? 'WARN' : 'BAD';
}

/** Молчащие правила: null → NO_DATA; <silentOk → OK; иначе BAD. */
export function classifySilent(share: number | null, t: EffectivenessThresholds): BlockStatus {
  if (share === null) return 'NO_DATA';
  return share < t.silentOk ? 'OK' : 'BAD';
}

/** Override из config поверх дефолтов (E1.2); битые/чужие поля отбрасываются схемой. */
export function resolveThresholds(override?: Partial<EffectivenessThresholds>): EffectivenessThresholds {
  return { ...DEFAULT_EFFECTIVENESS_THRESHOLDS, ...override };
}

export interface EffectivenessReport {
  /** Блок 1: правила (информативный). prevented/checked — null при отсутствии holdout-данных (Ф22). */
  rules: { activeRules: number; prevented: number | null; checked: number | null };
  /** Блок 2: инструменты (информационный). */
  tools: { toolCount: number; totalUsage: number; economy: EconomyResult };
  /** Блок 3: доставка→срабатывание. */
  delivery: {
    deliveryEvents: number;
    triggeredObjects: number;
    activeRules: number;
    silentRules: number;
    /** false — окно молчания ещё не набралось (мало пробега), silentShare = null. */
    enoughDeliveryData: boolean;
    /** null — мало delivery-данных (окно silentRuleIds) или нет активных правил. */
    silentShare: number | null;
  };
  /** Блок 4: шум памяти («пишется-но-не-читается»); documents — document-ref, исключённые из метрики. */
  noise: { totalObjects: number; writeOnly: number; share: number | null; documents: number };
  noiseStatus: BlockStatus;
  silentStatus: BlockStatus;
  /** Блок 5: роутинг по моделям (информационный); сортировка по tasks убыв. */
  routing: Array<{ model: string; tasks: number; medianWeighted: number | null }>;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Пять блоков отчёта из одних портов: чистая агрегация, детерминированная.
 * Не падает на пустой памяти — все блоки возвращают нули/null.
 */
export async function buildEffectivenessReport(
  deps: { store: MemoryStore; log: EventLog; relations: RelationLog },
  input: { signals: SignalEvent[]; runLogText: string | null; thresholds: EffectivenessThresholds }
): Promise<EffectivenessReport> {
  // Блок 1 «Правила»: активные + суммы holdout-полей Ф22 по rule/lesson (все статусы)
  const activeRuleObjects = await deps.store.list({ type: 'rule', status: 'active' });
  const activeRules = activeRuleObjects.length;
  let prevented = 0;
  let checked = 0;
  let hasHoldoutData = false;
  for (const type of ['rule', 'lesson'] as const) {
    for (const o of await deps.store.list({ type })) {
      const rec = o as Record<string, unknown>;
      const p = finiteNumber(rec.holdout_prevented);
      const c = finiteNumber(rec.holdout_checked);
      if (p !== null || c !== null) hasHoldoutData = true;
      prevented += p ?? 0;
      checked += c ?? 0;
    }
  }

  // Блок 2 «Инструменты»: реестр + экономика (переиспользуем toolStats, включая
  // honest-fallback при runLogText === null)
  const { tools: toolRows, economy } = await toolStats({ store: deps.store }, { runLogText: input.runLogText });

  // Блок 3 «Доставка→срабатывание»: сигнальный лог + окно молчания из learn-decay
  const deliveries = input.signals.filter((s) => s.event === 'delivery');
  const triggered = new Set<string>();
  for (const ev of deliveries) {
    if (typeof ev.detail?.name === 'string') triggered.add(ev.detail.name);
  }
  const silent = silentRuleIds(input.signals);
  // то же пре-условие, что внутри silentRuleIds (ранний выход при малом пробеге):
  // count=0 в этом случае — «не знаем», а не «нет молчащих»
  const sessions = countSessions(input.signals).length;
  const enoughDeliveryData = deliveries.length >= SILENT_RULE_MIN_DELIVERIES && sessions > SILENT_RULE_WINDOW_SESSIONS;
  // silentRuleIds возвращает ВСЕ молчащие delivery-имена (любой тип — call-injection,
  // lesson и т.д.); делим только на правила и считаем только правила (прецедент:
  // runDecayPass фильтрует по active rules) — иначе доля могла бы превысить 100%
  const activeRuleIds = new Set(activeRuleObjects.map((o) => o.id));
  const silentRules = [...silent.ids].filter((id) => activeRuleIds.has(id)).length;
  const silentShare = enoughDeliveryData && activeRules > 0 ? (silentRules / activeRules) * 100 : null;

  // Блок 4 «Шум памяти»: нет связей И нет событий кроме memory.added (event-log).
  // document-ref — функциональный «индекс документов» (использование = регистрация/
  // обновление сканом), из метрики шума исключён и из числителя, и из знаменателя
  // (калибровка 2026-08-30); показывается отдельной строкой documents.
  // memory.scan.updated = подтверждение актуальности = использование: readIds-фильтр
  // («любое событие кроме memory.added») засчитывает scan-события автоматически.
  const allObjects = await deps.store.list();
  const documents = allObjects.filter((o) => o.type === 'document-ref').length;
  const noiseBase = allObjects.filter((o) => o.type !== 'document-ref');
  const linked = new Set<string>();
  for (const r of await deps.relations.list()) {
    linked.add(r.subject);
    linked.add(r.object);
  }
  const readIds = new Set<string>();
  for (const ev of await deps.log.readAll()) {
    if (ev.type === 'memory.added') continue;
    const mid = (ev.payload as Record<string, unknown> | undefined)?.memory_id;
    if (typeof mid === 'string') readIds.add(mid);
  }
  const writeOnly = noiseBase.filter((o) => !linked.has(o.id) && !readIds.has(o.id)).length;
  const noiseShare = noiseBase.length > 0 ? (writeOnly / noiseBase.length) * 100 : null;

  // Блок 5 «Роутинг»: группировка run-log по model, медиана weighted (медианы переиспользуем)
  const weightedByModel = new Map<string, number[]>();
  for (const entry of parseRunLog(input.runLogText ?? '')) {
    const w = finiteNumber(entry.weighted);
    if (w === null) continue;
    const model = typeof entry.model === 'string' && entry.model !== '' ? entry.model : 'unknown';
    const arr = weightedByModel.get(model) ?? [];
    arr.push(w);
    weightedByModel.set(model, arr);
  }
  const routing = [...weightedByModel.entries()]
    .map(([model, values]) => ({ model, tasks: values.length, medianWeighted: median(values) }))
    .sort((a, b) => b.tasks - a.tasks || a.model.localeCompare(b.model));

  const noise = { totalObjects: noiseBase.length, writeOnly, share: noiseShare, documents };
  return {
    rules: { activeRules, prevented: hasHoldoutData ? prevented : null, checked: hasHoldoutData ? checked : null },
    tools: { toolCount: toolRows.length, totalUsage: toolRows.reduce((sum, r) => sum + r.usage_count, 0), economy },
    delivery: {
      deliveryEvents: deliveries.length,
      triggeredObjects: triggered.size,
      activeRules,
      silentRules,
      enoughDeliveryData,
      silentShare,
    },
    noise,
    noiseStatus: classifyNoise(noiseShare, input.thresholds),
    silentStatus: classifySilent(silentShare, input.thresholds),
    routing,
  };
}
