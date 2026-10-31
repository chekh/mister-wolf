/**
 * A1.1: чистый маппинг записи usage-источника (assistant-turn OpenCode 2.2.5) в
 * событие `run` существующей схемы SignalEvent и агрегация run-итогов.
 * Пишутся только поля SignalEventSchema (ADR-6): схема памяти не расширяется.
 * Дизайн: docs/dev/2026-10-31-a1-1-measurements/design.md.
 */
import { createHash } from 'crypto';
import type { SignalEvent } from '../../adapters/fs/session-metrics-log.js';

/** Один завершённый/незавершённый assistant-turn из источника. */
export interface UsageTurn {
  /** session_message.id */
  messageId: string;
  /** session_message.session_id */
  sessionId: string;
  seq: number | null;
  /** data.time.created */
  createdMs: number | null;
  /** data.time.completed|streamed */
  completedMs: number | null;
  /** data.agent */
  agent: string | null;
  /** data.model.id */
  modelId: string | null;
  /** data.model.providerID */
  providerId: string | null;
  tokens: { input: number; output: number; cacheRead: number } | null;
  /** data.tokens.reasoning — не входит в output. */
  reasoning: number | null;
  /** data.tokens.cache.write — не входит в cache_read. */
  cacheWrite: number | null;
  /** data.finish */
  finish: 'stop' | 'tool-calls' | 'error' | null;
  /** data.retry.attempt */
  attempt: number | null;
}

/** Метаданные run (сессии источника). */
export interface UsageRun {
  sessionId: string;
  /** session_v2.parent_id */
  parentSessionId: string | null;
  agent: string | null;
  modelId: string | null;
  providerId: string | null;
  createdMs: number | null;
  /** session_v2.time_busy */
  busyMs: number | null;
}

export interface RunSummary {
  runId: string;
  sessionId: string;
  traceId: string | null;
  taskId: string | null;
  /** null = неизвестно */
  attempts: number[] | null;
  /** `${providerId}/${modelId}` или modelId */
  model: string | null;
  agent: string | null;
  /** null = неизвестно */
  tokens: { input: number; output: number; cacheRead: number } | null;
  /** сумма duration_ms импортированных turn'ов */
  generationMs: number | null;
  busyMs: number | null;
  events: number;
  outcomes: { ok: number; error: number; unknown: number };
  /** имена недоступных полей */
  unknowns: string[];
}

export const USAGE_SOURCE_LIMITATIONS: readonly string[] = [
  'model variant is not carried over (no field in the signal schema)',
  'reasoning and cache.write have undocumented semantics and are not added to output/cache_read or weighted',
  'cost is not computed (the source has no pricing table)',
  'task_id comes only from an explicit session-to-task map',
  'attempt exists only when the source recorded a retry',
  'duration_ms is turn wall-clock time, not answer length',
  'unfinished turns (no completed timestamp) are not imported',
  'an empty event set means unknown coverage, not zero usage',
];

/** Детерминированный id события: sha256("opencode-usage:v1|"+messageId), первые 32 hex. */
export function usageEventId(messageId: string): string {
  return createHash('sha256').update(`opencode-usage:v1|${messageId}`).digest('hex').slice(0, 32);
}

function modelRef(id: string | null | undefined, providerId: string | null | undefined): string | null {
  if (!id) return null;
  return providerId ? `${providerId}/${id}` : id;
}

/**
 * null — turn не завершён (нет completedMs) или нет session_id; иначе событие run.
 */
export function signalFromTurn(
  turn: UsageTurn,
  ctx?: {
    taskId?: string | null;
    traceId?: string | null;
    sessionModel?: { id: string; providerID: string } | null;
  }
): SignalEvent | null {
  const { completedMs, createdMs } = turn;
  if (completedMs == null || !turn.sessionId) return null;

  const agent = turn.agent || null;
  const modelId =
    modelRef(turn.modelId, turn.providerId) ?? modelRef(ctx?.sessionModel?.id, ctx?.sessionModel?.providerID);

  const event: SignalEvent = {
    ts: new Date(completedMs).toISOString(),
    event: 'run',
    schema_version: 2,
    session_id: turn.sessionId,
    run_id: turn.sessionId,
    event_id: usageEventId(turn.messageId),
    gen_ai: { modelID: modelId, agent },
    orchestration: { task: null, actor: agent ? `agent:${agent}` : 'opencode:unknown' },
  };

  if (ctx?.traceId) event.trace_id = ctx.traceId;
  if (ctx?.taskId) event.task_id = ctx.taskId;
  if (turn.attempt != null) event.attempt = turn.attempt;

  if (turn.tokens) {
    const { input, output, cacheRead } = turn.tokens;
    event.tokens = { input, output, cache_read: cacheRead };
    event.weighted = input + 0.1 * cacheRead + 5 * output;
  }

  if (createdMs != null && completedMs - createdMs >= 0) {
    event.duration_ms = completedMs - createdMs;
  }

  if (turn.finish === 'stop' || turn.finish === 'tool-calls') event.outcome = 'ok';
  else if (turn.finish === 'error') event.outcome = 'error';

  return event;
}

/** Агрегация по run_id; порядок — по возрастанию первого ts. */
export function summarizeRuns(events: SignalEvent[], runs: UsageRun[]): RunSummary[] {
  const runById = new Map<string, UsageRun>();
  for (const run of runs) runById.set(run.sessionId, run);

  const groups = new Map<string, SignalEvent[]>();
  for (const ev of events) {
    const runId = ev.run_id ?? ev.session_id;
    if (!runId) continue;
    const group = groups.get(runId);
    if (group) group.push(ev);
    else groups.set(runId, [ev]);
  }
  for (const run of runs) {
    if (!groups.has(run.sessionId)) groups.set(run.sessionId, []);
  }

  const ordered: Array<{ ts: string; summary: RunSummary }> = [];
  for (const [runId, group] of groups) {
    const run = runById.get(runId);
    ordered.push({
      ts: group[0]?.ts ?? (run?.createdMs != null ? new Date(run.createdMs).toISOString() : ''),
      summary: summarizeRun(runId, group, run),
    });
  }
  ordered.sort((a, b) => (a.ts === b.ts ? a.summary.runId.localeCompare(b.summary.runId) : a.ts.localeCompare(b.ts)));
  return ordered.map((entry) => entry.summary);
}

function summarizeRun(runId: string, group: SignalEvent[], run: UsageRun | undefined): RunSummary {
  const unknowns: string[] = [];

  const firstString = (pick: (ev: SignalEvent) => string | null | undefined): string | null => {
    for (const ev of group) {
      const value = pick(ev);
      if (typeof value === 'string' && value !== '') return value;
    }
    return null;
  };

  const taskIds = new Set<string>();
  for (const ev of group) {
    if (typeof ev.task_id === 'string' && ev.task_id !== '') taskIds.add(ev.task_id);
  }
  const taskId = taskIds.size === 1 ? ([...taskIds][0] ?? null) : null;
  if (!taskId) unknowns.push('task-unknown');

  const attemptSet = new Set<number>();
  for (const ev of group) {
    if (typeof ev.attempt === 'number') attemptSet.add(ev.attempt);
  }
  const attempts = [...attemptSet].sort((a, b) => a - b);
  if (attempts.length === 0) unknowns.push('attempt-unknown');

  let tokens: RunSummary['tokens'] = null;
  for (const ev of group) {
    if (!ev.tokens) continue;
    tokens = tokens ?? { input: 0, output: 0, cacheRead: 0 };
    tokens.input += ev.tokens.input;
    tokens.output += ev.tokens.output;
    tokens.cacheRead += ev.tokens.cache_read;
  }
  if (!tokens) unknowns.push('tokens-unknown');

  let generationMs: number | null = null;
  for (const ev of group) {
    if (typeof ev.duration_ms !== 'number') continue;
    generationMs = (generationMs ?? 0) + ev.duration_ms;
  }
  if (generationMs === null) unknowns.push('duration-unknown');

  const outcomes = { ok: 0, error: 0, unknown: 0 };
  for (const ev of group) {
    if (ev.outcome === 'ok') outcomes.ok += 1;
    else if (ev.outcome === 'error') outcomes.error += 1;
    else outcomes.unknown += 1;
  }

  if (group.length === 0) unknowns.push('no-events');

  return {
    runId,
    sessionId: firstString((ev) => ev.session_id) ?? run?.sessionId ?? runId,
    traceId: firstString((ev) => ev.trace_id),
    taskId,
    attempts: attempts.length > 0 ? attempts : null,
    model: firstString((ev) => ev.gen_ai.modelID),
    agent: firstString((ev) => ev.gen_ai.agent),
    tokens,
    generationMs,
    busyMs: run?.busyMs ?? null,
    events: group.length,
    outcomes,
    unknowns,
  };
}
