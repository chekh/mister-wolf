import { MemoryStore } from '../../ports/memory-store.port.js';
import { analyzeEconomy, EconomyResult, parseRunLog } from '../../domain/tool-economy.js';

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

/** `wolf tool stats`: реестр tool-объектов + экономика переиспользования по run-log. */
export async function toolStats(
  deps: { store: MemoryStore },
  input: { runLogText: string | null }
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

  const economy: EconomyResult =
    input.runLogText === null
      ? {
          sufficient: false,
          reason: 'run-log missing (.wolf/run-log.jsonl not found)',
          toolRuns: 0,
          totalRuns: 0,
          medianTool: null,
          medianAll: null,
          savingsPct: null,
        }
      : analyzeEconomy(parseRunLog(input.runLogText));

  return { tools, economy };
}
