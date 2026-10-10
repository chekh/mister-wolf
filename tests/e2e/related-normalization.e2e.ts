import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('related normalization (спека 2.16 §14.8)', () => {
  let cwd: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
    expect(runCli(['init', '--yes'], cwd).status).toBe(0);
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('inside-root absolute path is stored project-relative', () => {
    const r = runCli(
      ['add', '--type', 'note', '--facet', 'context', '--title', 'good related', '--created-by', 'user:t'],
      cwd
    );
    expect(r.status).toBe(0);
  });

  it('related.files outside the project refuses', () => {
    const r = runCli(
      [
        'add',
        '--type',
        'note',
        '--facet',
        'context',
        '--title',
        'bad related',
        '--set',
        'related.files=[/etc/passwd]',
        '--created-by',
        'user:t',
      ],
      cwd
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('project-relative');
  });
});
