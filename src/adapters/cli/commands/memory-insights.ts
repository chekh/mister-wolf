import { Command, Option } from 'commander';
import { generateInsights, renderInsights, ANALYSIS_TYPES } from '../../../app/use-cases/generate-insights.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryInsightsCommand(): Command {
  return new Command('insights')
    .description('Heuristic pattern analysis over project memory (Level 1, no LLM)')
    .option('--topic <topic>', 'Filter by topic: exact tag match or substring in title/body')
    .addOption(new Option('--type <type>', 'Analysis lens').choices([...ANALYSIS_TYPES]).default('patterns'))
    .action(async (options) => {
      const { store, clock } = createCliContainer(process.cwd());
      const report = await generateInsights({ store, clock }, { topic: options.topic, analysisType: options.type });
      console.log(renderInsights(report));
    });
}
