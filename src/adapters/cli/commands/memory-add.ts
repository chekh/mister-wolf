import { Command, Option } from 'commander';
import { safeCwd } from '../cli-entry.js';
import { addMemoryObject } from '../../../app/use-cases/add-memory-object.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { MEMORY_TYPES, type MemoryType } from '../../../domain/memory-types.js';
import { parseSetPairs } from '../../../domain/parse-set-pairs.js';
import { resolveCreatedBy } from '../../../domain/actor.js';
import { UserFacingError } from '../../../domain/errors.js';
import { addArgsSummary } from '../../fs/session-metrics-log.js';
import { withCliCall } from './with-cli-call.js';

function collectSet(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** Общая форма опций add-пути: generic `wolf add` и генерённые `<type> add` (§6.3). */
export interface AddActionOptions {
  type: string;
  title: string;
  body?: string;
  tags?: string;
  confidence?: string;
  importance?: number;
  set?: string[];
  scope?: string;
  facet?: string;
  createdBy?: string;
  /** Сгенерённые флаги полей типа (snake_case-ключи декларации); мержатся в extra поверх --set. */
  extraFields?: Record<string, unknown>;
}

/**
 * Единое действие add-пути (2.13 §6.3): `wolf add --type <type>` и генерённые
 * `wolf <type> add` делегируют сюда — логика опций/use-case не дублируется.
 */
export async function runAddAction(baseDir: string, options: AddActionOptions): Promise<void> {
  const { store, log, clock, idGen, index, declarations } = createCliContainer(baseDir);
  const type = options.type as MemoryType;
  const extra = parseSetPairs(options.set ?? [], type);
  if (options.scope !== undefined) {
    if ('scope' in extra) throw new UserFacingError('Duplicate scope: use either --scope or --set scope=..., not both');
    extra.scope = options.scope;
  }
  if (options.facet !== undefined) {
    if ('facet' in extra) throw new UserFacingError('Duplicate facet: use either --facet or --set facet=..., not both');
  }
  Object.assign(extra, options.extraFields ?? {});
  const result = await addMemoryObject(
    { store, log, clock, idGen, index, declarations },
    {
      type,
      title: options.title,
      body: options.body,
      createdBy: resolveCreatedBy(options.createdBy),
      tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [],
      confidence: options.confidence as 'low' | 'medium' | 'high' | undefined,
      importance: options.importance,
      facet: options.facet,
      extra,
    }
  );
  console.log(`Created memory object: ${result.object.id}`);
  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      console.warn(`Warning: ${warning}`);
    }
  }
}

// baseDir инъектится для тестов (прецедент: memory-update.ts).
export function memoryAddCommand(baseDir: string = safeCwd()): Command {
  return new Command('add')
    .description('Add a memory object')
    .addOption(new Option('--type <type>', 'Memory type').choices([...MEMORY_TYPES]).makeOptionMandatory(true))
    .requiredOption('--title <title>', 'Title')
    .option('--body <body>', 'Body text')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--confidence <confidence>', 'Confidence level (low|medium|high)')
    .option('--importance <n>', 'Importance from 0 to 1', parseFloat)
    .option('--set <k=v>', 'Extra field key=value (repeatable; "[a,b]" value is a string array)', collectSet, [])
    .option('--scope <scope>', 'Scope field for types that declare one (rule: project|global)')
    .option('--facet <facet>', 'Note facet (required for note; howto|pitfall|context|metric|history|legacy|constraint)')
    .option('--created-by <actor>', 'Creator actor (default: env WOLF_ACTOR, else user:cli)')
    .action(
      withCliCall(
        'add',
        (options) => runAddAction(baseDir, options),
        // волна 0 0.1: args_summary в mcp_call-сигнал (body не попадает);
        // extra_keys — из --set пар (парсинг дублируется дёшево, телеметрия в try/catch обёртки)
        (options) => ({
          args_summary: addArgsSummary({
            type: options.type,
            title: options.title,
            extra: parseSetPairs(options.set as string[], options.type),
          }),
        })
      )
    );
}
