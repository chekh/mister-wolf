import { describe, it, expect } from 'vitest';
import { getDeclaration, subdirectoryFor } from '../../../src/domain/memory-types.js';
import { ALLOWED_TRANSITIONS, canTransition } from '../../../src/domain/governance.js';
import { transitionsFor } from '../../../src/domain/taxonomy.js';
import { buildTypeSchema } from '../../../src/domain/type-schema-builder.js';
import { MemoryObjectSchema } from '../../../src/domain/schemas/memory-object-schema.js';

describe('tool type (Фаза C): декларация', () => {
  it('lifecycle candidate→active→deprecated→archived, старт — candidate', () => {
    const decl = getDeclaration('tool');
    expect(decl.lifecycle).toEqual(['candidate', 'active', 'deprecated', 'archived']);
    expect(decl.defaultStatus).toBe('candidate');
  });

  it('живёт в shared/tools, не в тредах', () => {
    expect(subdirectoryFor('tool', 'shared')).toBe('tools');
    expect(subdirectoryFor('tool', 'thread')).toBeNull();
  });

  it('объявляет контрактные поля и счётчики', () => {
    const fields = getDeclaration('tool').fields ?? {};
    expect(fields.name).toEqual({ kind: 'string', required: true, min: 1 });
    expect(fields.script_path).toEqual({ kind: 'string', required: true, min: 1 });
    expect(fields.language).toEqual({ kind: 'string', required: true, min: 1 });
    expect(fields.usage_count).toEqual({ kind: 'int', default: 0 });
    expect(fields.last_used_at).toEqual({ kind: 'string', optional: true });
    expect(fields.contract_input).toEqual({ kind: 'string', optional: true });
  });
});

describe('tool type (Фаза C): lifecycle-переходы', () => {
  it('candidate → active и candidate → deprecated разрешены', () => {
    expect(canTransition('candidate', 'active')).toBe(true);
    expect(canTransition('candidate', 'deprecated')).toBe(true);
  });

  it('active → deprecated разрешён (списание инструмента)', () => {
    expect(canTransition('active', 'deprecated')).toBe(true);
  });

  it('deprecated → active разрешён (реанимация)', () => {
    expect(ALLOWED_TRANSITIONS.deprecated).toContain('active');
    expect(canTransition('deprecated', 'active')).toBe(true);
  });

  it('active → candidate запрещён (назад в кандидатство не возвращаем)', () => {
    expect(canTransition('active', 'candidate')).toBe(false);
  });

  it('эффективные переходы типа tool не тянут чужие статусы', () => {
    const eff = transitionsFor(getDeclaration('tool'));
    expect(Object.keys(eff).sort()).toEqual(['active', 'archived', 'candidate', 'deprecated']);
    expect(eff.candidate).toEqual(['active', 'deprecated', 'archived']);
    expect(eff.deprecated).toEqual(['active', 'archived']);
  });
});

describe('tool type (Фаза C): схема объекта', () => {
  function base(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'mem_20260830_tool_test_000001',
      type: 'tool',
      title: 'Tool: extract-todos',
      status: 'candidate',
      review_state: 'accepted',
      confidence: 'medium',
      importance: 0.5,
      created_at: '2026-08-30T00:00:00.000Z',
      updated_at: '2026-08-30T00:00:00.000Z',
      created_by: 'user:test',
      schema_version: 1,
      source: { kind: 'manual' },
      related: { files: [], docs: [], decisions: [] },
      tags: [],
      superseded_by: null,
      body: '',
      memory_class: 'working',
      truth_role: 'accepted_knowledge',
      lifetime: 'long_term',
      name: 'extract-todos',
      script_path: '.wolf/tools/extract-todos.ts',
      language: 'ts',
      ...overrides,
    };
  }

  it('валидный tool-объект проходит; usage_count дефолтится в 0', () => {
    const schema = buildTypeSchema(getDeclaration('tool'));
    const parsed = schema.parse(base());
    expect((parsed as { usage_count?: number }).usage_count).toBe(0);
  });

  it('без обязательных name/script_path/language — ошибка валидации', () => {
    const schema = buildTypeSchema(getDeclaration('tool'));
    const bad = base({ name: undefined, script_path: undefined, language: undefined });
    // ponytail: delete вместо undefined-присвоения — zod v4 различает missing и undefined
    delete (bad as Record<string, unknown>).name;
    delete (bad as Record<string, unknown>).script_path;
    delete (bad as Record<string, unknown>).language;
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it('usage_count принимает только целые неотрицательные', () => {
    const schema = buildTypeSchema(getDeclaration('tool'));
    expect(schema.safeParse(base({ usage_count: 2 })).success).toBe(true);
    expect(schema.safeParse(base({ usage_count: 2.5 })).success).toBe(false);
  });

  it('статус вне lifecycle tool отклоняется', () => {
    const schema = buildTypeSchema(getDeclaration('tool'));
    expect(schema.safeParse(base({ status: 'open' })).success).toBe(false);
    expect(schema.safeParse(base({ status: 'deprecated' })).success).toBe(true);
  });

  it('базовая схема принимает новые статусы candidate/deprecated', () => {
    expect(MemoryObjectSchema.shape.status.safeParse('candidate').success).toBe(true);
    expect(MemoryObjectSchema.shape.status.safeParse('deprecated').success).toBe(true);
  });
});
