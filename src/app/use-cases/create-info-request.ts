import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { InfoRequest, InfoRequestSchema } from '../../domain/schemas/info-request-schema.js';
import { governanceDefaults } from '../../domain/governance.js';
import { recordRelation } from './record-relation.js';

export interface CreateInfoRequestInput {
  title: string;
  thread: string;
  question: string;
  detourReason: string;
  neededFor?: string[];
  expectedAnswer: string[];
  preliminaryAnswer?: string;
  createdBy: string;
}

export interface CreateInfoRequestResult {
  object: InfoRequest;
}

export async function createInfoRequest(
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    index?: SearchIndex;
    relations?: RelationLog;
  },
  input: CreateInfoRequestInput
): Promise<CreateInfoRequestResult> {
  if (!input.detourReason.trim()) throw new Error('detour_reason is required');
  if (input.expectedAnswer.length === 0) throw new Error('expected_answer must contain at least one item');

  const now = deps.clock.now();
  const defaults = governanceDefaults(input.createdBy);
  const object: InfoRequest = {
    id: deps.idGen.generateMemoryId(now, input.title),
    type: 'info-request',
    title: input.title,
    status: 'open',
    review_state: input.createdBy.startsWith('agent:') ? 'proposed' : 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    created_by: input.createdBy,
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    body: '',
    thread: input.thread,
    question: input.question,
    detour_reason: input.detourReason,
    needed_for: input.neededFor || [],
    expected_answer: input.expectedAnswer,
    preliminary_answer: input.preliminaryAnswer || '',
    memory_class: defaults.memory_class,
    truth_role: defaults.truth_role,
    lifetime: defaults.lifetime,
  };

  InfoRequestSchema.parse(object);

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
  if (deps.relations) {
    await recordRelation(deps, now, object.id, 'related_to', object.thread);
  }

  return { object };
}
