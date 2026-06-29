import { Command } from 'commander';
import { initProjectMemory } from '../../../app/use-cases/init-project-memory.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryInitCommand(): Command {
  return new Command('init').description('Initialize Mr. Wolf memory for this project').action(async () => {
    const { initializer } = createCliContainer(process.cwd());
    await initProjectMemory(initializer, process.cwd());
    console.log('Project memory initialized.');
  });
}
