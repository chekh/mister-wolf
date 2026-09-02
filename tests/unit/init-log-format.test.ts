// tests/unit/init-log-format.test.ts
// F5/F6 (спека 2.1.0 §2.3/§2.4): чистые форматтеры строк лога `wolf init`.
import { describe, it, expect } from 'vitest';
import { formatBaseSetLine, formatPlatformLine } from '../../src/adapters/cli/commands/memory-init.js';

describe('formatBaseSetLine (F5, §2.3: скиллы — `[skill] <имя> → <путь>`)', () => {
  it('скилл created → строка дословно из спеки, без суффикса', () => {
    expect(formatBaseSetLine({ file: '.opencode/skills/wolf-lesson/SKILL.md', action: 'created' })).toBe(
      '[skill] wolf-lesson → .opencode/skills/wolf-lesson/SKILL.md'
    );
  });

  it('скилл skipped → суффикс с action и reason', () => {
    expect(
      formatBaseSetLine({
        file: '.opencode/skills/wolf-lesson/SKILL.md',
        action: 'skipped',
        reason: 'exists, unstamped (wx-политика)',
      })
    ).toBe('[skill] wolf-lesson → .opencode/skills/wolf-lesson/SKILL.md (skipped: exists, unstamped (wx-политика))');
  });

  it('скилл updated без reason → суффикс только с action', () => {
    expect(formatBaseSetLine({ file: '.opencode/skills/foo/SKILL.md', action: 'updated' })).toBe(
      '[skill] foo → .opencode/skills/foo/SKILL.md (updated)'
    );
  });

  it('не-скилл → прежний формат `- base set:`', () => {
    expect(formatBaseSetLine({ file: 'AGENTS.md', action: 'created' })).toBe('- base set: AGENTS.md created');
    expect(
      formatBaseSetLine({ file: '.opencode/agents/mr-wolf.md', action: 'skipped', reason: 'content identical' })
    ).toBe('- base set: .opencode/agents/mr-wolf.md skipped — content identical');
  });
});

describe('formatPlatformLine (F6, §2.4: честный лог платформенного конфига)', () => {
  it('configFile + keys — пример спеки дословно', () => {
    expect(
      formatPlatformLine({
        platform: 'opencode',
        action: 'written',
        configFile: 'opencode.json',
        keys: ['mcp.wolf', 'default_agent=mr-wolf', 'subagent_depth=2'],
      })
    ).toBe('- opencode.json: written (mcp.wolf, default_agent=mr-wolf, subagent_depth=2)');
  });

  it('unchanged с reason: keys без чужого default_agent, reason в хвосте', () => {
    expect(
      formatPlatformLine({
        platform: 'opencode',
        action: 'unchanged',
        reason: 'default_agent=other занят; mr-wolf не назначен',
        configFile: 'opencode.json',
        keys: ['mcp.wolf', 'subagent_depth=2'],
      })
    ).toBe('- opencode.json: unchanged (mcp.wolf, subagent_depth=2) — default_agent=other занят; mr-wolf не назначен');
  });

  it('npx → `- platform configs: …` с причиной', () => {
    expect(
      formatPlatformLine({ platform: 'npx', action: 'skipped', reason: 'npx try-out never writes MCP configs' })
    ).toBe('- platform configs: skipped — npx try-out never writes MCP configs');
  });

  it('npx без reason → защита формата: unknown reason', () => {
    expect(formatPlatformLine({ platform: 'npx', action: 'skipped' })).toBe(
      '- platform configs: skipped — unknown reason'
    );
  });

  it('без configFile (removed) → прежний формат `platform <id>`', () => {
    expect(formatPlatformLine({ platform: 'claude', action: 'removed', reason: 'no wolf entry' })).toBe(
      '- platform claude: removed — no wolf entry'
    );
  });
});
