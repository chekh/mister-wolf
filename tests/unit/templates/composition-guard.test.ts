// tests/unit/templates/composition-guard.test.ts
// S-DELIVERY 3.0.0: validate-подход к составу набора (по образцу пилотного
// validate_content): ровно 9 агентов (mr-wolf + 8 wolf-*), ровно 35 скиллов,
// frontmatter валиден у всех; удалённые роли/плагины не упоминаются в активных
// шаблонах (исторические пометки «упразднён» — допустимы, using-skills/SKILL.md:19);
// task-спавн разрешён только mr-wolf; команды адресуют mr-wolf.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const base = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'templates', 'base');
const AGENTS = [
  'mr-wolf',
  'wolf-architect',
  'wolf-developer',
  'wolf-editor',
  'wolf-expert',
  'wolf-release-engineer',
  'wolf-researcher',
  'wolf-reviewer',
  'wolf-tester',
];
const BANNED = [
  'executor-lead',
  'worker-implementer',
  'worker-researcher',
  'worker-reviewer',
  'worker-expert',
  'wolf-router',
  'wolf-session-start',
];

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const frontmatterRaw = (raw: string, what: string): string => {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  expect(m, `${what}: frontmatter обязателен`).toBeTruthy();
  return m![1]!;
};

const frontmatterOf = (raw: string, what: string): Record<string, unknown> =>
  yaml.load(frontmatterRaw(raw, what)) as Record<string, unknown>;

describe('состав набора (S-DELIVERY 3.0.0)', () => {
  it('в templates/base/agents ровно 9 .md: mr-wolf без префикса + 8 с wolf-префиксом', () => {
    const files = readdirSync(join(base, 'agents'))
      .filter((f) => f.endsWith('.md'))
      .sort();
    expect(files).toEqual([...AGENTS].sort().map((a) => `${a}.md`));
  });

  it('ровно 35 каталогов скиллов, в каждом SKILL.md', () => {
    const dirs = readdirSync(join(base, 'skills')).filter((d) => statSync(join(base, 'skills', d)).isDirectory());
    expect(dirs).toHaveLength(35);
    for (const d of dirs) expect(existsSync(join(base, 'skills', d, 'SKILL.md')), d).toBe(true);
  });

  it('YAML-frontmatter парсится у всех агентов и скиллов (name/agent-id + description)', () => {
    for (const a of AGENTS) {
      const raw = readFileSync(join(base, 'agents', `${a}.md`), 'utf-8');
      const fm = frontmatterOf(raw, a);
      expect(String(fm['agent-id'] ?? raw.match(/^agent-id:\s*(\S+)\s*$/m)?.[1]), a).toBe(a);
      expect(String(fm['description'] ?? ''), a).not.toBe('');
    }
    for (const d of readdirSync(join(base, 'skills'))) {
      const p = join(base, 'skills', d, 'SKILL.md');
      if (!existsSync(p)) continue;
      const fm = frontmatterOf(readFileSync(p, 'utf-8'), d);
      expect(fm['name'], d).toBe(d);
      expect(String(fm['description'] ?? ''), d).not.toBe('');
    }
  });

  it('удалённые роли/плагины не упоминаются в активных шаблонах (исторические «упразднён» — допустимы)', () => {
    const violations: string[] = [];
    for (const file of walk(base)) {
      const lines = readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, i) => {
        for (const token of BANNED) {
          if (line.includes(token) && !line.includes('упраздн')) violations.push(`${file}:${i + 1}: ${token}`);
        }
      });
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('task-спавн разрешён только mr-wolf; исполнители не нанимают', () => {
    const mrWolf = readFileSync(join(base, 'agents', 'mr-wolf.md'), 'utf-8');
    expect(mrWolf).toMatch(/"wolf-developer":\s*allow/);
    for (const a of AGENTS.filter((x) => x !== 'mr-wolf')) {
      const fm = frontmatterRaw(readFileSync(join(base, 'agents', `${a}.md`), 'utf-8'), a);
      // map-форма (permission:) и list-форма (permissions: wolf-expert) — task-allow запрещён обеими
      expect(fm, `${a}: task-allow`).not.toMatch(/task[^\n]*allow/);
      expect(fm, `${a}: task-allow (list-form)`).not.toMatch(/\{\s*action:\s*'task'[^}]*allow/);
    }
  });

  it('команды complain/doc-review/analyze-doc существуют и адресуют mr-wolf', () => {
    for (const c of ['complain', 'doc-review', 'analyze-doc']) {
      const raw = readFileSync(join(base, 'commands', `${c}.md`), 'utf-8');
      expect(raw, c).toContain('agent: mr-wolf');
    }
  });
});
