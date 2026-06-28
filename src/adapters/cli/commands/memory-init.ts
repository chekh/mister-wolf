import { Command } from 'commander';
import { initProjectMemory } from '../../../app/use-cases/init-project-memory.js';
import { FsProjectInitializer } from '../../fs/fs-project-initializer.js';

export function memoryInitCommand(): Command {
  return new Command('init')
    .description('Initialize Mr. Wolf memory for this project')
    .action(async () => {
      await initProjectMemory(new FsProjectInitializer(), process.cwd());
      console.log('Project memory initialized.');
    });
}
