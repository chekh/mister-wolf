import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 2.16.3 hotfix (C2): guard от повторения регрессии OpenCode v2.
// Агент без mode в frontmatter регистрируется с дефолтом primary
// (schema/agent.ts) и гейтится субагент-тулом («Agent X cannot run as
// a subagent», subagent.ts:136) — Task-цепь L0→L1→L2 умирает молча.
// Поэтому каждый шаблон обязан явно объявлять mode, а исполнители wolf-*
// (нанимаются task-тулом из mr-wolf) — subagent, ведущий — primary.
const AGENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'base', 'agents');
const VALID_MODES = new Set(['primary', 'all', 'subagent']);
// Task-цепь: исполнители спавнятся субагент-тулом (mr-wolf → wolf-*)
const TASK_CHAIN = [/^wolf-.*\.md$/];
const PACKAGE_AGENTS = new Set([
  'mr-wolf.md',
  'wolf-researcher.md',
  'wolf-architect.md',
  'wolf-developer.md',
  'wolf-reviewer.md',
  'wolf-tester.md',
  'wolf-editor.md',
  'wolf-release-engineer.md',
  'wolf-expert.md',
]);

function frontmatter(name: string): string {
  const text = readFileSync(join(AGENTS_DIR, name), 'utf-8');
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error(`${name}: frontmatter block missing`);
  return m[1];
}

function modeOf(name: string): string | null {
  const m = frontmatter(name).match(/^mode:\s*(\S+)\s*$/m);
  if (!m) return null;
  return m[1].replace(/^['"]|['"]$/g, '');
}

describe('agents templates mode guard (hotfix 2.16.3, C2)', () => {
  const files = readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'));

  it('enumerates the full package agent set (no vacuous pass)', () => {
    expect(new Set(files)).toEqual(PACKAGE_AGENTS);
  });

  it.each(files)('%s declares a valid mode', (name) => {
    const mode = modeOf(name);
    if (mode === null) throw new Error(`${name}: frontmatter has no mode line`);
    expect(VALID_MODES.has(mode), `${name}: mode "${mode}" not in ${[...VALID_MODES].join('/')}`).toBe(true);
  });

  it.each(files.filter((f) => TASK_CHAIN.some((re) => re.test(f))))(
    '%s (wolf-исполнитель) must be mode:subagent',
    (name) => {
      const mode = modeOf(name);
      if (mode === null) throw new Error(`${name}: wolf-исполнитель must declare mode explicitly`);
      expect(mode, `${name}: wolf-исполнители нанимаются task-тулом из mr-wolf — mode:subagent`).toBe('subagent');
    }
  );

  it('mr-wolf.md — ведущий двухуровневой модели: mode primary', () => {
    expect(modeOf('mr-wolf.md')).toBe('primary');
  });
});
