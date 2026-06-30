import { Command } from 'commander';
import { searchMemory } from '../../../app/use-cases/search-memory.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memorySearchCommand(): Command {
  return new Command('search')
    .description('Search memory objects')
    .argument('<query>', 'Search query')
    .option('--type <type>', 'Filter by type')
    .option('--status <status>', 'Filter by status')
    .option('--tag <tag>', 'Filter by tag (repeatable)', collect, [])
    .option('--confidence <confidence>', 'Filter by confidence (low|medium|high)')
    .option('--min-importance <n>', 'Minimum importance', parseFloat)
    .option('--max-importance <n>', 'Maximum importance', parseFloat)
    .option('--created-after <iso>', 'Created on or after date')
    .option('--created-before <iso>', 'Created on or before date')
    .option('--limit <n>', 'Maximum results', parseInt)
    .option('--include-superseded', 'Include superseded objects', false)
    .action(async (query, options) => {
      const { index } = createCliContainer(process.cwd());
      const results = await searchMemory(
        { index },
        {
          query,
          type: options.type,
          status: options.status,
          tags: options.tag.length > 0 ? options.tag : undefined,
          confidence: options.confidence,
          minImportance: options.minImportance,
          maxImportance: options.maxImportance,
          createdAfter: options.createdAfter,
          createdBefore: options.createdBefore,
          limit: options.limit,
          includeSuperseded: options.includeSuperseded,
        }
      );
      for (const result of results) {
        console.log(`${result.object.id} [${result.object.type}] ${result.object.title}`);
      }
    });
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat(value);
}
