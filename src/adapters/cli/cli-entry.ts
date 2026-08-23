import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Command } from 'commander';
import { memoryInitCommand as initCommand } from './commands/memory-init.js';
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
import { memoryTaxonomyCommand as taxonomyCommand } from './commands/memory-taxonomy.js';
import { memoryMigrateCommand as migrateCommand } from './commands/memory-migrate.js';

function readPackageVersion(): string {
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(baseDir, '../../../package.json'), 'utf-8')) as { version: string };
  return pkg.version;
}

export function createCli(): Command {
  const program = new Command('wolf');
  program.version(readPackageVersion());

  program.addCommand(initCommand());
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
  program.addCommand(taxonomyCommand());
  program.addCommand(migrateCommand());

  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createCli().parse();
}
