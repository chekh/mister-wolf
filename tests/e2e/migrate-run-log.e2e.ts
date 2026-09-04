import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ensureBuilt, runCli } from './helpers.js';

/**
 * E2E архивации legacy run-log (P1 D4): `wolf migrate run-log` выносит
 * .wolf/run-log.jsonl в .wolf/metrics/archive/ через rename (не перезапись),
 * идемпотентен при отсутствии файла, коллизии имён — суффиксом -2 без перезаписи.
 */

/** Изолированное окружение: tmp XDG, чтобы e2e не трогал реальный ~/.config/wolf. */
function env(xdg: string): NodeJS.ProcessEnv {
  return { XDG_CONFIG_HOME: xdg };
}

const FIXTURE3 = [
  '{"ts":"2026-09-04T10:00:00Z","model":"m1","weighted":0.5}',
  '{"ts":"2026-09-04T10:01:00Z","model":"m2","weighted":0.7}',
  '{"ts":"2026-09-04T10:02:00Z","model":"m3","weighted":0.9}',
].join('\n');
const FIXTURE1 = '{"ts":"2026-09-04T11:00:00Z","model":"m4","weighted":0.1}';

/** Локальный день запуска (имя архива привязано к нему, не к UTC). */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const projects: string[] = [];

/** Свежий проект на тест — изоляция сценариев друг от друга. */
function freshProject(): string {
  const p = mkdtempSync(join(tmpdir(), 'wolf-migrate-runlog-'));
  writeFileSync(join(p, 'package.json'), '{ "name": "migrate-runlog-e2e" }');
  projects.push(p);
  return p;
}

function legacyPath(p: string): string {
  return join(p, '.wolf', 'run-log.jsonl');
}

function archivePath(p: string, name: string): string {
  return join(p, '.wolf', 'metrics', 'archive', name);
}

describe('wolf migrate run-log', () => {
  let xdg: string;

  beforeAll(() => {
    ensureBuilt();
    xdg = mkdtempSync(join(tmpdir(), 'wolf-migrate-runlog-xdg-'));
  });

  afterAll(() => {
    for (const p of projects) rmSync(p, { recursive: true, force: true });
    rmSync(xdg, { recursive: true, force: true });
  });

  it('(a) no legacy file: nothing to migrate, idempotent, no archive dir', () => {
    const p = freshProject();
    const r1 = runCli(['migrate', 'run-log'], p, env(xdg));
    expect(r1.status).toBe(0);
    expect(r1.stdout).toContain('nothing to migrate');
    // повторный запуск — тот же результат (идемпотентность)
    const r2 = runCli(['migrate', 'run-log'], p, env(xdg));
    expect(r2.status).toBe(0);
    expect(r2.stdout).toContain('nothing to migrate');
    // файла нет → никаких побочных действий, каталог не создаётся
    expect(existsSync(join(p, '.wolf', 'metrics', 'archive'))).toBe(false);
  });

  it('(b) 3-line fixture: renamed to dated archive, byte-identical (mv, not rewrite)', () => {
    const p = freshProject();
    mkdirSync(join(p, '.wolf'), { recursive: true });
    writeFileSync(legacyPath(p), FIXTURE3 + '\n');
    const r = runCli(['migrate', 'run-log'], p, env(xdg));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('.wolf/run-log.jsonl');
    expect(r.stdout).toContain(`run-log-${today()}-legacy.jsonl`);
    expect(r.stdout).toContain('lines: 3');
    expect(existsSync(legacyPath(p))).toBe(false); // на старом месте файла нет
    const archived = readFileSync(archivePath(p, `run-log-${today()}-legacy.jsonl`), 'utf-8');
    expect(archived).toBe(FIXTURE3 + '\n'); // байт-в-байт: это mv, не перезапись
  });

  it('(c) collision: second run archives to -2 suffix, first archive untouched', () => {
    const p = freshProject();
    mkdirSync(join(p, '.wolf'), { recursive: true });
    writeFileSync(legacyPath(p), FIXTURE3 + '\n');
    expect(runCli(['migrate', 'run-log'], p, env(xdg)).status).toBe(0);
    const first = archivePath(p, `run-log-${today()}-legacy.jsonl`);
    writeFileSync(legacyPath(p), FIXTURE1 + '\n');
    const r2 = runCli(['migrate', 'run-log'], p, env(xdg));
    expect(r2.status).toBe(0);
    const second = archivePath(p, `run-log-${today()}-legacy-2.jsonl`);
    expect(r2.stdout).toContain(`run-log-${today()}-legacy-2.jsonl`);
    expect(existsSync(second)).toBe(true);
    expect(readFileSync(first, 'utf-8')).toBe(FIXTURE3 + '\n'); // первый архив НЕ перезаписан
    expect(readFileSync(second, 'utf-8')).toBe(FIXTURE1 + '\n');
  });

  it('(d) last line without trailing newline counts correctly', () => {
    const p = freshProject();
    mkdirSync(join(p, '.wolf'), { recursive: true });
    writeFileSync(legacyPath(p), FIXTURE3); // без финального '\n' — всё равно 3 строки
    const r = runCli(['migrate', 'run-log'], p, env(xdg));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('lines: 3');
    expect(readFileSync(archivePath(p, `run-log-${today()}-legacy.jsonl`), 'utf-8')).toBe(FIXTURE3);
  });

  it('(e) archive dir created when .wolf/metrics absent', () => {
    const p = freshProject();
    mkdirSync(join(p, '.wolf'), { recursive: true }); // .wolf/metrics/ нет
    writeFileSync(legacyPath(p), FIXTURE3 + '\n');
    const r = runCli(['migrate', 'run-log'], p, env(xdg));
    expect(r.status).toBe(0);
    expect(existsSync(archivePath(p, `run-log-${today()}-legacy.jsonl`))).toBe(true);
  });
});
