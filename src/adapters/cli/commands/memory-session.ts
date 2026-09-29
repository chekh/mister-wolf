import { Command } from 'commander';
import { diffThread } from '../../../app/use-cases/diff-thread.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { memorySessionWrapUpCommand } from './memory-session-wrap-up.js';

export function memorySessionCommand(): Command {
  const session = new Command('session').description('Manage sessions and checkpoints');

  session.addCommand(memorySessionWrapUpCommand());

  return session;
}

export function memoryThreadDiffCommand(): Command {
  return new Command('diff')
    .description('Show thread changes since a checkpoint')
    .argument('<thread-id>', 'Thread id')
    .requiredOption('--since <checkpoint-id>', 'Checkpoint id')
    .action(async (threadId: string, options) => {
      const { store, relations } = createCliContainer(process.cwd());
      const diff = await diffThread({ store, relations }, threadId, options.since);
      console.log(`Thread: ${diff.threadId}`);
      console.log(`Since checkpoint: ${diff.sinceCheckpointId}`);
      console.log(`Current state: "${diff.currentState.before}" -> "${diff.currentState.after}"`);
      if (diff.added.length > 0) {
        console.log('Added:');
        for (const id of diff.added) console.log(`  - ${id}`);
      }
      if (diff.removed.length > 0) {
        console.log('Removed/closed:');
        for (const id of diff.removed) console.log(`  - ${id}`);
      }
      if (diff.relations.length > 0) {
        console.log('Relations:');
        for (const line of diff.relations) console.log(`  - ${line}`);
      }
    });
}
