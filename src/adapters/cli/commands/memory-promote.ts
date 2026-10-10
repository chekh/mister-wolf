import { Command } from 'commander';
import { promoteWorktreeMemory } from '../../../app/use-cases/promote-memory.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { safeCwd } from '../cli-entry.js';

export function memoryPromoteCommand(): Command {
  return new Command('promote')
    .description('Deliver worktree-scoped memory objects: promote them to main scope')
    .argument('<worktree>', 'Worktree name whose scoped objects become main')
    .action(async (worktree: string) => {
      const { store, log, clock, idGen, index, lock } = createCliContainer(safeCwd());
      const result = await promoteWorktreeMemory({ store, log, clock, idGen, index, lock }, worktree);
      console.log(`Promoted ${result.promoted} object(s) from ${result.scopeFrom} to main`);
    });
}
