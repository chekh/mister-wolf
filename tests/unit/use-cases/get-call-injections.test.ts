import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getCallInjections } from '../../../src/app/use-cases/get-call-injections.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { checksumBlock } from '../../../src/adapters/fs/session-delivery-registry.js';

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

  it('routing-объект (машино-состояние, тег wolf-routing) никогда не инъецируется', async () => {
    await seed(
      makeObj({
        id: 'routing_1',
        type: 'rule',
        status: 'active',
        title: 'Routing: модели агентов',
        scope: 'project',
        tags: ['wolf-routing', 'models'],
        body: 'primary: x/y\nworker: x/y',
      })
    );

    const noTopic = await getCallInjections({ store, clock }, { thread: true });
    expect(noTopic.blocks).toHaveLength(0);
    const fallback = await getCallInjections({ store, clock }, { topic: 'nonexistent-topic-xyz' });
    expect(fallback.blocks).toHaveLength(0);
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

  it('index fallback includes injections whose body matches the topic without keyword overlap', async () => {
    await seed(
      makeObj({
        id: 'inj_kw',
        type: 'call-injection',
        status: 'active',
        trigger_keywords: ['gitflow'],
        title: 'Keyword match',
        body: 'x'.repeat(200),
      }),
      makeObj({
        id: 'inj_fts',
        type: 'call-injection',
        status: 'active',
        trigger_keywords: ['unrelated'],
        title: 'Only FTS match',
        body: 'merge dev through release branches',
      })
    );
    const index = {
      search: async () => [{ object: await store.get('inj_fts'), score: 5 }],
      rebuild: async () => {},
      indexObject: async () => {},
      removeObject: async () => {},
    };

    const result = await getCallInjections({ store, index, clock }, { topic: 'release branches' });
    const ids = result.blocks.map((b) => b.match(/\[(\w+)\]/)?.[1]);
    expect(ids).toContain('inj_fts');
  });

  it('finds lesson with trigger_keywords matching topic (D2)', async () => {
    await seed(
      makeObj({
        id: 'lesson_1',
        type: 'lesson',
        status: 'active',
        title: 'Merge lesson',
        trigger_keywords: ['merge'],
        body: '',
      })
    );

    const result = await getCallInjections({ store, clock }, { topic: 'merge' });
    expect(result.blocks.join('\n')).toContain('lesson_1');
  });

  it('finds rule with trigger_keywords matching topic (D2)', async () => {
    await seed(
      makeObj({
        id: 'rule_kw',
        type: 'rule',
        status: 'active',
        title: 'Merge rule',
        scope: 'project',
        trigger_keywords: ['merge'],
        body: '',
      })
    );

    const result = await getCallInjections({ store, clock }, { topic: 'merge' });
    expect(result.blocks.join('\n')).toContain('rule_kw');
  });

  it('does not surface lesson/rule without keyword overlap (D2)', async () => {
    await seed(
      makeObj({
        id: 'lesson_1',
        type: 'lesson',
        status: 'active',
        title: 'Merge lesson',
        trigger_keywords: ['merge'],
        body: '',
      }),
      makeObj({
        id: 'inj_A',
        type: 'call-injection',
        status: 'active',
        title: 'Git injection',
        trigger_keywords: ['git'],
        body: '',
      }),
      makeObj({
        id: 'rule_kw',
        type: 'rule',
        status: 'active',
        title: 'Merge rule',
        scope: 'project',
        trigger_keywords: ['merge'],
        body: '',
      })
    );

    // injection совпадает по 'git' → fallback выключен; lesson/rule с 'merge' не совпали
    const result = await getCallInjections({ store, clock }, { topic: 'git' });
    const all = result.blocks.join('\n');
    expect(all).toContain('inj_A');
    expect(all).not.toContain('lesson_1');
    expect(all).not.toContain('rule_kw');
  });

  it('keyword-matched rule is not duplicated by the rules fallback (D2)', async () => {
    await seed(
      makeObj({
        id: 'rule_kw',
        type: 'rule',
        status: 'active',
        title: 'Merge rule',
        scope: 'project',
        trigger_keywords: ['merge'],
        body: '',
      }),
      makeObj({ id: 'rule_2', type: 'rule', status: 'active', title: 'Rule 2', scope: 'global', body: '' }),
      makeObj({ id: 'rule_3', type: 'rule', status: 'active', title: 'Rule 3', scope: 'global', body: '' })
    );

    const result = await getCallInjections({ store, clock }, { topic: 'merge' });
    const occurrences = result.blocks.filter((b) => b.includes('rule_kw')).length;
    expect(occurrences).toBe(1);
    // fallback не сработал (есть совпадение) — остальные правила не подтянуты
    expect(result.blocks.join('\n')).not.toContain('rule_2');
  });

  // --- P103 (волна 2.12 A4): один store.list() на вызов wolf call ---

  it('P103: ровно один store.list() на path call --for X --thread Y (instrumentation)', async () => {
    await seed(
      makeObj({ id: 'inj_A', type: 'call-injection', status: 'active', trigger_keywords: ['merge'], title: 'A' }),
      makeObj({ id: 'lesson_1', type: 'lesson', status: 'active', trigger_keywords: ['merge'], title: 'L' }),
      makeObj({ id: 'rule_1', type: 'rule', status: 'active', scope: 'project', title: 'R' }),
      makeObj({ id: 'blocker_1', type: 'blocker', status: 'active', thread: 'mem_t1', title: 'B', impact: 'x' })
    );
    let listCalls = 0;
    const countingStore = {
      save: (o: unknown) => store.save(o as any),
      get: (id: string) => store.get(id),
      update: (id: string, patch: any) => store.update(id, patch),
      list: async () => {
        listCalls++;
        return store.list();
      },
    };

    const result = await getCallInjections({ store: countingStore, clock }, { topic: 'merge', thread: 'mem_t1' });
    expect(listCalls).toBe(1);
    expect(result.deliveredIds.length).toBeGreaterThan(0);
  });

  it('P103: снапшот вывода на фиксированном наборе — ранжирование не изменилось', async () => {
    await seed(
      makeObj({
        id: 'inj_A',
        type: 'call-injection',
        status: 'active',
        trigger_keywords: ['merge'],
        title: 'Injection A',
        importance: 0.9,
        confidence: 'high',
        updated_at: daysAgo(1),
      }),
      makeObj({
        id: 'lesson_1',
        type: 'lesson',
        status: 'active',
        trigger_keywords: ['merge'],
        title: 'Lesson One',
        importance: 0.7,
        confidence: 'medium',
        updated_at: daysAgo(1),
      }),
      makeObj({
        id: 'rule_kw',
        type: 'rule',
        status: 'active',
        scope: 'project',
        trigger_keywords: ['merge'],
        title: 'Rule KW',
        importance: 0.6,
        confidence: 'medium',
        updated_at: daysAgo(1),
      }),
      makeObj({
        id: 'blocker_1',
        type: 'blocker',
        status: 'active',
        thread: 'mem_t1',
        title: 'Thread Blocker',
        impact: 'x',
        importance: 0.5,
        confidence: 'low',
        updated_at: daysAgo(1),
      }),
      // шум: не должен попасть в вывод
      makeObj({ id: 'blocker_other', type: 'blocker', status: 'active', thread: 'mem_x', title: 'Other', impact: 'x' }),
      makeObj({ id: 'rule_global', type: 'rule', status: 'active', scope: 'global', title: 'Global Rule' }),
      makeObj({ id: 'decision_1', type: 'decision', status: 'active', title: 'Decision' }),
      makeObj({ id: 'rule_done', type: 'rule', status: 'superseded', scope: 'project', title: 'Old Rule' })
    );

    const result = await getCallInjections({ store, clock }, { topic: 'merge', thread: 'mem_t1' });
    expect(result.blocks).toEqual([
      `- [inj_A] Injection A (high, ${daysAgo(1)})\n  source: inj_A`,
      `- [lesson_1] Lesson One (medium, ${daysAgo(1)})\n  source: lesson_1`,
      `- [rule_kw] Rule KW (medium, ${daysAgo(1)})\n  source: rule_kw`,
      `- [blocker_1] Thread Blocker (low, ${daysAgo(1)})\n  source: blocker_1`,
    ]);
    expect(result.truncated).toBe(0);
  });

  // --- P108 (волна 2.12 4.C): сессионная дедупликация доставок ---

  /** Реестр id→checksum, выведенный из фактического вывода первого вызова. */
  function registryFrom(result: { blocks: string[]; deliveredIds: string[] }): Record<string, string> {
    const reg: Record<string, string> = {};
    result.deliveredIds.forEach((id, i) => {
      reg[id] = checksumBlock(result.blocks[i] ?? '');
    });
    return reg;
  }

  it('P108: deliveredRegistry с текущей checksum → skip, deduplicated посчитан', async () => {
    await seed(
      makeObj({ id: 'inj_A', type: 'call-injection', status: 'active', trigger_keywords: ['a'], title: 'AAA' }),
      makeObj({ id: 'inj_B', type: 'call-injection', status: 'active', trigger_keywords: ['b'], title: 'BBB' })
    );

    const first = await getCallInjections({ store, clock }, {});
    expect(first.blocks).toHaveLength(2);

    const second = await getCallInjections({ store, clock }, { deliveredRegistry: registryFrom(first) });
    expect(second.blocks).toEqual([]);
    expect(second.deliveredIds).toEqual([]);
    expect(second.deduplicated).toBe(2);
    expect(second.truncated).toBe(0);
  });

  it('P108: дедупликация ДО бюджета — освободившийся бюджет получает следующий блок', async () => {
    const longTitle = 'A'.repeat(500);
    await seed(
      makeObj({
        id: 'inj_A',
        type: 'call-injection',
        status: 'active',
        trigger_keywords: ['a'],
        title: longTitle,
        importance: 0.9,
        updated_at: daysAgo(1),
      }),
      makeObj({
        id: 'inj_B',
        type: 'call-injection',
        status: 'active',
        trigger_keywords: ['b'],
        title: longTitle,
        importance: 0.2,
        updated_at: daysAgo(5),
      }),
      makeObj({
        id: 'inj_C',
        type: 'call-injection',
        status: 'active',
        trigger_keywords: ['c'],
        title: longTitle,
        importance: 0.1,
        updated_at: daysAgo(5),
      })
    );

    // компакт 1200: без дедупликации A+B влезают, C — truncated
    const first = await getCallInjections({ store, clock }, { compact: true });
    expect(first.deliveredIds).toEqual(['inj_A', 'inj_B']);
    expect(first.truncated).toBe(1);

    // A уже доставлен → не занимает бюджет, C занимает освободившееся место
    const registry = registryFrom(first);
    delete registry['inj_B'];
    const second = await getCallInjections({ store, clock }, { compact: true, deliveredRegistry: registry });
    expect(second.deliveredIds).toEqual(['inj_B', 'inj_C']);
    expect(second.deduplicated).toBe(1);
    expect(second.truncated).toBe(0);
  });

  it('P108: checksum отличается (текст изменился) → доставляется повторно', async () => {
    await seed(
      makeObj({ id: 'inj_A', type: 'call-injection', status: 'active', trigger_keywords: ['a'], title: 'AAA' })
    );

    const stale = await getCallInjections({ store, clock }, {});
    const registry = registryFrom(stale);
    registry['inj_A'] = 'deadbeefdeadbeef'; // текст блока изменился с момента доставки

    const result = await getCallInjections({ store, clock }, { deliveredRegistry: registry });
    expect(result.blocks).toHaveLength(1);
    expect(result.deliveredIds).toEqual(['inj_A']);
    expect(result.deduplicated).toBe(0);
  });

  it('P108: deliveredRegistry не передан (MCP-канал) → фильтр выключен, deduplicated = 0', async () => {
    await seed(
      makeObj({ id: 'inj_A', type: 'call-injection', status: 'active', trigger_keywords: ['a'], title: 'AAA' })
    );

    const result = await getCallInjections({ store, clock }, {});
    expect(result.blocks).toHaveLength(1);
    expect(result.deduplicated).toBe(0);
  });
});
