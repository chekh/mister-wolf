import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getCallInjections } from '../../../src/app/use-cases/get-call-injections.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlRelationLog } from '../../../src/adapters/fs/jsonl-relation-log.js';

// 2.14 §7.1 (триггер 2): banner неагрегированных уроков в call-выводе;
// фикстуры — прецедент get-call-injections.test.ts. Banner считается по ВСЕМ
// объектам (не по matched-блокам) — проверяется без topic.
const NOW = new Date('2026-09-30T00:00:00.000Z');
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

describe('getCallInjections banner (unaggregated lessons)', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let relations: JsonlRelationLog;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-call-banner-'));
    store = new MarkdownMemoryStore(dir);
    relations = new JsonlRelationLog(join(dir, 'relations.jsonl'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('3 зрелых урока → banner со счётчиком и вызовом Стюарда', async () => {
    await store.save(makeObj({ id: 'lesson_1', type: 'lesson', status: 'active', title: 'L1' }) as any);
    await store.save(makeObj({ id: 'lesson_2', type: 'lesson', status: 'active', title: 'L2' }) as any);
    await store.save(makeObj({ id: 'lesson_3', type: 'lesson', status: 'active', title: 'L3' }) as any);

    const result = await getCallInjections({ store, clock, relations }, {});

    expect(result.banner).toContain('неагрегированных уроков: 3');
    expect(result.banner).toContain('(зрелых: 3)');
    expect(result.banner).toContain('opencode run --agent steward');
  });

  it('2 свежих урока → banner null', async () => {
    await store.save(
      makeObj({ id: 'lesson_1', type: 'lesson', status: 'active', created_at: daysAgo(0), title: 'L1' }) as any
    );
    await store.save(
      makeObj({ id: 'lesson_2', type: 'lesson', status: 'active', created_at: daysAgo(0), title: 'L2' }) as any
    );

    const result = await getCallInjections({ store, clock, relations }, {});

    expect(result.banner).toBeNull();
  });

  it('relations не передан (MCP-канал) → banner null', async () => {
    await store.save(makeObj({ id: 'lesson_1', type: 'lesson', status: 'active', title: 'L1' }) as any);

    const result = await getCallInjections({ store, clock }, {});

    expect(result.banner).toBeNull();
  });
});
