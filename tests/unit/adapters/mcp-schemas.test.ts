import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { MemoryAddInputSchema, normalizeAddInputKeys } from '../../../src/adapters/mcp/mcp-schemas.js';
import { CORE_TAXONOMY } from '../../../src/domain/memory-types.js';

describe('MemoryAddInputSchema (derived from taxonomy)', () => {
  it('keeps rule.scope through parse (not stripped)', () => {
    const parsed = MemoryAddInputSchema.safeParse({
      type: 'rule',
      title: 't',
      createdBy: 'user:x',
      scope: 'project',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.scope).toBe('project');
  });

  it('rejects invalid scope with enum message', () => {
    const parsed = MemoryAddInputSchema.safeParse({
      type: 'rule',
      title: 't',
      createdBy: 'user:x',
      scope: 'bogus',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const scopeIssue = parsed.error.issues.find((i) => i.path.includes('scope'));
      expect(scopeIssue).toBeDefined();
      expect(scopeIssue?.message).toMatch(/project/);
    }
  });

  it('keeps thread.goal through parse (not stripped)', () => {
    const parsed = MemoryAddInputSchema.safeParse({
      type: 'thread',
      title: 't',
      createdBy: 'user:x',
      goal: 'ship it',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.goal).toBe('ship it');
    }
  });

  it('rejects keys outside base + taxonomy', () => {
    const parsed = MemoryAddInputSchema.safeParse({
      type: 'lesson',
      title: 't',
      createdBy: 'user:x',
      no_such_field: 1,
    });
    expect(parsed.success).toBe(false);
  });

  it('guard: every per-type field of every CORE_TAXONOMY declaration is in the schema shape', () => {
    for (const decl of CORE_TAXONOMY) {
      for (const key of Object.keys(decl.fields ?? {})) {
        expect(MemoryAddInputSchema.shape).toHaveProperty(key);
      }
    }
  });

  it('JSON Schema exposes scope enum and additionalProperties: false for MCP clients', () => {
    const json = z.toJSONSchema(MemoryAddInputSchema) as {
      additionalProperties?: unknown;
      properties?: Record<string, { enum?: string[] }>;
    };
    expect(json.additionalProperties).toBe(false);
    expect(json.properties?.scope?.enum).toEqual(['project', 'global']);
  });
});

// T011: агентские camelCase-ключи → snake_case per-type поля тула add
describe('normalizeAddInputKeys', () => {
  it('renames camelCase key to its known snake_case field', () => {
    // wave13-a: per-type поля таксономии 7 типов (trigger_keywords, current_state, next_steps)
    expect(normalizeAddInputKeys({ triggerKeywords: ['a'] })).toEqual({ trigger_keywords: ['a'] });
    expect(normalizeAddInputKeys({ type: 'thread', currentState: 's', nextSteps: ['a'] })).toEqual({
      type: 'thread',
      current_state: 's',
      next_steps: ['a'],
    });
  });

  it('leaves unknown keys untouched (strict() then reports Unrecognized key)', () => {
    expect(normalizeAddInputKeys({ fooBar: 1 })).toEqual({ fooBar: 1 }); // foo_bar — не поле таксономии
    expect(normalizeAddInputKeys({ totally_unknown: 2 })).toEqual({ totally_unknown: 2 });
  });

  it('returns non-objects as-is', () => {
    expect(normalizeAddInputKeys(null)).toBeNull();
    expect(normalizeAddInputKeys('str')).toBe('str');
    expect(normalizeAddInputKeys(42)).toBe(42);
    expect(normalizeAddInputKeys([1, 2])).toEqual([1, 2]);
  });

  it('does not rename base camelCase fields (createdBy is part of the contract)', () => {
    const out = normalizeAddInputKeys({ createdBy: 'u', type: 'lesson', title: 't' }) as Record<string, unknown>;
    expect(out.createdBy).toBe('u');
    expect(out.created_by).toBeUndefined();
  });

  it('full add input validates after normalization; value carries snake_case fields', async () => {
    const raw = {
      type: 'thread',
      title: 't',
      createdBy: 'user:x',
      goal: 'g',
      currentState: 's',
      nextSteps: ['a'],
    };
    const result = (await MemoryAddInputSchema['~standard'].validate(normalizeAddInputKeys(raw))) as {
      value?: Record<string, unknown>;
      issues?: unknown[];
    };
    expect(result.issues).toBeUndefined();
    expect(result.value?.current_state).toBe('s');
    expect(result.value?.next_steps).toEqual(['a']);
    expect(result.value?.createdBy).toBe('user:x');
  });
});
