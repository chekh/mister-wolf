import { Command, Option } from 'commander';
import { transitionMemoryObject } from '../../../app/use-cases/transition-memory-object.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import type { MemoryStatus } from '../../../domain/memory-types.js';

const MEMORY_STATUSES: MemoryStatus[] = [
  'active',
  'open',
  'resolved',
  'stale',
  'conflicting',
  'superseded',
  'archived',
  'paused',
  'completed',
  'answered',
  'rejected',
  'obsolete',
  'proposed',
  'accepted',
];

export function memoryTransitionCommand(): Command {
  return new Command('transition')
    .description('Transition a memory object to a new status')
    .argument('<id>', 'Memory object id')
    .argument('<status>', 'New status')
    .addOption(new Option('--status', 'Deprecated').hideHelp())
    .option('--actor <actor>', 'Actor performing the transition', 'user:cli')
    .action(async (id: string, status: string, options) => {
      const { store, log, clock, idGen, index, declarations } = createCliContainer(process.cwd());
      await transitionMemoryObject(
        { store, log, clock, idGen, index, declarations },
        id,
        status as never,
        options.actor
      );
      console.log(`Transitioned ${id} to ${status}.`);
    });
}
