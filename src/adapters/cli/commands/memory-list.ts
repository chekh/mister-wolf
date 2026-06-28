import { Command } from 'commander';
import { listMemoryObjects } from '../../../app/use-cases/list-memory-objects.js';
import { createCliContainer } from '../container.js';

export function memoryListCommand(): Command {
  return new Command('list')
    .description('List memory objects')
    .option('--type <type>', 'Filter by type')
    .option('--status <status>', 'Filter by status', 'active')
    .action(async (options) => {
      const { store } = createCliContainer(process.cwd());
      const objects = await listMemoryObjects(store, { type: options.type, status: options.status });
      for (const obj of objects) {
        console.log(`${obj.id} [${obj.type}] ${obj.title}`);
      }
    });
}
