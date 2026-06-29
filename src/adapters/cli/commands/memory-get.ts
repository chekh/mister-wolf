import { Command } from 'commander';
import { getMemoryObject } from '../../../app/use-cases/get-memory-object.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryGetCommand(): Command {
  return new Command('get')
    .description('Get a memory object by id')
    .argument('<id>', 'Memory object id')
    .action(async (id) => {
      const { store } = createCliContainer(process.cwd());
      const obj = await getMemoryObject(store, id);
      if (!obj) {
        console.error(`Memory object not found: ${id}`);
        process.exit(1);
      }
      console.log(JSON.stringify(obj, null, 2));
    });
}
