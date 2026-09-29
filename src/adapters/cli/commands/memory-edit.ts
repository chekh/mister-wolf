import { Command } from 'commander';
import { safeCwd } from '../cli-entry.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { UserFacingError } from '../../../domain/errors.js';
import type { MemoryObject } from '../../../domain/schemas/memory-object-schema.js';

// wolf edit (спека 2.13 §6.1): правка title/body с diff-аудитом — отдельное
// событие memory.edited на каждое изменённое поле, before/after обрезаны до
// 200 симв (прецедент target-обрезки волны 0, session-metrics-log.ts:482).
// Смыслные смены (смена решения и т.п.) — по-прежнему supersede.
const CLIP = 200;
const clip = (s: string): string => (s.length > CLIP ? s.slice(0, CLIP) : s);

// baseDir инъектится для тестов (прецедент: memory-update.ts).
export function memoryEditCommand(baseDir: string = safeCwd()): Command {
  return new Command('edit')
    .description('Edit title and/or body of a memory object (diff-audited in events.jsonl)')
    .argument('<id>', 'Memory object id')
    .option('--title <t>', 'New title')
    .option('--body <b>', 'New body')
    .option('--actor <actor>', 'Actor performing the edit', 'user:cli')
    .action(async (id: string, options: { title?: string; body?: string; actor: string }) => {
      const { store, log, clock, idGen, index, lock } = createCliContainer(baseDir);
      const existing = await store.get(id);
      if (!existing) throw new UserFacingError(`Memory object not found: ${id}`);

      const edits: Array<'title' | 'body'> = [];
      if (options.title !== undefined) {
        if (options.title.trim() === '') throw new UserFacingError('Title must not be empty');
        edits.push('title');
      }
      if (options.body !== undefined) {
        if (options.body.trim() === '') throw new UserFacingError('Body must not be empty');
        edits.push('body');
      }
      if (edits.length === 0) {
        throw new UserFacingError('Nothing to edit: pass --title and/or --body');
      }

      const patch: Partial<MemoryObject> = {};
      if (options.title !== undefined) patch.title = options.title;
      if (options.body !== undefined) patch.body = options.body;

      const run = async (): Promise<void> => {
        const updated = await store.update(id, patch);
        const now = clock.now();
        for (const field of edits) {
          await log.append({
            id: idGen.generateEventId(now),
            type: 'memory.edited',
            timestamp: now.toISOString(),
            actor: options.actor,
            payload: {
              memory_id: id,
              field,
              before: clip(existing[field]),
              after: clip(options[field] as string),
            },
          });
        }
        if (index) await index.indexObject(updated);
        console.log(`Edited ${id}: ${edits.join(', ')}`);
      };
      return lock ? lock.withLock(run) : run();
    });
}
