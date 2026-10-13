// src/app/use-cases/edit-memory-object.ts
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { UserFacingError } from '../../domain/errors.js';

// wolf edit (спека 2.13 §6.1): правка title/body с diff-аудитом — отдельное
// событие memory.edited на каждое изменённое поле, before/after обрезаны до
// 200 симв (прецедент target-обрезки волны 0, session-metrics-log.ts:482).
// 2.17.1 REQ-04 (R05, design §7): edit вынесен из CLI в use-case слой —
// face-тип запрещён (лицо меняется только версионирующим путём wolf face);
// guard здесь, не в CLI (AC-4: негативный сценарий на уровне use-case).
const CLIP = 200;
const clip = (s: string): string => (s.length > CLIP ? s.slice(0, CLIP) : s);

export interface EditMemoryObjectDeps {
  store: MemoryStore;
  log: EventLog;
  clock: Clock;
  idGen: IdGenerator;
  index?: SearchIndex;
  lock?: MemoryLock;
}

export interface EditMemoryObjectInput {
  id: string;
  title?: string;
  body?: string;
  actor: string;
}

export interface EditMemoryObjectResult {
  id: string;
  fields: Array<'title' | 'body'>;
}

export async function editMemoryObject(
  deps: EditMemoryObjectDeps,
  input: EditMemoryObjectInput
): Promise<EditMemoryObjectResult> {
  const existing = await deps.store.get(input.id);
  if (!existing) throw new UserFacingError(`Memory object not found: ${input.id}`);
  if (existing.type === 'face') {
    throw new UserFacingError(
      'type "face" cannot be edited: faces are versioned, use "wolf face" commands (new | restore | breakglass)'
    );
  }

  const fields: Array<'title' | 'body'> = [];
  if (input.title !== undefined) {
    if (input.title.trim() === '') throw new UserFacingError('Title must not be empty');
    fields.push('title');
  }
  if (input.body !== undefined) {
    if (input.body.trim() === '') throw new UserFacingError('Body must not be empty');
    fields.push('body');
  }
  if (fields.length === 0) throw new UserFacingError('Nothing to edit: pass a title and/or body');

  const patch: Partial<MemoryObject> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.body !== undefined) patch.body = input.body;

  const run = async (): Promise<EditMemoryObjectResult> => {
    const updated = await deps.store.update(input.id, patch);
    const now = deps.clock.now();
    for (const field of fields) {
      await deps.log.append({
        id: deps.idGen.generateEventId(now),
        type: 'memory.edited',
        timestamp: now.toISOString(),
        actor: input.actor,
        payload: {
          memory_id: input.id,
          field,
          before: clip(existing[field]),
          after: clip(input[field] as string),
        },
      });
    }
    await deps.index?.indexObject(updated);
    return { id: input.id, fields };
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
