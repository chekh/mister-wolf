import { Command } from 'commander';
import { createWorkThread } from '../../../app/use-cases/create-work-thread.js';
import { getThreadBrief } from '../../../app/use-cases/get-thread-brief.js';
import { listMemoryObjects } from '../../../app/use-cases/list-memory-objects.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryThreadCommand(): Command {
  const thread = new Command('thread').description('Manage work threads');

  thread
    .command('create')
    .description('Create a work thread')
    .requiredOption('--title <title>', 'Thread title')
    .requiredOption('--goal <goal>', 'Thread goal')
    .option('--current-state <state>', 'Current state', '')
    .option('--next-steps <steps>', 'Comma-separated next steps')
    .option('--created-by <actor>', 'Creator actor', 'user:cli')
    .action(async (options) => {
      const { store, log, clock, idGen, index } = createCliContainer(process.cwd());
      const result = await createWorkThread(
        { store, log, clock, idGen, index },
        {
          title: options.title,
          goal: options.goal,
          currentState: options.currentState,
          nextSteps: options.nextSteps ? options.nextSteps.split(',').map((s: string) => s.trim()) : [],
          createdBy: options.createdBy,
        }
      );
      console.log(`Created work thread: ${result.object.id}`);
    });

  thread
    .command('list')
    .description('List work threads')
    .action(async () => {
      const { store } = createCliContainer(process.cwd());
      const objects = await listMemoryObjects(store, { type: 'work-thread' });
      for (const obj of objects) {
        console.log(`${obj.id} [${obj.status}] ${obj.title}`);
      }
    });

  thread
    .command('brief')
    .description('Generate a brief for a work thread')
    .argument('<thread-id>', 'Thread id')
    .action(async (threadId) => {
      const { store } = createCliContainer(process.cwd());
      const brief = await getThreadBrief({ store }, threadId);
      console.log(brief.rendered);
    });

  return thread;
}
