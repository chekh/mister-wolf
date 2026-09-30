import { Command, Option } from 'commander';
import { safeCwd } from './cli-entry.js';
import {
  DEFAULT_CHARACTER_FACETS,
  getDeclaration,
  type FieldSpec,
  type MemoryType,
  type MemoryTypeDeclaration,
} from '../../domain/memory-types.js';
import { runAddAction } from './commands/memory-add.js';
import { runListAction } from './commands/memory-list.js';
import { addArgsSummary } from '../fs/session-metrics-log.js';
import { withCliCall } from './commands/with-cli-call.js';

/**
 * Спека 2.13 §6.3 (P222): commander-неймспейсы `wolf <type> add|list` генерируются
 * из деклараций таксономии — обязательные поля → обязательные флаги, enum → choices
 * (фасет note — из словаря §5.3). Прецедент автогенерации полей — perTypeExtraFields
 * (type-schema-builder.ts). Тонкие обёртки: add/list делегируют в те же действия,
 * что `wolf add --type <type>` / `wolf list --type <type>` (runAddAction/runListAction).
 *
 * `tool` — спец-случай: живая обёртка memory-tool.ts (register/use/expose/...);
 * генерённый `tool add` = синоним register, `tool list` — существующий list
 * (guard-тест собирает program из typeNamespaceCommand + memoryToolCommand).
 */

const TYPE_NAMESPACE_DESCRIPTIONS: Record<Exclude<MemoryType, 'tool'>, string> = {
  rule: 'Manage rules',
  lesson: 'Manage lessons',
  decision: 'Manage decisions',
  thread: 'Manage work threads',
  complaint: 'Manage complaints',
  note: 'Manage notes',
};

const kebab = (s: string): string => s.replace(/_/g, '-');
const camel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

const splitCsv = (value: string): string[] => value.split(',').map((item: string) => item.trim());

/** FieldSpec → commander-опция (зеркало fieldToZod: required → mandatory). */
function addFieldOption(cmd: Command, name: string, spec: FieldSpec): void {
  const flag = `--${kebab(name)} <${kebab(name)}>`;
  if (spec.kind === 'string') {
    if ('required' in spec && spec.required) cmd.requiredOption(flag, `${name} (required)`);
    else cmd.option(flag, name);
    return;
  }
  if (spec.kind === 'string[]') {
    if ('required' in spec && spec.required) cmd.requiredOption(flag, `${name} (comma-separated)`, splitCsv);
    else cmd.option(flag, `${name} (comma-separated)`, splitCsv);
    return;
  }
  if (spec.kind === 'enum') {
    cmd.addOption(new Option(flag, name).choices([...spec.values]).makeOptionMandatory());
    return;
  }
  // int-поля — счётчики (complaint.dispatch_ages и пр.): флага нет, значение — через --set;
  // boolean — через --set ('true'/'false' коэрсится в parseSetPairs)
}

function typeAddCommand(decl: MemoryTypeDeclaration, baseDir: string): Command {
  const cmd = new Command('add').description(`Add a ${decl.name} (generated from taxonomy)`);
  cmd.requiredOption('--title <title>', 'Title');
  cmd.option('--body <body>', 'Body text');
  cmd.option('--tags <tags>', 'Comma-separated tags');
  cmd.option('--confidence <confidence>', 'Confidence level (low|medium|high)');
  cmd.option('--importance <n>', 'Importance from 0 to 1', parseFloat);
  cmd.option('--set <k=v>', 'Extra field key=value (repeatable)', (v: string, prev: string[]) => [...prev, v], []);
  cmd.option('--created-by <actor>', 'Creator actor (default: env WOLF_ACTOR, else user:cli)');

  // поля декларации → флаги; scope/facet идут через общие флаги add-пути
  // (дубль-гварды в runAddAction), int/boolean — только через --set
  const flagFields: Array<{ field: string; key: string }> = [];
  for (const [name, spec] of Object.entries(decl.fields ?? {})) {
    if (name === 'scope' || name === 'facet') {
      if (spec.kind === 'enum') {
        cmd.addOption(new Option(`--${name} <${name}>`, name).choices([...spec.values]).makeOptionMandatory());
      }
      continue;
    }
    if (spec.kind === 'int' || spec.kind === 'boolean') continue;
    addFieldOption(cmd, name, spec);
    flagFields.push({ field: name, key: camel(name) });
  }

  const extraFrom = (options: Record<string, unknown>): Record<string, unknown> => {
    const extra: Record<string, unknown> = {};
    for (const { field, key } of flagFields) {
      if (options[key] !== undefined) extra[field] = options[key];
    }
    return extra;
  };

  return cmd.action(
    withCliCall(
      'add',
      async (options: Record<string, unknown>) =>
        runAddAction(baseDir, {
          type: decl.name,
          title: options.title as string,
          body: options.body as string | undefined,
          tags: options.tags as string | undefined,
          confidence: options.confidence as string | undefined,
          importance: options.importance as number | undefined,
          set: options.set as string[] | undefined,
          scope: options.scope as string | undefined,
          facet: options.facet as string | undefined,
          createdBy: options.createdBy as string | undefined,
          extraFields: extraFrom(options),
        }),
      (options: Record<string, unknown>) => ({
        args_summary: addArgsSummary({
          type: decl.name,
          title: options.title as string,
          extra: extraFrom(options),
        }),
      })
    )
  );
}

function typeListCommand(type: MemoryType): Command {
  const cmd = new Command('list').description(`List ${type} memory objects (generated from taxonomy)`);
  cmd.option('--status <status>', 'Filter by status');
  cmd.option('--stale', 'List stale objects (not updated in 30 days)', false);
  if (type === 'note') {
    cmd.option('--facet <facet>', `Filter by character facet (${DEFAULT_CHARACTER_FACETS.join('|')})`);
  }
  return cmd.action(
    withCliCall('list', async (options: Record<string, unknown>) =>
      runListAction({
        type,
        status: options.status as string | undefined,
        stale: options.stale as boolean | undefined,
        facet: options.facet as string | undefined,
      })
    )
  );
}

/** Неймспейс `wolf <type>` с генерёнными add|list (всё, кроме tool — живая обёртка). */
export function typeNamespaceCommand(type: Exclude<MemoryType, 'tool'>, baseDir: string = safeCwd()): Command {
  const decl = getDeclaration(type);
  const ns = new Command(type).description(TYPE_NAMESPACE_DESCRIPTIONS[type]);
  ns.addCommand(typeAddCommand(decl, baseDir));
  ns.addCommand(typeListCommand(type));
  return ns;
}
