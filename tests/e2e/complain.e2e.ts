import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

// Жалобный контур v2 (спека 2026-09-01 §4.2): объект типа complaint со
// статусом open, required-поля about/rule/evidence/proposal, relation
// complain, hot-signal; --text — deprecated-alias на --evidence.
describe('wolf complain (complaint-v2)', () => {
  let cwd: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
    expect(runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], cwd).status).toBe(0);
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('жалоба: complaint/open с about/rule/evidence/proposal, relation, get отдаёт JSON', () => {
    const r = runCli(
      [
        'complain',
        '--about',
        'worker-implementer',
        '--rule',
        'п.2 МЕТОДИКИ требует читать файлы до правки',
        '--evidence',
        'бриф запретил чтение — следование обоим невозможно',
        '--proposal',
        'добавить исключение для allowlist-замен',
      ],
      cwd
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Complaint recorded: ');
    const id = r.stdout.trim().split('\n')[0].split(': ')[1];
    expect(id).toMatch(/^mem_/);

    const relations = readFileSync(join(cwd, '.wolf/memory/relations.jsonl'), 'utf-8');
    expect(relations).toContain('"predicate":"complain"');
    expect(relations).toContain(`"subject":"${id}"`);
    expect(relations).toContain('"object":"worker-implementer"');

    const got = runCli(['get', id], cwd);
    expect(got.status).toBe(0);
    expect(got.stdout).toContain('"type": "complaint"');
    expect(got.stdout).toContain('"status": "open"');
    expect(got.stdout).toContain('"about": "worker-implementer"');
    expect(got.stdout).toContain('"rule": "п.2 МЕТОДИКИ требует читать файлы до правки"');
    expect(got.stdout).toContain('"proposal": "добавить исключение для allowlist-замен"');
    expect(got.stdout).toContain('"dispatch_ages": 0');
    expect(got.stdout).toContain('"corroborations": 1');

    // диспетчерский запрос точечен: list --type complaint --status open
    const list = runCli(['list', '--type', 'complaint', '--status', 'open'], cwd);
    expect(list.status).toBe(0);
    expect(list.stdout).toContain(id);
  });

  it('--text deprecated-alias работает как evidence', () => {
    const r = runCli(
      ['complain', '--about', 'skill:apprentice', '--rule', 'r', '--text', 'старый интерфейс', '--proposal', 'p'],
      cwd
    );
    expect(r.status).toBe(0);
    const id = r.stdout.trim().split('\n')[0].split(': ')[1];
    const got = runCli(['get', id], cwd);
    expect(got.stdout).toContain('"evidence": "старый интерфейс"');
  });

  it('мусорная цель about отклоняется', () => {
    const r = runCli(
      ['complain', '--about', 'не-существует', '--rule', 'r', '--evidence', 'e', '--proposal', 'p'],
      cwd
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('Unknown --about');
  });

  it('wolf update: whitelist триажа + SLA-счётчик + тег stalled', () => {
    const c = runCli(['complain', '--about', 'steward', '--rule', 'r', '--evidence', 'e', '--proposal', 'p'], cwd);
    const id = c.stdout.trim().split('\n')[0].split(': ')[1];

    const bad = runCli(['update', id, '--set', 'rule=подделка'], cwd);
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toContain('not settable');

    const inc = runCli(
      ['update', id, '--set', 'triage=need-info', '--inc', 'dispatch_ages=1', '--tags', 'stalled'],
      cwd
    );
    expect(inc.status).toBe(0);

    const got = runCli(['get', id], cwd);
    expect(got.stdout).toContain('"triage": "need-info"');
    expect(got.stdout).toContain('"dispatch_ages": 1');
    expect(got.stdout).toContain('"stalled"');
    expect(got.stdout).toContain('"rule": "r"');
  });
});
