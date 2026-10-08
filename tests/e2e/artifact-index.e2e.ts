// tests/e2e/artifact-index.e2e.ts
// E2E (2.15 A2/A4): scaffold artifact → sync → docs/dev/INDEX.md со строкой фичи;
// повторный sync идемпотентен («без изменений», mtime не тронут); без docs/dev — skipped.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ensureBuilt } from './helpers.js';

ensureBuilt();

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../..');
const cli = join(REPO, 'dist', 'bootstrap', 'cli.js');

/** Изоляция: tmp XDG (реестр проектов) + срез npm_command (npx-запуск теста не должен выглядеть как npx try-out CLI). */
function env(xdg: string): NodeJS.ProcessEnv {
  const { npm_command: _drop, ...rest } = process.env;
  return { ...rest, XDG_CONFIG_HOME: xdg };
}

function run(args: string[], cwd: string, xdg: string) {
  const r = spawnSync('node', [cli, ...args], { cwd, env: env(xdg), encoding: 'utf-8', timeout: 60_000 });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

describe('wolf sync генерирует docs/dev/INDEX.md, идемпотентно (2.15 A2/A4)', () => {
  let project: string;
  let xdg: string;

  beforeAll(() => {
    project = mkdtempSync(join(tmpdir(), 'wolf-artifact-index-e2e-'));
    writeFileSync(join(project, 'package.json'), '{ "name": "artifact-index-e2e" }');
    xdg = mkdtempSync(join(tmpdir(), 'wolf-artifact-index-e2e-xdg-'));
    expect(run(['scaffold', 'artifact', 'demo'], project, xdg).status).toBe(0);
  });

  afterAll(() => {
    rmSync(project, { recursive: true, force: true });
    rmSync(xdg, { recursive: true, force: true });
  });

  it('scaffold → sync: INDEX.md создан со строкой demo (full-профиль)', () => {
    const r = run(['sync'], project, xdg);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('docs/dev/INDEX.md: regenerated');

    const indexPath = join(project, 'docs', 'dev', 'INDEX.md');
    expect(readFileSync(indexPath, 'utf-8')).toMatch(/^\| demo \| \d{4}-\d{2}-\d{2} \| .+ \| draft \| full \|$/m);
  });

  it('повторный sync: «без изменений», mtime INDEX.md не изменился', () => {
    const indexPath = join(project, 'docs', 'dev', 'INDEX.md');
    const mtimeBefore = statSync(indexPath).mtimeMs;
    const r = run(['sync'], project, xdg);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('- docs/dev/INDEX.md: unchanged');
    expect(statSync(indexPath).mtimeMs).toBe(mtimeBefore);
  });

  it('без docs/dev sync молча пропускает индекс', () => {
    const bare = mkdtempSync(join(tmpdir(), 'wolf-artifact-index-e2e-bare-'));
    writeFileSync(join(bare, 'package.json'), '{ "name": "artifact-index-bare" }');
    try {
      const r = run(['sync'], bare, xdg);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('docs/dev missing — skipped');
      expect(readdirSync(bare)).not.toContain('docs');
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});
