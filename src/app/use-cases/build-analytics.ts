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
import { runCostUsd } from '../../domain/pricing.js';
import type { PricingTable } from '../../domain/pricing.js';
import { silentRuleIds } from './learn-decay.js';
import { mondayOf } from './generate-insights.js';

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

/** Ключи недельных бакетов (понедельники ISO), от старой к новой; weeks — глубина окна. */
function weekBuckets(now: Date, weeks: number): string[] {
  const currentMondayMs = Date.parse(`${mondayOf(now.toISOString())}T00:00:00Z`);
  const keys: string[] = [];
  for (let i = weeks - 1; i >= 0; i--)
    keys.push(new Date(currentMondayMs - i * 7 * 86_400_000).toISOString().slice(0, 10));
  return keys;
}

/** Воронка Q6: write (memory.added) → deliver (delivery-сигналы) → trigger (уникальные имена).
 * prevented НЕ входит: holdout-счётчики кумулятивны, без таймстампов (спека §5 M5, rev.4). */
function buildFunnel(events: MemoryEvent[], signals: SignalEvent[], now: Date, weeks: number): FunnelWeek[] {
  const buckets = new Map<string, { week: string; writes: number; delivers: number; names: Set<string> }>();
  for (const week of weekBuckets(now, weeks)) {
    buckets.set(week, { week, writes: 0, delivers: 0, names: new Set<string>() });
  }
  for (const ev of events) {
    if (ev.type !== 'memory.added') continue;
    const b = buckets.get(mondayOf(ev.timestamp));
    if (b !== undefined) b.writes += 1;
  }
  for (const s of signals) {
    if (s.event !== 'delivery') continue;
    const b = buckets.get(mondayOf(s.ts));
    if (b === undefined) continue;
    b.delivers += 1;
    if (typeof s.detail?.name === 'string') b.names.add(s.detail.name); // прецедент delivery.triggeredObjects
  }
  return [...buckets.values()].map(({ week, writes, delivers, names }) => ({
    week,
    writes,
    delivers,
    triggers: names.size,
    writeToDeliverPct: writes > 0 ? (delivers / writes) * 100 : null,
    deliverToTriggerPct: delivers > 0 ? (names.size / delivers) * 100 : null,
  }));
}

/** Outliers Q8: top-N прогонов по finite weighted; $ при pricing (D9 — без данных null). */
function buildOutliers(runLogText: string | null, pricing: PricingTable | undefined, top: number): OutlierRun[] {
  return parseRunLog(runLogText ?? '')
    .filter((e) => finiteNumber(e.weighted) !== null)
    .sort((a, b) => (b.weighted ?? 0) - (a.weighted ?? 0))
    .slice(0, top)
    .map((e) => ({
      ts: typeof e.ts === 'string' ? e.ts : null,
      model: typeof e.model === 'string' ? e.model : null,
      agent: typeof e.agent === 'string' ? e.agent : null,
      title: typeof e.title === 'string' ? e.title : null,
      weighted: e.weighted as number,
      costUsd: runCostUsd(e.tokens, pricing, typeof e.model === 'string' ? e.model : null),
      tools: e.tools ?? [],
    }));
}

/** Agent ledger Q11: строки по run-агентам ∪ complaint-акторам `agent:<имя>`; три уровня —
 * объём (runs/weighted/duration/cost), проблемы (failures/toolErrors/жалобы), достижения
 * (successes/holdout_prevented его rule/lesson). */
function buildAgents(
  signals: SignalEvent[],
  objects: MemoryObject[],
  pricing: PricingTable | undefined
): AgentLedgerRow[] {
  const AGENT_PREFIX = 'agent:';
  interface AgentAcc {
    runs: number;
    failures: number;
    successes: number;
    weighted: number;
    durations: number[];
    cost: number | null;
    toolErrors: number;
    complaintsBy: number;
    complaintsAbout: number;
    holdoutSum: number;
    hasHoldout: boolean;
  }
  const acc = new Map<string, AgentAcc>();
  const rowOf = (name: string): AgentAcc => {
    let r = acc.get(name);
    if (r === undefined) {
      r = {
        runs: 0,
        failures: 0,
        successes: 0,
        weighted: 0,
        durations: [],
        cost: null,
        toolErrors: 0,
        complaintsBy: 0,
        complaintsAbout: 0,
        holdoutSum: 0,
        hasHoldout: false,
      };
      acc.set(name, r);
    }
    return r;
  };

  // проход 1: источники строк (run-агенты, complaint-акторы) + объём/ошибки
  for (const ev of signals) {
    if (ev.event === 'run' && typeof ev.gen_ai.agent === 'string' && ev.gen_ai.agent !== '') {
      const r = rowOf(ev.gen_ai.agent);
      r.runs += 1;
      if (ev.outcome === 'ok') r.successes += 1;
      else r.failures += 1;
      r.weighted += finiteNumber(ev.weighted) ?? 0;
      const d = finiteNumber(ev.duration_ms);
      if (d !== null) r.durations.push(d);
      const cost = runCostUsd(ev.tokens, pricing, ev.gen_ai.modelID);
      if (cost !== null) r.cost = (r.cost ?? 0) + cost;
    }
    if (ev.event === 'complaint') {
      const actor = ev.orchestration.actor;
      if (actor.startsWith(`${AGENT_PREFIX}`) && actor.length > AGENT_PREFIX.length) {
        rowOf(actor.slice(AGENT_PREFIX.length)).complaintsBy += 1;
      }
    }
  }
  // tool-ошибки по агенту — только для существующих строк (строки создают run/complaint-actor)
  for (const ev of signals) {
    if (ev.event === 'tool_error' && typeof ev.gen_ai.agent === 'string' && acc.has(ev.gen_ai.agent)) {
      acc.get(ev.gen_ai.agent)!.toolErrors += 1;
    }
  }
  // проход 2: жалобы НА агента — detail.about содержит имя
  for (const ev of signals) {
    if (ev.event !== 'complaint') continue;
    const about = String(ev.detail?.about ?? '');
    if (about === '') continue;
    for (const name of acc.keys()) {
      if (about.includes(name)) acc.get(name)!.complaintsAbout += 1;
    }
  }
  // достижения: holdout_prevented у rule/lesson с created_by === 'agent:<имя>'
  for (const o of objects) {
    if (o.type !== 'rule' && o.type !== 'lesson') continue;
    // план-код падал на моках без created_by: guard (схема требует, тестовые фикстуры — нет)
    if (typeof o.created_by !== 'string' || !o.created_by.startsWith(AGENT_PREFIX)) continue;
    const name = o.created_by.slice(AGENT_PREFIX.length);
    if (!acc.has(name)) continue;
    const p = finiteNumber((o as Record<string, unknown>).holdout_prevented);
    if (p !== null) {
      acc.get(name)!.holdoutSum += p;
      acc.get(name)!.hasHoldout = true;
    }
  }

  return [...acc.entries()]
    .map(([agent, r]) => ({
      agent,
      runs: r.runs,
      failures: r.failures,
      failureRatePct: r.runs > 0 ? (r.failures / r.runs) * 100 : null,
      weighted: r.weighted,
      avgDurationMs: r.durations.length > 0 ? r.durations.reduce((s, v) => s + v, 0) / r.durations.length : null,
      costUsd: r.cost,
      toolErrors: r.toolErrors,
      complaintsBy: r.complaintsBy,
      complaintsAbout: r.complaintsAbout,
      successes: r.successes,
      holdoutPrevented: r.hasHoldout ? r.holdoutSum : null,
    }))
    .sort((a, b) => b.runs - a.runs || a.agent.localeCompare(b.agent));
}

/** Вид мутации события: update/supersede/resolve/transition; memory.updated с kind='tool.used'
 * → tool-mutation; added/scan.updated — не мутации. */
function mutationKindOf(ev: MemoryEvent): string | null {
  switch (ev.type) {
    case 'memory.updated': {
      const kind = (ev.payload as Record<string, unknown> | undefined)?.kind;
      return kind === 'tool.used' ? 'tool-mutation' : 'update';
    }
    case 'memory.superseded':
      return 'supersede';
    case 'memory.resolved':
      return 'resolve';
    case 'memory.transitioned':
      return 'transition';
    default:
      return null;
  }
}

const MUTATION_KINDS = ['update', 'supersede', 'resolve', 'transition', 'tool-mutation'] as const;

/** Steward view Q12: мутации за окно weeks (то же, что воронка), жалобная воронка,
 * SLA-эскалации (dispatch_ages >= 3), рецидивы, churn, доля авто-мутаций. */
function buildSteward(
  events: MemoryEvent[],
  signals: SignalEvent[],
  objects: MemoryObject[],
  now: Date,
  weeks: number
): StewardView {
  const keys = weekBuckets(now, weeks);

  // мутации: виды + недели + churn + авто-доля
  const kindCount = new Map<string, number>(MUTATION_KINDS.map((k) => [k, 0]));
  const weekTotal = new Map<string, number>(keys.map((k) => [k, 0]));
  const mutationsById = new Map<string, number>();
  let totalMutations = 0;
  let autoMutations = 0;
  for (const ev of events) {
    const kind = mutationKindOf(ev);
    if (kind === null) continue;
    if (!weekTotal.has(mondayOf(ev.timestamp))) continue; // вне окна
    kindCount.set(kind, (kindCount.get(kind) ?? 0) + 1);
    weekTotal.set(mondayOf(ev.timestamp), (weekTotal.get(mondayOf(ev.timestamp)) ?? 0) + 1);
    totalMutations += 1;
    if (ev.actor === 'system:wolf') autoMutations += 1;
    const mid = (ev.payload as Record<string, unknown> | undefined)?.memory_id;
    if (typeof mid === 'string') mutationsById.set(mid, (mutationsById.get(mid) ?? 0) + 1);
  }

  // жалобная воронка
  const complaints = signals.filter((s) => s.event === 'complaint' && weekTotal.has(mondayOf(s.ts)));
  const filed = complaints.length;
  let resolved = 0;
  let rejected = 0;
  for (const ev of events) {
    if (!weekTotal.has(mondayOf(ev.timestamp))) continue;
    if (ev.type === 'memory.resolved') resolved += 1;
    if (ev.type === 'memory.transitioned' && (ev.payload as Record<string, unknown> | undefined)?.to === 'rejected') {
      rejected += 1;
    }
  }
  // время жизни: resolved-событие − первый complaint по тому же id (в часах)
  const firstComplaintById = new Map<string, string>();
  for (const s of signals) {
    if (s.event !== 'complaint') continue;
    const id = s.detail?.object_id;
    if (typeof id !== 'string') continue;
    const cur = firstComplaintById.get(id);
    if (cur === undefined || s.ts < cur) firstComplaintById.set(id, s.ts);
  }
  const lifetimes: number[] = [];
  for (const ev of events) {
    if (ev.type !== 'memory.resolved') continue;
    const mid = (ev.payload as Record<string, unknown> | undefined)?.memory_id;
    if (typeof mid !== 'string') continue;
    const first = firstComplaintById.get(mid);
    if (first === undefined) continue;
    lifetimes.push((Date.parse(ev.timestamp) - Date.parse(first)) / 3_600_000);
  }
  const avgLifetimeHours = lifetimes.length > 0 ? lifetimes.reduce((s, v) => s + v, 0) / lifetimes.length : null;

  // SLA: объекты с dispatch_ages >= 3 (passthrough-поле)
  let slaEscalations = 0;
  for (const o of objects) {
    const dispatchAges = finiteNumber((o as Record<string, unknown>).dispatch_ages);
    if (dispatchAges !== null && dispatchAges >= 3) slaEscalations += 1;
  }

  // рецидивы: ≥2 жалобы на объект И update по нему строго между первой и последней жалобой
  const complaintTsById = new Map<string, string[]>();
  for (const s of signals) {
    if (s.event !== 'complaint') continue;
    const id = s.detail?.object_id;
    if (typeof id !== 'string') continue;
    const arr = complaintTsById.get(id) ?? [];
    arr.push(s.ts);
    complaintTsById.set(id, arr);
  }
  const updateTsById = new Map<string, string[]>();
  for (const ev of events) {
    if (ev.type !== 'memory.updated') continue;
    const mid = (ev.payload as Record<string, unknown> | undefined)?.memory_id;
    if (typeof mid !== 'string') continue;
    const arr = updateTsById.get(mid) ?? [];
    arr.push(ev.timestamp);
    updateTsById.set(mid, arr);
  }
  let recidivismCount = 0;
  for (const [id, tsList] of complaintTsById) {
    if (tsList.length < 2) continue;
    const sorted = [...tsList].sort();
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    if ((updateTsById.get(id) ?? []).some((ts) => ts > first && ts < last)) recidivismCount += 1;
  }

  const churnIds = [...mutationsById.entries()]
    .filter(([, n]) => n >= 2)
    .map(([id]) => id)
    .sort();

  return {
    mutations: MUTATION_KINDS.map((kind) => ({ kind, count: kindCount.get(kind) ?? 0 })),
    mutationsByWeek: keys.map((week) => ({ week, total: weekTotal.get(week) ?? 0 })),
    complaintFunnel: { filed, resolved, rejected, avgLifetimeHours, slaEscalations },
    recidivismCount,
    churnIds,
    autoMutationSharePct: totalMutations > 0 ? (autoMutations / totalMutations) * 100 : null,
  };
}

/** Experiment readiness Q10: доля run-сигналов с experiment.arm; выборки по группам. */
function buildReadiness(signals: SignalEvent[]): ExperimentReadiness {
  const runs = signals.filter((s) => s.event === 'run');
  let withArm = 0;
  const byArm = new Map<string, number>();
  const byExperiment = new Map<string, number>();
  for (const ev of runs) {
    const experiment = ev.experiment as { arm?: unknown; id?: unknown } | undefined;
    const arm = experiment?.arm;
    if (typeof arm === 'string' && arm !== '') {
      withArm += 1;
      byArm.set(arm, (byArm.get(arm) ?? 0) + 1);
    }
    const id = experiment?.id;
    if (typeof id === 'string' && id !== '') byExperiment.set(id, (byExperiment.get(id) ?? 0) + 1);
  }
  const totalRuns = runs.length;
  return {
    totalRuns,
    withArm,
    withArmPct: totalRuns > 0 ? (withArm / totalRuns) * 100 : null,
    byArm: [...byArm.entries()].map(([arm, n]) => ({ arm, runs: n })).sort((a, b) => a.arm.localeCompare(b.arm)),
    byExperiment: [...byExperiment.entries()]
      .map(([experiment, n]) => ({ experiment, runs: n }))
      .sort((a, b) => b.runs - a.runs || a.experiment.localeCompare(b.experiment)),
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
  const weeks = input.weeks ?? 8;

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
  const funnel = buildFunnel(events, input.signals, now, weeks);
  const outliers = buildOutliers(input.runLogText, input.pricing, input.topOutliers ?? 10);
  const agents = buildAgents(input.signals, allObjects, input.pricing);
  const steward = buildSteward(events, input.signals, allObjects, now, weeks);
  const readiness = buildReadiness(input.signals);

  return {
    generatedAt: now.toISOString(),
    thresholds,
    memory,
    tools,
    rules,
    funnel,
    outliers,
    agents,
    steward,
    readiness,
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
