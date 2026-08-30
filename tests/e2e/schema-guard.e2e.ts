import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { repoRoot, tmpProject, ensureBuilt } from './helpers.js';

ensureBuilt();

const cli = join(repoRoot, 'dist', 'bootstrap', 'cli.js');

const legacyMd =
  '---\nid: mem_legacy\ntype: decision\ntitle: Legacy decision\nstatus: active\nreview_state: accepted\nconfidence: medium\nimportance: 0.5\ncreated_at: 2026-06-29T14:00:00Z\nupdated_at: 2026-06-29T14:00:00Z\ncreated_by: user:test\nschema_version: 1\nsource:\n  kind: manual\nrelated:\n  files: []\n  docs: []\n  decisions: []\ntags: []\nsuperseded_by: null\n---\n\nBody.\n';

describe('schema guard at entry points (спека §3 уровень 2)', () => {
  it('any wolf command lazily migrates a legacy project (backup + marker + layout v2)', () => {
    const project = tmpProject();
    writeFileSync(join(project, 'package.json'), '{}');
    mkdirSync(join(project, '.wolf', 'memory', 'objects', 'decision'), { recursive: true });
    writeFileSync(join(project, '.wolf', 'config.yaml'), 'artifact_sources: []\n');
    writeFileSync(join(project, '.wolf', 'memory', 'objects', 'decision', 'mem_legacy.md'), legacyMd);

    // guard стоит в runCli ДО parseAsync, поэтому достаточно любой команды, даже --version
    const res = spawnSync('node', [cli, '--version'], { cwd: project, encoding: 'utf-8', timeout: 30_000 });
    expect(res.status).toBe(0);
    // маркер проставлен
    expect(readFileSync(join(project, '.wolf', 'config.yaml'), 'utf-8')).toContain('schema_version: 2');
    // layout v2 применён
    expect(existsSync(join(project, '.wolf', 'memory', 'shared', 'decisions', 'mem_legacy.md'))).toBe(true);
    // бэкап создан
    expect(existsSync(join(project, '.wolf', 'backup'))).toBe(true);
  });

  it('schema from the future → honest error, exit 1, nothing written', () => {
    const project = tmpProject();
    writeFileSync(join(project, 'package.json'), '{}');
    mkdirSync(join(project, '.wolf'), { recursive: true });
    writeFileSync(join(project, '.wolf', 'config.yaml'), 'artifact_sources: []\nschema_version: 99\n');

    const res = spawnSync('node', [cli, '--version'], { cwd: project, encoding: 'utf-8', timeout: 30_000 });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('npm install -g mister-wolf');
    expect(readFileSync(join(project, '.wolf', 'config.yaml'), 'utf-8')).toBe(
      'artifact_sources: []\nschema_version: 99\n'
    );
  });

  it('recovery is reachable, not circular: corrupted yaml kills any command with --recreate hint, but init --recreate heals (спека §6)', () => {
    const project = tmpProject();
    writeFileSync(join(project, 'package.json'), '{}');
    mkdirSync(join(project, '.wolf'), { recursive: true });
    writeFileSync(join(project, '.wolf', 'config.yaml'), '{broken');

    // любой команде guard отказывает честно, с хинтом восстановления
    const dead = spawnSync('node', [cli, '--version'], { cwd: project, encoding: 'utf-8', timeout: 30_000 });
    expect(dead.status).toBe(1);
    expect(dead.stderr).toContain('wolf init --recreate');

    // recovery-команда обходит guard и чинит конфиг
    const heal = spawnSync('node', [cli, 'init', '--recreate'], {
      cwd: project,
      env: { ...process.env, XDG_CONFIG_HOME: join(project, 'xdg') },
      encoding: 'utf-8',
      timeout: 30_000,
    });
    expect(heal.status).toBe(0);
    const raw = readFileSync(join(project, '.wolf', 'config.yaml'), 'utf-8');
    expect(raw).toContain('memory_types'); // валидный дефолт-рендер
    expect(existsSync(join(project, '.wolf', 'backup'))).toBe(true); // битый оригинал в бэкапе

    // после восстановления guard снова пропускает команды
    const alive = spawnSync('node', [cli, '--version'], { cwd: project, encoding: 'utf-8', timeout: 30_000 });
    expect(alive.status).toBe(0);
  });
});
