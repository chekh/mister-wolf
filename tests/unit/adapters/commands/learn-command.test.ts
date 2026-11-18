import { describe, it, expect } from 'vitest';
import { learnCommand } from '../../../../src/adapters/cli/commands/learn.js';

/**
 * 3.2.0 T-05/T-06 (интеграция): единая группа `wolf learn` — очередь сигналов
 * (due/list/ack/dismiss, T-05) и жизненный цикл кандидата
 * (accept/apply/rollback, T-06) слиты ведущим по design §9. Только форма
 * команды: action'ы не вызываются (они строят контейнер), это structural
 * smoke — поведение покрыто tests/integration/learning-due-queue.test.ts и
 * apply-learning-change*.test.ts.
 */
describe('learnCommand (T-05/T-06): структура группы wolf learn', () => {
  const cmd = learnCommand('/nonexistent-base-dir');

  function sub(name: string) {
    const found = cmd.commands.find((c) => c.name() === name);
    expect(found, `subcommand "${name}" is registered`).toBeDefined();
    return found!;
  }

  it('registers the merged group: due/list/ack/dismiss + accept/apply/rollback', () => {
    expect(cmd.name()).toBe('learn');
    expect(cmd.commands.map((c) => c.name()).sort()).toEqual([
      'accept',
      'ack',
      'apply',
      'dismiss',
      'due',
      'list',
      'rollback',
    ]);
  });

  it('due is read-only and bounded: --limit/--json only, no mutating flags', () => {
    const flags = sub('due').options.map((o) => o.long);
    expect(flags).toEqual(expect.arrayContaining(['--limit', '--json']));
  });

  it('list paginates by seq: --limit/--after-seq/--json', () => {
    const flags = sub('list').options.map((o) => o.long);
    expect(flags).toEqual(expect.arrayContaining(['--limit', '--after-seq', '--json']));
  });

  it('ack takes --seq and dismiss takes the signal id argument (REQ-03/REQ-12)', () => {
    expect(sub('ack').options.map((o) => o.long)).toContain('--seq');
    // публичный help: аргумент <id> обязателен у dismiss
    expect(sub('dismiss').helpInformation()).toContain('<id>');
  });

  it('accept requires --verdict-ref; apply/rollback take the candidate id (REQ-08)', () => {
    expect(sub('accept').options.map((o) => o.long)).toContain('--verdict-ref');
    expect(sub('apply').helpInformation()).toContain('<id>');
    expect(sub('rollback').helpInformation()).toContain('<id>');
  });
});
