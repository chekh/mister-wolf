/**
 * A1.1: импорт завершённых assistant-turn'ов OpenCode в сигнальный лог — событие
 * `run` через единственный writer `appendSignal`. Дедуп по детерминированному
 * event_id делает повтор идемпотентным. Дизайн:
 * docs/dev/2026-10-31-a1-1-measurements/design.md §«Дедупликация», §«Run-итог».
 */
import type { SignalEvent } from '../../adapters/fs/session-metrics-log.js';
import { appendSignal, readSignalLog } from '../../adapters/fs/session-metrics-log.js';
import { DEFAULT_USAGE_DB_PATH, readUsageSource } from '../../adapters/fs/opencode-usage-db.js';
import {
  USAGE_SOURCE_LIMITATIONS,
  signalFromTurn,
  summarizeRuns,
  usageEventId,
  type RunSummary,
} from './usage-signal.js';

export interface ImportUsageOptions {
  dbPath?: string;
  sinceMs?: number;
  untilMs?: number;
  taskMap?: Record<string, string>;
  dryRun?: boolean;
}

export interface ImportUsageResult {
  appended: number;
  duplicate: number;
  skippedIncomplete: number;
  runs: RunSummary[];
  limitations: readonly string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Дефолтное окно: с начала вчерашнего локального дня до текущего момента. */
function defaultSince(nowMs: number): number {
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  return startOfToday.getTime() - DAY_MS;
}

export function importUsage(baseDir: string, opts: ImportUsageOptions = {}): ImportUsageResult {
  const nowMs = Date.now();
  const sinceMs = opts.sinceMs ?? defaultSince(nowMs);
  const untilMs = opts.untilMs ?? nowMs;

  const source = readUsageSource(opts.dbPath ?? DEFAULT_USAGE_DB_PATH, { sinceMs, untilMs });
  const log = readSignalLog(baseDir);

  const existing = new Set<string>();
  for (const event of log.events) {
    if (event.event_id) existing.add(event.event_id);
  }

  const runsById = new Map(source.runs.map((run) => [run.sessionId, run]));
  const ordered = [...source.turns].sort((a, b) => {
    const ta = a.createdMs ?? a.completedMs ?? 0;
    const tb = b.createdMs ?? b.completedMs ?? 0;
    return ta === tb ? a.messageId.localeCompare(b.messageId) : ta - tb;
  });

  let appended = 0;
  let duplicate = 0;
  let skippedIncomplete = 0;
  const written: SignalEvent[] = [];

  for (const turn of ordered) {
    const eventId = usageEventId(turn.messageId);
    if (existing.has(eventId)) {
      duplicate += 1;
      continue;
    }
    const run = runsById.get(turn.sessionId);
    const sessionModel = run?.modelId && run.providerId ? { id: run.modelId, providerID: run.providerId } : null;
    const event = signalFromTurn(turn, {
      taskId: opts.taskMap?.[turn.sessionId] ?? null,
      traceId: run?.parentSessionId ?? null,
      sessionModel,
      sessionAgent: run?.agent ?? null,
    });
    if (!event) {
      skippedIncomplete += 1;
      continue;
    }
    if (!opts.dryRun) appendSignal(baseDir, event);
    existing.add(eventId);
    written.push(event);
    appended += 1;
  }

  // Run-итог агрегирует весь run, а не события окна: фильтра по ts нет, берём
  // ранее записанные run-события тех же сессий (повтор печатает те же строки).
  const runIds = new Set(source.runs.map((run) => run.sessionId));
  const existingRunEvents = log.events.filter(
    (event) => event.event === 'run' && event.run_id !== undefined && runIds.has(event.run_id)
  );
  const runs = summarizeRuns([...existingRunEvents, ...written], source.runs);

  return {
    appended,
    duplicate,
    skippedIncomplete,
    runs,
    limitations: USAGE_SOURCE_LIMITATIONS,
  };
}
