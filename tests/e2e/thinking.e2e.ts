import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync, existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

function findObjectMd(root: string, id: string): string {
  const stack = [join(root, '.wolf', 'memory')];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === `${id}.md`) return full;
    }
  }
  throw new Error(`object file not found: ${id}`);
}

function thinkingEntries(dir: string): string[] {
  const thinking = join(dir, '.wolf', 'thinking');
  return existsSync(thinking) ? readdirSync(thinking) : [];
}

describe('thinking golden scenarios', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('full cycle: start -> 4 thoughts -> conclude creates decision with trace and based_on links', () => {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir);

    const start = runCli(['think', 'start', '--goal', 'Choose auth strategy'], dir);
    expect(start.status).toBe(0);
    const seqId = start.stdout.trim().replace('Started thinking sequence: ', '');
    expect(seqId).toMatch(/^mem_/);

    const thoughts: Array<[string, string]> = [
      ['hypothesis', 'JWT alone is enough'],
      ['reasoning', 'API clients are stateless'],
      ['evidence', 'Existing sessions caused bugs'],
      ['concern', 'Token revocation is hard'],
    ];
    const tids: string[] = [];
    for (const [type, text] of thoughts) {
      const add = runCli(['think', 'add', '--sequence', seqId, '--type', type, '--text', text], dir);
      expect(add.status).toBe(0);
      tids.push(add.stdout.trim().replace('Added thought: ', ''));
    }

    const conclude = runCli(
      ['think', 'conclude', '--sequence', seqId, '--title', 'Use JWT for auth', '--body', 'Chosen JWT.'],
      dir
    );
    expect(conclude.status).toBe(0);
    const decisionId = conclude.stdout.trim().replace('Created decision: ', '');
    expect(decisionId).toMatch(/^mem_/);

    expect(thinkingEntries(dir)).toEqual([]);

    const md = readFileSync(findObjectMd(dir, decisionId), 'utf-8');
    expect(md).toContain('## Thinking trace');
    expect(md).toContain('1. [hypothesis] JWT alone is enough');
    expect(md).toContain('4. [concern] Token revocation is hard');

    const relations = readFileSync(join(dir, '.wolf', 'memory', 'relations.jsonl'), 'utf-8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const basedOn = relations.filter((r) => r.subject === decisionId && r.predicate === 'based_on');
    expect(basedOn.map((r) => r.object)).toEqual(tids);
    const basisFor = relations.filter((r) => r.predicate === 'basis_for');
    expect(basisFor).toHaveLength(4);
    expect(basisFor.map((r) => r.object)).toEqual(Array(4).fill(decisionId));
  });

  it('abandon removes the sequence without touching memory', () => {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir);

    const start = runCli(['think', 'start', '--goal', 'Spike idea'], dir);
    expect(start.status).toBe(0);
    const seqId = start.stdout.trim().replace('Started thinking sequence: ', '');

    const add = runCli(['think', 'add', '--sequence', seqId, '--type', 'evidence', '--text', 'some fact'], dir);
    expect(add.status).toBe(0);

    const abandon = runCli(['think', 'abandon', '--sequence', seqId], dir);
    expect(abandon.status).toBe(0);

    expect(thinkingEntries(dir)).toEqual([]);
    expect(() => findObjectMd(dir, seqId)).toThrow();
    expect(existsSync(join(dir, '.wolf', 'memory', 'relations.jsonl'))).toBe(false);
  });
});
