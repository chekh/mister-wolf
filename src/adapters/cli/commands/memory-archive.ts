import { Command } from 'commander';
import { safeCwd } from '../cli-entry.js';
import { transitionMemoryObject } from '../../../app/use-cases/transition-memory-object.js';
import { createCliContainer } from '../../../bootstrap/container.js';

// wolf archive (спека 2.13 §6.1 E1): сахар transition → archived.
// transition остаётся полной матрицей статусов.
// baseDir инъектится для тестов (прецедент: memory-update.ts).
export function memoryArchiveCommand(baseDir: string = safeCwd()): Command {
  return new Command('archive')
    .description('Archive a memory object (sugar for: transition archived)')
    .argument('<id>', 'Memory object id')
    .option('--actor <actor>', 'Actor performing the archive', 'user:cli')
    .action(async (id: string, options: { actor: string }) => {
      const { store, log, clock, idGen, index, declarations } = createCliContainer(baseDir);
      await transitionMemoryObject({ store, log, clock, idGen, index, declarations }, id, 'archived', options.actor);
      console.log(`Archived ${id}.`);
    });
}
