import { Command } from 'commander';
import { addMemoryObject } from '../../../app/use-cases/add-memory-object.js';
import { MarkdownMemoryStore } from '../../fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../fs/jsonl-event-log.js';
import { SystemClock } from '../../fs/system-clock.js';
import { HashIdGenerator } from '../../fs/hash-id-generator.js';
import { eventsPath } from '../../fs/project-paths.js';

export function memoryAddCommand(): Command {
  return new Command('add')
    .description('Add a memory object')
    .requiredOption('--type <type>', 'Memory type')
    .requiredOption('--title <title>', 'Title')
    .option('--body <body>', 'Body text')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--created-by <actor>', 'Creator actor', 'user:cli')
    .action(async (options) => {
      const baseDir = process.cwd();
      const store = new MarkdownMemoryStore(baseDir);
      const log = new JsonlEventLog(eventsPath(baseDir));
      const result = await addMemoryObject(
        { store, log, clock: new SystemClock(), idGen: new HashIdGenerator() },
        {
          type: options.type,
          title: options.title,
          body: options.body,
          createdBy: options.createdBy,
          tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [],
        }
      );
      console.log(`Created memory object: ${result.object.id}`);
      if (result.warnings.length > 0) {
        for (const warning of result.warnings) {
          console.warn(`Warning: ${warning}`);
        }
      }
    });
}
