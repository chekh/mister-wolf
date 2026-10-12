import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 2.16.3 hotfix (C2): guard от повторения регрессии OpenCode v2.
// Агент без mode в frontmatter регистрируется с дефолтом primary
// (schema/agent.ts) и гейтится субагент-тулом («Agent X cannot run as
// a subagent», subagent.ts:136) — Task-цепь L0→L1→L2 умирает молча.
// Поэтому каждый шаблон обязан явно объявлять mode, а участники
// Task-цепи (executor-lead, worker-*) — не primary.
const AGENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'base', 'agents');
const VALID_MODES = new Set(['primary', 'all', 'subagent']);
// Task-цепь: спавнятся субагент-тулом (mr-wolf → executor-lead → worker-*)
const TASK_CHAIN = [/^executor-lead\.md$/, /^worker-.*\.md$/];
const PACKAGE_AGENTS = new Set([
  'executor-lead.md',
  'mr-wolf.md',
  'steward.md',
  'worker-implementer.md',
  'worker-researcher.md',
  'worker-reviewer.md',
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

  it.each(files.filter((f) => TASK_CHAIN.some((re) => re.test(f))))('%s (Task-chain) must be mode:all', (name) => {
    const mode = modeOf(name);
    if (mode === null) throw new Error(`${name}: Task-chain agent must declare mode explicitly`);
    // 'all', не просто «не primary»: subagent чинит Task-спавн, но ломает
    // прямой `opencode run --agent …` — решение владельца сохраняет обе площадки (REQ-01)
    expect(mode, `${name}: Task-chain agents must be mode:all (Task-spawn + direct CLI)`).toBe('all');
  });
});
