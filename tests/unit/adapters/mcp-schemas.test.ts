import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { MemoryAddInputSchema, AnalyticsInputSchema } from '../../../src/adapters/mcp/mcp-schemas.js';
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

  it('keeps task-brief executor and priority through parse', () => {
    const parsed = MemoryAddInputSchema.safeParse({
      type: 'task-brief',
      title: 't',
      createdBy: 'user:x',
      executor: 'worker',
      priority: 'high',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.executor).toBe('worker');
      expect(parsed.data.priority).toBe('high');
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

describe('AnalyticsInputSchema (analytics MCP tool)', () => {
  it('parses a full valid object and keeps every field', () => {
    const parsed = AnalyticsInputSchema.safeParse({
      view: 'memory',
      class: 'dead',
      type: 'rule',
      origin: 'script',
      agent: 'dev',
      top: 5,
      weeks: 4,
      silent: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({
        view: 'memory',
        class: 'dead',
        type: 'rule',
        origin: 'script',
        agent: 'dev',
        top: 5,
        weeks: 4,
        silent: true,
      });
    }
  });

  it('rejects unknown view value', () => {
    const parsed = AnalyticsInputSchema.safeParse({ view: 'bogus' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes('view'))).toBe(true);
    }
  });
});
