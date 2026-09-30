import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('recap golden scenarios', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('recap summarizes seeded memory sections', () => {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir);

    const rule = runCli(
      [
        'add',
        '--type',
        'rule',
        '--title',
        'Run checks before done',
        '--body',
        'Always run npm run check.',
        '--scope',
        'project',
      ],
      dir
    );
    expect(rule.status).toBe(0);
    const decision = runCli(
      ['add', '--type', 'decision', '--title', 'Use recap command', '--body', 'recap summarizes active memory.'],
      dir
    );
    expect(decision.status).toBe(0);
    // 2.13: open-question → note facet context; вопрос = note+context в статусе open
    const question = runCli(
      ['add', '--type', 'note', '--facet', 'context', '--title', 'Auth strategy', '--body', 'JWT or sessions?'],
      dir
    );
    expect(question.status).toBe(0);
    const questionId = question.stdout.match(/Created memory object: (\S+)/)?.[1]!;
    const tr = runCli(['transition', questionId, 'open'], dir);
    expect(tr.status).toBe(0);

    const recap = runCli(['recap'], dir);
    expect(recap.status).toBe(0);
    expect(recap.stdout).toContain('## Active rules');
    expect(recap.stdout).toContain('Run checks before done');
    expect(recap.stdout).toContain('## Active work threads');
    expect(recap.stdout).toContain('## Open blockers');
    expect(recap.stdout).toContain('## Open questions');
    expect(recap.stdout).toContain('Auth strategy');
    expect(recap.stdout).toContain('## Open info requests');
    expect(recap.stdout).toContain('## Recent decisions');
    expect(recap.stdout).toContain('Use recap command');
  });

  it('recap on empty memory renders placeholders', () => {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir);

    const recap = runCli(['recap'], dir);
    expect(recap.status).toBe(0);
    expect(recap.stdout).toContain('## Active rules\n-');
    expect(recap.stdout).toContain('## Active work threads\n-');
    expect(recap.stdout).toContain('## Open blockers\n-');
    expect(recap.stdout).toContain('## Open questions\n-');
    expect(recap.stdout).toContain('## Open info requests\n-');
    expect(recap.stdout).toContain('## Recent decisions\n-');
    // P110: без router.log секции Delivery нет
    expect(recap.stdout).not.toContain('## Delivery');
  });

  it('recap renders Delivery (7d) section from router.log', () => {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir);

    // P110: 2 строки в окне (canonical hit + fallback), ts = сейчас
    const now = new Date().toISOString();
    writeFileSync(
      join(dir, '.wolf', 'router.log'),
      [
        `${now} agent-id=agent-a playbook=hit name=mem_x variant=canonical injected=yes ms=5 bytes=10`,
        `${now} agent-id=agent-b playbook=hit name=mem_y variant=fallback injected=yes ms=6 bytes=20`,
      ].join('\n') + '\n',
      'utf-8'
    );

    const recap = runCli(['recap'], dir);
    expect(recap.status).toBe(0);
    expect(recap.stdout).toContain('## Delivery (7d)');
    expect(recap.stdout).toContain('доставок 2, промахов 1');
  });

  // 2.14 §6.3: счётчик «жалоб без исхода» в секции Контур поправок
  it('recap counts resolved complaints without outcome edge', () => {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir);

    const complaint = runCli(
      ['complain', '--about', 'executor-lead', '--rule', 'r', '--evidence', 'e', '--proposal', 'p'],
      dir
    );
    expect(complaint.status).toBe(0);
    const id = complaint.stdout.match(/Complaint recorded: (\S+)/)?.[1]!;
    expect(runCli(['transition', id, 'resolved'], dir).status).toBe(0);

    const recap1 = runCli(['recap'], dir);
    expect(recap1.status).toBe(0);
    expect(recap1.stdout).toContain('## Контур поправок');
    expect(recap1.stdout).toContain('жалоб без исхода: 1');

    expect(runCli(['relation', 'add', id, 'outcome', 'rejected'], dir).status).toBe(0);

    const recap2 = runCli(['recap'], dir);
    expect(recap2.status).toBe(0);
    expect(recap2.stdout).toContain('жалоб без исхода: 0');
  });
});
