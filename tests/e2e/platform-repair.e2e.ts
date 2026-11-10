// E-1 (3.0.0): e2e «установлено под v1 → рантайм v2 → doctor сообщает → --repair чинит
// (перерендер базового набора + канонизация конфига) → повторный doctor чист»;
// dry-run не пишет (снимок дерева до/после); идемпотентность повтора.
// 3.0.0-нюанс: init НЕ доставляет плагины, поэтому v1-состояние сеется детерминированно:
// легаси-файл .opencode/plugins/* со штампом set < 2.14.1 (DUAL_SINCE) + запись в
// wolf-sync-state — mismatch детектится именно по plugins-записям state (platform-mismatch.ts).
// Repair легаси-сироту НЕ трогает (orphanedNote: remove manually / wolf uninstall, F-02),
// поэтому сценарий повторной чистоты включает этот ручной шаг по совету repair.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative } from 'path';
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

/** Снимок дерева: rel-путь → sha256 контента (no-write и идемпотентность — по контенту). */
function treeSnapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[relative(root, p)] = sha256(readFileSync(p, 'utf-8'));
    }
  };
  walk(root);
  return out;
}

const LEGACY_PLUGIN_REL = '.opencode/plugins/wolf-router.ts';
const V1_SET = '2.14.0'; // < DUAL_SINCE (2.14.1) — v1-only плагин

/** V1-фикстура: init 3.0.0 плагины не рендерит — легаси-плагин кладём вручную:
 * файл со штампом v1-набора + запись-свидетель в wolf-sync-state (детект читает state). */
function seedLegacyV1Plugin(project: string): void {
  const abs = join(project, LEGACY_PLUGIN_REL);
  mkdirSync(dirname(abs), { recursive: true });
  const v1Body = `// wolf:rendered base=wolf-router.ts set=${V1_SET}\n// v1-only router plugin (legacy)\nexport default {};\n`;
  writeFileSync(abs, v1Body);
  const statePath = join(project, '.opencode/wolf-sync-state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf-8')) as { files: Record<string, unknown> };
  state.files[LEGACY_PLUGIN_REL] = sha256(v1Body);
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
}

describe('platform repair v1→v2 (REQ-02, 3.0.0 e2e)', () => {
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
    seedLegacyV1Plugin(project);
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

  /** in-process runDoctor по cwd=project: CLI-реестр tmp-проекты prunes как sandbox (os.tmpdir). */
  async function doctorIssues(): Promise<string[]> {
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
      return report.entries.flatMap((e) => e.issues);
    } finally {
      process.env.PATH = prevPath;
    }
  }

  it('doctor (без --repair) сообщает о несоответствии v1→v2 с подсказкой --repair', async () => {
    const issues = await doctorIssues();
    expect(issues.some((i) => i.includes('installed under v1'))).toBe(true);
    expect(issues.some((i) => i.includes('--repair'))).toBe(true);
  });

  it('--repair --dry-run: отчёт-план (mismatch + перерендер + канонизация), проект не изменён', () => {
    const before = treeSnapshot(project);
    const res = run(['doctor', '--repair', '--dry-run'], project, xdg, fakeBin);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('(dry-run)');
    expect(res.stdout).toContain('## Platform (plan)');
    expect(res.stdout).toContain('installed under v1');
    expect(res.stdout).toContain('syncBaseSet: re-render');
    expect(res.stdout).toContain('writeConfig: canonicalize');
    expect(treeSnapshot(project)).toEqual(before); // dry-run ничего не пишет
  });

  it('--repair: базовый набор выровнен, конфиг каноничен; сирота-легаси остаётся с пометкой', () => {
    const res = run(['doctor', '--repair'], project, xdg, fakeBin);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('## Platform');
    // перерендер штампованных целей базового набора записан в отчёте
    expect(res.stdout).toMatch(/- \.opencode\/\S+ — /);
    // канонизация конфига (v2-пути, без deprecated-ключей)
    const cfg = JSON.parse(readFileSync(join(project, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp?.servers?.wolf?.command).toEqual(['wolf', 'mcp']);
    expect(cfg.default_agent).toBe('mr-wolf');
    expect(cfg.experimental.subagent_depth).toBe(2);
    expect(cfg.subagent_depth).toBeUndefined(); // deprecated в opencode v2
    // легаси-плагин repair не трогает (orphaned) — рекомендация удаления в отчёте
    expect(existsSync(join(project, LEGACY_PLUGIN_REL))).toBe(true);
    expect(res.stdout).toContain('orphaned stamped files are not touched');
  });

  it('повторный doctor чист после удаления сироты по совету repair; повторный --repair идемпотентен', async () => {
    // Ручной шаг из orphanedNote (repair сироты не удаляет — F-02)
    rmSync(join(project, LEGACY_PLUGIN_REL));
    expect((await doctorIssues()).some((i) => i.includes('installed under v1'))).toBe(false);

    // идемпотентность платформенной зоны: повторный --repair не меняет контент
    const before = {
      opencode: treeSnapshot(join(project, '.opencode')),
      config: sha256(readFileSync(join(project, 'opencode.json'), 'utf-8')),
    };
    const res = run(['doctor', '--repair'], project, xdg, fakeBin);
    expect(res.status).toBe(0);
    expect({
      opencode: treeSnapshot(join(project, '.opencode')),
      config: sha256(readFileSync(join(project, 'opencode.json'), 'utf-8')),
    }).toEqual(before);
    // и после повтора mismatch не возвращается
    expect((await doctorIssues()).some((i) => i.includes('installed under v1'))).toBe(false);
  });
});
