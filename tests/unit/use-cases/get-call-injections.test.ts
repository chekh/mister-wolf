import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import yaml from 'js-yaml';
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
      // wave13-a: call-injection поглощён note+howto — легаси-записи сеем сырым
      // .md со старым типом (правило в): alias-резолвер читает их как note с
      // alias_origin='call-injection', пул доставок находит по alias_origin
      if (o.type === 'call-injection') {
        const { body, ...fm } = o;
        const path = join(dir, '.wolf', 'memory', 'shared', 'calls', `${o.id}.md`);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, `---\n${yaml.dump(fm)}---\n\n${body ?? ''}`);
      } else {
        await store.save(o as any);
      }
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
        type: 'note', // wave13-a: blocker → note+facet pitfall
        facet: 'pitfall',
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
      makeObj({
        id: 'blocker_1',
        type: 'note',
        facet: 'pitfall',
        status: 'active',
        thread: 'mem_t1',
        title: 'B',
        impact: 'x',
      }) // wave13-a: blocker → note
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
        type: 'note', // wave13-a: blocker → note+facet pitfall
        facet: 'pitfall',
        status: 'active',
        thread: 'mem_t1',
        title: 'Thread Blocker',
        impact: 'x',
        importance: 0.5,
        confidence: 'low',
        updated_at: daysAgo(1),
      }),
      // шум: не должен попасть в вывод
      makeObj({
        id: 'blocker_other',
        type: 'note',
        facet: 'pitfall',
        status: 'active',
        thread: 'mem_x',
        title: 'Other',
        impact: 'x',
      }), // wave13-a: blocker → note
      makeObj({ id: 'rule_global', type: 'rule', status: 'active', scope: 'global', title: 'Global Rule' }),
      makeObj({ id: 'decision_1', type: 'decision', status: 'active', title: 'Decision' }),
      makeObj({ id: 'rule_done', type: 'rule', status: 'superseded', scope: 'project', title: 'Old Rule' })
    );

    const result = await getCallInjections({ store, clock }, { topic: 'merge', thread: 'mem_t1' });
    // P212 §5.3в: фасет перед title (inj_A — call-injection alias → howto,
    // blocker_1 — note+pitfall); lesson/rule без фасета — плоско
    expect(result.blocks).toEqual([
      `- [inj_A] [howto] Injection A (high, ${daysAgo(1)})\n  source: inj_A`,
      `- [lesson_1] Lesson One (medium, ${daysAgo(1)})\n  source: lesson_1`,
      `- [rule_kw] Rule KW (medium, ${daysAgo(1)})\n  source: rule_kw`,
      `- [blocker_1] [pitfall] Thread Blocker (low, ${daysAgo(1)})\n  source: blocker_1`,
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

  // --- 2.17.1 REQ-02 (R02): WT-ID + предикат isVisible во всех ветвях отбора (design §3.2) ---

  /** Валидный WT-ID-токен (12 hex) — как его вычисляет resolveMemoryRoot().worktree. */
  const OWN_HASH = 'w-0123456789ab';

  it('WT-ID-scoped объект доставлен в своей копии (bare и полный токен), скрыт из main и чужой копии', async () => {
    await seed(
      makeObj({
        id: 'inj_wt',
        type: 'call-injection',
        status: 'active',
        scope: `worktree:${OWN_HASH}`,
        title: 'Worktree only',
        body: 'x'.repeat(200),
      })
    );

    const bare = await getCallInjections({ store, clock }, { currentScope: OWN_HASH });
    expect(bare.deliveredIds).toEqual(['inj_wt']);
    expect(bare.hidden).toBeNull();

    const full = await getCallInjections({ store, clock }, { currentScope: `worktree:${OWN_HASH}` });
    expect(full.deliveredIds).toEqual(['inj_wt']);

    const fromMain = await getCallInjections({ store, clock }, { currentScope: 'main' });
    expect(fromMain.blocks).toEqual([]);
    expect(fromMain.hidden).toEqual({ scope: 'main', count: 1 });
    expect(fromMain.poolSize).toBe(1);

    // R2-01 fallthrough: чужой хеш уходит в legacy-разбор — seam держит тест
    // герметичным (без реального git worktree list в process.cwd())
    const otherCopy = await getCallInjections(
      { store, clock, resolveIdentity: () => ident('wt-copy', true) },
      { currentScope: 'w-fedcba987654' }
    );
    expect(otherCopy.blocks).toEqual([]);
    expect(otherCopy.hidden).toEqual({ scope: 'w-fedcba987654', count: 1 });

    // currentScope не передан (MCP-канал) — трактуется как main
    const noScope = await getCallInjections({ store, clock }, {});
    expect(noScope.blocks).toEqual([]);
    expect(noScope.hidden).toEqual({ scope: 'main', count: 1 });
  });

  it('WP3: без worktree-scope в пуле hidden = null, poolSize считает до фильтров', async () => {
    await seed(
      makeObj({ id: 'inj_A', type: 'call-injection', status: 'active', trigger_keywords: ['a'], title: 'AAA' })
    );

    const result = await getCallInjections({ store, clock }, { currentScope: 'main' });
    expect(result.blocks).toHaveLength(1);
    expect(result.hidden).toBeNull();
    expect(result.poolSize).toBe(1);
  });

  // --- 2.17.1 REQ-02 (R02), NFR-01: legacy-токен worktree:<name> через identity ---

  const ident = (legacyName: string, legacyUnique: boolean) => ({
    id: `worktree:${OWN_HASH}`,
    legacyName,
    legacyUnique,
  });

  it('NFR-01/S-10: однозначный legacy-токен доставлен своей копии, чужое legacy-имя скрыто', async () => {
    await seed(
      makeObj({
        id: 'inj_legacy_own',
        type: 'call-injection',
        status: 'active',
        scope: 'worktree:wt-a',
        title: 'Own legacy fact',
        body: 'x'.repeat(100),
      }),
      makeObj({
        id: 'inj_legacy_foreign',
        type: 'call-injection',
        status: 'active',
        scope: 'worktree:wt-b',
        title: 'Foreign legacy fact',
        body: 'y'.repeat(100),
      })
    );

    const inW = await getCallInjections(
      { store, clock, resolveIdentity: () => ident('wt-a', true) },
      { currentScope: OWN_HASH }
    );
    expect(inW.deliveredIds).toEqual(['inj_legacy_own']);
    expect(inW.scopeConflicts).toEqual([]);
  });

  it('S-13/S-16: неоднозначное legacy-имя — скрыто, конфликт в scopeConflicts + stderr', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await seed(
        makeObj({
          id: 'inj_amb',
          type: 'call-injection',
          status: 'active',
          scope: 'worktree:task',
          title: 'Ambiguous legacy fact',
          body: 'x'.repeat(100),
        })
      );

      const r = await getCallInjections(
        { store, clock, resolveIdentity: () => ident('task', false) },
        { currentScope: OWN_HASH }
      );
      expect(r.blocks).toEqual([]);
      expect(r.hidden).toEqual({ scope: OWN_HASH, count: 1 });
      expect(r.scopeConflicts).toEqual(['worktree:task']);
      expect(err).toHaveBeenCalledWith(expect.stringContaining('worktree:task'));
    } finally {
      err.mockRestore();
    }
  });

  it('S-14: identity null при legacy-токене — fail-closed, доставки нет + предупреждение (design §5)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await seed(
        makeObj({
          id: 'inj_legacy',
          type: 'call-injection',
          status: 'active',
          scope: 'worktree:wt-a',
          title: 'Legacy fact',
          body: 'x'.repeat(100),
        })
      );

      const r = await getCallInjections({ store, clock, resolveIdentity: () => null }, { currentScope: OWN_HASH });
      expect(r.blocks).toEqual([]);
      expect(r.scopeConflicts).toEqual([]);
      // MINOR-2 (design §5): fs-парс .git успешен (WT-ID копии известен), но
      // git worktree list упал → fail-closed скрытие обязано предупреждать, не молчать
      expect(err).toHaveBeenCalledWith(expect.stringContaining('metadata unavailable'));
    } finally {
      err.mockRestore();
    }
  });

  // --- 2.17.1 REQ-02 (R02), design §3.2 R2-01: чужой WT-ID-токен — общий legacy-разбор ---

  it('R2-01: чужой WT-ID-токен маппится по basename (каталог, названный w-<12hex>), не скрыт молча', async () => {
    await seed(
      makeObj({
        id: 'inj_hash_named',
        type: 'call-injection',
        status: 'active',
        scope: 'worktree:w-fedcba987654',
        title: 'Hash-named dir fact',
        body: 'x'.repeat(100),
      })
    );

    // копия живёт в каталоге w-fedcba987654 — легаси-разбор видит совпадение basename
    const r = await getCallInjections(
      { store, clock, resolveIdentity: () => ident('w-fedcba987654', true) },
      { currentScope: OWN_HASH }
    );
    expect(r.deliveredIds).toEqual(['inj_hash_named']);
    expect(r.scopeConflicts).toEqual([]);
  });

  it('R2-01: чужой WT-ID-токен при неоднозначном basename — честный конфликт, не тихое скрытие', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await seed(
        makeObj({
          id: 'inj_hash_amb',
          type: 'call-injection',
          status: 'active',
          scope: 'worktree:w-fedcba987654',
          title: 'Ambiguous hash-named fact',
          body: 'x'.repeat(100),
        })
      );

      const r = await getCallInjections(
        { store, clock, resolveIdentity: () => ident('w-fedcba987654', false) },
        { currentScope: OWN_HASH }
      );
      expect(r.blocks).toEqual([]);
      expect(r.scopeConflicts).toEqual(['worktree:w-fedcba987654']);
      expect(err).toHaveBeenCalledWith(expect.stringContaining('worktree:w-fedcba987654'));
    } finally {
      err.mockRestore();
    }
  });

  // --- 2.17.1 REQ-02 (R02), ADR-2: чужой объект не доходит НИ ОДНОЙ ветвью отбора ---

  it('S-12: 5 ветвей отбора — чужой worktree-scoped объект скрыт в каждой; позитивный контроль доставляется', async () => {
    const FOREIGN = 'worktree:w-fedcba987654';
    await seed(
      // ветвь 1: call-injections/alias-note
      makeObj({
        id: 'inj_foreign',
        type: 'call-injection',
        status: 'active',
        scope: FOREIGN,
        trigger_keywords: ['deploy'],
        title: 'Foreign injection',
        body: 'x'.repeat(100),
      }),
      // ветвь 2: keyword-уроки
      makeObj({
        id: 'lesson_foreign',
        type: 'lesson',
        status: 'active',
        scope: FOREIGN,
        trigger_keywords: ['deploy'],
        title: 'Foreign lesson',
        body: '',
      }),
      // ветвь 3: keyword-правила
      makeObj({
        id: 'rule_kw_foreign',
        type: 'rule',
        status: 'active',
        scope: FOREIGN,
        trigger_keywords: ['deploy'],
        title: 'Foreign keyword rule',
        body: '',
      }),
      // ветвь 4 (fallback): правило без keywords
      makeObj({
        id: 'rule_fallback_foreign',
        type: 'rule',
        status: 'active',
        scope: FOREIGN,
        title: 'Foreign fallback rule',
        body: '',
      }),
      // ветвь 5: thread-блокер
      makeObj({
        id: 'blocker_foreign',
        type: 'note',
        facet: 'pitfall',
        status: 'active',
        scope: FOREIGN,
        thread: 'mem_t1',
        title: 'Foreign blocker',
        impact: 'blocks work',
        body: '',
      }),
      // позитивные контроли (AC-4): main/project-scoped доставляются как раньше
      makeObj({
        id: 'rule_project',
        type: 'rule',
        status: 'active',
        scope: 'project',
        title: 'Project rule',
        body: '',
      }),
      makeObj({
        id: 'blocker_own',
        type: 'note',
        facet: 'pitfall',
        status: 'active',
        thread: 'mem_t1',
        title: 'Own thread blocker',
        impact: 'blocks work',
        body: '',
      })
    );

    const inCopy = await getCallInjections(
      { store, clock, resolveIdentity: () => ident('wt-copy', true) },
      { topic: 'deploy', thread: 'mem_t1', currentScope: OWN_HASH }
    );
    const all = inCopy.blocks.join('\n');
    expect(all).not.toContain('inj_foreign');
    expect(all).not.toContain('lesson_foreign');
    expect(all).not.toContain('rule_kw_foreign');
    expect(all).not.toContain('blocker_foreign');
    expect(all).toContain('rule_project');
    expect(all).toContain('blocker_own');

    // fallback-ветвь: топик без совпадений — чужое правило не подтягивается, своё — да
    const fallback = await getCallInjections(
      { store, clock, resolveIdentity: () => ident('wt-copy', true) },
      { topic: 'zzz-no-match', currentScope: OWN_HASH }
    );
    expect(fallback.blocks.join('\n')).not.toContain('rule_fallback_foreign');
    expect(fallback.blocks.join('\n')).toContain('rule_project');

    // из main чужие объекты тоже не видны
    const fromMain = await getCallInjections({ store, clock }, { topic: 'deploy', thread: 'mem_t1' });
    const mainAll = fromMain.blocks.join('\n');
    expect(mainAll).not.toContain('foreign');
    expect(mainAll).toContain('rule_project');
    expect(mainAll).toContain('blocker_own');
  });

  // --- WP5 §14.4 (волна 2.16): пустой call объясняет себя — topic-кейс ---

  it('WP5: topic-miss — blocks пуст при непустом пуле, hidden null', async () => {
    await seed(
      makeObj({
        id: 'inj_topic',
        type: 'call-injection',
        status: 'active',
        trigger_keywords: ['gitflow'],
        title: 'Gitflow rule',
        body: 'x'.repeat(200),
      })
    );

    const result = await getCallInjections({ store, clock }, { topic: 'zzz-no-match' });
    expect(result.blocks).toEqual([]);
    expect(result.poolSize).toBe(1);
    expect(result.hidden).toBeNull();
  });
});
