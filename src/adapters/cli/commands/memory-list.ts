import { Command } from 'commander';
import { listMemoryObjects, resolveListType } from '../../../app/use-cases/list-memory-objects.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { DEPRECATED_TYPE_ALIASES } from '../../../domain/memory-types.js';
import { UserFacingError } from '../../../domain/errors.js';

export function memoryListCommand(): Command {
  return new Command('list')
    .description('List memory objects')
    .option('--type <type>', 'Filter by type')
    .option('--status <status>', 'Filter by status')
    .option('--stale', 'List stale objects (not updated in 30 days)', false)
    .action(async (options) => {
      const { store, declarations } = createCliContainer(process.cwd());
      let type: string | undefined = options.type;
      if (type) {
        // Резолв --type (спека 2.1.0 §2.2 F10): алиас → warning, неизвестный → error
        const resolved = resolveListType(
          type,
          declarations.map((d) => d.name),
          DEPRECATED_TYPE_ALIASES
        );
        if (resolved.error) throw new UserFacingError(resolved.error);
        if (resolved.warning) console.error(`Warning: ${resolved.warning}`);
        type = resolved.type;
      }
      const objects = await listMemoryObjects(store, {
        type,
        status: options.status,
        stale: options.stale,
      });
      for (const obj of objects) {
        console.log(`${obj.id} [${obj.type}] [${obj.status}] ${obj.title}`);
      }
    });
}
