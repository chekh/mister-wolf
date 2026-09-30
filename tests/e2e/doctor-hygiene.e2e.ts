import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ensureBuilt, runCli, repoRoot } from './helpers.js';
import { ProjectsRegistry } from '../../src/adapters/fs/projects-registry.js';

// P331/2.14 §11.4 (критерии 2–3): песочницы чистятся с пометкой, призрак-детект
// для cwd (маркер без памяти / память без маркера), самолечение реестра —
// register-upsert с no-op (mtime неизменен). Изоляция — WOLF_SANDBOX (риск §4
// плана: тестовый реестр через env, живой ~/.config/wolf не трогаем).

/** Изолированный реестр: sandbox-корень → wolfUserConfigDir = <sb>/.config/wolf. */
function sandboxedRegistry(sb: string): ProjectsRegistry {
  return new ProjectsRegistry(join(sb, '.config', 'wolf'));
}

/** Полу-инициализированный живой проект: .wolf/memory + config v2 (без AGENTS.md-маркера). */
function memoryProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wolf-doc-hyg-'));
  mkdirSync(join(dir, '.wolf', 'memory'), { recursive: true });
  writeFileSync(join(dir, '.wolf', 'config.yaml'), 'schema_version: 2\n');
  return dir;
}

describe('wolf doctor hygiene e2e (P331/2.14 §11.4)', () => {
  const dirs: string[] = [];
  let neutralCwd: string;

  beforeAll(() => {
    ensureBuilt();
    neutralCwd = mkdtempSync(join(tmpdir(), 'wolf-doc-hyg-cwd-')); // без .wolf и маркеров — чистый cwd
    writeFileSync(join(neutralCwd, 'package.json'), '{ "name": "neutral" }');
    dirs.push(neutralCwd);
  });

  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it('запись под os.tmpdir() → `sandbox — pruned`, запись удалена из реестра', async () => {
    const sb = mkdtempSync(join(tmpdir(), 'wolf-doc-hyg-sb1-'));
    dirs.push(sb);
    const sandboxEntry = mkdtempSync(join(tmpdir(), 'wolf-doc-hyg-sandbox-')); // живой путь под tmpdir
    dirs.push(sandboxEntry);
    const registry = sandboxedRegistry(sb);
    await registry.register(sandboxEntry, 2);
    // контроль: не-песочница не чистится (repoRoot вне tmpdir — живой wolf-проект)
    await registry.register(repoRoot, 2);

    const res = runCli(['doctor'], neutralCwd, { WOLF_SANDBOX: sb });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('sandbox — pruned');
    const paths = (await sandboxedRegistry(sb).list()).map((p) => p.path);
    expect(paths).not.toContain(sandboxEntry);
    expect(paths).toContain(repoRoot);
  });

  it('cwd с маркером AGENTS.md без .wolf/memory → issue «памяти нет — wolf init»', () => {
    const ghost = mkdtempSync(join(tmpdir(), 'wolf-doc-hyg-ghost-'));
    dirs.push(ghost);
    writeFileSync(
      join(ghost, 'AGENTS.md'),
      '# Agents\n\n<!-- wolf:onboarding v2 -->\n\nwolf memory instructions\n<!-- /wolf:onboarding -->\n'
    );

    const res = runCli(['doctor'], ghost);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('инструктирует wolf, памяти нет — wolf init');
  });

  it('cwd с .wolf/memory без маркера → issue «не подключён — wolf sync»', () => {
    const orphan = memoryProject(); // память есть, AGENTS.md-маркера нет
    dirs.push(orphan);

    const res = runCli(['doctor'], orphan);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('память есть, агент не подключён — wolf sync');
  });

  it('самолечение: команда в незарегистрированном cwd с .wolf/memory добавляет запись; повторная — mtime реестра неизменен', () => {
    const sb = mkdtempSync(join(tmpdir(), 'wolf-doc-hyg-sb2-'));
    dirs.push(sb);
    const proj = memoryProject();
    dirs.push(proj);
    const registryFile = join(sb, '.config', 'wolf', 'projects.yaml');

    const first = runCli(['list'], proj, { WOLF_SANDBOX: sb });
    expect(first.status).toBe(0);
    // дочерний процесс резолвит cwd в realpath (macOS: /var → /private/var)
    expect(sandboxedRegistry(sb).list()).resolves.toMatchObject([{ path: realpathSync(proj), schema_version: 2 }]);

    const mtimeAfterFirst = statSync(registryFile).mtimeMs;
    const second = runCli(['list'], proj, { WOLF_SANDBOX: sb });
    expect(second.status).toBe(0);
    expect(statSync(registryFile).mtimeMs).toBe(mtimeAfterFirst);
  });
});
