import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { validateMemoryObject } from '../../domain/policies/write-protocol.js';

export interface AddMemoryObjectInput {
  type: MemoryObject['type'];
  title: string;
  body?: string;
  createdBy: string;
  tags?: string[];
  related?: MemoryObject['related'];
  confidence?: MemoryObject['confidence'];
  importance?: number;
  source?: MemoryObject['source'];
  reviewState?: MemoryObject['review_state'];
}

export interface AddMemoryObjectResult {
  object: MemoryObject;
  warnings: string[];
}

export async function addMemoryObject(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator; index?: SearchIndex },
  input: AddMemoryObjectInput
): Promise<AddMemoryObjectResult> {
  const now = deps.clock.now();
  const object: MemoryObject = {
    id: deps.idGen.generateMemoryId(now, input.title),
    type: input.type,
    title: input.title,
    body: input.body || '',
    status: 'active',
    review_state: input.reviewState ?? (input.createdBy.startsWith('agent:') ? 'proposed' : 'accepted'),
    confidence: input.confidence ?? 'medium',
    importance: input.importance ?? 0.5,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    created_by: input.createdBy,
    schema_version: 1,
    source: input.source ?? { kind: 'manual' },
    related: input.related ?? { files: [], docs: [], decisions: [] },
    tags: input.tags ?? [],
    superseded_by: null,
  };

  const validation = validateMemoryObject(object);
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

  return { object, warnings: validation.warnings };
}
