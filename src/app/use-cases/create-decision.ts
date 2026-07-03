import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { Decision, DecisionSchema } from '../../domain/schemas/decision-schema.js';
import { governanceDefaults } from '../../domain/governance.js';
import { recordRelation } from './record-relation.js';
import { summarizeSession } from './summarize-session.js';

export interface CreateDecisionInput {
  title: string;
  body: string;
  thread?: string;
  basedOn?: string[];
  createdBy: string;
}

export interface CreateDecisionResult {
  object: Decision;
}

export async function createDecision(
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    index?: SearchIndex;
    relations?: RelationLog;
  },
  input: CreateDecisionInput
): Promise<CreateDecisionResult> {
  const now = deps.clock.now();
  const defaults = governanceDefaults(input.createdBy);
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
    memory_class: defaults.memory_class,
    truth_role: defaults.truth_role,
    lifetime: defaults.lifetime,
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
  if (deps.index) {
    await deps.index.indexObject(object);
  }
  if (deps.relations) {
    if (object.thread) {
      await recordRelation(deps, now, object.id, 'updates', object.thread);
    }
    for (const basisId of input.basedOn ?? []) {
      await recordRelation(deps, now, object.id, 'based_on', basisId);
    }
  }

  await summarizeSession(deps, { createdBy: input.createdBy }).catch((err) => {
    console.error('Session summary failed:', err);
  });

  return { object };
}
