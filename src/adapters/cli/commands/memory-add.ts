import { Command } from 'commander';
import { addMemoryObject } from '../../../app/use-cases/add-memory-object.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryAddCommand(): Command {
  return new Command('add')
    .description('Add a memory object')
    .requiredOption('--type <type>', 'Memory type')
    .requiredOption('--title <title>', 'Title')
    .option('--body <body>', 'Body text')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--created-by <actor>', 'Creator actor', 'user:cli')
    .action(async (options) => {
      const { store, log, clock, idGen } = createCliContainer(process.cwd());
      const result = await addMemoryObject(
        { store, log, clock, idGen },
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
