import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpencodeBaseSetRenderer } from '../../../../src/adapters/render/opencode/opencode-renderer.js';

// Редакция S-DELIVERY 3.0.0: wolf-work-strategy доставляется как полный файл
// набора (не пересказ), покрыт картой обновления; рамки wolf-* доставляются
// с подстановкой моделей и без task-спавна; команды адресуют mr-wolf.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const base = join(root, 'templates/base');
const harness = join(root, 'templates/opencode');
const projects: string[] = [];
const renderer = () => new OpencodeBaseSetRenderer(base, { harnessTemplatesRoot: harness, setVersion: '9.9.9' });
const project = () => {
  const path = mkdtempSync(join(tmpdir(), 'wolf-strategy-'));
  projects.push(path);
  return path;
};

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
const WORKER_MODEL = new Set(['wolf-developer', 'wolf-editor', 'wolf-tester']);

afterEach(() => {
  for (const path of projects.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('work strategy delivery through the real base set', () => {
  it('delivers the complete strategy, substitutes entry points and keeps worker permissions', async () => {
    const path = project();
    await renderer().renderBaseSet(path, { models: { primary: 'test/primary', worker: 'test/worker' } });
    const read = (file: string) => readFileSync(join(path, '.opencode', file), 'utf8');
    const source = readFileSync(join(base, 'skills/wolf-work-strategy/SKILL.md'), 'utf8');
    const delivered = read('skills/wolf-work-strategy/SKILL.md');
    // Check actual payload delivery, not a shortened paraphrase of the methodology.
    expect(delivered.replace(/^<!-- wolf:rendered.*-->\n/gm, '')).toBe(source);
    // Рамки всех 9 агентов доставлены, плейсхолдеров моделей нет; исполнители
    // не нанимают (task-spawn запрещён), mr-wolf нанимает wolf-*.
    for (const role of AGENTS) {
      const text = read(`agents/${role}.md`);
      expect(text).not.toContain('{{model.');
      expect(text).not.toContain('{ { model.');
      const wanted = WORKER_MODEL.has(role) ? 'test/worker' : 'test/primary';
      expect(text, role).toContain(`model: ${wanted}`);
    }
    for (const role of AGENTS.filter((r) => r !== 'mr-wolf')) {
      const frontmatter = read(`agents/${role}.md`).split('---')[1] ?? '';
      expect(frontmatter, `${role}: task deny`).toMatch(/task:\s*deny|\{\s*action:\s*'task'[^}]*deny/);
    }
    expect(read('agents/mr-wolf.md')).toMatch(/"wolf-developer":\s*allow/);
    expect(read('command/analyze-doc.md')).toContain('agent: mr-wolf');
    expect(read('command/doc-review.md')).toContain('agent: mr-wolf');
    const map = JSON.parse(readFileSync(join(root, 'update-map.json'), 'utf8')) as {
      files: Array<{ path: string; kind: string; category: string }>;
    };
    expect(map.files).toContainEqual({
      path: 'base/skills/wolf-work-strategy/SKILL.md',
      kind: 'skill',
      // The lifecycle category changes after the introducing release.
      category: expect.stringMatching(/^(new|changed|unchanged)$/),
    });
  });

  it('adds a missing strategy on an existing project, preserves protection and is idempotent', async () => {
    const path = project();
    await renderer().renderBaseSet(path);
    const strategy = join(path, '.opencode/skills/wolf-work-strategy/SKILL.md');
    rmSync(strategy);
    const researcher = join(path, '.opencode/agents/wolf-researcher.md');
    const local =
      readFileSync(researcher, 'utf8').replace(/^---\n/, '---\nprotect: true\n') + '\nLocal project policy.\n';
    writeFileSync(researcher, local);
    const result = await renderer().renderBaseSet(path);
    expect(result.find((item) => item.file === '.opencode/skills/wolf-work-strategy/SKILL.md')?.action).toBe('created');
    expect(readFileSync(researcher, 'utf8')).toBe(local);
    expect(readFileSync(strategy, 'utf8')).toContain('name: wolf-work-strategy');
    const again = await renderer().renderBaseSet(path);
    expect(again.some((item) => item.action === 'created' || item.action === 'updated')).toBe(false);
  });
});
