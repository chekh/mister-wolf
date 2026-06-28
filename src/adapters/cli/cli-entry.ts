import { Command } from 'commander';
import { memoryInitCommand } from './commands/memory-init.js';
import { memoryAddCommand } from './commands/memory-add.js';
import { memoryListCommand } from './commands/memory-list.js';
import { memoryGetCommand } from './commands/memory-get.js';

export function createCli(): Command {
  const program = new Command('wolf');
  program.version('0.2.0');

  const memory = new Command('memory');
  memory.addCommand(memoryInitCommand());
  memory.addCommand(memoryAddCommand());
  memory.addCommand(memoryListCommand());
  memory.addCommand(memoryGetCommand());

  program.addCommand(memory);
  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createCli().parse();
}
