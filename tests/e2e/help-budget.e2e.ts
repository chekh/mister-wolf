import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync } from 'fs';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

/**
 * P224 (спека 2.13 §6.6/§10.2): `wolf --help` ≤ 31 строки (2.14 §8.1: +1 видимая
 * `projects`); plumbing скрыт из help, но работает. Бюджет: 24 видимые команды
 * + 7 строк шапки, каждая команда — ровно одна строка (описания стабов ≤ 52
 * симв., колонка 80−2−24−2).
 */
describe('help budget: wolf --help <= 31 lines, plumbing hidden but alive (P224)', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function newProject(): string {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir);
    return dir;
  }

  it('--help fits the 31-line budget (2.14: +visible projects)', () => {
    const dir = newProject();
    const help = runCli(['--help'], dir);
    expect(help.status).toBe(0);
    const lines = help.stdout.replace(/\n+$/, '').split('\n');
    expect(lines.length).toBeLessThanOrEqual(31);
  });

  it('hidden plumbing works: think --help answers, scan runs, session wrap-up --help answers', () => {
    const dir = newProject();
    const think = runCli(['think', '--help'], dir);
    expect(think.status).toBe(0);
    expect(think.stdout).toContain('Usage: wolf think');

    const scan = runCli(['scan'], dir);
    expect(scan.status).toBe(0);

    const wrapUp = runCli(['session', 'wrap-up', '--help'], dir);
    expect(wrapUp.status).toBe(0);
    expect(wrapUp.stdout).toContain('Usage: wolf session wrap-up');
  });

  it('hidden names absent from --help, protected surface visible', () => {
    const dir = newProject();
    const help = runCli(['--help'], dir);
    expect(help.status).toBe(0);
    // командная строка начинается с имени команды; слова в описаниях не считаются
    const cmdLines = help.stdout.split('\n').map((l) => l.trim());
    const startsWith = (name: string) => cmdLines.some((l) => new RegExp(`^${name}\\b`).test(l));
    // plumbing скрыт (спека §6.6 + решения P224: матрица/сессии/MCP)
    for (const hidden of [
      'rebuild-index',
      'migrate',
      'taxonomy',
      'validate',
      'scan',
      'task-eval',
      'think',
      'update',
      'bootstrap',
      'solve',
      'scaffold',
      'wrap-up',
      'supersede',
      'transition',
      'diff',
      'session',
      'mcp',
      'help',
    ]) {
      expect(startsWith(hidden), `expected ${hidden} to be hidden`).toBe(false);
    }
    // живая поверхность видима (§6.6): пятёрка + archive, окна, relation, call,
    // type-неймспейсы, complain, init/sync/doctor/upgrade
    for (const visible of [
      'init',
      'sync',
      'add',
      'list',
      'get',
      'search',
      'edit',
      'archive',
      'brief',
      'recap',
      'analytics',
      'call',
      'relation',
      'rule',
      'lesson',
      'decision',
      'thread',
      'complaint',
      'note',
      'tool',
      'complain',
      'upgrade',
      'doctor',
      'projects',
    ]) {
      expect(startsWith(visible), `expected ${visible} to be visible`).toBe(true);
    }
  });
});
