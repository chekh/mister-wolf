import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Command } from 'commander';
import { memoryInitCommand } from './commands/memory-init.js';
import { memoryAddCommand } from './commands/memory-add.js';
import { memoryListCommand } from './commands/memory-list.js';
import { memoryGetCommand } from './commands/memory-get.js';
import { memorySearchCommand } from './commands/memory-search.js';
import { memoryRebuildIndexCommand } from './commands/memory-rebuild-index.js';
import { memorySupersedeCommand } from './commands/memory-supersede.js';

function readPackageVersion(): string {
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(baseDir, '../../../package.json'), 'utf-8')) as { version: string };
  return pkg.version;
}

export function createCli(): Command {
  const program = new Command('wolf');
  program.version(readPackageVersion());

  const memory = new Command('memory');
  memory.addCommand(memoryInitCommand());
  memory.addCommand(memoryAddCommand());
  memory.addCommand(memoryListCommand());
  memory.addCommand(memoryGetCommand());
  memory.addCommand(memorySearchCommand());
  memory.addCommand(memoryRebuildIndexCommand());
  memory.addCommand(memorySupersedeCommand());

  program.addCommand(memory);
  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createCli().parse();
}
