import { describe, it, expect } from 'vitest';
import { getDeclaration, subdirectoryFor } from '../../../src/domain/memory-types.js';
import { buildTypeSchema } from '../../../src/domain/type-schema-builder.js';

describe('playbook type (W5)', () => {
  const decl = getDeclaration('playbook');

  it('объявлен в core-таксономии с placement shared/playbooks', () => {
    expect(decl.name).toBe('playbook');
    expect(subdirectoryFor('playbook', 'shared')).toBe('playbooks');
    expect(subdirectoryFor('playbook', 'thread')).toBeNull();
    expect(decl.lifecycle).toContain('superseded');
  });

  it('валидный объект проходит схему', () => {
    const schema = buildTypeSchema(decl);
    const check = schema.safeParse({
      id: 'mem_20260829_pb_000001',
      type: 'playbook',
      title: 'apprentice playbook v4',
      body: '...',
      status: 'active',
      review_state: 'accepted',
      confidence: 'medium',
      importance: 0.5,
      created_at: '2026-08-29T00:00:00.000Z',
      updated_at: '2026-08-29T00:00:00.000Z',
      created_by: 'user:cli',
      schema_version: 1,
      source: { kind: 'manual' },
      related: { files: [], docs: [], decisions: [] },
      tags: ['apprentice'],
      superseded_by: null,
      memory_class: 'working',
      truth_role: 'accepted_knowledge',
      lifetime: 'long_term',
      trigger_keywords: [],
      steps: ['Прочитай файл', 'Найди 3 улучшения', 'Ответь по формату'],
      owner_skill: 'skill:apprentice',
      version: 'v4',
    });
    expect(check.success).toBe(true);
  });

  it('без обязательных steps/owner_skill/version — ошибка валидации', () => {
    const schema = buildTypeSchema(decl);
    const check = schema.safeParse({
      id: 'mem_20260829_pb_000002',
      type: 'playbook',
      title: 'сломанный playbook',
      body: '',
      status: 'active',
      review_state: 'accepted',
      confidence: 'medium',
      importance: 0.5,
      created_at: '2026-08-29T00:00:00.000Z',
      updated_at: '2026-08-29T00:00:00.000Z',
      created_by: 'user:cli',
      schema_version: 1,
      source: { kind: 'manual' },
      related: { files: [], docs: [], decisions: [] },
      tags: [],
      superseded_by: null,
      memory_class: 'working',
      truth_role: 'accepted_knowledge',
      lifetime: 'long_term',
    });
    expect(check.success).toBe(false);
    if (!check.success) {
      const missing = check.error.issues.map((i) => i.path.join('.')).sort();
      expect(missing).toEqual(['owner_skill', 'steps', 'version']);
    }
  });
});
