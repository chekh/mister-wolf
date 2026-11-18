import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  MemoryAddInputSchema,
  normalizeAddInputKeys,
  NoteContradictionInputSchema,
} from '../../../src/adapters/mcp/mcp-schemas.js';
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

  // WP3 §6.2 (2.16): scope — необязательная строка (машинные worktree:<имя>/main
  // должны проходить; enum project|global резал их на границе MCP)
  it('accepts worktree scope strings through parse (not stripped)', () => {
    const parsed = MemoryAddInputSchema.safeParse({
      type: 'rule',
      title: 't',
      createdBy: 'user:x',
      scope: 'worktree:wt-e2e',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.scope).toBe('worktree:wt-e2e');
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

  // 2.32.0 (Q1): slug — часть контракта add, не per-type поле и не extra
  it('keeps slug through parse and normalization', () => {
    const parsed = MemoryAddInputSchema.safeParse({
      type: 'decision',
      title: 't',
      slug: 'release-plan',
      createdBy: 'user:x',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.slug).toBe('release-plan');
    expect(normalizeAddInputKeys({ type: 'decision', title: 't', slug: 'release-plan' })).toEqual({
      type: 'decision',
      title: 't',
      slug: 'release-plan',
    });
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

  it('JSON Schema exposes scope as string (no enum) and additionalProperties: false for MCP clients', () => {
    const json = z.toJSONSchema(MemoryAddInputSchema) as {
      additionalProperties?: unknown;
      properties?: Record<string, { enum?: string[]; type?: string }>;
    };
    expect(json.additionalProperties).toBe(false);
    expect(json.properties?.scope?.type).toBe('string');
    expect(json.properties?.scope?.enum).toBeUndefined();
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

// Патч 3.3.1 (REQ-331-4 AC-4.3, design §8): MCP-схема note_contradiction —
// первая линия защиты: report требует непустые после trim reason и
// contradiction_evidence (ошибка схемы до use-case); правило use-case от схемы
// не зависит (T-4.1). resolve адресует запись журнала (AC-1.3): обязательный
// suppression_id, note_id из resolve-ветки удалён. Новых actions/тулов нет
// (NFR-331-1, guard не трогается).
describe('NoteContradictionInputSchema (patch 3.3.1)', () => {
  /** Тот же путь, что SDK: ~standard.validate обёрнутой схемы. */
  async function issues(input: unknown): Promise<string[]> {
    const result = (await NoteContradictionInputSchema['~standard'].validate(input)) as {
      issues?: Array<{ message: string }>;
    };
    return (result.issues ?? []).map((i) => i.message);
  }

  it('T-4.3: report rejects empty and whitespace-only reason and contradiction_evidence', async () => {
    for (const input of [
      { action: 'report', note_id: 'n1', reason: '', contradiction_evidence: 'e' },
      { action: 'report', note_id: 'n1', reason: '   ', contradiction_evidence: 'e' },
      { action: 'report', note_id: 'n1', reason: ' \n\t ', contradiction_evidence: 'e' },
      { action: 'report', note_id: 'n1', reason: 'r', contradiction_evidence: '' },
      { action: 'report', note_id: 'n1', reason: 'r', contradiction_evidence: ' \t ' },
    ]) {
      expect(await issues(input)).not.toEqual([]);
    }
    expect(await issues({ action: 'report', note_id: 'n1', reason: 'r', contradiction_evidence: 'e' })).toEqual([]);
  });

  it('resolve requires suppression_id and no longer accepts note_id addressing', async () => {
    expect(await issues({ action: 'resolve', resolution: 'r' })).not.toEqual([]);
    expect(await issues({ action: 'resolve', note_id: 'n1', resolution: 'r' })).not.toEqual([]);
    expect(await issues({ action: 'resolve', suppression_id: 'cnr_20261118_0000aa', resolution: 'r' })).toEqual([]);
    // неизвестный action по-прежнему отклоняется (каталог не растёт)
    expect(await issues({ action: 'merge', note_id: 'n1' })).not.toEqual([]);
  });
});
