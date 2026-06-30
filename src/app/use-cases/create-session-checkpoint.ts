import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { SessionCheckpoint, SessionCheckpointSchema } from '../../domain/schemas/session-checkpoint-schema.js';

export interface CreateSessionCheckpointInput {
  threadId: string;
  createdBy: string;
}

export interface CreateSessionCheckpointResult {
  object: SessionCheckpoint;
}

export async function createSessionCheckpoint(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator; index?: SearchIndex },
  input: CreateSessionCheckpointInput
): Promise<CreateSessionCheckpointResult> {
  const thread = await deps.store.get(input.threadId);
  if (!thread) throw new Error(`Memory object not found: ${input.threadId}`);
  if (thread.type !== 'work-thread') throw new Error(`Memory object is not a work thread: ${input.threadId}`);

  const related = await deps.store.list();
  const relatedIds = related
    .filter(
      (obj) =>
        (obj.type === 'info-request' && (obj as { thread?: string }).thread === input.threadId) ||
        (obj.type === 'article' && (obj as { thread?: string }).thread === input.threadId) ||
        (obj.type === 'decision' && (obj as { thread?: string }).thread === input.threadId) ||
        (obj.type === 'blocker' && (obj as { thread?: string }).thread === input.threadId)
    )
    .map((obj) => obj.id);

  const now = deps.clock.now();
  const object: SessionCheckpoint = {
    id: deps.idGen.generateMemoryId(now, `checkpoint-${input.threadId}`),
    type: 'session-checkpoint',
    title: `Checkpoint for ${thread.title}`,
    status: 'active',
    review_state: input.createdBy.startsWith('agent:') ? 'proposed' : 'accepted',
    confidence: 'high',
    importance: 0.5,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    created_by: input.createdBy,
    schema_version: 1,
    source: { kind: 'session' },
    related: { files: [], docs: [], decisions: [] },
    tags: ['checkpoint'],
    superseded_by: null,
    body: '',
    thread: input.threadId,
    captured_state: {
      thread_current_state: (thread as { current_state?: string }).current_state ?? '',
      related_ids: relatedIds,
    },
  };

  SessionCheckpointSchema.parse(object);

  await deps.store.save(object);
  await deps.log.append({
    id: deps.idGen.generateEventId(now),
    type: 'memory.added',
    timestamp: now.toISOString(),
    actor: input.createdBy,
    payload: { memory_id: object.id, type: object.type },
  });
  if (deps.index) {
    await deps.index.indexObject(object);
  }

  return { object };
}
