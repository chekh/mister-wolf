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
