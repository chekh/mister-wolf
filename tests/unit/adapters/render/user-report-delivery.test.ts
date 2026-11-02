import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpencodeBaseSetRenderer } from '../../../../src/adapters/render/opencode/opencode-renderer.js';
import { artifactFs } from '../../../../src/adapters/fs/artifact-fs.js';
import { runArtifactLint } from '../../../../src/app/use-cases/lint-artifacts.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const base = join(root, 'templates/base');
const reportPath = '.opencode/skills/wolf-user-report/SKILL.md';
const routerPath = '.opencode/skills/using-skills/SKILL.md';
const projects: string[] = [];
const renderer = () =>
  new OpencodeBaseSetRenderer(base, {
    harnessTemplatesRoot: join(root, 'templates/opencode'),
    setVersion: '9.9.9',
  });
const project = () => {
  const path = mkdtempSync(join(tmpdir(), 'wolf-user-report-'));
  projects.push(path);
  return path;
};
const unstamp = (text: string) => text.replace(/^<!-- wolf:rendered.*-->\n/gm, '');

afterEach(() => {
  for (const path of projects.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('user report delivery through the real base set', () => {
  it('keeps minimal onboarding minimal, then delivers the full skill and its route', async () => {
    const path = project();
    await renderer().renderBaseSet(path, { scope: 'agents-md' });
    expect(existsSync(join(path, reportPath))).toBe(false);
    await renderer().renderBaseSet(path);
    const source = readFileSync(join(base, 'skills/wolf-user-report/SKILL.md'), 'utf8');
    const delivered = readFileSync(join(path, reportPath), 'utf8');
    expect(unstamp(delivered)).toBe(source);
    expect(delivered).toMatch(/^---\nname: wolf-user-report\n/);
    expect(delivered).not.toContain('{{');
    expect(readFileSync(join(path, routerPath), 'utf8')).toContain('wolf-user-report');
    const map = JSON.parse(readFileSync(join(root, 'update-map.json'), 'utf8'));
    expect(map.files).toContainEqual({
      path: 'base/skills/wolf-user-report/SKILL.md',
      kind: 'skill',
      // The lifecycle category changes after the introducing release.
      category: expect.stringMatching(/^(new|changed|unchanged)$/),
    });
  });

  it('adds a missing skill, preserves protected routing and project CSS, and is idempotent', async () => {
    const path = project();
    await renderer().renderBaseSet(path);
    rmSync(join(path, reportPath));
    const router = join(path, routerPath);
    const local = readFileSync(router, 'utf8').replace(/^---\n/, '---\nprotect: true\n') + '\nLocal policy.\n';
    writeFileSync(router, local);
    const theme = join(path, 'reports/templates/team.css');
    mkdirSync(dirname(theme), { recursive: true });
    writeFileSync(theme, ':root { --accent: #176248; }\n');
    const result = await renderer().renderBaseSet(path);
    expect(result.find((item) => item.file === reportPath)?.action).toBe('created');
    expect(result.find((item) => item.file === routerPath)?.protected).toBe(true);
    expect(readFileSync(router, 'utf8')).toBe(local);
    expect(readFileSync(theme, 'utf8')).toBe(':root { --accent: #176248; }\n');
    const again = await renderer().renderBaseSet(path);
    expect(again.some((item) => item.action === 'created' || item.action === 'updated')).toBe(false);
  });

  it('does not overwrite an unstamped user skill with the same name', async () => {
    const path = project();
    const file = join(path, reportPath);
    mkdirSync(dirname(file), { recursive: true });
    const local = '---\nname: wolf-user-report\ndescription: Local report rules\n---\nLocal content.\n';
    writeFileSync(file, local);
    const result = await renderer().renderBaseSet(path);
    expect(result.find((item) => item.file === reportPath)).toMatchObject({ action: 'skipped' });
    expect(readFileSync(file, 'utf8')).toBe(local);
  });

  it('preserves a local mutation of the stamped report skill', async () => {
    const path = project();
    await renderer().renderBaseSet(path);
    const file = join(path, reportPath);
    const local = readFileSync(file, 'utf8') + '\nProject-specific report policy.\n';
    writeFileSync(file, local);
    const result = await renderer().renderBaseSet(path);
    expect(result.find((item) => item.file === reportPath)).toMatchObject({ action: 'skipped', mutated: true });
    expect(readFileSync(file, 'utf8')).toBe(local);
  });

  it('recognizes the delivered report as a base skill rather than a ghost tool', async () => {
    const path = project();
    await renderer().renderBaseSet(path);
    const findings = await runArtifactLint({
      fs: artifactFs(),
      baseDir: path,
      toolOwners: new Set(),
      baseSkillNames: new Set(readdirSync(join(base, 'skills'))),
    });
    expect(findings.filter((finding) => finding.file.includes('wolf-user-report'))).toEqual([]);
  });
});
