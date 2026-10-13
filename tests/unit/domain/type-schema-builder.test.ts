import { describe, it, expect } from 'vitest';
import { buildTypeSchema, applyFacetEnum, PROPOSAL_CONTRACT_FIELDS } from '../../../src/domain/type-schema-builder.js';
import { getDeclaration } from '../../../src/domain/memory-types.js';

const minimalBase = {
  id: 'mem_x',
  title: 't',
  review_state: 'accepted',
  confidence: 'medium',
  importance: 0.5,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  created_by: 'user:test',
  source: { kind: 'manual' },
  tags: [],
  superseded_by: null,
};

describe('buildTypeSchema', () => {
  it('rejects status outside type lifecycle', () => {
    const s = buildTypeSchema(getDeclaration('thread'));
    expect(() => s.parse({ ...minimalBase, type: 'thread', status: 'resolved', goal: 'g' })).toThrow();
  });
  it('accepts new thread statuses blocked/waiting_answer/open', () => {
    const s = buildTypeSchema(getDeclaration('thread'));
    for (const status of ['blocked', 'waiting_answer', 'open'] as const) {
      expect(s.safeParse({ ...minimalBase, type: 'thread', status, goal: 'g' }).success).toBe(true);
    }
  });
  it('rejects missing declared field (thread.goal)', () => {
    const s = buildTypeSchema(getDeclaration('thread'));
    expect(() => s.parse({ ...minimalBase, type: 'thread', status: 'active' })).toThrow(/goal/i);
  });
  it('note требует facet из enum-словаря', () => {
    const s = buildTypeSchema(getDeclaration('note'));
    expect(() => s.parse({ ...minimalBase, type: 'note', status: 'active' })).toThrow(/facet/i);
    expect(() => s.parse({ ...minimalBase, type: 'note', status: 'active', facet: 'bogus' })).toThrow();
    expect(s.safeParse({ ...minimalBase, type: 'note', status: 'active', facet: 'pitfall' }).success).toBe(true);
  });
  it('applyFacetEnum подменяет словарь фасета (кастомный facets.character)', () => {
    const custom = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const s = buildTypeSchema(applyFacetEnum(getDeclaration('note'), custom));
    expect(s.safeParse({ ...minimalBase, type: 'note', status: 'active', facet: 'h' }).success).toBe(true);
    expect(s.safeParse({ ...minimalBase, type: 'note', status: 'active', facet: 'pitfall' }).success).toBe(false);
  });
  it('passthrough guard (§8.2.2): чужие поля переживают buildTypeSchema и остаются в результате', () => {
    const s = buildTypeSchema(getDeclaration('note'));
    const parsed = s.parse({
      ...minimalBase,
      type: 'note',
      status: 'active',
      facet: 'legacy',
      impact: 'CI is down',
      legacy_field: { nested: true },
    });
    expect(parsed.impact).toBe('CI is down');
    expect(parsed.legacy_field).toEqual({ nested: true });
  });
});

describe('face: контракт типа (волна 2.17 REQ-01)', () => {
  const faceBase = {
    ...minimalBase,
    type: 'face',
    status: 'active',
    owner_skill: 'worker-implementer',
    version: '1',
    reason: 'seed base face',
    initiator: 'seed',
  };

  it('полный контракт проходит; based_on опционален', () => {
    const s = buildTypeSchema(getDeclaration('face'));
    expect(s.safeParse(faceBase).success).toBe(true);
    expect(s.safeParse({ ...faceBase, based_on: 'mem_0' }).success).toBe(true);
  });

  it('отсутствие обязательного поля или initiator вне enum — отказ', () => {
    const s = buildTypeSchema(getDeclaration('face'));
    for (const field of ['owner_skill', 'version', 'reason', 'initiator']) {
      const o: Record<string, unknown> = { ...faceBase };
      delete o[field];
      expect(s.safeParse(o).success, field).toBe(false);
    }
    expect(s.safeParse({ ...faceBase, initiator: 'rogue' }).success).toBe(false);
  });
});

describe('proposal: сигнал-фасет + контракт (волна 2.17 REQ-08)', () => {
  const contract = {
    addressee: 'agent:steward',
    basis: 'observed friction in daily runs',
    proposed_change: 'add a shortcut section',
    expected_benefit: 'fresher injections',
    applicability_bounds: 'only for coding agents',
  };

  it('полный контракт на note — успех', () => {
    const s = buildTypeSchema(getDeclaration('note'));
    expect(
      s.safeParse({ ...minimalBase, type: 'note', status: 'active', facet: 'proposal', ...contract }).success
    ).toBe(true);
  });

  it('полный контракт на не-note core-типах (decision, face) — успех', () => {
    const decision = buildTypeSchema(getDeclaration('decision'));
    expect(
      decision.safeParse({ ...minimalBase, type: 'decision', status: 'active', facet: 'proposal', ...contract }).success
    ).toBe(true);
    const face = buildTypeSchema(getDeclaration('face'));
    expect(
      face.safeParse({
        ...minimalBase,
        type: 'face',
        status: 'active',
        owner_skill: 'agent:x',
        version: '1',
        reason: 'r',
        initiator: 'migration',
        facet: 'proposal',
        ...contract,
      }).success
    ).toBe(true);
  });

  it('отсутствие любого поля контракта (вкл. applicability_bounds) — отказ', () => {
    const s = buildTypeSchema(getDeclaration('note'));
    expect(PROPOSAL_CONTRACT_FIELDS).toContain('applicability_bounds'); // CR-2026-10-13-01
    for (const field of PROPOSAL_CONTRACT_FIELDS) {
      const partial = { ...contract };
      delete partial[field as keyof typeof partial];
      const r = s.safeParse({ ...minimalBase, type: 'note', status: 'active', facet: 'proposal', ...partial });
      expect(r.success, field).toBe(false);
    }
  });

  it('пустое значение поля контракта — отказ (min 1)', () => {
    const s = buildTypeSchema(getDeclaration('note'));
    const r = s.safeParse({
      ...minimalBase,
      type: 'note',
      status: 'active',
      facet: 'proposal',
      ...contract,
      addressee: '',
    });
    expect(r.success).toBe(false);
  });

  it('сигнал-словарь не-note core-типов: facet опционален, только proposal', () => {
    const s = buildTypeSchema(getDeclaration('decision'));
    expect(s.safeParse({ ...minimalBase, type: 'decision', status: 'active' }).success).toBe(true);
    // character-фасеты note не протекают в сигнал-словарь
    expect(s.safeParse({ ...minimalBase, type: 'decision', status: 'active', facet: 'howto' }).success).toBe(false);
  });

  it('facet≠proposal не триггерит контракт (note howto без полей предложения — успех)', () => {
    const s = buildTypeSchema(getDeclaration('note'));
    expect(s.safeParse({ ...minimalBase, type: 'note', status: 'active', facet: 'howto' }).success).toBe(true);
  });
});
