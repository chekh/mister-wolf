// E-1 (test-plan волны 2.16.2): e2e «установлено под v1 → рантайм v2 → doctor сообщает
// → --repair чинит → плагин/MCP работают»; dry-run не пишет; идемпотентность.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { ensureBuilt } from './helpers.js';

ensureBuilt();

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../..');
const cli = join(REPO, 'dist', 'bootstrap', 'cli.js');
const sha256 = (s: string): string => createHash('sha256').update(s, 'utf-8').digest('hex');

function env(xdg: string, pathPrefix?: string): NodeJS.ProcessEnv {
  const { npm_command: _drop, ...rest } = process.env;
  return { ...rest, XDG_CONFIG_HOME: xdg, ...(pathPrefix ? { PATH: `${pathPrefix}:${rest.PATH ?? ''}` } : {}) };
}

function run(args: string[], cwd: string, xdg: string, pathPrefix?: string) {
  const r = spawnSync('node', [cli, ...args], { cwd, env: env(xdg, pathPrefix), encoding: 'utf-8', timeout: 120_000 });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

const V1_STAMP = '// wolf:rendered base=wolf-router.ts set=2.14.0';

describe('platform repair v1→v2 (REQ-02, e2e)', () => {
  let project: string;
  let xdg: string;
  let fakeBin: string;

  beforeAll(() => {
    project = mkdtempSync(join(tmpdir(), 'wolf-repair-e2e-'));
    xdg = mkdtempSync(join(tmpdir(), 'wolf-repair-e2e-xdg-'));
    fakeBin = mkdtempSync(join(tmpdir(), 'wolf-repair-e2e-bin-'));
    writeFileSync(join(project, 'package.json'), '{ "name": "repair-e2e" }');
    const init = run(['init', '--full', '--platform', 'opencode', '--model', 'zai-coding-plan/glm-5.3'], project, xdg);
    expect(init.status).toBe(0);
    // Имитация «установлено под v1»: плагин отрендерен версией < 2.14.1 (v1-only).
    // Важно: это НЕ локальная правка поверх текущего рендера — state-хэш синхронно
    // перезаписан под v1-файл (иначе mutated-skip защищает файл, и это другой сценарий).
    const plugin = join(project, '.opencode/plugins/wolf-router.ts');
    const v1Body = readFileSync(plugin, 'utf-8').replace(
      /\/\/ wolf:rendered base=\S+ set=\S+/,
      V1_STAMP
    );
    writeFileSync(plugin, v1Body);
    const statePath = join(project, '.opencode/wolf-sync-state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    state.files['.opencode/plugins/wolf-router.ts'] = sha256(v1Body);
    writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
    // Fake opencode CLI: рантайм v2 (read-only, только --version).
    const bin = join(fakeBin, 'opencode');
    writeFileSync(bin, '#!/bin/sh\necho "opencode v2.0.24"\n');
    chmodSync(bin, 0o755);
  });
  afterAll(() => {
    rmSync(project, { recursive: true, force: true });
    rmSync(xdg, { recursive: true, force: true });
    rmSync(fakeBin, { recursive: true, force: true });
  });

  it('doctor сообщает о несоответствии v1→v2 (runDoctor по cwd; CLI-реестр tmp-проекты prunes как sandbox)', async () => {
    const { runDoctor } = await import('../../src/app/use-cases/doctor.js');
    const { makeDetectMismatch } = await import('../../src/adapters/cli/commands/memory-doctor.js');
    const { PLATFORM_ADAPTERS } = await import('../../src/adapters/platforms/index.js');
    const { ProjectsRegistry } = await import('../../src/adapters/fs/projects-registry.js');
    const { readSchemaVersion } = await import('../../src/adapters/fs/schema-version.js');
    const prevPath = process.env.PATH;
    process.env.PATH = `${fakeBin}:${prevPath ?? ''}`;
    try {
      const report = await runDoctor({
        registry: new ProjectsRegistry(join(xdg, 'wolf')),
        readSchema: (p) => readSchemaVersion(p),
        exists: async (p) => existsSync(p),
        adapters: PLATFORM_ADAPTERS,
        cwd: project,
        readFile: async (p) => {
          try {
            return readFileSync(p, 'utf-8');
          } catch {
            return null;
          }
        },
        detectMismatch: makeDetectMismatch(PLATFORM_ADAPTERS),
      });
      const allIssues = report.entries.flatMap((e) => e.issues);
      expect(allIssues.some((i) => i.includes('installed under v1'))).toBe(true);
      expect(allIssues.some((i) => i.includes('--repair'))).toBe(true);
    } finally {
      process.env.PATH = prevPath;
    }
  });

  it('dry-run показывает план и не пишет', () => {
    const plugin = join(project, '.opencode/plugins/wolf-router.ts');
    const before = readFileSync(plugin, 'utf-8');
    const res = run(['doctor', '--repair', '--dry-run'], project, xdg, fakeBin);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('(dry-run)');
    expect(res.stdout).toMatch(/## Platform/);
    expect(readFileSync(plugin, 'utf-8')).toBe(before);
  });

  it('--repair чинит: штамп обновлён, конфиг каноничен, повторный doctor чист', () => {
    const res = run(['doctor', '--repair'], project, xdg, fakeBin);
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/## Platform/);
    const plugin = readFileSync(join(project, '.opencode/plugins/wolf-router.ts'), 'utf-8');
    // Плагин перерендерен: v1-штамп исчез, в контенте v2-маркер dual entry (плагин/MCP работают в v2).
    expect(plugin).not.toContain('set=2.14.0');
    expect(plugin).toMatch(/\/\/ wolf:rendered base=wolf-router\.ts set=\d+\.\d+\.\d+/);
    expect(plugin).toMatch(/server|ctx\.session/);
    const cfg = JSON.parse(readFileSync(join(project, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp?.wolf?.command).toEqual(['wolf', 'mcp']);
    expect(cfg.default_agent).toBe('mr-wolf');
    expect(cfg.subagent_depth).toBe(2);
    // Повторный doctor — чисто (идемпотентность).
    const again = run(['doctor'], project, xdg, fakeBin);
    expect(again.status).toBe(0);
    expect(again.stdout).not.toContain('installed under v1');
  });
});
