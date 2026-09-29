import { Command, CommanderError } from 'commander';
import { getWolfVersion } from '../version.js';
import { UserFacingError } from '../../domain/errors.js';
import { ensureCliSessionId } from '../../domain/actor.js';
import { removedCommandHint } from './removed-commands.js';

/**
 * Спека 2.13 §10.4: удалённые команды (без синонимов) отвечают ошибкой с
 * подсказкой. Commander уже напечатал свою строку (`error: unknown command
 * 'run'`) к моменту _exit — допечатываем подсказку и выходим. Прочие коды
 * выходят с родным exitCode (help/version = 0, ошибки = 1), т.е. дефолтное
 * поведение (включая suggestions опечаток) не меняется.
 */
function exitWithRemovedHint(err: CommanderError): never {
  const match = err.message.match(/unknown command '([^']+)'/);
  if (match) {
    const hint = removedCommandHint(match[1]);
    if (hint) {
      console.error(`Error: ${hint}`);
      process.exit(1);
    }
  }
  process.exit(err.exitCode);
}

/**
 * Спека A3 / план P101: ленивые команды. Статические импорты 45 командных
 * модулей заставляли `--version`/`--help` платить за весь import-граф
 * (zod/js-yaml/etc). Вместо этого — статические метаданные (name +
 * description + usage-хинт для списка команд в program --help, скопированы
 * дословно из командных модулей), тела подгружаются `await import()` только
 * внутри action выбранной команды.
 */
interface CommandSpec {
  name: string;
  description: string;
  /** usage-хинт в списке команд program --help (`get [options] <id>`); '' — без хинта. */
  usage: string;
  load: () => Promise<Command>;
  /** Скрытый синоним (спека 2.13 §6.5): работает, не показывается в help (до 2.15). */
  hidden?: boolean;
  /** Скрытый синоним переносит argv на `analytics --view <aliasView>` (+ stderr-предупреждение). */
  aliasView?: string;
}

/** Порядок = порядок бывших addCommand: влияет на `--help` и unknown-command suggestions. */
const COMMANDS: CommandSpec[] = [
  {
    name: 'init',
    description: 'Initialize Mr. Wolf memory for this project (interactive in TTY; non-interactive requires --model)',
    usage: '[options]',
    load: () => import('./commands/memory-init.js').then((m) => m.memoryInitCommand()),
  },
  {
    name: 'sync',
    description: 'Re-render the wolf base set (stamped files only; memory untouched)',
    usage: '',
    load: () => import('./commands/memory-sync.js').then((m) => m.memorySyncCommand()),
  },
  {
    name: 'add',
    description: 'Add a memory object',
    usage: '[options]',
    load: () => import('./commands/memory-add.js').then((m) => m.memoryAddCommand()),
  },
  {
    name: 'list',
    description: 'List memory objects',
    usage: '[options]',
    load: () => import('./commands/memory-list.js').then((m) => m.memoryListCommand()),
  },
  {
    name: 'get',
    description: 'Get a memory object by id',
    usage: '[options] <id>',
    load: () => import('./commands/memory-get.js').then((m) => m.memoryGetCommand()),
  },
  {
    name: 'search',
    description: 'Search memory objects',
    usage: '[options] <query>',
    load: () => import('./commands/memory-search.js').then((m) => m.memorySearchCommand()),
  },
  {
    name: 'edit',
    description: 'Edit title and/or body of a memory object (diff-audited in events.jsonl)',
    usage: '[options] <id>',
    load: () => import('./commands/memory-edit.js').then((m) => m.memoryEditCommand()),
  },
  {
    name: 'rebuild-index',
    description: 'Rebuild the SQLite search index from memory objects',
    usage: '',
    load: () => import('./commands/memory-rebuild-index.js').then((m) => m.memoryRebuildIndexCommand()),
  },
  {
    name: 'supersede',
    description: 'Supersede a memory object with another',
    usage: '<old-id> <new-id>',
    load: () => import('./commands/memory-supersede.js').then((m) => m.memorySupersedeCommand()),
  },
  {
    name: 'transition',
    description: 'Transition a memory object to a new status',
    usage: '[options] <id> <status>',
    load: () => import('./commands/memory-transition.js').then((m) => m.memoryTransitionCommand()),
  },
  {
    name: 'archive',
    description: 'Archive a memory object (sugar for transition to archived)',
    usage: '[options] <id>',
    load: () => import('./commands/memory-archive.js').then((m) => m.memoryArchiveCommand()),
  },
  {
    name: 'scan',
    description: 'Scan the project and save a context snapshot',
    usage: '',
    load: () => import('./commands/memory-scan.js').then((m) => m.memoryScanCommand()),
  },
  {
    name: 'brief',
    description: 'Generate the agent brief from the latest scan and memory',
    usage: '',
    load: () => import('./commands/memory-brief.js').then((m) => m.memoryBriefCommand()),
  },
  {
    name: 'thread',
    description: 'Manage work threads',
    usage: '',
    load: () => import('./commands/memory-thread.js').then((m) => m.memoryThreadCommand()),
  },
  {
    name: 'diff',
    description: 'Show thread changes since a checkpoint',
    usage: '[options] <thread-id>',
    load: () => import('./commands/memory-session.js').then((m) => m.memoryThreadDiffCommand()),
  },
  {
    name: 'decision',
    description: 'Manage decisions',
    usage: '',
    load: () => import('./commands/memory-decision.js').then((m) => m.memoryDecisionCommand()),
  },
  {
    name: 'blocker',
    description: 'Manage blockers',
    usage: '',
    load: () => import('./commands/memory-blocker.js').then((m) => m.memoryBlockerCommand()),
  },
  {
    name: 'info-request',
    description: 'Manage info requests',
    usage: '',
    load: () => import('./commands/memory-info-request.js').then((m) => m.memoryInfoRequestCommand()),
  },
  {
    name: 'article',
    description: 'Manage articles',
    usage: '',
    load: () => import('./commands/memory-article.js').then((m) => m.memoryArticleCommand()),
  },
  {
    name: 'session',
    description: 'Manage sessions and checkpoints',
    usage: '',
    load: () => import('./commands/memory-session.js').then((m) => m.memorySessionCommand()),
  },
  {
    name: 'mcp',
    description: 'Start the MCP server (stdio)',
    usage: '',
    load: () => import('./commands/memory-mcp.js').then((m) => m.memoryMcpCommand()),
  },
  {
    name: 'rule',
    description: 'Manage rules',
    usage: '',
    load: () => import('./commands/memory-rule.js').then((m) => m.memoryRuleCommand()),
  },
  {
    name: 'relation',
    description: 'Manage relations between memory objects',
    usage: '',
    load: () => import('./commands/memory-relation.js').then((m) => m.memoryRelationCommand()),
  },
  {
    name: 'taxonomy',
    description: 'Manage memory taxonomy',
    usage: '',
    load: () => import('./commands/memory-taxonomy.js').then((m) => m.memoryTaxonomyCommand()),
  },
  {
    name: 'migrate',
    description: 'One-time migration: objects/<type>/ -> threads/<tid>/<subdir>/ + shared/',
    usage: '[options]',
    load: () => import('./commands/memory-migrate.js').then((m) => m.memoryMigrateCommand()),
  },
  {
    name: 'validate',
    description: 'Validate memory store integrity',
    usage: '[options]',
    load: () => import('./commands/memory-validate.js').then((m) => m.memoryValidateCommand()),
  },
  {
    name: 'solve',
    description: 'Build a solve pack for a memory problem',
    usage: '[options] <problem>',
    load: () => import('./commands/memory-solve.js').then((m) => m.memorySolveCommand()),
  },
  {
    name: 'call',
    description: 'Get active call injections',
    usage: '[options]',
    load: () => import('./commands/memory-call.js').then((m) => m.memoryCallCommand()),
  },
  {
    name: 'insights',
    description: 'Deprecated hidden synonym: analytics --view readiness (removed in 2.15)',
    usage: '[options]',
    hidden: true,
    aliasView: 'readiness',
    load: () => import('./commands/analytics.js').then((m) => m.analyticsCommand()),
  },
  {
    name: 'recap',
    description: 'Summarize active project memory: rules, threads, blockers, questions, decisions',
    usage: '',
    load: () => import('./commands/memory-recap.js').then((m) => m.memoryRecapCommand()),
  },
  {
    name: 'think',
    description: 'Structured thinking sequences (goal -> thoughts -> conclusion)',
    usage: '',
    load: () => import('./commands/memory-think.js').then((m) => m.memoryThinkCommand()),
  },
  {
    name: 'scaffold',
    description: 'Scaffold opencode frame (agent|skill|command) + playbook in Wolf memory',
    usage: '[options] <kind> <name>',
    load: () => import('./commands/memory-scaffold.js').then((m) => m.memoryScaffoldCommand()),
  },
  {
    name: 'tool',
    description: 'Tool librarian: register/list/use/expose/deprecate/revive',
    usage: '',
    load: () => import('./commands/memory-tool.js').then((m) => m.memoryToolCommand()),
  },
  {
    name: 'complain',
    description: 'File a complaint about a rule/playbook/agent as a memory object (type complaint, status open)',
    usage: '[options]',
    load: () => import('./commands/memory-complain.js').then((m) => m.memoryComplainCommand()),
  },
  {
    name: 'update',
    description:
      'Update triage fields of a memory object (whitelist: --set triage|resolution, --inc dispatch_ages|corroborations, --tags append)',
    usage: '[options] <id>',
    load: () => import('./commands/memory-update.js').then((m) => m.memoryUpdateCommand()),
  },
  {
    name: 'effectiveness',
    description: 'Deprecated hidden synonym: analytics --view effectiveness (removed in 2.15)',
    usage: '[options]',
    hidden: true,
    aliasView: 'effectiveness',
    load: () => import('./commands/analytics.js').then((m) => m.analyticsCommand()),
  },
  {
    name: 'analytics',
    description:
      'Effectiveness analytics: ledgers (memory/tools/rules), weekly activity, agents, steward view, councils, outliers, experiment readiness, memory lifecycle & coordination, campaigns & per-memory ROI, machine acceptance (wave metrics), state windows (effectiveness, dashboard)',
    usage: '[options]',
    load: () => import('./commands/analytics.js').then((m) => m.analyticsCommand()),
  },
  {
    name: 'dashboard',
    description: 'Deprecated hidden synonym: analytics --view dashboard (removed in 2.15)',
    usage: '[options]',
    hidden: true,
    aliasView: 'dashboard',
    load: () => import('./commands/analytics.js').then((m) => m.analyticsCommand()),
  },
  {
    name: 'task-eval',
    description: 'Record a task verdict into the signal log (event task_evaluated)',
    usage: '[options]',
    load: () => import('./commands/task-eval.js').then((m) => m.taskEvalCommand()),
  },
  {
    name: 'bootstrap',
    description: 'Scan the project and draft starting memory: proposed rules, document-refs, work thread',
    usage: '[options]',
    load: () => import('./commands/memory-bootstrap.js').then((m) => m.memoryBootstrapCommand()),
  },
  {
    name: 'upgrade',
    description:
      'Upgrade the global wolf installation to the latest npm version (runs npm install -g mister-wolf@latest); --check only compares versions, no install',
    usage: '[options]',
    load: () => import('./commands/memory-upgrade.js').then((m) => m.memoryUpgradeCommand()),
  },
  {
    name: 'doctor',
    description: 'Check all registered projects: binary vs schema version, platform configs, prune dead entries',
    usage: '',
    load: () => import('./commands/memory-doctor.js').then((m) => m.memoryDoctorCommand()),
  },
];

export function createCli(): Command {
  const program = new Command('wolf');
  program.version(getWolfVersion());
  // 2.13 §10.4: удалённые имена — подсказка (механизм exitWithRemovedHint выше)
  program.exitOverride(exitWithRemovedHint);
  // P101: стаб-команды несут usage-хинт списка команд в `.usage()` — дефолтный
  // subcommandTerm собирает терм из declared arguments/options (которых у стаба
  // нет) и кастомный usage игнорирует. Наш рендер: явный usage => `name usage`.
  program.configureHelp({
    subcommandTerm(cmd: Command): string {
      return cmd.usage() !== '' ? `${cmd.name()} ${cmd.usage()}` : cmd.name();
    },
  });

  for (const spec of COMMANDS) {
    const stub = new Command(spec.name)
      .description(spec.description)
      .allowUnknownOption()
      .helpOption(false)
      .action(async () => {
        // Скрытый синоним (§6.5): deprecation-строка в stderr (stdout не шумит
        // для машин) + перенос argv на analytics --view <aliasView>.
        if (spec.aliasView !== undefined) {
          process.stderr.write(
            `[wolf] '${spec.name}' is deprecated since 2.13 and hidden: it now maps to "analytics --view ${spec.aliasView}"; it will be removed in 2.15\n`
          );
          const real = await import('./commands/analytics.js').then((m) => m.analyticsCommand());
          new Command('wolf').addCommand(real);
          await real.parseAsync(['--view', spec.aliasView, ...process.argv.slice(3)], { from: 'user' });
          return;
        }
        // Делегирование исходных токенов: process.argv = [node, cli.js, <cmd>, ...args],
        // slice(3) + from:'user' — реальная команда сама парсит опции/позиционные/сабкоманды.
        const real = await spec.load();
        // addCommand не копирует exitOverride (наследует только .command()) —
        // вешаем явно: unknown subcommand (`session checkpoint`) получает подсказку.
        real.exitOverride(exitWithRemovedHint);
        // Префикс wolf в usage реального хелпа (`wolf get --help` → `Usage: wolf get ...`):
        // standalone-команда показывает usage без имени программы, поэтому вешаем на родителя.
        new Command('wolf').addCommand(real);
        await real.parseAsync(process.argv.slice(3), { from: 'user' });
      });
    if (spec.usage !== '') stub.usage(spec.usage);
    program.addCommand(stub, spec.hidden === true ? { hidden: true } : undefined);
  }

  // `wolf help <cmd>` — хелп реальной команды: дефолтный help-обработчик commander
  // нашёл бы стаб и напечатал бы пустой стаб-хелп (REGRESSION). Поведение дефолта
  // воспроизведено: без топика — program help (stdout, exit 0); неизвестный топик —
  // program help в stderr, exit 1; лишние топики игнорируются (хелп первого).
  // addCommand (не addHelpCommand): последний кладёт команду только в
  // _helpCommand, диспетчер её не находит и уходит в дефолтный _dispatchHelpCommand,
  // который печатает стаб-хелп — кастомный экшен оставался мёртвым кодом.
  program.addCommand(
    new Command('help')
      .description('display help for command')
      .arguments('[command]')
      .helpOption(false)
      .allowExcessArguments()
      .action(async (topic?: string) => {
        if (topic === undefined) {
          program.help();
          return;
        }
        // 2.13 §10.4: help по удалённой команде — та же подсказка, что при вызове
        const removedHint = removedCommandHint(topic);
        if (removedHint) {
          console.error(`Error: ${removedHint}`);
          process.exit(1);
        }
        const spec = COMMANDS.find((c) => c.name === topic);
        if (!spec) {
          process.stderr.write(program.helpInformation());
          process.exit(1);
        }
        const real = await spec.load();
        real.exitOverride(exitWithRemovedHint);
        new Command('wolf').addCommand(real);
        real.help();
      })
  );

  return program;
}

/**
 * process.cwd() с защитой от удалённого каталога (F13): если cwd удалён
 * (например, это был wolf worktree), Node кидает сырой ENOENT uv_cwd —
 * переводим его в UserFacingError (одна строка `Error: …`, exit 1, без стека).
 */
export function safeCwd(): string {
  try {
    return process.cwd();
  } catch {
    throw new UserFacingError(
      'current directory does not exist (probably deleted) — cd into an existing directory and rerun the command'
    );
  }
}

/** Единая точка запуска: UserFacingError → одна строка Error:, иначе стек (W4). */
export async function runCli(argv: string[]): Promise<void> {
  try {
    // спека §6: `init --recreate` — единственный путь восстановления при битом .wolf/config.yaml;
    // guard на битом yaml бросает с хинтом на эту команду, поэтому она сама его обходит.
    // Матч строгий: argv = [node, cli.js, <command>, ...], команда — ровно argv[2] === 'init'
    // (не подстрока — иначе `wolf add --title "... init ..."` ложно обходил бы guard);
    // `--recreate` проверяется точным токеном массива.
    const isRecoveryInit = argv[2] === 'init' && argv.includes('--recreate');
    const program = createCli();
    // P101 (спека A3): schema-guard платится только выбранной командой — preAction-хук
    // срабатывает после разбора argv и выбора команды, но ДО её action (side-effects).
    // `--version` / top-level `--help` / неизвестная команда до action не доходят —
    // guard не платят. Динамический import: schema-guard тянет yaml-стек.
    program.hook('preAction', async () => {
      if (!isRecoveryInit) {
        const { ensureCurrentSchema } = await import('../../adapters/fs/schema-guard.js');
        await ensureCurrentSchema(safeCwd());
      }
    });
    // Волна 0 (0.2): per-invocation session-ключ CLI-канала (все writers процесса
    // получают один id). `mcp` — исключение: long-lived сервер, один env на все
    // запросы = фальшивая сессия, канал не сессионируется.
    if (argv[2] !== 'mcp') ensureCliSessionId();
    await program.parseAsync(argv);
  } catch (err: unknown) {
    if (err instanceof UserFacingError) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    throw err; // неожиданное исключение — стек сохраняется (unhandled rejection)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runCli(process.argv);
}
