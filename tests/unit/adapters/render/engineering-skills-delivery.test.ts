import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpencodeBaseSetRenderer } from '../../../../src/adapters/render/opencode/opencode-renderer.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const skills = ['wolf-software-design', 'wolf-code-craft', 'wolf-code-simplify'];
const projects: string[] = [];
const renderer = () =>
  new OpencodeBaseSetRenderer(join(root, 'templates/base'), {
    harnessTemplatesRoot: join(root, 'templates/opencode'),
    setVersion: '9.9.9',
  });
const project = () => {
  const path = mkdtempSync(join(tmpdir(), 'wolf-engineering-'));
  projects.push(path);
  return path;
};
const target = (path: string, skill: string) => join(path, '.opencode/skills', skill, 'SKILL.md');

afterEach(() => {
  for (const path of projects.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('engineering skills delivery', () => {
  it('delivers complete skill payloads through the real base set', async () => {
    const path = project();
    await renderer().renderBaseSet(path);
    const map = JSON.parse(readFileSync(join(root, 'update-map.json'), 'utf8'));
    for (const skill of skills) {
      const source = readFileSync(join(root, 'templates/base/skills', skill, 'SKILL.md'), 'utf8');
      const delivered = readFileSync(target(path, skill), 'utf8');
      expect(delivered.replace(/^<!-- wolf:rendered.*-->\n/gm, '')).toBe(source);
      expect(map.files).toContainEqual({
        path: `base/skills/${skill}/SKILL.md`,
        kind: 'skill',
        category: expect.stringMatching(/^(new|changed|unchanged)$/),
      });
    }
  });

  it('syncs missing skills on existing projects without overwriting protected skills', async () => {
    const path = project();
    await renderer().renderBaseSet(path);
    for (const skill of ['wolf-code-craft', 'wolf-code-simplify']) rmSync(target(path, skill));
    const design = target(path, 'wolf-software-design');
    const local = readFileSync(design, 'utf8').replace(/^---\n/, '---\nprotect: true\n') + '\nLocal policy.\n';
    writeFileSync(design, local);
    const result = await renderer().syncBaseSet(path);
    for (const skill of ['wolf-code-craft', 'wolf-code-simplify']) {
      expect(result.outcomes.find((item) => item.file === `.opencode/skills/${skill}/SKILL.md`)?.action).toBe(
        'created'
      );
    }
    expect(readFileSync(design, 'utf8')).toBe(local);
    const again = await renderer().syncBaseSet(path);
    expect(again.outcomes.some((item) => item.action === 'created' || item.action === 'updated')).toBe(false);
  });
});
