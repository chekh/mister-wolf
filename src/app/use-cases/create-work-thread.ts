import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { WorkThread, WorkThreadSchema } from '../../domain/schemas/thread-schema.js';

export interface CreateWorkThreadInput {
  title: string;
  goal: string;
  currentState?: string;
  nextSteps?: string[];
  createdBy: string;
}

export interface CreateWorkThreadResult {
  object: WorkThread;
}

export async function createWorkThread(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator },
  input: CreateWorkThreadInput
): Promise<CreateWorkThreadResult> {
  const now = deps.clock.now();
  const object: WorkThread = {
    id: deps.idGen.generateMemoryId(now, input.title),
    type: 'work-thread',
    title: input.title,
    status: 'active',
    review_state: input.createdBy.startsWith('agent:') ? 'proposed' : 'accepted',
    confidence: 'medium',
    importance: 0.6,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    created_by: input.createdBy,
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    body: '',
    goal: input.goal,
    current_state: input.currentState || '',
    next_steps: input.nextSteps || [],
  };

  WorkThreadSchema.parse(object);

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
