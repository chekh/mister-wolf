// tests/integration/sync-deprecated.test.ts
// REQ-07 AC1 (2.19.0 T11): `wolf sync` — deprecated-алиас с redirect на
// `wolf upgrade --here`; инвариант: множество id объектов памяти неизменно
// (сравнение слепков до/после). Прецедент спавна CLI: b0-init.test.ts.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname, resolve, relative } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cliPath = join(REPO, 'dist', 'bootstrap', 'cli.js');

function runCli(args: string[], cwd: string): { stdout: string; stderr: string; status: number | null } {
  const { npm_command: _drop, ...env } = process.env;
  const r = spawnSync('node', [cliPath, ...args], { cwd, encoding: 'utf-8', timeout: 60_000, env });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

/** Слепок памяти: рекурсивно все .md под .wolf/memory → id (relpath) + содержимое. */
function memorySnapshot(root: string): Map<string, string> {
  const memDir = join(root, '.wolf', 'memory');
  const out = new Map<string, string>();
  if (!existsSync(memDir)) return out;
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e.endsWith('.md')) out.set(relative(memDir, p), readFileSync(p, 'utf-8'));
    }
  };
  walk(memDir);
  return out;
}

describe('wolf sync: deprecated alias (REQ-07 AC1, T11)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-sync-dep-'));
    writeFileSync(join(dir, 'package.json'), '{ "name": "sync-dep-it" }');
    const init = runCli(['init', '--full', '--platform', 'opencode', '--model', 'zai-coding-plan/glm-5.3', dir], dir);
    expect(init.status, `init failed: ${init.stderr}`).toBe(0);
    // гарантия непустого слепка: свой note поверх init-скелета (sync память не
    // читает — инвариант файловый, байтовый)
    const probeDir = join(dir, '.wolf', 'memory', 'shared', 'lessons');
    mkdirSync(probeDir, { recursive: true });
    writeFileSync(
      join(probeDir, 'mem_t11_probe.md'),
      `---\nid: mem_t11_probe\ntype: note\nfacet: lesson\nstatus: active\ntitle: sync-deprecation probe\ncreated_at: '2026-10-24T00:00:00.000Z'\nupdated_at: '2026-10-24T00:00:00.000Z'\n---\n\nprobe body\n`,
      'utf-8'
    );
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('prints DEPRECATED + redirect to wolf upgrade --here', () => {
    const r = runCli(['sync'], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('DEPRECATED: wolf sync is superseded by `wolf upgrade --here`; removed in 2.20.0');
  });

  it('memory id set unchanged by sync (invariant REQ-07 AC1)', () => {
    const before = memorySnapshot(dir);
    expect(before.size).toBeGreaterThan(0); // init создал скелет
    const r = runCli(['sync'], dir);
    expect(r.status).toBe(0);
    const after = memorySnapshot(dir);
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [id, body] of before) expect(after.get(id)).toBe(body);
  });
});
