import { Command } from 'commander';
import { getMemoryObject } from '../../../app/use-cases/get-memory-object.js';
import { getLatestMemoryObject } from '../../../app/use-cases/get-latest-memory-object.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { UserFacingError } from '../../../domain/errors.js';

export function memoryGetCommand(): Command {
  return new Command('get')
    .description('Get a memory object by id')
    .argument('<id>', 'Memory object id')
    .option('--latest', 'Follow the superseded_by chain to the current object', false)
    .action(async (id, options) => {
      const { store } = createCliContainer(process.cwd());
      if (options.latest) {
        const obj = await getLatestMemoryObject({ store }, id);
        console.log(JSON.stringify(obj, null, 2));
        return;
      }
      const obj = await getMemoryObject(store, id);
      if (!obj) {
        throw new UserFacingError(`Memory object not found: ${id}`);
      }
      console.log(JSON.stringify(obj, null, 2));
    });
}
