import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpencodeBaseSetRenderer } from '../../../../src/adapters/render/opencode/opencode-renderer.js';

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
    expect(read('skills/using-skills/SKILL.md')).toContain('wolf-work-strategy');
    expect(read('command/analyze-doc.md')).toContain('agent: mr-wolf');
    expect(read('command/doc-review.md')).toContain('agent: mr-wolf');
    for (const role of [
      'mr-wolf',
      'executor-lead',
      'steward',
      'worker-researcher',
      'worker-implementer',
      'worker-reviewer',
    ]) {
      const text = read(`agents/${role}.md`);
      expect(text).toContain('wolf-work-strategy');
      if (role.startsWith('worker-')) {
        expect(text).toContain('task: deny');
        expect(text).toContain('"mr-wolf_*": deny');
      }
      expect(text).not.toContain('{{model.');
      expect(text).toContain(`model: test/${role === 'worker-implementer' ? 'worker' : 'primary'}`);
      expect(text).not.toContain('{ { model.');
    }
    const map = JSON.parse(readFileSync(join(root, 'update-map.json'), 'utf8'));
    expect(map.files).toContainEqual({
      path: 'base/skills/wolf-work-strategy/SKILL.md',
      kind: 'skill',
      category: 'new',
    });
  });

  it('adds a missing strategy on an existing project, preserves protection and is idempotent', async () => {
    const path = project();
    await renderer().renderBaseSet(path);
    const strategy = join(path, '.opencode/skills/wolf-work-strategy/SKILL.md');
    rmSync(strategy);
    const lead = join(path, '.opencode/agents/executor-lead.md');
    const local = readFileSync(lead, 'utf8').replace(/^---\n/, '---\nprotect: true\n') + '\nLocal project policy.\n';
    writeFileSync(lead, local);
    const result = await renderer().renderBaseSet(path);
    expect(result.find((item) => item.file === '.opencode/skills/wolf-work-strategy/SKILL.md')?.action).toBe('created');
    expect(readFileSync(lead, 'utf8')).toBe(local);
    expect(readFileSync(strategy, 'utf8')).toContain('name: wolf-work-strategy');
    const again = await renderer().renderBaseSet(path);
    expect(again.some((item) => item.action === 'created' || item.action === 'updated')).toBe(false);
  });
});
