/**
 * Ф20 (D1.1): сигнальный лог контура самообучения — .wolf/metrics/session-metrics.jsonl.
 * Append-only, derived/rebuildable (инвариант §9), запись детерминированная, без LLM.
 * Формат: OTEL GenAI-совместимые поля по спеке §2.1 (session_id, gen_ai.*, orchestration.*,
 * outcome); gen_ai.modelID — обязательное поле (PoC#4, §21 п.23; null — модель неизвестна).
 * Документация формата: docs/guide/signal-log.md. Спека:
 * docs/superpowers/specs/2026-08-26-self-learning-design.md §2.1, §2.2.
 *
 * Writer-матрица D1 (M20-07, решение Q3): writer'ы — сами CLI-команды (complain,
 * scaffold, tool expose); `wolf metrics emit` не вводится.
 *
 * P1 D1: identity-поля v2 (event_id, schema_version, run_id, trace_id, parent_span_id,
 * role_level, attempt, task_id, config_hash, prompt_hash, tools) — все опциональные,
 * записи v1 валидны без изменений. Upcast-совместимость (P1 D2): записи без
 * schema_version = v1, поля остаются undefined; писатели переходят на v2 отдельно.
 * Спека: docs/superpowers/specs/2026-09-04-p1-telemetry-identity-design.md.
 */
import {
  appendFileSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { metricsDir } from './project-paths.js';
import { LOCK_TIMING } from './memory-lock.js';
import { classifyError } from '../../domain/error-class.js';
import { loadWolfConfigSync } from './config-file.js';
import { parseRunLog, type RunLogEntry } from '../../domain/tool-economy.js';

export type SignalEventName =
  | 'run'
  | 'complaint'
  | 'delivery'
  | 'tool_error'
  | 'task_evaluated'
  | 'mcp_call'
  | 'memory_stage'
  | 'coord_event';

/**
 * Схема сигнального лога (P0 D6): чтение лога валидируется Zod, неизвестные поля
 * отбрасываются (strip — дефолт zod-object). Тип SignalEvent выводится из схемы.
 */
export const SignalEventSchema = z.object({
  /** ISO8601. */
  ts: z.string(),
  event: z.enum([
    'run',
    'complaint',
    'delivery',
    'tool_error',
    'task_evaluated',
    'mcp_call',
    'memory_stage',
    'coord_event',
  ]),
  session_id: z.string().nullable(),
  /** gen_ai-неймспейс OTEL; modelID — обязательное поле записи (null = неизвестна). */
  gen_ai: z.object({ modelID: z.string().nullable(), agent: z.string().nullable() }),
  orchestration: z.object({ task: z.string().nullable(), actor: z.string() }),
  /** weighted-токены (input + 0.1×cache_read + 5×output) — для run-событий. */
  weighted: z.number().optional(),
  /** M1 (D4): wall-clock длительность прогона, мс (только run-события). */
  duration_ms: z.number().optional(),
  /** M1 (D3): сырые токены прогона (только run-события). */
  tokens: z.object({ input: z.number(), output: z.number(), cache_read: z.number() }).optional(),
  /** M1 (D5): экспериментальные примитивы (arm/task_id пишутся только с experiment). */
  experiment: z
    .object({ id: z.string(), arm: z.enum(['wolf', 'baseline']), task_id: z.string().optional() })
    .optional(),
  /** run: 'ok' | 'exit_<code>'; tool_error: 'error'. */
  outcome: z.string().optional(),
  /** tool_error. */
  tool_name: z.string().optional(),
  /** tool_error: id из classifyError. */
  error_class_id: z.string().optional(),
  // --- P1 D1: identity-поля v2 (все опциональные → записи v1 валидны) ---
  /** Уникальный id события (uuid). Отсутствует в v1-записях. */
  event_id: z.string().optional(),
  /** 2 = схема v2 (identity-поля). Отсутствует = v1 (D2 upcast: поля остаются undefined). */
  schema_version: z.literal(2).optional(),
  /** Идентификатор прогона `wolf run` (uuid) — сквозная цепочка задачи. */
  run_id: z.string().optional(),
  /** Трасса (uuid; `--trace-id` в wolf run) — объединяет раны одной задачи. */
  trace_id: z.string().optional(),
  /** Родительский span (span-модель — P2; поле зарезервировано). */
  parent_span_id: z.string().optional(),
  /** Уровень роли писателя по actor-конвенции; дефолт — поле не пишется. */
  role_level: z.enum(['L0', 'L1', 'L2']).optional(),
  /** Попытка (retry-номер) в рамках run. */
  attempt: z.number().optional(),
  /** Общий id задачи (не только эксперименты; пишется всегда при передаче). */
  task_id: z.string().optional(),
  /** P3 D1: id кампании (`wolf run --campaign` / `task-eval --campaign`); без флага не пишется. */
  campaign_id: z.string().optional(),
  /** sha256(.wolf/config.yaml).slice(0,12) — конфиг-подпись. */
  config_hash: z.string().optional(),
  /** sha256(prompt).slice(0,12) — подпись промпта. */
  prompt_hash: z.string().optional(),
  /** Инструменты прогона (из --tool wolf run). */
  tools: z.array(z.string()).optional(),
  /** Факты события: about/text у жалобы, name/mechanism/target у доставки, message у ошибки. */
  detail: z.record(z.string(), z.unknown()).optional(),
});

export type SignalEvent = z.infer<typeof SignalEventSchema>;

/** Порог паттерна N≥3 — дефолт спеки §2.2/§16; параметр процесса (config.yaml). */
export const DEFAULT_PATTERN_THRESHOLD = 3;

export function metricsLogPath(baseDir: string): string {
  return join(metricsDir(baseDir), 'session-metrics.jsonl');
}

/**
 * Ключ кластеризации Ф21 (детерминированный, O(n)-группировка):
 * tool_error → `tool_name:error_class_id`; complaint/delivery → `тип:цель`;
 * run/task_evaluated → null (контекст-событие, не кластеризуется).
 */
export function signalKey(ev: SignalEvent): string | null {
  if (ev.event === 'tool_error') return `${ev.tool_name ?? 'unknown'}:${ev.error_class_id ?? 'uncategorized'}`;
  if (ev.event === 'complaint') return `complaint:${String(ev.detail?.about ?? 'unknown')}`;
  if (ev.event === 'delivery') return `delivery:${String(ev.detail?.name ?? 'unknown')}`;
  return null;
}

/**
 * Мягкое чтение jsonl: со схемой — Zod-валидация каждой строки
 * (session-metrics.jsonl). Малформ-строки (не-JSON или
 * не прошедшие схему) считаются и пропускаются: лог append-only, битая строка
 * не должна ронять контур.
 */
function readJsonl<T>(
  path: string,
  schema?: z.ZodType<T>
): {
  items: T[];
  malformedLines: number;
  totalLines: number;
} {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return { items: [], malformedLines: 0, totalLines: 0 };
  }
  const items: T[] = [];
  let malformedLines = 0;
  let totalLines = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    totalLines++;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (schema) {
        const res = schema.safeParse(parsed);
        if (!res.success) {
          malformedLines++;
          continue;
        }
        items.push(res.data);
      } else {
        items.push(parsed as T);
      }
    } catch {
      malformedLines++;
    }
  }
  return { items, malformedLines, totalLines };
}

export interface SignalLogStats {
  /** Валидные события в порядке записи. */
  events: SignalEvent[];
  /** Не-JSON строки + строки, не прошедшие схему. */
  malformedLines: number;
  /** Все непустые строки лога. */
  totalLines: number;
}

/** Сигнальный лог со счётчиком малформа (P0 D6: честная статистика аналитики). */
export function readSignalLog(baseDir: string): SignalLogStats {
  const { items, malformedLines, totalLines } = readJsonl(metricsLogPath(baseDir), SignalEventSchema);
  return { events: items, malformedLines, totalLines };
}

/** Все сигналы лога (порядок записи); отсутствующий/битый лог → максимально читаемое. */
export function readSignals(baseDir: string): SignalEvent[] {
  return readSignalLog(baseDir).events;
}

/** P104 (A1): сайдкар счётчиков Ф21 — derived-файл, отсутствующий/битый = rebuild-scan. */
export function signalCountsPath(baseDir: string): string {
  return join(metricsDir(baseDir), 'signal-counts.json');
}

/**
 * Чтение сайдкар-счётчиков; отсутствующий/битый JSON → один полный rebuild-scan лога
 * (единственный O(n)-проход, только на холодном старте). Счёт = валидные keyed-события
 * лога — семантика прежнего O(n)-пересчёта сохранена.
 */
function readSignalCounts(baseDir: string): Map<string, number> {
  try {
    const raw: unknown = JSON.parse(readFileSync(signalCountsPath(baseDir), 'utf-8'));
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      const counts = new Map<string, number>();
      let valid = true;
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
          valid = false;
          break;
        }
        counts.set(k, v);
      }
      if (valid) return counts;
    }
  } catch {
    // отсутствует/битый → rebuild ниже
  }
  const counts = new Map<string, number>();
  for (const s of readSignals(baseDir)) {
    const k = signalKey(s);
    if (k !== null) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/** Атомарная перезапись сайдкара: tmp + rename (читатель не видит половину файла). */
function writeSignalCountsAtomic(baseDir: string, counts: Map<string, number>): void {
  const tmp = join(metricsDir(baseDir), '.signal-counts.json.tmp');
  writeFileSync(tmp, JSON.stringify(Object.fromEntries(counts)));
  renameSync(tmp, signalCountsPath(baseDir));
}

function tryAcquireLock(path: string): boolean {
  try {
    const fd = openSync(path, 'wx');
    writeFileSync(fd, JSON.stringify({ pid: process.pid, ts: Date.now() }));
    closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

function stealStaleLock(path: string, staleMs: number): boolean {
  try {
    const { ts } = JSON.parse(readFileSync(path, 'utf-8')) as { ts?: number };
    const lockTs = Number(ts) || 0;
    if (isNaN(lockTs) || lockTs === 0 || Date.now() - lockTs <= staleMs) return false;
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * ponytail: sync-лок без очереди — appendSignal синхронный, async withMemoryLock
 * (memory-lock.ts) сломал бы контракт writer'ов. Одна попытка acquire, одноразовый
 * steal-stale + повтор, вторая неудача — fail-open: телеметрия не должна блокировать.
 * Потолок: гонка параллельных процессов разрешается fail-open'ом (недосчёт ловит
 * следующий rebuild-scan). Апгрейд: очередь ожидания/Atomics.wait в memory-lock.ts,
 * если появятся реальные contention-сценарии.
 */
function withSyncMemoryLock<T>(dir: string, fn: () => T): T {
  const path = join(dir, '.lock');
  let acquired = tryAcquireLock(path);
  if (!acquired && stealStaleLock(path, LOCK_TIMING.STALE_MS)) acquired = tryAcquireLock(path);
  if (!acquired) return fn();
  try {
    return fn();
  } finally {
    try {
      unlinkSync(path);
    } catch {
      /* already gone */
    }
  }
}

/**
 * Append сигнала + keyed-счётчик Ф21.
 * P104 (A1): инкремент сайдкара signal-counts.json вместо O(n)-пересчёта
 * лога на каждой записи; вся секция под sync-локом metrics-каталога.
 */
export function appendSignal(baseDir: string, ev: SignalEvent): { key: string | null; count: number } {
  mkdirSync(metricsDir(baseDir), { recursive: true });
  const key = signalKey(ev);
  if (key === null) {
    appendFileSync(metricsLogPath(baseDir), JSON.stringify(ev) + '\n');
    return { key: null, count: 0 };
  }
  // ponytail: crash между append строки и перезаписью сайдкара даёт недосчёт до
  // следующего rebuild-scan (сайдкар остаётся валидным JSON) — приемлемо для
  // телеметрии local-first; fsync-журнал если счёт станет money-path.
  return withSyncMemoryLock(metricsDir(baseDir), () => {
    const counts = readSignalCounts(baseDir);
    appendFileSync(metricsLogPath(baseDir), JSON.stringify(ev) + '\n');
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    writeSignalCountsAtomic(baseDir, counts);
    return { key, count };
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Writer (б): `wolf complain` — сигнал жалобы (hot-signal Стюарда). */
export function appendComplaintSignal(
  baseDir: string,
  input: { about: string; text: string; actor: string; objectId: string }
): { key: string | null; count: number } {
  return appendSignal(baseDir, {
    ts: nowIso(),
    event: 'complaint',
    session_id: null,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: input.actor },
    outcome: 'complaint',
    detail: { about: input.about, text: input.text, object_id: input.objectId },
  });
}

/** Writer (в): delivery_event — факт доставки методики/инструмента (scaffold / tool expose;
 * Ф22 — активация draft: доставка через wolf call / trigger_keywords). */
export function appendDeliverySignal(
  baseDir: string,
  input: {
    name: string;
    mechanism: 'skill' | 'frame' | 'plugin' | 'search' | 'call';
    target?: string;
    actor: string;
    detail?: Record<string, unknown>;
    /** Волна 0 0.1: session_id доставки (CLI-канал); дефолт null — как раньше. */
    sessionId?: string | null;
    /** Волна 0 0.1: байты инъекции (detail.injection_bytes; токен-аппроксимация — не-цель). */
    injectionBytes?: number;
  }
): { key: string | null; count: number } {
  return appendSignal(baseDir, {
    ts: nowIso(),
    event: 'delivery',
    session_id: input.sessionId ?? null,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: input.actor },
    outcome: 'delivered',
    detail: {
      name: input.name,
      mechanism: input.mechanism,
      // волна 0 0.1: target ≤200 симв — промпты не утекают в metrics целиком
      ...(input.target ? { target: input.target.slice(0, 200) } : {}),
      ...(input.injectionBytes !== undefined ? { injection_bytes: input.injectionBytes } : {}),
      ...input.detail,
    },
  });
}

/** Волна 0 0.1: args_summary для add (MCP и CLI каналы) — type≤40, title≤80, ключи
 * extra; body в телеметрию никогда не попадает. */
export function addArgsSummary(input: {
  type?: unknown;
  title?: unknown;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    type: String(input.type ?? '').slice(0, 40),
    title: String(input.title ?? '').slice(0, 80),
    extra_keys: Object.keys(input.extra ?? {}),
  };
}

/**
 * P104 (A6): проектная таксономия ошибок — только на error-путях (ок-вызовы телеметрии
 * не платят yaml-parse). Мемоизация loadWolfConfigSync по mtime+size см. config-file.ts.
 */
function projectErrorRules(baseDir: string): readonly { id: string; match: string[] }[] {
  try {
    return loadWolfConfigSync(baseDir)?.errorClassTaxonomy ?? [];
  } catch {
    // битый конфиг — классифицируем дефолтной таблицей
  }
  return [];
}

/**
 * Writer (з): mcp_call — вызов инструмента/команды через MCP или CLI-обёртку
 * (волна 0 0.1). Контекст-событие: signalKey → null, пороги Ф21 не считаются.
 * При input.error — classifyError (проектная таксономия из config.yaml)
 * → detail.error_class_id + detail.error.{message ≤200, code}. Конфиг читается
 * только в error-ветке (P104: sync-yaml-parse убран с горячего пути).
 */
export function appendMcpCallSignal(
  baseDir: string,
  input: {
    tool: string;
    outcome: 'ok' | 'error';
    durationMs: number;
    /** Дефолт 'system:wolf' (MCP); CLI-обёртка передаёт 'user:cli'. */
    actor?: string;
    /** Дефолт null: MCP-канал не сессионируется. */
    sessionId?: string | null;
    detail?: Record<string, unknown>;
    /** При outcome='error': классификация → detail.error_class_id + detail.error. */
    error?: { message: string; code?: string };
  }
): void {
  appendSignal(baseDir, {
    ts: nowIso(),
    event: 'mcp_call',
    session_id: input.sessionId ?? null,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: input.actor ?? 'system:wolf' },
    outcome: input.outcome,
    tool_name: input.tool,
    duration_ms: input.durationMs,
    detail: {
      ...input.detail,
      ...(input.error
        ? {
            error: {
              message: input.error.message.slice(0, 200),
              ...(input.error.code ? { code: input.error.code } : {}),
            },
            error_class_id: classifyError(
              { message: input.error.message, code: input.error.code },
              projectErrorRules(baseDir)
            ),
          }
        : {}),
    },
  });
}

/**
 * Writer (д): task_evaluated (P0 D2) — вердикт по задаче от скорера. Контекст-событие:
 * signalKey → null (как run), пороги Ф21 не считаются. Дефолт scorer='human'
 * задаётся на уровне CLI-команды `wolf task-eval` (P0 D3).
 */
export function appendTaskEvaluatedSignal(
  baseDir: string,
  input: {
    verdict: 'accepted' | 'rejected' | 'partial' | 'inconclusive';
    scorer: 'human' | 'deterministic' | 'llm_judge' | 'hidden_tests';
    sessionId?: string | null;
    taskId?: string;
    /** P3 D1: id кампании (detail.campaign_id); без флага не пишется. */
    campaignId?: string;
    criteriaPassed?: number;
    criteriaTotal?: number;
    criticalFailure?: boolean;
    note?: string;
  }
): { key: string | null; count: number } {
  return appendSignal(baseDir, {
    ts: nowIso(),
    event: 'task_evaluated',
    session_id: input.sessionId ?? null,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: 'user:cli' },
    outcome: 'evaluated',
    detail: {
      verdict: input.verdict,
      scorer: input.scorer,
      ...(input.taskId !== undefined ? { task_id: input.taskId } : {}),
      ...(input.campaignId !== undefined ? { campaign_id: input.campaignId } : {}),
      ...(input.criteriaPassed !== undefined ? { criteria_passed: input.criteriaPassed } : {}),
      ...(input.criteriaTotal !== undefined ? { criteria_total: input.criteriaTotal } : {}),
      ...(input.criticalFailure ? { critical_failure: true } : {}),
      ...(input.note ? { note: input.note } : {}),
    },
  });
}

// --- P2 D1: memory lifecycle события ---

/** Detail memory_stage: стадия жизненного цикла памяти + затронутые объекты. */
export const MemoryStageDetailSchema = z.object({
  stage: z.enum(['retrieved', 'injected', 'cited', 'applied']),
  memory_ids: z.array(z.string()).min(1),
});

/**
 * Writer (е): memory_stage (P2 D1) — стадия жизненного цикла памяти. Контекст-событие:
 * signalKey → null (как run/task_evaluated), пороги Ф21 не считаются. Detail
 * валидируется схемой — parse-ошибка = программная ошибка писателя (бросаем).
 */
export function appendMemoryStageSignal(
  baseDir: string,
  input: {
    stage: 'retrieved' | 'injected' | 'cited' | 'applied';
    memoryIds: string[];
    actor: string;
    sessionId?: string | null;
  }
): { key: string | null; count: number } {
  const detail = MemoryStageDetailSchema.parse({ stage: input.stage, memory_ids: input.memoryIds });
  return appendSignal(baseDir, {
    ts: nowIso(),
    event: 'memory_stage',
    session_id: input.sessionId ?? null,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: input.actor },
    outcome: input.stage,
    detail,
  });
}

// --- run-entries: аналитика исторических run-сигналов ---

/**
 * P1 D4: канонический источник run-метрик — сигнальный лог; исторический
 * .wolf/run-log.jsonl (deprecated) мержится на переходный период.
 * Правило мержа: простая конкатенация [сигнальные run-entries, legacy run-log entries]
 * без dedup: в переходном окне каждый run существует в обоих источниках, дублирование
 * симметрично → медианы инвариантны; счётчики (toolRuns/totalRuns) могут завышаться
 * до выхода из переходного периода (задокументировано в RISKS отчёта P1).
 */
/** run-сигналы → канонические run-entries (tools из v2-поля tools). */
export function runEntriesFromSignals(signals: SignalEvent[]): RunLogEntry[] {
  return signals.flatMap((s) => {
    if (s.event !== 'run') return [];
    return [
      {
        ts: s.ts,
        model: s.gen_ai.modelID ?? undefined,
        agent: s.gen_ai.agent ?? undefined,
        title: s.orchestration.task ?? undefined,
        session: s.session_id ?? undefined,
        weighted: s.weighted,
        tools: s.tools,
        duration_ms: s.duration_ms,
        tokens: s.tokens,
      },
    ];
  });
}

/** Переходный мерж: сигнальный источник + исторический run-log (если файл существует). */
export function mergeRunEntries(signals: SignalEvent[], runLogText: string | null): RunLogEntry[] {
  return [...runEntriesFromSignals(signals), ...parseRunLog(runLogText ?? '')];
}

// --- silent-rules: аналитика доставки ---

/** Окно молчания правила для rule_utilization-дрейфа [ВА] (§16). */
export const SILENT_RULE_WINDOW_SESSIONS = 30;
/** Минимум delivery-событий в логе, чтобы судить об утилизации правил [ВА] (§16). */
export const SILENT_RULE_MIN_DELIVERIES = 20;

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

/** Молчащее правило: доставки были, но нет ни одной за последние 30 сессий
 * (при ≥20 delivery-событий в логе). ponytail: [ВА]-порог rule_utilization
 * <0.5 от baseline упрощён продукт-минимумом до «ноль доставок в окне» —
 * честный апгрейд: baseline-утилизация по delivery-stats (S20-09).
 * Экспортирована для effectiveness-панели (E1.2). */
export function silentRuleIds(signals: SignalEvent[]): { ids: Set<string>; count: number } {
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
