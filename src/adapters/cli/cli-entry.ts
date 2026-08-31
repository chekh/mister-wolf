import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Command } from 'commander';
import { ensureCurrentSchema } from '../../adapters/fs/schema-guard.js';
import { memoryInitCommand as initCommand } from './commands/memory-init.js';
import { memorySyncCommand as syncCommand } from './commands/memory-sync.js';
import { memoryDoctorCommand as doctorCommand } from './commands/memory-doctor.js';
import { memoryAddCommand as addCommand } from './commands/memory-add.js';
import { memoryListCommand as listCommand } from './commands/memory-list.js';
import { memoryGetCommand as getCommand } from './commands/memory-get.js';
import { memorySearchCommand as searchCommand } from './commands/memory-search.js';
import { memoryRebuildIndexCommand as rebuildIndexCommand } from './commands/memory-rebuild-index.js';
import { memorySupersedeCommand as supersedeCommand } from './commands/memory-supersede.js';
import { memoryTransitionCommand as transitionCommand } from './commands/memory-transition.js';
import { memoryScanCommand as scanCommand } from './commands/memory-scan.js';
import { memoryBriefCommand as briefCommand } from './commands/memory-brief.js';
import { memoryThreadCommand as threadCommand } from './commands/memory-thread.js';
import { memoryInfoRequestCommand as infoRequestCommand } from './commands/memory-info-request.js';
import { memoryArticleCommand as articleCommand } from './commands/memory-article.js';
import { memoryDecisionCommand as decisionCommand } from './commands/memory-decision.js';
import { memoryBlockerCommand as blockerCommand } from './commands/memory-blocker.js';
import {
  memorySessionCommand as sessionCommand,
  memoryThreadDiffCommand as threadDiffCommand,
} from './commands/memory-session.js';
import { memoryMcpCommand as mcpCommand } from './commands/memory-mcp.js';
import { memoryRuleCommand as ruleCommand } from './commands/memory-rule.js';
import { memoryRelationCommand as relationCommand } from './commands/memory-relation.js';
import { memoryTaxonomyCommand as taxonomyCommand } from './commands/memory-taxonomy.js';
import { memoryMigrateCommand as migrateCommand } from './commands/memory-migrate.js';
import { memoryCouncilCommand as councilCommand } from './commands/memory-council.js';
import { memoryValidateCommand as validateCommand } from './commands/memory-validate.js';
import { memorySolveCommand as solveCommand } from './commands/memory-solve.js';
import { memoryCallCommand as callCommand } from './commands/memory-call.js';
import { memoryInsightsCommand as insightsCommand } from './commands/memory-insights.js';
import { memoryRecapCommand as recapCommand } from './commands/memory-recap.js';
import { memoryThinkCommand as thinkCommand } from './commands/memory-think.js';
import { memoryScaffoldCommand as scaffoldCommand } from './commands/memory-scaffold.js';
import { memoryToolCommand as toolCommand } from './commands/memory-tool.js';
import { memoryComplainCommand as complainCommand } from './commands/memory-complain.js';
import { memoryLearnCommand as learnCommand } from './commands/memory-learn.js';
import { memoryEffectivenessCommand as effectivenessCommand } from './commands/memory-effectiveness.js';
import { memoryRunCommand as runCommand } from './commands/memory-run.js';
import { memoryBootstrapCommand as bootstrapCommand } from './commands/memory-bootstrap.js';
import { UserFacingError } from '../../domain/errors.js';

function readPackageVersion(): string {
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(baseDir, '../../../package.json'), 'utf-8')) as { version: string };
  return pkg.version;
}

export function createCli(): Command {
  const program = new Command('wolf');
  program.version(readPackageVersion());

  program.addCommand(initCommand());
  program.addCommand(syncCommand());
  program.addCommand(addCommand());
  program.addCommand(listCommand());
  program.addCommand(getCommand());
  program.addCommand(searchCommand());
  program.addCommand(rebuildIndexCommand());
  program.addCommand(supersedeCommand());
  program.addCommand(transitionCommand());
  program.addCommand(scanCommand());
  program.addCommand(briefCommand());
  program.addCommand(threadCommand());
  program.addCommand(threadDiffCommand());
  program.addCommand(decisionCommand());
  program.addCommand(blockerCommand());
  program.addCommand(infoRequestCommand());
  program.addCommand(articleCommand());
  program.addCommand(sessionCommand());
  program.addCommand(mcpCommand());
  program.addCommand(ruleCommand());
  program.addCommand(relationCommand());
  program.addCommand(taxonomyCommand());
  program.addCommand(migrateCommand());
  program.addCommand(councilCommand());
  program.addCommand(validateCommand());
  program.addCommand(solveCommand());
  program.addCommand(callCommand());
  program.addCommand(insightsCommand());
  program.addCommand(recapCommand());
  program.addCommand(thinkCommand());
  program.addCommand(scaffoldCommand());
  program.addCommand(toolCommand());
  program.addCommand(complainCommand());
  program.addCommand(learnCommand());
  program.addCommand(effectivenessCommand());
  program.addCommand(runCommand());
  program.addCommand(bootstrapCommand());
  program.addCommand(doctorCommand());

  return program;
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
    if (!isRecoveryInit) {
      await ensureCurrentSchema(process.cwd());
    }
    await createCli().parseAsync(argv);
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
