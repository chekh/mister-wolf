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

describe('onboarding-блок AGENTS.md: версия формата (REQ-03, волна 2.20.0)', () => {
  let d: string;
  const agentsMd = () => join(d, 'AGENTS.md');

  beforeEach(() => {
    d = mkdtempSync(join(tmpdir(), 'wolf-b0-agents-'));
    writeFileSync(join(d, 'package.json'), '{ "name": "b0-agents-it" }');
    expect(runCli(['init', '--full', '--platform', 'opencode'], d).status).toBe(0);
  });
  afterEach(() => rmSync(d, { recursive: true, force: true }));

  it('R03-1/R03-2: блок v2 обновляется до шаблона; текст выше и ниже — байт-в-байт', () => {
    const above = '# Мой проект\n\nМои правила.\n\n';
    const below = '\n## Мой хвост\n\nпосле блока\n';
    const v2 = '<!-- wolf:onboarding v2 -->\nстарый текст блока\n<!-- /wolf:onboarding -->';
    writeFileSync(agentsMd(), `${above}${v2}${below}`);
    const res = runCli(['sync'], d);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('AGENTS.md: updated');
    const out = readFileSync(agentsMd(), 'utf-8');
    expect(out.startsWith(above)).toBe(true);
    expect(out.endsWith(below)).toBe(true);
    expect(out).toContain('<!-- wolf:onboarding v3 -->');
    expect(out).not.toContain('старый текст блока');
    // R03-4: повторный проход блок не меняет
    expect(runCli(['sync'], d).status).toBe(0);
    expect(readFileSync(agentsMd(), 'utf-8')).toBe(out);
  });

  it('R03-7: AGENTS.md без блока и без штампа sync не трогает (wx-политика)', () => {
    const own = '# Чужой конфиг\nне трогай\n';
    writeFileSync(agentsMd(), own);
    const res = runCli(['sync'], d);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('no onboarding block');
    expect(readFileSync(agentsMd(), 'utf-8')).toBe(own);
  });

  it('R03-5: открывающий маркер без закрывающего → skipped с причиной, файл не тронут', () => {
    const broken = '# Мой\n\n<!-- wolf:onboarding v3 -->\nбез закрывающего\n';
    writeFileSync(agentsMd(), broken);
    const res = runCli(['sync'], d);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('onboarding markers broken');
    expect(readFileSync(agentsMd(), 'utf-8')).toBe(broken);
  });
});
