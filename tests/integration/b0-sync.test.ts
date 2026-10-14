// tests/integration/b0-sync.test.ts
// REQ-04 (B0, 2.18.0), S-34: `wolf sync` не перезаписывает локальные мутации
// штампованных файлов набора. Сценарий test-plan: init с пиннингом модели →
// локальная правка .opencode/agents/worker-researcher.md → sync с другим
// fresh-рендером (omit — «шаблон изменился») → mutated-skip, правка цела.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/bootstrap/cli.js');
const MODEL = 'zai-coding-plan/glm-5.3';

function runCli(args: string[], cwd: string): { stdout: string; stderr: string; status: number | null } {
  const { npm_command: _drop, ...env } = process.env;
  const r = spawnSync('node', [cliPath, ...args], { cwd, encoding: 'utf-8', timeout: 60_000, env });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

describe('wolf sync: локальные мутации не перезаписываются (REQ-04, S-34)', () => {
  let dir: string;
  const mutated = () => join(dir, '.opencode/agents/worker-researcher.md');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-b0-sync-'));
    writeFileSync(join(dir, 'package.json'), '{ "name": "b0-sync-it" }');
    expect(runCli(['init', '--full', '--platform', 'opencode', '--model', MODEL], dir).status).toBe(0);
    // локальная мутация пользователя: комментарий в конце, штамп не тронут
    writeFileSync(mutated(), `${readFileSync(mutated(), 'utf-8')}\n<!-- S-34: локальная правка пользователя -->\n`);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('sync с изменившимся fresh-рендером → mutated-skip, правка и пиннинг модели цела', () => {
    const res = runCli(['sync'], dir);
    expect(res.status).toBe(0);
    // sync идёт с omit → fresh-рендер отличается от записанного (model-строки
    // вырезаны) — «шаблон изменился»; но файл мутирован локально → не тронут
    expect(res.stdout).toContain('.opencode/agents/worker-researcher.md: skipped');
    expect(res.stdout).toContain('mutated');
    const body = readFileSync(mutated(), 'utf-8');
    expect(body).toContain('S-34: локальная правка пользователя');
    expect(body).toContain(`model: ${MODEL}`); // omit-рендер НЕ затёр пиннинг
    // контраст: немутated файл с тем же изменившимся fresh-рендером — updated
    expect(res.stdout).toContain('.opencode/agents/steward.md: updated');
    // память sync не трогает (мутации лиц — зона Стюарда, D4)
    expect(res.stdout).toContain('Memory (.wolf/) untouched');
  });

  it('повторный sync: mutated-skip стабилен, хэш мутации не «выучен»', () => {
    expect(runCli(['sync'], dir).status).toBe(0);
    const second = runCli(['sync'], dir);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('.opencode/agents/worker-researcher.md: skipped');
    expect(second.stdout).toContain('mutated');
    expect(readFileSync(mutated(), 'utf-8')).toContain('S-34: локальная правка пользователя');
  });
});
