import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('wolf tool (C2 librarian v1)', () => {
  let cwd: string;
  let toolId: string;

  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
    expect(runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], cwd).status).toBe(0);
    writeFileSync(join(cwd, 'extract-todos.ts'), 'export function run(){}\n', 'utf-8');
  });

  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('register: кандидат с контрактом и скопированным скриптом', () => {
    const r = runCli(
      [
        'tool',
        'register',
        'extract-todos.ts',
        '--name',
        'extract-todos',
        '--language',
        'typescript',
        '--contract-in',
        'путь к файлу .ts',
        '--contract-out',
        'список TODO строкой',
      ],
      cwd
    );
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toContain('Registered tool extract-todos');
    expect(r.stdout).toContain(`Script: ${join('.wolf', 'tools', 'extract-todos.ts')}`);
    expect(readFileSync(join(cwd, '.wolf', 'tools', 'extract-todos.ts'), 'utf-8')).toBe('export function run(){}\n');

    toolId = r.stdout.match(/Registered tool \S+: (\S+)/)?.[1] ?? '';
    expect(toolId).toMatch(/^mem_/);

    const got = runCli(['get', toolId], cwd);
    expect(got.status).toBe(0);
    expect(got.stdout).toContain('"type": "tool"');
    expect(got.stdout).toContain('"status": "candidate"');
    expect(got.stdout).toContain('"usage_count": 0');
  });

  it('повторный register того же name — коллизия имени (exit 1, даже с --force)', () => {
    const r = runCli(
      ['tool', 'register', 'extract-todos.ts', '--name', 'extract-todos', '--language', 'typescript'],
      cwd
    );
    expect(r.status).toBe(1);
    expect(r.stderr.trim()).toMatch(/^Error: .*занято/);

    const forced = runCli(
      ['tool', 'register', 'extract-todos.ts', '--name', 'extract-todos', '--language', 'typescript', '--force'],
      cwd
    );
    expect(forced.status).toBe(1);
    expect(forced.stderr.trim()).toMatch(/^Error: .*занято/);
  });

  it('register похожего по контракту под другим именем — подсказка «похожие»; --force обходит', () => {
    const r = runCli(
      [
        'tool',
        'register',
        'extract-todos.ts',
        '--name',
        'todo-harvester',
        '--language',
        'typescript',
        '--contract-out',
        'список TODO строкой',
      ],
      cwd
    );
    expect(r.status).toBe(1);
    expect(r.stderr.trim()).toMatch(/^Error: .*похожие/);
    expect(r.stderr).toContain('extract-todos');
  });

  it('list показывает name и candidate', () => {
    const r = runCli(['tool', 'list'], cwd);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('extract-todos');
    expect(r.stdout).toContain('candidate');
  });

  it('use ×2 → get показывает usage_count 2', () => {
    expect(runCli(['tool', 'use', 'extract-todos'], cwd).status).toBe(0);
    expect(runCli(['tool', 'use', toolId], cwd).status).toBe(0);

    const got = runCli(['get', toolId], cwd);
    expect(got.status).toBe(0);
    expect(got.stdout).toContain('"usage_count": 2');
    expect(got.stdout).toMatch(/"last_used_at": "\d{4}-\d{2}-\d{2}T/);
  });

  it('expose: SKILL.md с маркером; повторный expose идемпотентен', () => {
    const r = runCli(['tool', 'expose', 'extract-todos'], cwd);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(join('.opencode', 'skills', 'extract-todos', 'SKILL.md'));

    const skillPath = join(cwd, '.opencode', 'skills', 'extract-todos', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);
    const before = readFileSync(skillPath, 'utf-8');
    expect(before).toContain(`generated from tool:${toolId}`);
    expect(before).toContain('список TODO строкой');
    expect(before).toContain(join('.wolf', 'tools', 'extract-todos.ts'));

    const again = runCli(['tool', 'expose', 'extract-todos'], cwd);
    expect(again.status).toBe(0);
    expect(readFileSync(skillPath, 'utf-8')).toBe(before);
  });

  it('deprecate --reason → статус deprecated, list --status deprecated содержит name', () => {
    const r = runCli(['tool', 'deprecate', 'extract-todos', '--reason', 'устарел'], cwd);
    expect(r.status).toBe(0);

    const got = runCli(['get', toolId], cwd);
    expect(got.status).toBe(0);
    expect(got.stdout).toContain('"status": "deprecated"');
    expect(got.stdout).toContain('"deprecation_reason": "устарел"');

    const listed = runCli(['tool', 'list', '--status', 'deprecated'], cwd);
    expect(listed.status).toBe(0);
    expect(listed.stdout).toContain('extract-todos');
  });

  it('revive → статус active', () => {
    const r = runCli(['tool', 'revive', 'extract-todos'], cwd);
    expect(r.status).toBe(0);

    const got = runCli(['get', toolId], cwd);
    expect(got.status).toBe(0);
    expect(got.stdout).toContain('"status": "active"');
  });
});
