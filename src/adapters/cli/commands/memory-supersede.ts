import { Command } from 'commander';
import { supersedeMemoryObject } from '../../../app/use-cases/supersede-memory-object.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memorySupersedeCommand(): Command {
  return new Command('supersede')
    .description('Supersede a memory object with another')
    .argument('<old-id>', 'Id of the memory object to supersede')
    .argument('<new-id>', 'Id of the replacement memory object')
    .action(async (oldId: string, newId: string) => {
      const { store, log, clock, idGen, index } = createCliContainer(process.cwd());
      await supersedeMemoryObject({ store, log, clock, idGen, index }, oldId, newId);
      console.log(`Superseded ${oldId} with ${newId}.`);
    });
}
