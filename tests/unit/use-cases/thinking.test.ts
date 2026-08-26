import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startThinking } from '../../../src/app/use-cases/thinking.js';
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
