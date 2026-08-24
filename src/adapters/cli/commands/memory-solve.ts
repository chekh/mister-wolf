import { Command } from 'commander';
import { buildSolvePack } from '../../../app/use-cases/build-solve-pack.js';
import { createMemoryRepairRequest } from '../../../app/use-cases/create-memory-repair-request.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memorySolveCommand(): Command {
  return new Command('solve')
    .description('Build a solve pack for a memory problem')
    .argument('<problem>', 'Problem description')
    .option('--save', 'Save a memory repair request')
    .option('--thread <id>', 'Thread the repair request')
    .action(async (problem: string, options: { save?: boolean; thread?: string }) => {
      const { store, index, clock, log, idGen } = createCliContainer(process.cwd());
      const { markdown, objectIds } = await buildSolvePack({ store, index, clock }, { problem });
      console.log(markdown);
      if (options.save) {
        const { object } = await createMemoryRepairRequest(
          { store, log, clock, idGen, index },
          { problem, relevantIds: objectIds, createdBy: 'user:cli', thread: options.thread }
        );
        console.log(`Saved repair request: ${object.id}`);
      }
    });
}
