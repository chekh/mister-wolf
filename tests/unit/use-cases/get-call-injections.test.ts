import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getCallInjections } from '../../../src/app/use-cases/get-call-injections.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';

const NOW = new Date('2026-08-24T00:00:00.000Z');
const clock = { now: () => NOW };

function daysAgo(d: number): string {
  return new Date(NOW.getTime() - d * 86_400_000).toISOString();
}

function makeObj(
  overrides: Record<string, unknown> & { id: string; type: string; status: string }
): Record<string, unknown> {
  return {
    title: overrides.id,
    confidence: 'medium',
    importance: 0.5,
    created_at: daysAgo(10),
    updated_at: daysAgo(1),
    created_by: 'user:test',
    review_state: 'accepted',
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    body: '',
    memory_class: 'working',
    truth_role: 'accepted_knowledge',
    lifetime: 'long_term',
    ...overrides,
  };
}

describe('getCallInjections', () => {
  let dir: string;
  let store: MarkdownMemoryStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-call-'));
    store = new MarkdownMemoryStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function seed(...objs: Record<string, unknown>[]) {
    for (const o of objs) {
      await store.save(o as any);
    }
  }

  it('returns active injections matching topic keywords ranked by relevance', async () => {
    await seed(
      makeObj({
        id: 'inj_A',
        type: 'call-injection',
        status: 'active',
        trigger_keywords: ['get', 'deprecated'],
        title: 'Do not use top-level get',
        updated_at: daysAgo(1),
        body: 'x'.repeat(600),
      }),
      makeObj({
        id: 'inj_B',
        type: 'call-injection',
        status: 'active',
        trigger_keywords: ['imports'],
        title: 'Fix import cycles',
        updated_at: daysAgo(2),
        body: 'y'.repeat(600),
      })
    );

    const result = await getCallInjections({ store, clock }, { topic: 'deprecated get' });
    expect(result.blocks[0]).toContain('inj_A');
  });

  it('returns all active injections ranked by relevance when called without --for', async () => {
    await seed(
      makeObj({
        id: 'inj_A',
        type: 'call-injection',
        status: 'active',
        trigger_keywords: ['get', 'deprecated'],
        title: 'Do not use top-level get',
        updated_at: daysAgo(1),
        body: 'x'.repeat(600),
      }),
      makeObj({
        id: 'inj_B',
        type: 'call-injection',
        status: 'active',
        trigger_keywords: ['imports'],
        title: 'Fix import cycles',
        updated_at: daysAgo(2),
        body: 'y'.repeat(600),
      })
    );

    const result = await getCallInjections({ store, clock }, {});
    expect(result.blocks).toHaveLength(2);
    const idxA = result.blocks.findIndex((b) => b.includes('inj_A'));
    const idxB = result.blocks.findIndex((b) => b.includes('inj_B'));
    expect(idxA).toBeLessThan(idxB);
  });

  it('thread mode appends project rules and open blockers', async () => {
    await seed(
      makeObj({
        id: 'inj_A',
        type: 'call-injection',
        status: 'active',
        trigger_keywords: ['get'],
        title: 'Injection A',
        body: 'x'.repeat(200),
      }),
      makeObj({ id: 'rule_1', type: 'rule', status: 'active', title: 'Project Rule', scope: 'project', body: '' }),
      makeObj({
        id: 'blocker_1',
        type: 'blocker',
        status: 'active',
        thread: 'mem_t1',
        title: 'Thread Blocker',
        impact: 'blocks work',
        body: '',
      })
    );

    const result = await getCallInjections({ store, clock }, { thread: 'mem_t1' });
    const ids = result.blocks.map((b) => b.match(/\[(\w+)\]/)?.[1]);
    expect(ids).toContain('rule_1');
    expect(ids).toContain('blocker_1');
  });

  it('falls back to up to 3 active rules when no injections match', async () => {
    await seed(
      makeObj({ id: 'rule_1', type: 'rule', status: 'active', title: 'Rule 1', scope: 'project', body: '' }),
      makeObj({ id: 'rule_2', type: 'rule', status: 'active', title: 'Rule 2', scope: 'project', body: '' }),
      makeObj({ id: 'rule_3', type: 'rule', status: 'active', title: 'Rule 3', scope: 'global', body: '' })
    );

    const result = await getCallInjections({ store, clock }, { topic: 'nonexistent-topic-xyz' });
    expect(result.blocks.length).toBeLessThanOrEqual(3);
    for (const b of result.blocks) {
      expect(b).toMatch(/rule_\d/);
    }
  });

  it('respects compact budget dropping whole blocks', async () => {
    const longTitle = 'A'.repeat(500);
    await seed(
      makeObj({ id: 'inj_A', type: 'call-injection', status: 'active', trigger_keywords: ['a'], title: longTitle }),
      makeObj({ id: 'inj_B', type: 'call-injection', status: 'active', trigger_keywords: ['b'], title: longTitle }),
      makeObj({ id: 'inj_C', type: 'call-injection', status: 'active', trigger_keywords: ['c'], title: longTitle })
    );

    const result = await getCallInjections({ store, clock }, { compact: true });
    expect(result.blocks.length).toBe(2);
    expect(result.truncated).toBe(1);
  });

  it('no budget without compact flag', async () => {
    const longTitle = 'A'.repeat(500);
    await seed(
      makeObj({ id: 'inj_A', type: 'call-injection', status: 'active', trigger_keywords: ['a'], title: longTitle }),
      makeObj({ id: 'inj_B', type: 'call-injection', status: 'active', trigger_keywords: ['b'], title: longTitle }),
      makeObj({ id: 'inj_C', type: 'call-injection', status: 'active', trigger_keywords: ['c'], title: longTitle })
    );

    const result = await getCallInjections({ store, clock }, {});
    expect(result.blocks).toHaveLength(3);
    expect(result.truncated).toBe(0);
  });

  it('compact=N uses explicit char budget', async () => {
    const longTitle = 'A'.repeat(500);
    await seed(
      makeObj({ id: 'inj_A', type: 'call-injection', status: 'active', trigger_keywords: ['a'], title: longTitle }),
      makeObj({ id: 'inj_B', type: 'call-injection', status: 'active', trigger_keywords: ['b'], title: longTitle }),
      makeObj({ id: 'inj_C', type: 'call-injection', status: 'active', trigger_keywords: ['c'], title: longTitle })
    );

    const result = await getCallInjections({ store, clock }, { compact: 700 });
    expect(result.truncated).toBeGreaterThan(0);
  });

  it('decisions never appear in call output', async () => {
    await seed(
      makeObj({
        id: 'inj_A',
        type: 'call-injection',
        status: 'active',
        trigger_keywords: ['a'],
        title: 'IA',
        body: 'x'.repeat(200),
      }),
      makeObj({ id: 'decision_noise', type: 'decision', status: 'active', title: 'Some Decision', body: '' })
    );

    const result = await getCallInjections({ store, clock }, {});
    for (const b of result.blocks) {
      expect(b).not.toContain('decision_noise');
    }
  });
});
