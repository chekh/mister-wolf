import { Command } from 'commander';
import { summarizeSession } from '../../../app/use-cases/summarize-session.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memorySessionWrapUpCommand(): Command {
  return new Command('wrap-up')
    .description('Manually create a session-summary of recent events')
    .option('--title <title>', 'Summary title')
    .option('--tags <tags>', 'Comma-separated tags')
    .action(async (options) => {
      const { store, log, clock, idGen, index } = createCliContainer(process.cwd());
      const tags = options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [];
      const result = await summarizeSession(
        { store, log, clock, idGen, index },
        { title: options.title, tags, createdBy: 'user:cli' }
      );
      if (result) {
        console.log(`Created session-summary: ${result.object.id}`);
      } else {
        console.log('Skipped: a session-summary was created recently.');
      }
    });
}
