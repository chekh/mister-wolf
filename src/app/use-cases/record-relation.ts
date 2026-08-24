import { RelationLog } from '../../ports/relation-log.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { RelationPredicate } from '../../domain/schemas/relation-schema.js';

const INVERSE: Record<RelationPredicate, RelationPredicate> = {
  answers: 'answered_by',
  answered_by: 'answers',
  supports: 'supported_by',
  supported_by: 'supports',
  based_on: 'basis_for',
  basis_for: 'based_on',
  updates: 'updated_by',
  updated_by: 'updates',
  supersedes: 'superseded_by',
  superseded_by: 'supersedes',
  blocks: 'blocked_by',
  blocked_by: 'blocks',
  resolves: 'resolved_by',
  resolved_by: 'resolves',
  related_to: 'related_to',
  produced_by: 'produced_by',
};

export async function recordRelation(
  deps: { relations?: RelationLog; idGen: IdGenerator; lock?: MemoryLock },
  now: Date,
  subject: string,
  predicate: RelationPredicate,
  object: string,
  source: 'manual' | 'agent' | 'system' = 'agent'
): Promise<void> {
  if (!deps.relations) return;
  const run = async (): Promise<void> => {
    const forward = {
      id: deps.idGen.generateEventId(now),
      subject,
      predicate,
      object,
      created_at: now.toISOString(),
      source,
      confidence: 'high' as const,
    };
    const backward = {
      id: deps.idGen.generateEventId(now),
      subject: object,
      predicate: INVERSE[predicate],
      object: subject,
      created_at: now.toISOString(),
      source,
      confidence: 'high' as const,
    };
    await deps.relations!.append(forward);
    await deps.relations!.append(backward);
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
