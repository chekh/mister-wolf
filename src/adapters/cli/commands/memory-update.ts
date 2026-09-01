import { Command } from 'commander';
import { createCliContainer } from '../../../bootstrap/container.js';
import { getDeclaration } from '../../../domain/memory-types.js';
import { buildTypeSchema } from '../../../domain/type-schema-builder.js';
import { UserFacingError } from '../../../domain/errors.js';
import type { MemoryObject } from '../../../domain/schemas/memory-object-schema.js';

// wolf update (жалобный контур v2, спека 2026-09-01 §7.2, Q5): whitelist-режим.
// Диспетчер меняет только поля триажа: --set triage/resolution,
// --inc dispatch_ages/corroborations (монотонные: --set для них запрещён —
// анти-обнуление/накрутка), --tags — append. Поля автора жалобы
// (rule/evidence/proposal/about) неприкосновенны. Актор — в event-log
// (type memory.updated, прецедент tool-librarian.ts).
const SETTABLE = new Set(['triage', 'resolution']);
const INCREMENTABLE = new Set(['dispatch_ages', 'corroborations']);

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

// baseDir инъектится для тестов (прецедент: memory-complain.ts).
export function memoryUpdateCommand(baseDir: string = process.cwd()): Command {
  return new Command('update')
    .description(
      'Update triage fields of a memory object (whitelist: --set triage|resolution, --inc dispatch_ages|corroborations, --tags append)'
    )
    .argument('<id>', 'Memory object id')
    .option('--set <k=v>', 'Set a triage field: triage|resolution (repeatable)', collect, [])
    .option(
      '--inc <field=n>',
      'Increment monotonic counter by integer n > 0: dispatch_ages|corroborations (repeatable)',
      collect,
      []
    )
    .option('--tags <tags>', 'Append comma-separated tags')
    .option('--actor <actor>', 'Actor performing the update', 'user:cli')
    .action(async (id: string, options) => {
      const { store, log, clock, idGen, index, lock, declarations } = createCliContainer(baseDir);
      const existing = await store.get(id);
      if (!existing) throw new UserFacingError(`Memory object not found: ${id}`);
      const decl = getDeclaration(existing.type, declarations);
      const record = existing as unknown as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      const changed: string[] = [];

      const requireField = (key: string): void => {
        if (!(key in (decl.fields ?? {}))) {
          throw new UserFacingError(`Type "${existing.type}" has no field "${key}"`);
        }
      };

      for (const pair of options.set as string[]) {
        const i = pair.indexOf('=');
        if (i <= 0) throw new UserFacingError(`Invalid --set pair "${pair}" (expected key=value)`);
        const key = pair.slice(0, i).trim();
        if (!SETTABLE.has(key)) {
          if (INCREMENTABLE.has(key)) {
            throw new UserFacingError(`Field "${key}" is a monotonic counter: use --inc, --set is forbidden`);
          }
          throw new UserFacingError(
            `Field "${key}" is not settable via wolf update (allowed: ${[...SETTABLE].join(', ')})`
          );
        }
        requireField(key);
        patch[key] = pair.slice(i + 1);
        changed.push(key);
      }

      for (const pair of options.inc as string[]) {
        const i = pair.indexOf('=');
        if (i <= 0) throw new UserFacingError(`Invalid --inc pair "${pair}" (expected field=delta)`);
        const key = pair.slice(0, i).trim();
        if (!INCREMENTABLE.has(key)) {
          throw new UserFacingError(
            `Field "${key}" is not incrementable (allowed via --inc: ${[...INCREMENTABLE].join(', ')})`
          );
        }
        const delta = Number.parseInt(pair.slice(i + 1), 10);
        if (Number.isNaN(delta) || delta <= 0) {
          throw new UserFacingError(`--inc ${key} expects an integer > 0`);
        }
        requireField(key);
        const base = key in patch ? Number(patch[key]) : Number(record[key] ?? 0);
        patch[key] = base + delta;
        changed.push(key);
      }

      if (options.tags) {
        const incoming = ((options.tags as string) || '')
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t !== '');
        patch.tags = [...new Set([...(existing.tags ?? []), ...incoming])];
        changed.push('tags');
      }

      if (changed.length === 0) {
        throw new UserFacingError('Nothing to update: pass --set, --inc or --tags');
      }

      // Пост-merge валидация по декларации типа (как при add, спека §7.2)
      const typeCheck = buildTypeSchema(decl).safeParse({ ...existing, ...patch });
      if (!typeCheck.success) {
        throw new UserFacingError(
          `Type validation failed: ${typeCheck.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')}`
        );
      }

      const run = async (): Promise<void> => {
        const updated = await store.update(id, patch as Partial<MemoryObject>);
        const now = clock.now();
        await log.append({
          id: idGen.generateEventId(now),
          type: 'memory.updated',
          timestamp: now.toISOString(),
          actor: options.actor,
          payload: { memory_id: id, fields: changed },
        });
        if (index) await index.indexObject(updated);
        console.log(`Updated ${id}: ${changed.join(', ')}`);
      };
      return lock ? lock.withLock(run) : run();
    });
}
