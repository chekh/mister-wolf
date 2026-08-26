import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync } from 'fs';
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
    runCli(['init'], dir);

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
    const question = runCli(
      ['add', '--type', 'open-question', '--title', 'Auth strategy', '--body', 'JWT or sessions?'],
      dir
    );
    expect(question.status).toBe(0);

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
    runCli(['init'], dir);

    const recap = runCli(['recap'], dir);
    expect(recap.status).toBe(0);
    expect(recap.stdout).toContain('## Active rules\n-');
    expect(recap.stdout).toContain('## Active work threads\n-');
    expect(recap.stdout).toContain('## Open blockers\n-');
    expect(recap.stdout).toContain('## Open questions\n-');
    expect(recap.stdout).toContain('## Open info requests\n-');
    expect(recap.stdout).toContain('## Recent decisions\n-');
  });
});
