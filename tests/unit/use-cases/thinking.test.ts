import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startThinking, addThought, concludeThinking, THOUGHT_TYPES } from '../../../src/app/use-cases/thinking.js';
import { Clock } from '../../../src/ports/clock.port.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { EventLog } from '../../../src/ports/event-log.port.js';
import { MemoryStore } from '../../../src/ports/memory-store.port.js';
import { RelationLog } from '../../../src/ports/relation-log.port.js';

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

// свежий session-summary в list → shouldSummarize false → summarizeSession (внутри createDecision)
// отрабатывает вхолостую и не пишет в saved лишний объект (план Task 3, примечание)
const RECENT_SUMMARY = {
  id: 'mem_summary_recent',
  type: 'session-summary',
  title: 'Session wrap-up',
  status: 'active',
  review_state: 'accepted',
  confidence: 'medium',
  importance: 0.5,
  created_at: NOW.toISOString(),
  updated_at: NOW.toISOString(),
  created_by: 'user:test',
  schema_version: 1,
  source: { kind: 'session' },
  related: { files: [], docs: [], decisions: [] },
  tags: [],
  superseded_by: null,
  body: '',
  memory_class: 'working',
  truth_role: 'accepted_knowledge',
  lifetime: 'session',
};

function captureStore(): { store: MemoryStore; saved: Array<{ id: string; body: string }> } {
  const saved: Array<{ id: string; body: string }> = [];
  return {
    saved,
    store: {
      save: async (object) => {
        saved.push(object);
      },
      get: async () => null,
      list: async () => [RECENT_SUMMARY],
      update: async () => {
        throw new Error('not implemented');
      },
    },
  };
}

function captureLog(): { log: EventLog; events: Array<{ type: string; payload: Record<string, unknown> }> } {
  const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  return {
    events,
    log: {
      append: async (event) => {
        events.push(event);
      },
      readAll: async () => [],
    },
  };
}

function captureRelations(): {
  relations: RelationLog;
  appended: Array<{ subject: string; predicate: string; object: string }>;
} {
  const appended: Array<{ subject: string; predicate: string; object: string }> = [];
  return {
    appended,
    relations: {
      append: async (relation) => {
        appended.push(relation);
      },
      list: async () => [],
    },
  };
}

describe('concludeThinking', () => {
  it('creates a decision with embedded trace, based_on links in thought order, thread from meta; removes scratch', async () => {
    const deps = thinkDeps();
    const meta = await startThinking(deps, { goal: 'auth', thread: 'thr_9' });
    const t1 = await addThought(deps, { sequenceId: meta.id, type: 'hypothesis', text: 'H1' });
    const t2 = await addThought(deps, { sequenceId: meta.id, type: 'concern', text: 'C1' });
    const { store, saved } = captureStore();
    const { log, events } = captureLog();
    const { relations, appended } = captureRelations();

    const result = await concludeThinking(
      { baseDir: dir, store, log, clock: deps.clock, idGen: deps.idGen, relations },
      { sequenceId: meta.id, title: 'Use JWT', body: 'Decision body.', createdBy: 'user:test' }
    );

    expect(result.object.body).toBe(
      'Decision body.\n\n## Thinking trace (' + meta.id + ')\n\n1. [hypothesis] H1\n2. [concern] C1'
    );
    expect(saved).toHaveLength(1);
    expect(events.some((e) => e.type === 'memory.added')).toBe(true);
    expect(appended.filter((r) => r.predicate === 'based_on').map((r) => [r.subject, r.object])).toEqual([
      [result.object.id, t1.tid],
      [result.object.id, t2.tid],
    ]);
    expect(appended.filter((r) => r.predicate === 'updates').map((r) => r.object)).toEqual(['thr_9']);
    expect(appended.filter((r) => r.predicate === 'basis_for')).toHaveLength(2);
    expect(existsSync(scratchPath(meta.id))).toBe(false);
  });

  it('keeps the scratch file when createDecision fails', async () => {
    const deps = thinkDeps();
    const meta = await startThinking(deps, { goal: 'g' });
    await addThought(deps, { sequenceId: meta.id, type: 'evidence', text: 'E1' });
    const store: MemoryStore = {
      save: async () => {
        throw new Error('disk full');
      },
      get: async () => null,
      list: async () => [],
      update: async () => {
        throw new Error('not implemented');
      },
    };

    await expect(
      concludeThinking(
        { baseDir: dir, store, log: captureLog().log, clock: deps.clock, idGen: deps.idGen },
        { sequenceId: meta.id, title: 'T', body: 'B', createdBy: 'user:test' }
      )
    ).rejects.toThrow('disk full');
    expect(existsSync(scratchPath(meta.id))).toBe(true);
  });

  it('throws when the sequence has no thoughts', async () => {
    const deps = thinkDeps();
    const meta = await startThinking(deps, { goal: 'g' });
    await expect(
      concludeThinking(
        { baseDir: dir, store: captureStore().store, log: captureLog().log, clock: deps.clock, idGen: deps.idGen },
        { sequenceId: meta.id, title: 'T', body: 'B', createdBy: 'user:test' }
      )
    ).rejects.toThrow(`Sequence has no thoughts: ${meta.id}`);
  });

  it('throws on a second conclude (scratch already removed)', async () => {
    const deps = thinkDeps();
    const meta = await startThinking(deps, { goal: 'g' });
    await addThought(deps, { sequenceId: meta.id, type: 'evidence', text: 'E1' });
    const common = { baseDir: dir, clock: deps.clock, idGen: deps.idGen };
    const first = await concludeThinking(
      { ...common, store: captureStore().store, log: captureLog().log },
      { sequenceId: meta.id, title: 'T', body: 'B', createdBy: 'user:test' }
    );
    expect(first.object.id).toMatch(/^mem_/);
    await expect(
      concludeThinking(
        { ...common, store: captureStore().store, log: captureLog().log },
        { sequenceId: meta.id, title: 'T2', body: 'B2', createdBy: 'user:test' }
      )
    ).rejects.toThrow(`Thinking sequence not found: ${meta.id}`);
  });
});
