import { Command } from 'commander';
import { searchMemory } from '../../../app/use-cases/search-memory.js';
import { createCliContainer } from '../container.js';

export function memorySearchCommand(): Command {
  return new Command('search')
    .description('Search memory objects')
    .argument('<query>', 'Search query')
    .option('--type <type>', 'Filter by type')
    .option('--include-superseded', 'Include superseded objects', false)
    .action(async (query, options) => {
      const { store, index } = createCliContainer(process.cwd());
      const results = await searchMemory({ store, index }, {
        query,
        type: options.type,
        includeSuperseded: options.includeSuperseded,
      });
      for (const result of results) {
        console.log(`${result.object.id} [${result.object.type}] ${result.object.title}`);
      }
    });
}
