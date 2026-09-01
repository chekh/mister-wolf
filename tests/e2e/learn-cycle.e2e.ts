import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, readFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';
import { relationsPath } from '../../src/adapters/fs/project-paths.js';

// Ф22 (D2.2): полный цикл propose → validate (Sandbox Replay Holdout) → activate.
// e2e гоняет собранный CLI (dist/bootstrap/cli.js), как learn.e2e.ts.

function toolErrorLine(offsetMs: number): string {
  return (
    JSON.stringify({
      ts: new Date(Date.now() + offsetMs).toISOString(),
      event: 'tool_error',
      session_id: null,
      gen_ai: { modelID: null, agent: null },
      orchestration: { task: null, actor: 'user:cli' },
      outcome: 'error',
      tool_name: 'bash',
      error_class_id: 'timeout',
      detail: { message: 'Command timed out' },
    }) + '\n'
  );
}

function draftIdFrom(stdout: string): string {
  const line = stdout.split('\n').find((l) => l.startsWith('Draft created: '));
  if (!line) throw new Error(`no Draft created line in stdout: ${stdout}`);
  return line.slice('Draft created: '.length).trim();
}

describe('wolf learn propose/validate/activate (Ф22 D2.2, e2e)', () => {
  let cwd: string;
  let draftId: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
    expect(runCli(['init'], cwd).status).toBe(0);
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('(а) механический цикл: propose из паттерна, fail на пустом holdout, гейт активации', () => {
    const metrics = join(cwd, '.wolf/metrics/session-metrics.jsonl');
    mkdirSync(join(cwd, '.wolf/metrics'), { recursive: true }); // init не создаёт metrics — ленивый каталог
    for (let i = 3; i >= 1; i--) {
      appendFileSync(metrics, toolErrorLine(-i * 60_000));
    }

    const propose = runCli(['learn', 'propose', 'bash:timeout'], cwd);
    expect(propose.status).toBe(0);
    draftId = draftIdFrom(propose.stdout);
    expect(propose.stdout).toContain('type: lesson');
    expect(propose.stdout).toContain('mechanical: да');

    // §8 п.3: создание = недоставляемая запись — draft не виден wolf call до активации (§2.5)
    const callBefore = runCli(['call', '--for', 'bash'], cwd);
    expect(callBefore.status).toBe(0);
    expect(callBefore.stdout).not.toContain(draftId);

    const validate = runCli(['learn', 'validate', draftId], cwd);
    expect(validate.status).toBe(0);
    expect(validate.stdout).toContain('verdict: fail (prevented 0 / checked 0)');

    const activate = runCli(['learn', 'activate', draftId], cwd);
    expect(activate.status).not.toBe(0);
    expect(activate.stderr).toContain('Error:');

    // пост-аудит: draft виден в digest
    const digest = runCli(['learn', 'digest'], cwd);
    expect(digest.status).toBe(0);
    expect(digest.stdout).toContain('drafts (post-audit):');
    expect(digest.stdout).toContain(draftId);
  });

  it('(б) повторение на holdout: validate pass → activate → delivery + relation + active', () => {
    const metrics = join(cwd, '.wolf/metrics/session-metrics.jsonl');
    appendFileSync(metrics, toolErrorLine(0)); // ts новее created_at draft из (а)

    const validate = runCli(['learn', 'validate', draftId], cwd);
    expect(validate.status).toBe(0);
    expect(validate.stdout).toContain('verdict: pass');

    const activate = runCli(['learn', 'activate', draftId], cwd);
    expect(activate.status).toBe(0);
    expect(activate.stdout).toContain(`activated: ${draftId}`);

    const raw = readFileSync(metrics, 'utf-8');
    expect(raw).toContain('"event":"delivery"');
    expect(raw).toContain('"mechanism":"call"');
    expect(raw).toContain(`"name":"${draftId}"`);

    const get = runCli(['get', draftId], cwd);
    expect(get.status).toBe(0);
    expect(get.stdout).toContain('"status": "active"');

    expect(existsSync(relationsPath(cwd))).toBe(true);
    const rels = readFileSync(relationsPath(cwd), 'utf-8');
    expect(rels).toContain('"predicate":"based_on"');
    expect(rels).toContain('pattern:bash:timeout');
    expect(rels).toContain(draftId);

    // §2.5: лишь после активации запись становится доставляемой (wolf call)
    const callAfter = runCli(['call', '--for', 'bash'], cwd);
    expect(callAfter.status).toBe(0);
    expect(callAfter.stdout).toContain(draftId);

    // §8 п.3: откат одной операцией (transition; supersede — аналогично)
    const rollback = runCli(['transition', draftId, 'archived'], cwd);
    expect(rollback.status).toBe(0);
  });

  it('(в) человеческий путь: complaint → needs_human_review → --human-approved', () => {
    for (let i = 1; i <= 3; i++) {
      expect(
        runCli(['complain', '--about', 'skill:demo', '--rule', 'r', '--proposal', 'p', '--text', `жалоба ${i}`], cwd)
          .status
      ).toBe(0);
    }

    const propose = runCli(['learn', 'propose', 'complaint:skill:demo'], cwd);
    expect(propose.status).toBe(0);
    const id = draftIdFrom(propose.stdout);
    expect(propose.stdout).toContain('type: rule');
    expect(propose.stdout).toContain('mechanical: нет');

    const validate = runCli(['learn', 'validate', id], cwd);
    expect(validate.status).toBe(0);
    expect(validate.stdout).toContain('verdict: needs_human_review');

    const blocked = runCli(['learn', 'activate', id], cwd);
    expect(blocked.status).not.toBe(0);
    expect(blocked.stderr).toContain('Error:');

    const approved = runCli(['learn', 'activate', id, '--human-approved'], cwd);
    expect(approved.status).toBe(0);
    expect(approved.stdout).toContain(`activated: ${id}`);
  });
});
