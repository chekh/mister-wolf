import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { Blocker, BlockerSchema } from '../../domain/schemas/blocker-schema.js';
import { governanceDefaults } from '../../domain/governance.js';
import { recordRelation } from './record-relation.js';

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
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    index?: SearchIndex;
    relations?: RelationLog;
    lock?: MemoryLock;
  },
  input: CreateBlockerInput
): Promise<CreateBlockerResult> {
  const run = async (): Promise<CreateBlockerResult> => {
    const now = deps.clock.now();
    const defaults = governanceDefaults(input.createdBy);
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
      memory_class: defaults.memory_class,
      truth_role: defaults.truth_role,
      lifetime: defaults.lifetime,
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
    if (deps.index) {
      await deps.index.indexObject(object);
    }
    if (deps.relations && object.thread) {
      await recordRelation(deps, now, object.id, 'blocks', object.thread);
    }

    return { object };
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
