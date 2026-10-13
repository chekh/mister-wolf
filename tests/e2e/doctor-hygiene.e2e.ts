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

// Волна 2.17 T-06 (test-plan §NFR-02): doctor подсвечивает дубликаты канонических
// лиц, face вне контракта, битый based_on и legacy+face — формат `! <file>: <issue>`.

interface FaceSeed {
  id: string;
  owner_skill: string;
  version: string;
  status?: string;
  based_on?: string;
  /** undefined — поле не пишется вовсе: файл не проходит контракт face (сценарий «вне контракта»). */
  reason?: string;
}

/** Face-файл руками в shared/faces/ (даты в кавычках — прецедент writeLegacyInjection). */
function writeFace(dir: string, seed: FaceSeed): string {
  const q = (s: string) => JSON.stringify(s);
  const now = new Date().toISOString();
  const frontmatter = [
    '---',
    `id: ${q(seed.id)}`,
    'type: face',
    `title: ${q(`Face: ${seed.owner_skill} v${seed.version}`)}`,
    `status: ${q(seed.status ?? 'active')}`,
    'review_state: accepted',
    'confidence: high',
    'importance: 0.8',
    `created_at: ${q(now)}`,
    `updated_at: ${q(now)}`,
    `created_by: ${q('user:cli')}`,
    'schema_version: 1',
    'source:',
    '  kind: manual',
    `owner_skill: ${q(seed.owner_skill)}`,
    `version: ${q(seed.version)}`,
    ...(seed.based_on !== undefined ? [`based_on: ${q(seed.based_on)}`] : []),
    ...(seed.reason !== undefined ? [`reason: ${q(seed.reason)}`] : []),
    `initiator: ${q('steward')}`,
    '---',
  ].join('\n');
  const facesDir = join(dir, '.wolf', 'memory', 'shared', 'faces');
  mkdirSync(facesDir, { recursive: true });
  const path = join(facesDir, `${seed.id}.md`);
  writeFileSync(path, `${frontmatter}\n\n# face body\n`);
  return path;
}

/** Legacy-плейбук до-2.17 (тип playbook в shared/playbooks; alias-чтение даёт note+howto). */
function writeLegacyPlaybook(dir: string, id: string, ownerSkill: string, status = 'active'): string {
  const q = (s: string) => JSON.stringify(s);
  const now = new Date().toISOString();
  const frontmatter = [
    '---',
    `id: ${q(id)}`,
    'type: playbook',
    `title: ${q(`Playbook: ${ownerSkill}`)}`,
    `status: ${q(status)}`,
    'review_state: accepted',
    'confidence: high',
    'importance: 0.8',
    `created_at: ${q(now)}`,
    `updated_at: ${q(now)}`,
    `created_by: ${q('user:cli')}`,
    'schema_version: 1',
    'source:',
    '  kind: manual',
    `owner_skill: ${q(ownerSkill)}`,
    '---',
  ].join('\n');
  const pbDir = join(dir, '.wolf', 'memory', 'shared', 'playbooks');
  mkdirSync(pbDir, { recursive: true });
  const path = join(pbDir, `${id}.md`);
  writeFileSync(path, `${frontmatter}\n\n# playbook body\n`);
  return path;
}

describe('wolf doctor face hygiene e2e (2.17 NFR-02)', () => {
  const dirs: string[] = [];

  beforeAll(() => ensureBuilt());

  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it('дубликаты / битый based_on / вне контракта / legacy+face → находки `! <file>: <issue>`', () => {
    const sb = mkdtempSync(join(tmpdir(), 'wolf-doc-faces-sb-'));
    dirs.push(sb);
    const proj = memoryProject();
    dirs.push(proj);
    // (а) два активных face одного владельца — правка в обход версионирующего пути
    writeFace(proj, { id: 'mem_dup_a', owner_skill: 'skill:hygiene', version: '1', reason: 'initial' });
    writeFace(proj, { id: 'mem_dup_b', owner_skill: 'skill:hygiene', version: '2', reason: 'manual edit' });
    // (в) based_on указывает на несуществующий id
    writeFace(proj, {
      id: 'mem_badbase',
      owner_skill: 'skill:other',
      version: '1',
      based_on: 'mem_ghost',
      reason: 'restore attempt',
    });
    // (б) face вне контракта: обязательный reason отсутствует — файл отбракован парсером store
    writeFace(proj, { id: 'mem_offcontract', owner_skill: 'skill:third', version: '1' });
    // (г) остаточный кейс T-05: face создан, supersede legacy-head упал — legacy остался active
    writeFace(proj, { id: 'mem_face_ok', owner_skill: 'skill:fourth', version: '1', reason: 'migrated' });
    writeLegacyPlaybook(proj, 'mem_legacy_head', 'skill:fourth');

    const res = runCli(['doctor'], proj, { WOLF_SANDBOX: sb });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('## Faces (canonical playbooks)');
    expect(res.stdout).toContain('! mem_dup_a: duplicate canonical face for skill:hygiene');
    expect(res.stdout).toContain('! mem_dup_b: duplicate canonical face for skill:hygiene');
    expect(res.stdout).toContain('! mem_badbase: based_on mem_ghost does not exist');
    expect(res.stdout).toContain('! shared/faces/mem_offcontract.md: face does not match its contract');
    expect(res.stdout).toContain('! mem_legacy_head: active legacy playbook for skill:fourth');
    expect(res.stdout).toContain('wolf face migrate');
  });

  it('чистые лица не шумят: единственный face и не-мигрированный legacy — секции Faces нет', () => {
    const sb = mkdtempSync(join(tmpdir(), 'wolf-doc-faces-sb2-'));
    dirs.push(sb);
    const proj = memoryProject();
    dirs.push(proj);
    writeFace(proj, { id: 'mem_solo', owner_skill: 'skill:solo', version: '1', reason: 'initial' });
    writeLegacyPlaybook(proj, 'mem_pre_migration', 'skill:notmigrated'); // legacy без face — норма до миграции

    const res = runCli(['doctor'], proj, { WOLF_SANDBOX: sb });
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain('## Faces');
  });
});
