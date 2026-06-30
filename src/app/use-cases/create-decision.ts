import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { Decision, DecisionSchema } from '../../domain/schemas/decision-schema.js';

export interface CreateDecisionInput {
  title: string;
  body: string;
  thread?: string;
  createdBy: string;
}

export interface CreateDecisionResult {
  object: Decision;
}

export async function createDecision(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator },
  input: CreateDecisionInput
): Promise<CreateDecisionResult> {
  const now = deps.clock.now();
  const object: Decision = {
    id: deps.idGen.generateMemoryId(now, input.title),
    type: 'decision',
    title: input.title,
    status: 'active',
    review_state: input.createdBy.startsWith('agent:') ? 'proposed' : 'accepted',
    confidence: 'medium',
    importance: 0.7,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    created_by: input.createdBy,
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    body: input.body,
    thread: input.thread,
  };

  DecisionSchema.parse(object);

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
