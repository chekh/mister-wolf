import { Command } from 'commander';
import { rebuildMemoryIndex } from '../../../app/use-cases/rebuild-memory-index.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryRebuildIndexCommand(): Command {
  return new Command('rebuild-index')
    .description('Rebuild the SQLite search index from memory objects')
    .action(async () => {
      const { store, index } = createCliContainer(process.cwd());
      await rebuildMemoryIndex({ store, index });
      console.log('Index rebuilt.');
    });
}
