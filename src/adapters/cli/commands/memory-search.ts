import { Command } from 'commander';
import { searchMemory } from '../../../app/use-cases/search-memory.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { FTS_COLUMNS } from '../../sqlite/sqlite-search-index.js';
import { appendMemoryStageSignal } from '../../fs/session-metrics-log.js';
import { resolveCreatedBy, resolveSessionId } from '../../../domain/actor.js';
import { DEFAULT_CHARACTER_FACETS, type MemoryTypeDeclaration } from '../../../domain/memory-types.js';
import { colorsEnabled, highlightFacet } from '../../../domain/facet-colors.js';
import { UserFacingError } from '../../../domain/errors.js';
import { withCliCall } from './with-cli-call.js';

/** Эффективный словарь фасетов: enum note-декларации (config facets.character | дефолт). */
function facetDictionary(declarations: readonly MemoryTypeDeclaration[]): readonly string[] {
  const field = declarations.find((d) => d.name === 'note')?.fields?.facet;
  return field?.kind === 'enum' ? field.values : DEFAULT_CHARACTER_FACETS;
}

export function memorySearchCommand(): Command {
  return new Command('search')
    .description('Search memory objects')
    .argument('<query>', 'Search query')
    .option('--type <type>', 'Filter by type')
    .option(
      '--facet <facet>',
      'Filter notes by character facet (howto|pitfall|context|metric|history|legacy|constraint)'
    )
    .option('--status <status>', 'Filter by status')
    .option('--tag <tag>', 'Filter by tag (repeatable)', collect, [])
    .option('--confidence <confidence>', 'Filter by confidence (low|medium|high)')
    .option('--min-importance <n>', 'Minimum importance', parseFloat)
    .option('--max-importance <n>', 'Maximum importance', parseFloat)
    .option('--created-after <iso>', 'Created on or after date')
    .option('--created-before <iso>', 'Created on or before date')
    .option('--limit <n>', 'Maximum results', parseInt)
    .option('--file-path <path>', 'Filter by related/source file path')
    .option('--hide-superseded', 'Hide superseded objects (shown and marked [superseded] by default)', false)
    .option('--include-superseded', 'Deprecated no-op: superseded objects are shown by default', false)
    .action(
      withCliCall('search', async (query, options) => {
        const { index, declarations } = createCliContainer(process.cwd());
        // P212 (2.13 §5.3б): валидация --facet по образцу add — словарь из конфига
        const facetDict = facetDictionary(declarations);
        if (options.facet !== undefined && !facetDict.includes(options.facet)) {
          throw new UserFacingError(`Invalid facet "${options.facet}" (valid values: ${facetDict.join(', ')})`);
        }
        const results = await searchMemory(
          { index },
          {
            query,
            type: options.type,
            facet: options.facet,
            status: options.status,
            tags: options.tag.length > 0 ? options.tag : undefined,
            confidence: options.confidence,
            minImportance: options.minImportance,
            maxImportance: options.maxImportance,
            createdAfter: options.createdAfter,
            createdBefore: options.createdBefore,
            file_path: options.filePath,
            limit: options.limit,
            includeSuperseded: !options.hideSuperseded,
          }
        );
        // P2 D1: авто-писатель memory_stage(retrieved); сбой телеметрии не ломает поиск
        if (results.length > 0) {
          try {
            appendMemoryStageSignal(process.cwd(), {
              stage: 'retrieved',
              memoryIds: results.map((r) => r.object.id),
              actor: resolveCreatedBy(undefined),
              sessionId: resolveSessionId(),
            });
          } catch {
            // телеметрия не должна ломать основной поток
          }
        }
        // P212 (2.13 §5.3в): решение о цвете — один раз на вывод (pipe/NO_COLOR → плоско)
        const colored = colorsEnabled(process.stdout, process.env);
        for (const result of results) {
          const mark = result.object.status === 'superseded' ? ' [superseded]' : '';
          const facet = typeof result.object.facet === 'string' ? result.object.facet : undefined;
          const facetPart = facet ? ` [${highlightFacet(facet, colored)}]` : '';
          console.log(`${result.object.id} [${result.object.type}]${facetPart} ${result.object.title}${mark}`);
        }
        // Анти-тихий-ноль (вариант D): пустота не отдаётся молча.
        if (results.length === 0) {
          const columns = [...FTS_COLUMNS].join(', ');
          console.error(
            query.trim()
              ? `0 results for "${query}"; hint: supported syntax — words, prefix, AND/OR, field:value for columns: ${columns}`
              : `empty query; hint: supported syntax — words, prefix, AND/OR, field:value for columns: ${columns}`
          );
        }
      })
    );
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat(value);
}
