import { describe, it, expect } from 'vitest';
import { buildTypeSchema } from '../../../src/domain/type-schema-builder.js';
import { getDeclaration } from '../../../src/domain/memory-types.js';

describe('tool type carries intake fields (спека 2.15 C4)', () => {
  it('declaration carries owner_skill, version, source_url', () => {
    // Красный до шага 2: полей нет в декларации. Ассертим декларацию, не parse —
    // MemoryObjectSchema passthrough сохраняет неизвестные поля, parse зелёный и до правки.
    const fields = getDeclaration('tool').fields ?? {};
    expect(fields.owner_skill).toEqual({ kind: 'string', optional: true });
    expect(fields.version).toEqual({ kind: 'string', optional: true });
    expect(fields.source_url).toEqual({ kind: 'string', optional: true });
  });

  it('tool object with intake fields parses (smoke)', () => {
    const Schema = buildTypeSchema(getDeclaration('tool'), {});
    const parsed = Schema.parse({
      // минимальный валидный тул-объект — общие поля по MemoryObjectSchema
      // (прецедент фикстур: tests/unit/domain/tool-taxonomy.test.ts, функция base()).
      // Отклонение от брифа: добавлены body, memory_class, truth_role, lifetime —
      // фактический base() показывает, что это обязательные общие поля.
      id: 'mem_tool_1',
      type: 'tool',
      title: 'skill: ponytail',
      status: 'candidate',
      review_state: 'accepted',
      confidence: 'medium',
      importance: 0.5,
      created_at: '2026-10-08T00:00:00Z',
      updated_at: '2026-10-08T00:00:00Z',
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
      name: 'ponytail',
      script_path: '.opencode/skills/ponytail/SKILL.md',
      language: 'markdown',
      owner_skill: 'ponytail',
      version: '1.2.0',
      source_url: 'https://example.com/skills/ponytail',
    });
    expect(parsed.owner_skill).toBe('ponytail');
    expect(parsed.version).toBe('1.2.0');
    expect(parsed.source_url).toBe('https://example.com/skills/ponytail');
  });
});
