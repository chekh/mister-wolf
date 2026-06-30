import { Command } from 'commander';
import { createBlocker } from '../../../app/use-cases/create-blocker.js';
import { listMemoryObjects } from '../../../app/use-cases/list-memory-objects.js';
import { resolveBlocker } from '../../../app/use-cases/resolve-blocker.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { Blocker } from '../../../domain/schemas/blocker-schema.js';

export function memoryBlockerCommand(): Command {
  const blocker = new Command('blocker').description('Manage blockers');

  blocker
    .command('add')
    .description('Add a blocker')
    .requiredOption('--title <title>', 'Blocker title')
    .requiredOption('--impact <impact>', 'Blocker impact')
    .option('--workaround <workaround>', 'Possible workaround')
    .option('--thread <thread-id>', 'Parent thread id')
    .option('--created-by <actor>', 'Creator actor', 'user:cli')
    .action(async (options) => {
      const { store, log, clock, idGen, index, relations } = createCliContainer(process.cwd());
      const result = await createBlocker(
        { store, log, clock, idGen, index, relations },
        {
          title: options.title,
          impact: options.impact,
          workaround: options.workaround,
          thread: options.thread,
          createdBy: options.createdBy,
        }
      );
      console.log(`Created blocker: ${result.object.id}`);
    });

  blocker
    .command('list')
    .description('List blockers')
    .option('--thread <thread-id>', 'Filter by thread')
    .action(async (options) => {
      const { store } = createCliContainer(process.cwd());
      const objects = await listMemoryObjects(store, { type: 'blocker' });
      for (const obj of objects) {
        if (options.thread && (obj as Blocker).thread !== options.thread) continue;
        console.log(`${obj.id} [${obj.status}] ${obj.title}`);
      }
    });

  blocker
    .command('resolve')
    .description('Resolve a blocker')
    .argument('<id>', 'Blocker id')
    .option('--by <artifact-id>', 'Artifact that resolves the blocker')
    .action(async (id, options) => {
      const { store, log, clock, idGen, index, relations } = createCliContainer(process.cwd());
      await resolveBlocker({ store, log, clock, idGen, index, relations }, id, options.by);
      console.log(`Resolved blocker: ${id}`);
    });

  return blocker;
}
