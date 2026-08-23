import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('reliability', () => {
  let cwd: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('broken object file does not break list; validate reports, --fix quarantines', () => {
    const init = runCli(['init'], cwd);
    expect(init.status).toBe(0);

    const a = runCli(['add', '--type', 'observation', '--title', 'ObsA'], cwd);
    expect(a.status).toBe(0);
    const idA = a.stdout.match(/Created memory object: (\S+)/)?.[1]!;

    const b = runCli(['add', '--type', 'lesson', '--title', 'LesB'], cwd);
    expect(b.status).toBe(0);

    // corrupt the lesson file — list should still work (status 0) and show the valid one
    const lessonsDir = join(cwd, '.wolf/memory/shared/lessons');
    const files = readdirSync(lessonsDir).filter((f) => f.endsWith('.md'));
    expect(files.length).toBeGreaterThanOrEqual(1);
    writeFileSync(join(lessonsDir, files[0]), 'NOT VALID MARKDOWN {{{broken');

    const list = runCli(['list'], cwd);
    expect(list.status).toBe(0);
    expect(list.stdout).toContain(idA);
    // broken object is not shown in list (store skips parse errors)
    expect(list.stdout).not.toContain('LesB');

    const val = runCli(['validate'], cwd);
    expect(val.status).toBe(1);
    expect(val.stdout).toContain(files[0]);

    runCli(['validate', '--fix'], cwd);
    const qDir = join(cwd, '.wolf/memory/quarantine');
    expect(existsSync(qDir)).toBe(true);
    expect(readdirSync(qDir).length).toBeGreaterThanOrEqual(1);

    const val2 = runCli(['validate'], cwd);
    expect(val2.status).toBe(0);
  });

  it('broken relations.jsonl line is skipped tolerantly', () => {
    const init = runCli(['init'], cwd);
    expect(init.status).toBe(0);

    runCli(['add', '--type', 'observation', '--title', 'ObsRel'], cwd);

    // append garbage to relations.jsonl
    const relPath = join(cwd, '.wolf/memory/relations.jsonl');
    writeFileSync(relPath, '{not json at all\n', { flag: 'a' });

    // validate reports the bad line
    const val = runCli(['validate'], cwd);
    expect(val.stdout).toContain('bad 1');

    // list still works
    const list = runCli(['list'], cwd);
    expect(list.status).toBe(0);
  });
});
