// tests/unit/adapters/render/manifest.test.ts
import { describe, expect, it } from 'vitest';
import { OPENCODE_MANIFEST, substitute } from '../../../../src/adapters/render/manifest.js';

describe('manifest', () => {
  it('opencode-раскладка: agents/skills plural в шаблонах → .opencode/command (ед.ч.) целевой', () => {
    expect(OPENCODE_MANIFEST.layout).toEqual({
      agents: '.opencode/agents',
      skills: '.opencode/skills',
      commands: '.opencode/command',
    });
  });
  it('substitute заменяет известные плейсхолдеры', () => {
    expect(substitute('{{tool.task}} и {{tool.skill}}', OPENCODE_MANIFEST)).toBe('task и skill');
  });
  it('substitute громко падает на неизвестном', () => {
    expect(() => substitute('{{tool.nope}}', OPENCODE_MANIFEST)).toThrow(/Unknown tool placeholder/);
  });
});

describe('substitute + model context (onboarding v2, §4.5)', () => {
  it('с контекстом подставляет primary/worker, {{tool.*}} не ломает', () => {
    expect(
      substitute('{{tool.task}} → {{model.primary}}, {{model.worker}}', OPENCODE_MANIFEST, {
        primary: 'prov/m1',
        worker: 'prov/m2',
      })
    ).toBe('task → prov/m1, prov/m2');
  });
  it('omit: построчно удаляет model:-строку вместе с переводом строки', () => {
    expect(
      substitute('---\ndescription: d\nmodel: {{model.primary}}\ntemp: 0.3\n---\n', OPENCODE_MANIFEST, 'omit')
    ).toBe('---\ndescription: d\ntemp: 0.3\n---\n');
    expect(substitute('model: {{model.worker}}\n', OPENCODE_MANIFEST, 'omit')).toBe('');
  });
  it('без контекста {{model.*}} остаются как есть', () => {
    expect(substitute('model: {{model.worker}}', OPENCODE_MANIFEST)).toBe('model: {{model.worker}}');
  });
});
