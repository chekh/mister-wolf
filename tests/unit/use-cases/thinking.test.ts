import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startThinking, addThought, THOUGHT_TYPES } from '../../../src/app/use-cases/thinking.js';
import { Clock } from '../../../src/ports/clock.port.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';

const NOW = new Date('2026-08-26T12:00:00.000Z');

function fakeClock(): Clock {
  return { now: () => NOW };
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-thinking-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function scratchPath(id: string): string {
  return join(dir, '.wolf', 'thinking', `${id}.jsonl`);
}

function thinkDeps() {
  return { baseDir: dir, clock: fakeClock(), idGen: new HashIdGenerator() };
}

describe('startThinking', () => {
  it('creates .wolf/thinking/<id>.jsonl whose first line is the sequence meta, and returns the meta', async () => {
    const meta = await startThinking(thinkDeps(), { goal: 'Decide auth approach', thread: 'thr_1' });
    expect(meta.kind).toBe('sequence');
    expect(meta.id).toMatch(/^mem_/);
    expect(meta.goal).toBe('Decide auth approach');
    expect(meta.thread).toBe('thr_1');
    expect(meta.created_at).toBe(NOW.toISOString());
    expect(existsSync(scratchPath(meta.id))).toBe(true);
    const firstLine = JSON.parse(readFileSync(scratchPath(meta.id), 'utf-8').split('\n')[0]);
    expect(firstLine).toEqual(meta);
  });

  it('defaults thread to null when omitted', async () => {
    const meta = await startThinking(thinkDeps(), { goal: 'g' });
    expect(meta.thread).toBeNull();
  });
});

describe('addThought', () => {
  it('appends thoughts with incrementing n and returns them', async () => {
    const deps = thinkDeps();
    const meta = await startThinking(deps, { goal: 'g' });
    const t1 = await addThought(deps, { sequenceId: meta.id, type: 'hypothesis', text: 'JWT is enough' });
    const t2 = await addThought(deps, { sequenceId: meta.id, type: 'evidence', text: 'API is stateless' });
    expect(t1.n).toBe(1);
    expect(t2.n).toBe(2);
    expect(t1.kind).toBe('thought');
    expect(t1.tid).toMatch(/^mem_/);
    expect(t1.created_at).toBe(NOW.toISOString());
    const lines = readFileSync(scratchPath(meta.id), 'utf-8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(lines).toHaveLength(3);
    expect(lines[0].kind).toBe('sequence');
    expect(lines[1]).toEqual(t1);
    expect(lines[2]).toEqual(t2);
  });

  it('accepts every THOUGHT_TYPES value', async () => {
    const deps = thinkDeps();
    const meta = await startThinking(deps, { goal: 'g' });
    for (const type of THOUGHT_TYPES) {
      const thought = await addThought(deps, { sequenceId: meta.id, type, text: `text ${type}` });
      expect(thought.type).toBe(type);
    }
  });

  it('rejects an invalid type listing allowed values', async () => {
    const deps = thinkDeps();
    const meta = await startThinking(deps, { goal: 'g' });
    await expect(addThought(deps, { sequenceId: meta.id, type: 'guess' as never, text: 'x' })).rejects.toThrow(
      'Allowed: hypothesis, reasoning, evidence, concern'
    );
  });

  it('throws for a missing sequence', async () => {
    const deps = thinkDeps();
    await expect(addThought(deps, { sequenceId: 'mem_nope', type: 'evidence', text: 'x' })).rejects.toThrow(
      'Thinking sequence not found: mem_nope'
    );
  });
});
