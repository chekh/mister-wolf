import { describe, it, expect } from 'vitest';
import { RELATION_PREDICATES, RelationSchema, type Relation } from '../../../src/domain/schemas/relation-schema.js';
import type { RelationLog } from '../../../src/ports/relation-log.port.js';
import type { IdGenerator } from '../../../src/ports/id-generator.port.js';
import { recordRelation } from '../../../src/app/use-cases/record-relation.js';

// 2.14 §6.2: пара предикатов исхода жалобы — outcome/outcome_of
describe('relation predicates outcome/outcome_of', () => {
  it('both are in RELATION_PREDICATES', () => {
    expect(RELATION_PREDICATES).toContain('outcome');
    expect(RELATION_PREDICATES).toContain('outcome_of');
  });

  it('RelationSchema accepts outcome edges with free-string object (literal or mem-id)', () => {
    const base = {
      id: 'evt_1',
      subject: 'mem_complaint',
      created_at: new Date().toISOString(),
      source: 'manual',
      confidence: 'high',
    };
    expect(RelationSchema.parse({ ...base, predicate: 'outcome', object: 'rejected' }).object).toBe('rejected');
    expect(RelationSchema.parse({ ...base, predicate: 'outcome_of', object: 'mem_x' }).object).toBe('mem_x');
  });

  // INVERSE-симметрия поведенчески: forward + backward записываются обе
  it('recordRelation writes forward outcome_of and inverse outcome', async () => {
    const rows: Relation[] = [];
    // двойник relations-лога: массив-шпион с push вместо append
    const relations = {
      append: async (relation: Relation) => {
        rows.push(relation);
      },
      list: async () => rows,
    } satisfies RelationLog;
    let n = 0;
    const idGen = { generateEventId: () => `e${++n}` } as IdGenerator;

    await recordRelation({ relations, idGen }, new Date(), 'mem_rule', 'outcome_of', 'mem_complaint');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ subject: 'mem_rule', predicate: 'outcome_of', object: 'mem_complaint' });
    expect(rows[1]).toMatchObject({ subject: 'mem_complaint', predicate: 'outcome', object: 'mem_rule' });
  });
});
