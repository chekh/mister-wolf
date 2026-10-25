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

describe('wolf init CLI (спека §3 уровень 1; WP2 unpin: --model opt-in, не-TTY без него завершается 0)', () => {
  it('writes canonical opencode config, registers project in XDG registry, re-init is a no-op', () => {
    const { project, xdg } = newProject('opencode');

    const first = spawnSync(
      'node',
      [cli, 'init', '--full', '--platform', 'opencode', '--model', 'zai-coding-plan/glm-5.3'],
      {
        cwd: project,
        env: env(xdg),
        encoding: 'utf-8',
        timeout: 60_000,
      }
    );
    expect(first.status).toBe(0);
    // F6: честный лог — имя конфиг-файла + фактические ключи
    expect(first.stdout).toContain(
      'opencode.json: written (mcp.servers.wolf, default_agent=mr-wolf, subagent_depth=2)'
    );
    expect(first.stdout).toContain('restart opencode'); // F7: блок «Дальше»
    const cfg = JSON.parse(readFileSync(join(project, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp.servers.wolf).toEqual({ type: 'local', command: ['wolf', 'mcp'], disabled: false });
    expect(cfg.mcp.wolf).toBeUndefined(); // легаси-форма не пишется
    expect(cfg.default_agent).toBe('mr-wolf'); // F4 закрыт: default_agent первым init'ом
    expect(cfg.experimental.subagent_depth).toBe(2); // opencode v2: действующий путь — experimental
    expect(cfg.subagent_depth).toBeUndefined(); // deprecated верхнеуровневый ключ не пишется
    expect(readFileSync(join(xdg, 'wolf', 'projects.yaml'), 'utf-8')).toContain(project);

    const before = readFileSync(join(project, 'opencode.json'), 'utf-8');
    const second = spawnSync(
      'node',
      [cli, 'init', '--full', '--platform', 'opencode', '--model', 'zai-coding-plan/glm-5.3', '--yes'],
      {
        cwd: project,
        env: env(xdg),
        encoding: 'utf-8',
        timeout: 60_000,
      }
    );
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('opencode.json: unchanged');
    expect(readFileSync(join(project, 'opencode.json'), 'utf-8')).toBe(before);
  });

  it('non-TTY без --model → завершается 0 (WP2 unpin: omit по умолчанию; WP1: --full для базового набора)', () => {
    const { project, xdg } = newProject('opencode');
    const res = spawnSync('node', [cli, 'init', '--full'], {
      cwd: project,
      env: env(xdg),
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(res.status).toBe(0);
    const agent = readFileSync(join(project, '.opencode/agents/mr-wolf.md'), 'utf-8');
    expect(agent).not.toMatch(/^model:\s+\S+/m);
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

  it('--platform opencode on a bare project writes the config (WP1: дефолт конфиги не пишет)', () => {
    const { project, xdg } = newProject('none');
    const res = spawnSync(
      'node',
      [cli, 'init', '--full', '--platform', 'opencode', '--model', 'zai-coding-plan/glm-5.3'],
      {
        cwd: project,
        env: env(xdg),
        encoding: 'utf-8',
        timeout: 60_000,
      }
    );
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('opencode.json: written');
    expect(res.stdout).toContain('wolf bootstrap'); // F7: «Дальше» называет следующий шаг
    const cfg = JSON.parse(readFileSync(join(project, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp.servers.wolf).toEqual({ type: 'local', command: ['wolf', 'mcp'], disabled: false });
  });

  it('init --recreate on a LEGACY project migrates properly (marker + layout v2, objects/ not orphaned)', () => {
    const { project, xdg } = newProject('opencode');
    // легаси-состояние догфудера: config без маркера + layout v1 (objects/)
    mkdirSync(join(project, '.wolf', 'memory', 'objects', 'decision'), { recursive: true });
    writeFileSync(join(project, '.wolf', 'config.yaml'), 'artifact_sources: []\n');
    writeFileSync(join(project, '.wolf', 'memory', 'objects', 'decision', 'mem_legacy.md'), legacyMd);

    // K6: живой проект (непустой валидный конфиг) → гейт подтверждения; --yes применяет план
    const res = spawnSync('node', [cli, 'init', '--recreate', '--yes', '--model', 'zai-coding-plan/glm-5.3'], {
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
