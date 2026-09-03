/**
 * M5 (ядро L2): `wolf analytics` — реестры и воронка (Q1–Q4, Q6, Q8, Q10–Q12).
 * Чистая детерминированная агрегация store + signals + event-log + run-log, без LLM.
 * Дизайн: docs/superpowers/specs/2026-09-03-analytics-metrics-dashboard-design.md §5 M5, §6.2.
 */
import type { MemoryStore } from '../../ports/memory-store.port.js';
import type { EventLog } from '../../ports/event-log.port.js';
import type { Clock } from '../../ports/clock.port.js';
import type { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import type { MemoryEvent } from '../../domain/schemas/memory-event-schema.js';
import { DEFAULT_PATTERN_THRESHOLD, type SignalEvent } from '../../adapters/fs/session-metrics-log.js';
import { parseRunLog } from '../../domain/tool-economy.js';
import { UNCATEGORIZED_ERROR_CLASS } from '../../domain/error-class.js';
import { silentRuleIds } from './learn-decay.js';
import type { PricingTable } from '../../domain/pricing.js';

// ---------------------------------------------------------------------------
// Контракт отчёта (сквозной для задач 6–11: меняется ТОЛЬКО в задаче 6)
// ---------------------------------------------------------------------------

export interface LifecycleThresholds {
  newDays: number;
  workhorseUses: number;
}

export const DEFAULT_LIFECYCLE_THRESHOLDS: LifecycleThresholds = { newDays: 14, workhorseUses: 3 };

/** Override из config (analytics.thresholds) поверх дефолтов (D7). */
export function resolveLifecycleThresholds(override?: Partial<LifecycleThresholds>): LifecycleThresholds {
  return { ...DEFAULT_LIFECYCLE_THRESHOLDS, ...override };
}

export type LifecycleClass = 'new' | 'sleeper' | 'workhorse' | 'dead';

/** uses >= workhorseUses → workhorse; 1..workhorseUses-1 → sleeper; 0 && ageDays <= newDays → new; иначе dead. */
export function classifyLifecycle(uses: number, ageDays: number, t: LifecycleThresholds): LifecycleClass {
  if (uses >= t.workhorseUses) return 'workhorse';
  if (uses >= 1) return 'sleeper';
  return ageDays <= t.newDays ? 'new' : 'dead';
}

export interface MemoryLedgerRow {
  id: string;
  type: string;
  title: string;
  status: string;
  created_at: string;
  age_days: number;
  deliveries: number;
  triggers: number;
  complaints: number;
  holdout_prevented: number | null;
  holdout_checked: number | null;
  last_used: string | null;
  lifecycle: LifecycleClass;
}

export interface GarbageStats {
  dead: number;
  base: number;
  ratioPct: number | null;
}

export interface ToolLedgerRow {
  name: string;
  origin: 'script' | 'model-native';
  id: string | null;
  status: string | null;
  usageCount: number;
  lastUsedAt: string | null;
  errorCount: number;
  errorClasses: { id: string; count: number }[];
  promotion: 'expose-candidate' | 'register-candidate' | null;
}

export interface RuleRankingRow {
  id: string;
  title: string;
  status: string;
  prevented: number;
  checked: number | null;
  silent: boolean;
}

export interface FunnelWeek {
  week: string;
  writes: number;
  delivers: number;
  triggers: number;
  writeToDeliverPct: number | null;
  deliverToTriggerPct: number | null;
}

export interface OutlierRun {
  ts: string | null;
  model: string | null;
  agent: string | null;
  title: string | null;
  weighted: number;
  costUsd: number | null;
  tools: string[];
}

export interface AgentLedgerRow {
  agent: string;
  runs: number;
  failures: number;
  failureRatePct: number | null;
  weighted: number;
  avgDurationMs: number | null;
  costUsd: number | null;
  toolErrors: number;
  complaintsBy: number;
  complaintsAbout: number;
  successes: number;
  holdoutPrevented: number | null;
}

export interface StewardView {
  mutations: { kind: string; count: number }[];
  mutationsByWeek: { week: string; total: number }[];
  complaintFunnel: {
    filed: number;
    resolved: number;
    rejected: number;
    avgLifetimeHours: number | null;
    slaEscalations: number;
  };
  recidivismCount: number;
  churnIds: string[];
  autoMutationSharePct: number | null;
}

export interface ExperimentReadiness {
  totalRuns: number;
  withArm: number;
  withArmPct: number | null;
  byArm: { arm: string; runs: number }[];
  byExperiment: { experiment: string; runs: number }[];
}

export interface AnalyticsReport {
  generatedAt: string;
  thresholds: LifecycleThresholds;
  memory: { rows: MemoryLedgerRow[]; garbage: GarbageStats };
  tools: ToolLedgerRow[];
  rules: RuleRankingRow[];
  funnel: FunnelWeek[];
  outliers: OutlierRun[];
  agents: AgentLedgerRow[];
  steward: StewardView;
  readiness: ExperimentReadiness;
}

export interface AnalyticsDeps {
  store: MemoryStore;
  log: EventLog;
  clock: Clock;
}

export interface AnalyticsInput {
  signals: SignalEvent[];
  runLogText: string | null;
  thresholds?: Partial<LifecycleThresholds>;
  patternThreshold?: number;
  weeks?: number;
  topOutliers?: number;
  pricing?: PricingTable;
}

// ---------------------------------------------------------------------------
// Внутренние хелперы
// ---------------------------------------------------------------------------

/** Passthrough-поля MemoryObject — читаем кастом, NaN/Infinity отбрасываем (прецедент effectiveness). */
function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Memory ledger (Q1/Q2): per-object след использования + lifecycle-класс D7. */
function buildMemoryLedger(
  objects: MemoryObject[],
  events: MemoryEvent[],
  signals: SignalEvent[],
  now: Date,
  t: LifecycleThresholds
): AnalyticsReport['memory'] {
  const rows: MemoryLedgerRow[] = [];
  for (const o of objects) {
    // база: активная память минус archived и document-ref (прецедент noise-метрики)
    if (o.status === 'archived' || o.type === 'document-ref') continue;
    const rec = o as Record<string, unknown>;
    // tool-доставки пишутся по полю name (ToolFields), не по id объекта
    const toolName = o.type === 'tool' && typeof rec.name === 'string' ? rec.name : null;

    let lastUsed: string | null = null;
    const bump = (ts: string | null): void => {
      if (ts !== null && (lastUsed === null || ts > lastUsed)) lastUsed = ts;
    };

    // доставки: delivery-сигналы по detail.name === id (или tool-name)
    let deliveries = 0;
    for (const s of signals) {
      if (s.event !== 'delivery') continue;
      const name = s.detail?.name;
      if (name === o.id || (toolName !== null && name === toolName)) {
        deliveries += 1;
        bump(s.ts);
      }
    }
    // срабатывания: любое событие кроме memory.added с payload.memory_id === id (прецедент readIds)
    let triggers = 0;
    for (const ev of events) {
      if (ev.type === 'memory.added') continue;
      const mid = (ev.payload as Record<string, unknown> | undefined)?.memory_id;
      if (mid === o.id) {
        triggers += 1;
        bump(ev.timestamp);
      }
    }
    // жалобы: complaint-сигналы по detail.object_id
    let complaints = 0;
    for (const s of signals) {
      if (s.event === 'complaint' && s.detail?.object_id === o.id) {
        complaints += 1;
        bump(s.ts);
      }
    }
    // у tool-объектов last_used_at пишется использованием (ToolFields)
    if (toolName !== null && typeof rec.last_used_at === 'string') bump(rec.last_used_at);

    const ageDays = Math.floor((now.getTime() - Date.parse(o.created_at)) / 86_400_000);
    const uses = deliveries + triggers;
    rows.push({
      id: o.id,
      type: o.type,
      title: o.title,
      status: o.status,
      created_at: o.created_at,
      age_days: ageDays,
      deliveries,
      triggers,
      complaints,
      holdout_prevented: finiteNumber(rec.holdout_prevented),
      holdout_checked: finiteNumber(rec.holdout_checked),
      last_used: lastUsed,
      lifecycle: classifyLifecycle(uses, ageDays, t),
    });
  }
  const dead = rows.filter((r) => r.lifecycle === 'dead').length;
  const base = rows.length;
  return { rows, garbage: { dead, base, ratioPct: base > 0 ? (dead / base) * 100 : null } };
}

/** Каст tool-полей реестра (ToolFields в tool-librarian.ts): name — ключ lookup'а. */
function toolNameOf(o: MemoryObject): string | null {
  const rec = o as Record<string, unknown>;
  return o.type === 'tool' && typeof rec.name === 'string' && rec.name !== '' ? rec.name : null;
}

/** Tool ledger (Q3, D11): script = объекты type:'tool'; model-native = имена из логов минус script. */
function buildToolLedger(
  toolObjects: MemoryObject[],
  signals: SignalEvent[],
  runLogText: string | null,
  patternThreshold: number
): ToolLedgerRow[] {
  // ошибки по имени тула: tool_error-сигналы, группа по error_class_id
  const errorsByName = new Map<string, { count: number; classes: Map<string, number> }>();
  for (const ev of signals) {
    if (ev.event !== 'tool_error' || typeof ev.tool_name !== 'string') continue;
    const tally = errorsByName.get(ev.tool_name) ?? { count: 0, classes: new Map<string, number>() };
    tally.count += 1;
    const cls = ev.error_class_id ?? UNCATEGORIZED_ERROR_CLASS;
    tally.classes.set(cls, (tally.classes.get(cls) ?? 0) + 1);
    errorsByName.set(ev.tool_name, tally);
  }
  const errorRow = (name: string): { errorCount: number; errorClasses: { id: string; count: number }[] } => {
    const tally = errorsByName.get(name);
    if (tally === undefined) return { errorCount: 0, errorClasses: [] };
    return {
      errorCount: tally.count,
      errorClasses: [...tally.classes.entries()]
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
    };
  };

  const rows: ToolLedgerRow[] = [];
  const scriptNames = new Set<string>();

  // script-ряды: реестр type:'tool' (каст ToolFields — прецедент tool-stats)
  for (const o of toolObjects) {
    const rec = o as Record<string, unknown>;
    const name = toolNameOf(o) ?? o.title;
    scriptNames.add(name);
    const usageCount = typeof rec.usage_count === 'number' ? rec.usage_count : 0;
    rows.push({
      name,
      origin: 'script',
      id: o.id,
      status: o.status,
      usageCount,
      lastUsedAt: typeof rec.last_used_at === 'string' ? rec.last_used_at : null,
      ...errorRow(name),
      promotion: o.status === 'candidate' && usageCount >= patternThreshold ? 'expose-candidate' : null,
    });
  }

  // model-native: имена из tool_error-сигналов ∪ run-log tools[], минус зарегистрированные script
  const nativeCounts = new Map<string, number>();
  const bumpNative = (name: string): void => {
    nativeCounts.set(name, (nativeCounts.get(name) ?? 0) + 1);
  };
  for (const ev of signals) {
    if (ev.event === 'tool_error' && typeof ev.tool_name === 'string') bumpNative(ev.tool_name);
  }
  for (const entry of parseRunLog(runLogText ?? '')) {
    for (const name of entry.tools ?? []) bumpNative(name);
  }
  for (const [name, usageCount] of nativeCounts) {
    if (scriptNames.has(name)) continue;
    rows.push({
      name,
      origin: 'model-native',
      id: null,
      status: null,
      usageCount,
      lastUsedAt: null,
      ...errorRow(name),
      promotion: usageCount >= patternThreshold ? 'register-candidate' : null,
    });
  }

  // сортировка: script первым, потом usageCount убыв., потом имя
  return rows.sort((a, b) => {
    if (a.origin !== b.origin) return a.origin === 'script' ? -1 : 1;
    return b.usageCount - a.usageCount || a.name.localeCompare(b.name);
  });
}

/** Rule ranking (Q4): все статусы; prevented из holdout_prevented; silent от silentRuleIds. */
function buildRuleRanking(ruleObjects: MemoryObject[], signals: SignalEvent[]): RuleRankingRow[] {
  const silent = silentRuleIds(signals).ids;
  return ruleObjects
    .map((o) => {
      const rec = o as Record<string, unknown>;
      return {
        id: o.id,
        title: o.title,
        status: o.status,
        prevented: finiteNumber(rec.holdout_prevented) ?? 0,
        checked: finiteNumber(rec.holdout_checked),
        silent: silent.has(o.id),
      };
    })
    .sort((a, b) => b.prevented - a.prevented || Number(a.silent) - Number(b.silent) || a.id.localeCompare(b.id));
}

/** Нулевой steward-view (задача 8 заменит расчётом). */
function emptyStewardView(): StewardView {
  return {
    mutations: [],
    mutationsByWeek: [],
    complaintFunnel: { filed: 0, resolved: 0, rejected: 0, avgLifetimeHours: null, slaEscalations: 0 },
    recidivismCount: 0,
    churnIds: [],
    autoMutationSharePct: null,
  };
}

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

/**
 * Полный аналитический отчёт M5 из трёх портов: чистая агрегация, детерминированная.
 * Не падает на пустой памяти — все блоки возвращают нули/null/пустые массивы.
 */
export async function buildAnalyticsReport(deps: AnalyticsDeps, input: AnalyticsInput): Promise<AnalyticsReport> {
  const thresholds = resolveLifecycleThresholds(input.thresholds);
  const now = deps.clock.now();
  // ponytail: store.list() — полный reparse всех md; ровно один вызов на отчёт (прецедент generateInsights)
  const allObjects = await deps.store.list();
  const events = await deps.log.readAll();

  const memory = buildMemoryLedger(allObjects, events, input.signals, now, thresholds);
  const tools = buildToolLedger(
    allObjects.filter((o) => o.type === 'tool'),
    input.signals,
    input.runLogText,
    input.patternThreshold ?? DEFAULT_PATTERN_THRESHOLD
  );
  const rules = buildRuleRanking(
    allObjects.filter((o) => o.type === 'rule'),
    input.signals
  );

  return {
    generatedAt: now.toISOString(),
    thresholds,
    memory,
    tools,
    rules,
    funnel: [], // задача 8: воронка по неделям (Q6)
    outliers: [], // задача 8: top-N дорогих прогонов (Q8)
    agents: [], // задача 8: agent ledger (Q11)
    steward: emptyStewardView(), // задача 8: steward view (Q12)
    readiness: { totalRuns: 0, withArm: 0, withArmPct: null, byArm: [], byExperiment: [] }, // задача 8: Q10
  };
}

// ---------------------------------------------------------------------------
// View filter (§6.2: выборки Стюарда для CLI/MCP — задачи 9–11)
// ---------------------------------------------------------------------------

export interface AnalyticsViewFilter {
  view: 'memory' | 'tools' | 'rules' | 'funnel' | 'agents' | 'steward' | 'outliers' | 'readiness' | 'all';
  class?: 'new' | 'sleeper' | 'workhorse' | 'dead';
  type?: string;
  origin?: 'script' | 'model-native';
  agent?: string;
  silent?: boolean;
  top?: number;
}

export type AnalyticsViewPayload =
  | { view: 'memory'; rows: MemoryLedgerRow[]; garbage: GarbageStats }
  | { view: 'tools'; rows: ToolLedgerRow[] }
  | { view: 'rules'; rows: RuleRankingRow[] }
  | { view: 'funnel'; weeks: FunnelWeek[] }
  | { view: 'agents'; rows: AgentLedgerRow[] }
  | { view: 'steward'; steward: StewardView }
  | { view: 'outliers'; runs: OutlierRun[] }
  | { view: 'readiness'; readiness: ExperimentReadiness }
  | { view: 'all'; report: AnalyticsReport };

/** Срез отчёта по view-фильтру (§6.2); top ограничивает строки, дефолт 20. */
export function filterAnalytics(report: AnalyticsReport, filter: AnalyticsViewFilter): AnalyticsViewPayload {
  const top = filter.top ?? 20;
  switch (filter.view) {
    case 'memory': {
      let rows = report.memory.rows;
      if (filter.class !== undefined) rows = rows.filter((r) => r.lifecycle === filter.class);
      if (filter.type !== undefined) rows = rows.filter((r) => r.type === filter.type);
      return { view: 'memory', rows: rows.slice(0, top), garbage: report.memory.garbage };
    }
    case 'tools': {
      let rows = report.tools;
      if (filter.origin !== undefined) rows = rows.filter((r) => r.origin === filter.origin);
      return { view: 'tools', rows: rows.slice(0, top) };
    }
    case 'rules': {
      let rows = report.rules;
      if (filter.silent !== undefined) rows = rows.filter((r) => r.silent === filter.silent);
      return { view: 'rules', rows: rows.slice(0, top) };
    }
    case 'funnel':
      return { view: 'funnel', weeks: report.funnel };
    case 'agents': {
      let rows = report.agents;
      if (filter.agent !== undefined) rows = rows.filter((r) => r.agent === filter.agent);
      return { view: 'agents', rows: rows.slice(0, top) };
    }
    case 'steward':
      return { view: 'steward', steward: report.steward };
    case 'outliers':
      return { view: 'outliers', runs: report.outliers.slice(0, top) };
    case 'readiness':
      return { view: 'readiness', readiness: report.readiness };
    case 'all':
      return { view: 'all', report };
  }
}
