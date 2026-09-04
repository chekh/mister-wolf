import { MemoryStore } from '../../ports/memory-store.port.js';
import { analyzeEconomy, EconomyResult } from '../../domain/tool-economy.js';
import type { SignalEvent } from '../../adapters/fs/session-metrics-log.js';
import { mergeRunEntries } from './run-source.js';

export interface ToolUsageRow {
  id: string;
  name: string;
  status: string;
  usage_count: number;
  last_used_at: string | null;
}

export interface ToolStatsResult {
  tools: ToolUsageRow[];
  economy: EconomyResult;
}

/** `wolf tool stats`: реестр tool-объектов + экономика переиспользования (P1 D4:
 * сигнальный источник с compat-мержем legacy run-log; пустые данные → insufficient
 * от analyzeEconomy, reason «not enough data»). */
export async function toolStats(
  deps: { store: MemoryStore },
  input: { signals: SignalEvent[]; runLogText: string | null }
): Promise<ToolStatsResult> {
  const objects = await deps.store.list({ type: 'tool' });
  const tools: ToolUsageRow[] = objects
    .map((o) => {
      const extra = o as typeof o & { name?: unknown; usage_count?: unknown; last_used_at?: unknown };
      return {
        id: o.id,
        name: typeof extra.name === 'string' && extra.name !== '' ? extra.name : o.title,
        status: o.status,
        usage_count: typeof extra.usage_count === 'number' ? extra.usage_count : 0,
        last_used_at: typeof extra.last_used_at === 'string' ? extra.last_used_at : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const economy: EconomyResult = analyzeEconomy(mergeRunEntries(input.signals, input.runLogText));

  return { tools, economy };
}
