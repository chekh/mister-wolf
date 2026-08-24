import { z } from 'zod';
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { buildTypeSchema } from '../../domain/type-schema-builder.js';
import { getDeclaration } from '../../domain/memory-types.js';
import { governanceDefaults } from '../../domain/governance.js';
import { recordRelation } from './record-relation.js';
import type { MemoryObject } from '../../domain/schemas/memory-object-schema.js';

// buildTypeSchema with no custom thread → decl field {optional:true} applies
const RepairSchema = buildTypeSchema(getDeclaration('info-request'), {
  question: z.string().min(1),
  detour_reason: z.string().min(1),
  needed_for: z.array(z.string()).default([]),
  expected_answer: z.array(z.string()).min(1),
  preliminary_answer: z.string().default(''),
});

export async function createMemoryRepairRequest(
  deps: {
    store: MemoryStore;
    log?: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    index?: SearchIndex;
    relations?: RelationLog;
    lock?: MemoryLock;
  },
  input: { problem: string; relevantIds: string[]; createdBy: string; thread?: string }
): Promise<{ object: MemoryObject }> {
  const run = async (): Promise<MemoryObject> => {
    const now = deps.clock.now();
    const defaults = governanceDefaults(input.createdBy);
    const object = {
      id: deps.idGen.generateMemoryId(now, input.problem),
      type: 'info-request',
      title: input.problem,
      status: 'open',
      review_state: input.createdBy.startsWith('agent:') ? 'proposed' : 'accepted',
      confidence: 'medium' as const,
      importance: 0.5,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      created_by: input.createdBy,
      schema_version: 1,
      source: { kind: 'manual' as const },
      related: { files: [], docs: [], decisions: [] },
      tags: ['solve', 'memory-repair'],
      superseded_by: null,
      body: '',
      thread: input.thread,
      question: input.problem,
      detour_reason: 'Analyzing stale project memory would derail the active development session.',
      expected_answer: [
        'Diagnosis',
        'Stale or conflicting memory objects',
        'Proposed rule or relation changes',
        'Compact call injection',
      ],
      needed_for: ['Prevent repeated agent behavior failure', 'Create a durable memory correction'],
      preliminary_answer: '',
      memory_class: defaults.memory_class,
      truth_role: defaults.truth_role,
      lifetime: defaults.lifetime,
    };

    const parsed = RepairSchema.safeParse(object);
    if (!parsed.success) throw new Error(`Validation failed: ${parsed.error.message}`);

    await deps.store.save(parsed.data);

    if (deps.log) {
      await deps.log.append({
        id: deps.idGen.generateEventId(now),
        type: 'memory.added',
        timestamp: now.toISOString(),
        actor: input.createdBy,
        payload: { memory_id: parsed.data.id, type: 'info-request' },
      });
    }
    if (deps.index) {
      await deps.index.indexObject(parsed.data);
    }

    return parsed.data;
  };
  // ponytail: relations are written AFTER the lock is released — recordRelation
  // acquires the same lock itself; nesting would self-deadlock (wx semantics)
  const object = deps.lock ? await deps.lock.withLock(run) : await run();

  for (const relevantId of input.relevantIds) {
    await recordRelation(
      { relations: deps.relations, idGen: deps.idGen, lock: deps.lock },
      new Date(object.created_at),
      object.id,
      'related_to',
      relevantId,
      'system'
    );
  }

  return { object };
}
