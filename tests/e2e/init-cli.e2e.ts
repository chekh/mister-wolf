import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ensureBuilt } from './helpers.js';

ensureBuilt();

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../..');
const cli = join(REPO, 'dist', 'bootstrap', 'cli.js');

const legacyMd =
  '---\nid: mem_legacy\ntype: decision\ntitle: Legacy decision\nstatus: active\nreview_state: accepted\nconfidence: medium\nimportance: 0.5\ncreated_at: 2026-06-29T14:00:00Z\nupdated_at: 2026-06-29T14:00:00Z\ncreated_by: user:test\nschema_version: 1\nsource:\n  kind: manual\nrelated:\n  files: []\n  docs: []\n  decisions: []\ntags: []\nsuperseded_by: null\n---\n\nBody.\n';

/** Изолированное окружение: tmp XDG, чтобы e2e не трогал реальный ~/.config/wolf. */
function env(xdg: string): NodeJS.ProcessEnv {
  return { ...process.env, XDG_CONFIG_HOME: xdg };
}

function newProject(markers: 'opencode' | 'none'): { project: string; xdg: string } {
  const project = mkdtempSync(join(tmpdir(), 'wolf-init-cli-'));
  writeFileSync(join(project, 'package.json'), '{ "name": "init-cli-e2e" }');
  if (markers === 'opencode') writeFileSync(join(project, 'opencode.json'), '{}');
  const xdg = mkdtempSync(join(tmpdir(), 'wolf-init-cli-xdg-'));
  return { project, xdg };
}

describe('wolf init CLI (спека §3 уровень 1; onboarding v2 §4.6: не-TTY требует --model)', () => {
  it('writes canonical opencode config, registers project in XDG registry, re-init is a no-op', () => {
    const { project, xdg } = newProject('opencode');

    const first = spawnSync('node', [cli, 'init', '--model', 'zai-coding-plan/glm-5.3'], {
      cwd: project,
      env: env(xdg),
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(first.status).toBe(0);
    expect(first.stdout).toContain('platform opencode: written');
    expect(first.stdout).toContain('перезапустите opencode'); // F7: блок «Дальше»
    const cfg = JSON.parse(readFileSync(join(project, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp.wolf).toEqual({ type: 'local', command: ['wolf', 'mcp'], enabled: true });
    expect(cfg.default_agent).toBe('mr-wolf'); // F4 закрыт: default_agent первым init'ом
    expect(readFileSync(join(xdg, 'wolf', 'projects.yaml'), 'utf-8')).toContain(project);

    const before = readFileSync(join(project, 'opencode.json'), 'utf-8');
    const second = spawnSync('node', [cli, 'init', '--model', 'zai-coding-plan/glm-5.3'], {
      cwd: project,
      env: env(xdg),
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('platform opencode: unchanged');
    expect(readFileSync(join(project, 'opencode.json'), 'utf-8')).toBe(before);
  });

  it('non-TTY без --model → жёсткая ошибка с точной командой (Q11)', () => {
    const { project, xdg } = newProject('opencode');
    const res = spawnSync('node', [cli, 'init'], { cwd: project, env: env(xdg), encoding: 'utf-8', timeout: 60_000 });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('non-interactive init requires a model');
    expect(res.stderr).toContain('wolf init --model <providerID/modelID>');
    expect(JSON.parse(readFileSync(join(project, 'opencode.json'), 'utf-8')).mcp).toBeUndefined();
  });

  it('unknown --platform → UserFacingError, exit 1, no configs written', () => {
    const { project, xdg } = newProject('opencode');
    const res = spawnSync('node', [cli, 'init', '--platform', 'vscode'], {
      cwd: project,
      env: env(xdg),
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Unknown platform');
    expect(JSON.parse(readFileSync(join(project, 'opencode.json'), 'utf-8')).mcp).toBeUndefined();
  });

  it('no platform markers → opencode пишется безусловно (F4: факт рендера набора, не детекция)', () => {
    const { project, xdg } = newProject('none');
    const res = spawnSync('node', [cli, 'init', '--model', 'zai-coding-plan/glm-5.3'], {
      cwd: project,
      env: env(xdg),
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('platform opencode: written');
    expect(res.stdout).toContain('wolf bootstrap'); // F7: «Дальше» называет следующий шаг
    const cfg = JSON.parse(readFileSync(join(project, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp.wolf).toEqual({ type: 'local', command: ['wolf', 'mcp'], enabled: true });
  });

  it('init --recreate on a LEGACY project migrates properly (marker + layout v2, objects/ not orphaned)', () => {
    const { project, xdg } = newProject('opencode');
    // легаси-состояние догфудера: config без маркера + layout v1 (objects/)
    mkdirSync(join(project, '.wolf', 'memory', 'objects', 'decision'), { recursive: true });
    writeFileSync(join(project, '.wolf', 'config.yaml'), 'artifact_sources: []\n');
    writeFileSync(join(project, '.wolf', 'memory', 'objects', 'decision', 'mem_legacy.md'), legacyMd);

    const res = spawnSync('node', [cli, 'init', '--recreate', '--model', 'zai-coding-plan/glm-5.3'], {
      cwd: project,
      env: env(xdg),
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(res.status).toBe(0);
    // маркер проставлен ЧЕРЕЗ миграцию, а не тихой допиской: layout v2 применён
    expect(readFileSync(join(project, '.wolf', 'config.yaml'), 'utf-8')).toContain('schema_version: 2');
    expect(existsSync(join(project, '.wolf', 'memory', 'objects', 'decision', 'mem_legacy.md'))).toBe(false);
    expect(existsSync(join(project, '.wolf', 'memory', 'shared', 'decisions', 'mem_legacy.md'))).toBe(true);
  });

  it('init --recreate on schema-from-future → honest refusal, no downgrade, config untouched', () => {
    const { project, xdg } = newProject('opencode');
    const body = 'artifact_sources: []\nschema_version: 99\n';
    mkdirSync(join(project, '.wolf'), { recursive: true });
    writeFileSync(join(project, '.wolf', 'config.yaml'), body);

    const res = spawnSync('node', [cli, 'init', '--recreate', '--model', 'zai-coding-plan/glm-5.3'], {
      cwd: project,
      env: env(xdg),
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('npm install -g mister-wolf');
    // 99 не перезаписана на 2 (тихий даунгрейд запрещён), конфиг байт-в-байт
    expect(readFileSync(join(project, '.wolf', 'config.yaml'), 'utf-8')).toBe(body);
  });
});
