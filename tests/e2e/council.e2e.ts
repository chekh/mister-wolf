import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'fs';
import { ensureBuilt, runCli, tmpProject, writeRelationScript } from './helpers.js';

describe('council flow: question -> opinions -> tally winner -> synthesis', () => {
  let cwd: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('runs council flow end to end', () => {
    const init = runCli(['init'], cwd);
    expect(init.status).toBe(0);

    const q = runCli(['add', '--type', 'council-question', '--title', 'Q1', '--set', 'question=Q?'], cwd);
    expect(q.status).toBe(0);
    expect(q.stdout).toContain('Created memory object:');
    const qId = q.stdout.match(/Created memory object: (\S+)/)?.[1]!;

    const o1 = runCli(['add', '--type', 'council-opinion', '--title', 'O1', '--set', 'vote=A'], cwd);
    expect(o1.status).toBe(0);
    const o1Id = o1.stdout.match(/Created memory object: (\S+)/)?.[1]!;

    const o2 = runCli(['add', '--type', 'council-opinion', '--title', 'O2', '--set', 'vote=B'], cwd);
    expect(o2.status).toBe(0);
    const o2Id = o2.stdout.match(/Created memory object: (\S+)/)?.[1]!;

    const o3 = runCli(['add', '--type', 'council-opinion', '--title', 'O3', '--set', 'vote=A'], cwd);
    expect(o3.status).toBe(0);
    const o3Id = o3.stdout.match(/Created memory object: (\S+)/)?.[1]!;

    // relations: each opinion answers the question
    writeRelationScript(cwd, [
      { subject: o1Id, predicate: 'answers', object: qId },
      { subject: o2Id, predicate: 'answers', object: qId },
      { subject: o3Id, predicate: 'answers', object: qId },
    ]);

    const tally = runCli(['council', 'tally', '--question-id', qId, '--quorum', '3', '--threshold', '0.66'], cwd);
    expect(tally.status).toBe(0);
    expect(tally.stdout).toContain('Winner: A');
    expect(tally.stdout).toContain('3/3');

    const syn = runCli(['council', 'synthesize', '--question-id', qId, '--recommendation', 'Go A'], cwd);
    expect(syn.status).toBe(0);
    const synId = syn.stdout.match(/Created synthesis: (\S+)/)?.[1];
    expect(synId).toBeDefined();

    const list = runCli(['list'], cwd);
    expect(list.stdout).toContain('synthesis');
  });
});
