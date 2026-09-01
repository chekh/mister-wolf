import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync } from 'fs';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('solve builds stale-instruction pack on seeded memory', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function seed(): { dir: string; oldId: string; newId: string } {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir);
    runCli(['thread', 'create', '--title', 'CLI repair thread', '--goal', 'Repair stale CLI guidance'], dir);

    const oldRun = runCli(
      [
        'rule',
        'add',
        '--title',
        'Use top-level get',
        '--body',
        'Old guidance: use top-level get.',
        '--scope',
        'project',
      ],
      dir
    );
    const newRun = runCli(
      [
        'rule',
        'add',
        '--title',
        'Use entity-specific get commands',
        '--body',
        'New guidance: use entity-specific get.',
        '--scope',
        'project',
      ],
      dir
    );
    const oldId = oldRun.stdout.match(/Created (?:memory object|rule): (\S+)/)?.[1] ?? '';
    const newId = newRun.stdout.match(/Created (?:memory object|rule): (\S+)/)?.[1] ?? '';
    expect(oldId).not.toBe('');
    expect(newId).not.toBe('');
    return { dir, oldId, newId };
  }

  it('solve builds stale-instruction pack on seeded memory', () => {
    const { dir, oldId, newId } = seed();
    // БЕЗ supersedes-relation — конфликтующая память должна классифицироваться как stale-instruction
    const r = runCli(['solve', 'agent keeps using deprecated get command'], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('# Mr. Wolf Solve Pack');
    expect(r.stdout).toContain('Scenario: stale-instruction');
    expect(r.stdout).toContain(oldId);
    expect(r.stdout).toContain(newId);
    expect(r.stdout).toContain('Prefer superseding over deleting');
  });
});
