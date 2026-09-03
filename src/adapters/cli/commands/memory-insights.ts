import { Command, Option } from 'commander';
import { generateInsights, renderInsights, ANALYSIS_TYPES } from '../../../app/use-cases/generate-insights.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { readSignals, signalKey } from '../../fs/session-metrics-log.js';

/** Топ-ключи Ф20: группировка по signalKey, count>=2, убыв. count (tie => key), топ-5. */
function signalLogSummary(baseDir: string): { totalEvents: number; topKeys: { key: string; count: number }[] } {
  const signals = readSignals(baseDir);
  const counts = new Map<string, number>();
  for (const s of signals) {
    const key = signalKey(s);
    if (key === null) continue; // run-события не кластеризуются
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const topKeys = [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .filter((k) => k.count >= 2)
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, 5);
  return { totalEvents: signals.length, topKeys };
}

export function memoryInsightsCommand(): Command {
  return new Command('insights')
    .description('Heuristic pattern analysis over project memory (Level 1, no LLM)')
    .option('--topic <topic>', 'Filter by topic: exact tag match or substring in title/body')
    .addOption(new Option('--type <type>', 'Analysis lens').choices([...ANALYSIS_TYPES]).default('patterns'))
    .action(async (options) => {
      const baseDir = process.cwd();
      const { store, clock, log } = createCliContainer(baseDir);
      const events = await log.readAll();
      const summary = signalLogSummary(baseDir);
      const report = await generateInsights(
        { store, clock },
        {
          topic: options.topic,
          analysisType: options.type,
          // пустой лог — секции нет вовсе (регресс существующего вывода)
          ...(summary.totalEvents > 0 ? { signalLog: summary } : {}),
          ...(events.length > 0 ? { events } : {}),
        }
      );
      console.log(renderInsights(report));
    });
}
