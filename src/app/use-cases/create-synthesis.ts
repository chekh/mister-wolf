import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { addMemoryObject } from './add-memory-object.js';
import { recordRelation } from './record-relation.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';

export async function createSynthesis(
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    relations: RelationLog;
    index?: SearchIndex;
  },
  input: { questionId: string; recommendation: string; createdBy: string }
): Promise<{ object: MemoryObject; relatedOpinions: string[] }> {
  const rels = await deps.relations.list({ object: input.questionId, predicate: 'answers' });
  const opinionIds: string[] = [];
  for (const r of rels) {
    const op = await deps.store.get(r.subject);
    if (!op || op.type !== 'council-opinion') continue;
    opinionIds.push(op.id);
  }

  const { object: synthesis } = await addMemoryObject(
    { store: deps.store, log: deps.log, clock: deps.clock, idGen: deps.idGen, index: deps.index },
    {
      type: 'synthesis',
      title: `Synthesis for ${input.questionId}`,
      body: input.recommendation,
      createdBy: input.createdBy,
      status: 'proposed',
      extra: { recommendation: input.recommendation },
    }
  );

  const now = deps.clock.now();
  for (const opId of opinionIds) {
    await recordRelation(deps, now, synthesis.id, 'based_on', opId);
  }

  return { object: synthesis, relatedOpinions: opinionIds };
}
