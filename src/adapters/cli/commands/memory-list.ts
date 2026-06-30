import { Command } from 'commander';
import { listMemoryObjects } from '../../../app/use-cases/list-memory-objects.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryListCommand(): Command {
  return new Command('list')
    .description('List memory objects')
    .option('--type <type>', 'Filter by type')
    .option('--status <status>', 'Filter by status')
    .option('--stale', 'List stale objects (not updated in 30 days)', false)
    .action(async (options) => {
      const { store } = createCliContainer(process.cwd());
      const objects = await listMemoryObjects(store, {
        type: options.type,
        status: options.status,
        stale: options.stale,
      });
      for (const obj of objects) {
        console.log(`${obj.id} [${obj.type}] [${obj.status}] ${obj.title}`);
      }
    });
}
