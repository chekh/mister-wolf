import { Command } from 'commander';
import { safeCwd } from '../cli-entry.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { editMemoryObject } from '../../../app/use-cases/edit-memory-object.js';

// wolf edit (спека 2.13 §6.1): механика — в use-case edit-memory-object
// (2.17.1 REQ-04/R05: guard face-типа в use-case слое, не в CLI); команда —
// только разбор аргументов и печать.
export function memoryEditCommand(baseDir: string = safeCwd()): Command {
  return new Command('edit')
    .description('Edit title and/or body of a memory object (diff-audited in events.jsonl)')
    .argument('<id>', 'Memory object id')
    .option('--title <t>', 'New title')
    .option('--body <b>', 'New body')
    .option('--actor <actor>', 'Actor performing the edit', 'user:cli')
    .action(async (id: string, options: { title?: string; body?: string; actor: string }) => {
      const { store, log, clock, idGen, index, lock } = createCliContainer(baseDir);
      const result = await editMemoryObject({ store, log, clock, idGen, index, lock }, { ...options, id });
      console.log(`Edited ${id}: ${result.fields.join(', ')}`);
    });
}
