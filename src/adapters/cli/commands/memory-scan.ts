import { Command } from 'commander';
import { scanProject } from '../../../app/use-cases/scan-project.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryScanCommand(): Command {
  return new Command('scan')
    .description('Scan the project and save a context snapshot')
    .action(async () => {
      const { store, log, clock, idGen, scanner } = createCliContainer(process.cwd());
      const result = await scanProject({ store, log, clock, idGen, scanner }, process.cwd());
      console.log(`Project scan saved: ${result.object.id}`);
    });
}
