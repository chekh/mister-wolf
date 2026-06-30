import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { Blocker, BlockerSchema } from '../../domain/schemas/blocker-schema.js';

export interface CreateBlockerInput {
  title: string;
  impact: string;
  workaround?: string;
  thread?: string;
  createdBy: string;
}

export interface CreateBlockerResult {
  object: Blocker;
}

export async function createBlocker(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator },
  input: CreateBlockerInput
): Promise<CreateBlockerResult> {
  const now = deps.clock.now();
  const object: Blocker = {
    id: deps.idGen.generateMemoryId(now, input.title),
    type: 'blocker',
    title: input.title,
    status: 'active',
    review_state: input.createdBy.startsWith('agent:') ? 'proposed' : 'accepted',
    confidence: 'medium',
    importance: 0.8,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    created_by: input.createdBy,
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    body: '',
    impact: input.impact,
    workaround: input.workaround,
    thread: input.thread,
  };

  BlockerSchema.parse(object);

  await deps.store.save(object);
  await deps.log.append({
    id: deps.idGen.generateEventId(now),
    type: 'memory.added',
    timestamp: now.toISOString(),
    actor: input.createdBy,
    payload: { memory_id: object.id, type: object.type },
  });

  return { object };
}
