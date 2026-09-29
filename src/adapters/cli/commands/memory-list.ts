import { Command } from 'commander';
import { listMemoryObjects, resolveListType } from '../../../app/use-cases/list-memory-objects.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { DEPRECATED_TYPE_ALIASES } from '../../../domain/memory-types.js';
import { colorsEnabled, highlightFacet } from '../../../domain/facet-colors.js';
import { UserFacingError } from '../../../domain/errors.js';
import { withCliCall } from './with-cli-call.js';

export function memoryListCommand(): Command {
  return new Command('list')
    .description('List memory objects')
    .option('--type <type>', 'Filter by type')
    .option('--status <status>', 'Filter by status')
    .option('--stale', 'List stale objects (not updated in 30 days)', false)
    .option(
      '--facet <facet>',
      'Filter notes by character facet (howto|pitfall|context|metric|history|legacy|constraint)'
    )
    .action(
      withCliCall('list', async (options) => {
        const { store, declarations } = createCliContainer(process.cwd());
        let type: string | undefined = options.type;
        if (type) {
          // Резолв --type (спека 2.1.0 §2.2 F10 + карта §5.4 2.13): алиас → warning,
          // неизвестный → error. DEPRECATED_TYPE_ALIASES теперь Record<string, TypeAliasSpec>.
          const resolved = resolveListType(
            type,
            declarations.map((d) => d.name),
            Object.fromEntries(Object.entries(DEPRECATED_TYPE_ALIASES).map(([k, spec]) => [k, spec.target]))
          );
          if (resolved.error) throw new UserFacingError(resolved.error);
          if (resolved.warning) console.error(`Warning: ${resolved.warning}`);
          type = resolved.type;
        }
        const objects = await listMemoryObjects(store, {
          type,
          status: options.status,
          stale: options.stale,
          facet: options.facet,
        });
        // P212 (2.13 §5.3в): решение о цвете — один раз на вывод (pipe/NO_COLOR → плоско)
        const colored = colorsEnabled(process.stdout, process.env);
        for (const obj of objects) {
          const facet = typeof obj.facet === 'string' ? obj.facet : undefined;
          const facetPart = facet ? ` [${highlightFacet(facet, colored)}]` : '';
          console.log(`${obj.id} [${obj.type}]${facetPart} [${obj.status}] ${obj.title}`);
        }
      })
    );
}
