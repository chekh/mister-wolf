import { Command, Option } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  registerTool,
  listTools,
  useTool,
  exposeTool,
  deprecateTool,
  reviveTool,
  type ToolObject,
} from '../../../app/use-cases/tool-librarian.js';
import { toolStats } from '../../../app/use-cases/tool-stats.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { resolveCreatedBy } from '../../../domain/actor.js';
import { appendDeliverySignal } from '../../../adapters/fs/session-metrics-log.js';

function printContractReminder(tool: ToolObject): void {
  console.log(`Input: ${tool.contract_input ?? '—'}`);
  console.log(`Output: ${tool.contract_output ?? '—'}`);
  console.log(`Environment: ${tool.contract_environment ?? '—'}`);
  console.log(`Script: ${tool.script_path}`);
}

export function memoryToolCommand(): Command {
  const cmd = new Command('tool').description('Tool librarian: register/list/use/expose/deprecate/revive');

  cmd
    .command('register <script-path>')
    .description('Register a script as tool memory object (copies script to .wolf/tools/)')
    .requiredOption('--name <name>', 'Tool name (unique)')
    .requiredOption('--language <language>', 'Script language (typescript, python, bash, ...)')
    // contract-in/out — опциональные (как в доменной схеме tool): иначе commander
    // режет повторный register раньше, чем сработает dedup-проверка «похожие».
    .option('--contract-in <text>', 'Input contract')
    .option('--contract-out <text>', 'Output contract')
    .option('--contract-env <text>', 'Environment contract')
    .option('--notes <text>', 'Notes (stored as object body)')
    .option('--force', 'Skip similar-tools check', false)
    .option('--created-by <actor>', 'Creator actor (default: env WOLF_ACTOR, else user:cli)')
    .action(
      async (
        scriptPath: string,
        options: {
          name: string;
          language: string;
          contractIn: string;
          contractOut: string;
          contractEnv?: string;
          notes?: string;
          force?: boolean;
          createdBy?: string;
        }
      ) => {
        const { store, log, clock, idGen, index, lock, declarations, fs } = createCliContainer(process.cwd());
        const result = await registerTool(
          { store, log, clock, idGen, index, lock, declarations, fs, baseDir: process.cwd() },
          {
            scriptPath,
            name: options.name,
            language: options.language,
            contractIn: options.contractIn,
            contractOut: options.contractOut,
            contractEnvironment: options.contractEnv,
            notes: options.notes,
            force: options.force,
            createdBy: resolveCreatedBy(options.createdBy),
          }
        );
        console.log(`Registered tool ${options.name}: ${result.toolId}`);
        console.log(`Script: ${result.scriptPath}`);
      }
    );

  cmd
    .command('list')
    .description('List registered tools')
    .addOption(
      new Option('--status <status>', 'Filter by status').choices(['active', 'candidate', 'deprecated', 'archived'])
    )
    .action(async (options: { status?: string }) => {
      const { store } = createCliContainer(process.cwd());
      const tools = await listTools({ store }, { status: options.status });
      const nameW = 24;
      const statusW = 12;
      console.log(`${'name'.padEnd(nameW)}${'status'.padEnd(statusW)}${'usage_count'.padEnd(14)}last_used_at`);
      for (const t of tools) {
        console.log(
          `${t.name.padEnd(nameW)}${t.status.padEnd(statusW)}${String(t.usage_count ?? 0).padEnd(14)}${
            t.last_used_at ?? '—'
          }`
        );
      }
    });

  cmd
    .command('use <name-or-id>')
    .description('Mark tool as used (increments usage_count, prints contract reminder)')
    .action(async (nameOrId: string) => {
      const { store, log, clock, idGen, index, lock, declarations } = createCliContainer(process.cwd());
      const tool = await useTool(
        { store, log, clock, idGen, index, lock, declarations },
        { nameOrId, actor: resolveCreatedBy(undefined) }
      );
      printContractReminder(tool);
      console.log(`usage_count: ${tool.usage_count ?? 0}`);
    });

  cmd
    .command('expose <name-or-id>')
    .description('(Re)generate .opencode/skills/<name>/SKILL.md from tool object (idempotent)')
    .action(async (nameOrId: string) => {
      const { store, log, clock, idGen, index, lock, declarations, fs } = createCliContainer(process.cwd());
      const result = await exposeTool(
        { store, log, clock, idGen, index, lock, declarations, fs, baseDir: process.cwd() },
        { nameOrId }
      );
      // Ф20 (в): delivery_event — методика тула доставлена как skill
      const skillName = result.path.split('/').at(-2) ?? nameOrId;
      appendDeliverySignal(process.cwd(), {
        name: skillName,
        mechanism: 'skill',
        target: result.path,
        actor: resolveCreatedBy(undefined),
      });
      console.log(`Exposed skill: ${result.path}`);
    });

  cmd
    .command('deprecate <name-or-id>')
    .description('Deprecate a tool (requires reason)')
    .requiredOption('--reason <text>', 'Deprecation reason')
    .action(async (nameOrId: string, options: { reason: string }) => {
      const { store, log, clock, idGen, index, lock, declarations } = createCliContainer(process.cwd());
      const tool = await deprecateTool(
        { store, log, clock, idGen, index, lock, declarations },
        { nameOrId, reason: options.reason, actor: resolveCreatedBy(undefined) }
      );
      console.log(`Deprecated tool ${tool.name}: ${tool.id}`);
    });

  cmd
    .command('revive <name-or-id>')
    .description('Revive a deprecated tool (deprecated → active)')
    .action(async (nameOrId: string) => {
      const { store, log, clock, idGen, index, lock, declarations } = createCliContainer(process.cwd());
      const tool = await reviveTool(
        { store, log, clock, idGen, index, lock, declarations },
        { nameOrId, actor: resolveCreatedBy(undefined) }
      );
      console.log(`Revived tool ${tool.name}: ${tool.id}`);
    });

  cmd
    .command('stats')
    .description('Usage counters per tool + reuse economy from .wolf/run-log.jsonl')
    .action(async () => {
      const { store } = createCliContainer(process.cwd());
      const logPath = join(process.cwd(), '.wolf', 'run-log.jsonl');
      const runLogText = existsSync(logPath) ? readFileSync(logPath, 'utf-8') : null;
      const result = await toolStats({ store }, { runLogText });

      console.log(`tools: ${result.tools.length}`);
      for (const t of result.tools) {
        console.log(
          `  ${t.name.padEnd(24)}${t.status.padEnd(12)}used ${String(t.usage_count).padEnd(6)}last: ${t.last_used_at ?? '—'}`
        );
      }
      console.log('');
      const e = result.economy;
      if (!e.sufficient) {
        console.log(`economy: недостаточно данных (${e.reason ?? 'нет валидных записей run-log'})`);
      } else {
        console.log(`economy: tool-задач ${e.toolRuns} из ${e.totalRuns}`);
        console.log(`  weighted-медиана с tool: ${e.medianTool}`);
        console.log(`  weighted-медиана всех:   ${e.medianAll}`);
        if (e.savingsPct !== null) {
          console.log(
            `  оценка экономии: ${e.savingsPct >= 0 ? '' : '+'}${Math.abs(e.savingsPct).toFixed(1)}% (индикатор, не доказательство)`
          );
        } else {
          console.log('  оценка экономии: не вычислена (медиана всех = 0)');
        }
      }
    });

  return cmd;
}
