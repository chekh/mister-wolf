import { Command } from 'commander';
import { getMemoryObject } from '../../../app/use-cases/get-memory-object.js';
import { getLatestMemoryObject } from '../../../app/use-cases/get-latest-memory-object.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { UserFacingError } from '../../../domain/errors.js';
import { appendMemoryStageSignal } from '../../fs/session-metrics-log.js';
import { resolveCreatedBy, resolveSessionId } from '../../../domain/actor.js';

/** P2 D1: объект найден → retrieved; сбой телеметрии не ломает вывод. */
function recordRetrieved(objId: string): void {
  try {
    appendMemoryStageSignal(process.cwd(), {
      stage: 'retrieved',
      memoryIds: [objId],
      actor: resolveCreatedBy(undefined),
      sessionId: resolveSessionId(),
    });
  } catch {
    // телеметрия не должна ломать основной поток
  }
}

export function memoryGetCommand(): Command {
  return new Command('get')
    .description('Get a memory object by id')
    .argument('<id>', 'Memory object id')
    .option('--latest', 'Follow the superseded_by chain to the current object', false)
    .action(async (id, options) => {
      const { store } = createCliContainer(process.cwd());
      if (options.latest) {
        const obj = await getLatestMemoryObject({ store }, id);
        recordRetrieved(obj.id);
        console.log(JSON.stringify(obj, null, 2));
        return;
      }
      const obj = await getMemoryObject(store, id);
      if (!obj) {
        throw new UserFacingError(`Memory object not found: ${id}`);
      }
      recordRetrieved(obj.id);
      console.log(JSON.stringify(obj, null, 2));
    });
}
