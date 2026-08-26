import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync } from 'fs';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('insights golden scenarios', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('insights analyzes seeded memory by topic', () => {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init'], dir);

    const decision = runCli(
      [
        'add',
        '--type',
        'decision',
        '--title',
        'Use JWT for API auth',
        '--body',
        'Chose JWT over sessions',
        '--tags',
        'auth',
      ],
      dir
    );
    expect(decision.status).toBe(0);
    const lesson = runCli(
      [
        'add',
        '--type',
        'lesson',
        '--title',
        'JWT expiry bites',
        '--body',
        'Short JWT lifetimes caused login bugs',
        '--tags',
        'auth,debug',
      ],
      dir
    );
    expect(lesson.status).toBe(0);

    const insights = runCli(['insights', '--topic', 'auth', '--type', 'patterns'], dir);
    expect(insights.status).toBe(0);
    expect(insights.stdout).toContain('Insights [patterns]');
    expect(insights.stdout).toContain('(topic: auth)');
    expect(insights.stdout).toContain('## Top tags');
    expect(insights.stdout).toContain('auth');
  });

  it('insights on empty memory degrades gracefully', () => {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init'], dir);

    const insights = runCli(['insights'], dir);
    expect(insights.status).toBe(0);
    expect(insights.stdout).toContain('Insights [patterns] (project-wide)');
    expect(insights.stdout).toContain('matched 0/0 objects');
    expect(insights.stdout).toContain('-');
  });
});
