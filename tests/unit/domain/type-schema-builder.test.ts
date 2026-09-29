import { describe, it, expect } from 'vitest';
import { buildTypeSchema, applyFacetEnum } from '../../../src/domain/type-schema-builder.js';
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
