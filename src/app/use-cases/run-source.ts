/**
 * P1 D4: канонический источник run-метрик — сигнальный лог; исторический
 * .wolf/run-log.jsonl (deprecated) мержится на переходный период.
 * Правило мержа: простая конкатенация [сигнальные run-entries, legacy run-log entries]
 * без dedup: в переходном окне каждый run существует в обоих источниках, дублирование
 * симметрично → медианы инвариантны; счётчики (toolRuns/totalRuns) могут завышаться
 * до выхода из переходного периода (задокументировано в RISKS отчёта P1).
 */
import type { SignalEvent } from '../../adapters/fs/session-metrics-log.js';
import { parseRunLog, type RunLogEntry } from '../../domain/tool-economy.js';

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
