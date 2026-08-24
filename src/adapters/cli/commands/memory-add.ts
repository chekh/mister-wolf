import { Command, Option } from 'commander';
import { addMemoryObject } from '../../../app/use-cases/add-memory-object.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { MEMORY_TYPES } from '../../../domain/memory-types.js';

export function memoryAddCommand(): Command {
  return new Command('add')
    .description('Add a memory object')
    .addOption(
      new Option('--type <type>', 'Memory type')
        .choices([...MEMORY_TYPES].filter((t) => t !== 'document'))
        .makeOptionMandatory(true)
    )
    .requiredOption('--title <title>', 'Title')
    .option('--body <body>', 'Body text')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--confidence <confidence>', 'Confidence level (low|medium|high)')
    .option('--importance <n>', 'Importance from 0 to 1', parseFloat)
    .option('--set <k=v,k=v>', 'Extra fields for typed objects')
    .option('--created-by <actor>', 'Creator actor', 'user:cli')
    .action(async (options) => {
      const { store, log, clock, idGen, index } = createCliContainer(process.cwd());
      const extra = options.set
        ? Object.fromEntries(
            String(options.set)
              .split(',')
              .map((pair: string) => {
                const i = pair.indexOf('=');
                return [pair.slice(0, i), pair.slice(i + 1)];
              })
          )
        : undefined;
      const result = await addMemoryObject(
        { store, log, clock, idGen, index },
        {
          type: options.type,
          title: options.title,
          body: options.body,
          createdBy: options.createdBy,
          tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [],
          confidence: options.confidence,
          importance: options.importance,
          extra,
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
