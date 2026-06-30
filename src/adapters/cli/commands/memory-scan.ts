import { Command } from 'commander';
import { scanProject } from '../../../app/use-cases/scan-project.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryScanCommand(): Command {
  return new Command('scan').description('Scan the project and save a context snapshot').action(async () => {
    const { store, log, clock, idGen, scanner, index } = createCliContainer(process.cwd());
    const result = await scanProject({ store, log, clock, idGen, scanner, index }, process.cwd());
    console.log(`Project scan saved: ${result.object.id}`);
    if (result.documents.length > 0) {
      console.log(`Registered ${result.documents.length} project document(s):`);
      for (const doc of result.documents) {
        console.log(`  - ${doc.id}: ${doc.title}`);
      }
    }
  });
}
