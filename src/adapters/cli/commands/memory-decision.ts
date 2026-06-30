import { Command } from 'commander';
import { createDecision } from '../../../app/use-cases/create-decision.js';
import { listMemoryObjects } from '../../../app/use-cases/list-memory-objects.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { Decision } from '../../../domain/schemas/decision-schema.js';

export function memoryDecisionCommand(): Command {
  const decision = new Command('decision').description('Manage decisions');

  decision
    .command('add')
    .description('Add a decision')
    .requiredOption('--title <title>', 'Decision title')
    .requiredOption('--body <body>', 'Decision body')
    .option('--thread <thread-id>', 'Parent thread id')
    .option('--created-by <actor>', 'Creator actor', 'user:cli')
    .action(async (options) => {
      const { store, log, clock, idGen } = createCliContainer(process.cwd());
      const result = await createDecision(
        { store, log, clock, idGen },
        {
          title: options.title,
          body: options.body,
          thread: options.thread,
          createdBy: options.createdBy,
        }
      );
      console.log(`Created decision: ${result.object.id}`);
    });

  decision
    .command('list')
    .description('List decisions')
    .option('--thread <thread-id>', 'Filter by thread')
    .action(async (options) => {
      const { store } = createCliContainer(process.cwd());
      const objects = await listMemoryObjects(store, { type: 'decision' });
      for (const obj of objects) {
        if (options.thread && (obj as Decision).thread !== options.thread) continue;
        console.log(`${obj.id} [${obj.status}] ${obj.title}`);
      }
    });

  return decision;
}
