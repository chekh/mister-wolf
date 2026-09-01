// tests/unit/use-cases/model-routing.test.ts
import { describe, expect, it } from 'vitest';
import { findModelRouting, parseModelRouting, upsertModelRouting } from '../../../src/app/use-cases/model-routing.js';
import type { ModelRoutingDeps } from '../../../src/app/use-cases/model-routing.js';
import type { MemoryStore } from '../../../src/ports/memory-store.port.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

class FakeStore implements MemoryStore {
  objects = new Map<string, MemoryObject>();
  async save(o: MemoryObject): Promise<void> {
    this.objects.set(o.id, { ...o });
  }
  async get(id: string): Promise<MemoryObject | null> {
    return this.objects.get(id) ?? null;
  }
  async list(filters?: { type?: string; status?: string }): Promise<MemoryObject[]> {
    let arr = [...this.objects.values()];
    if (filters?.type) arr = arr.filter((o) => o.type === filters.type);
    if (filters?.status) arr = arr.filter((o) => o.status === filters.status);
    return arr;
  }
  async update(id: string, patch: Partial<MemoryObject>): Promise<MemoryObject> {
    const existing = this.objects.get(id);
    if (!existing) throw new Error(`not found: ${id}`);
    const updated = { ...existing, ...patch };
    this.objects.set(id, updated);
    return updated;
  }
}

let counter = 0;
function makeDeps(): { deps: ModelRoutingDeps; store: FakeStore } {
  const store = new FakeStore();
  counter = 0;
  const deps: ModelRoutingDeps = {
    store,
    log: { append: async () => {}, readAll: async () => [] },
    clock: { now: () => new Date('2026-09-01T00:00:00Z') },
    idGen: {
      generateMemoryId: () => `mem_20260901_rout_aa000${counter++}`,
      generateEventId: () => `evt_${counter++}`,
    },
  };
  return { deps, store };
}

function ruleObj(overrides: Partial<MemoryObject> = {}): MemoryObject {
  return {
    id: 'mem_20260901_old_aa0009',
    type: 'rule',
    title: 'Routing: модели агентов',
    status: 'active',
    review_state: 'accepted',
    confidence: 'high',
    importance: 0.9,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    created_by: 'wolf-init',
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: ['wolf-routing', 'models'],
    superseded_by: null,
    body: 'primary: old/p\nworker: old/w\n',
    memory_class: 'working',
    truth_role: 'source_of_truth',
    lifetime: 'long_term',
    scope: 'project',
    ...overrides,
  } as MemoryObject;
}

describe('findModelRouting', () => {
  it('находит активный rule с обоими тегами', async () => {
    const { store } = makeDeps();
    await store.save(ruleObj());
    expect((await findModelRouting(store))?.id).toBe('mem_20260901_old_aa0009');
  });
  it('игнорирует superseded, частичные теги и чужие типы', async () => {
    const { store } = makeDeps();
    await store.save(ruleObj({ id: 'mem_20260901_s1_aa0001', status: 'superseded' }));
    await store.save(ruleObj({ id: 'mem_20260901_s2_aa0002', tags: ['wolf-routing'] }));
    await store.save(ruleObj({ id: 'mem_20260901_s3_aa0003', type: 'decision', tags: ['wolf-routing', 'models'] }));
    expect(await findModelRouting(store)).toBeNull();
  });
});

describe('parseModelRouting', () => {
  it('читает машинно-читаемые строки primary/worker из body', () => {
    expect(parseModelRouting(ruleObj())).toEqual({ primary: 'old/p', worker: 'old/w' });
  });
  it('нет одной из строк → null', () => {
    expect(parseModelRouting(ruleObj({ body: 'primary: x\n' }))).toBeNull();
    expect(parseModelRouting(ruleObj({ body: 'нет строк' }))).toBeNull();
  });
});

describe('upsertModelRouting', () => {
  it('нет объекта → created: rule, теги, working, scope project, body со строками', async () => {
    const { deps, store } = makeDeps();
    const res = await upsertModelRouting(deps, { primary: 'p/m1', worker: 'w/m1' }, 'wolf-init');
    expect(res.action).toBe('created');
    const obj = await store.get(res.id);
    expect(obj?.type).toBe('rule');
    expect(obj?.status).toBe('active');
    expect(obj?.tags).toEqual(['wolf-routing', 'models']);
    expect(obj?.memory_class).toBe('working');
    expect((obj as { scope?: string } | null)?.scope).toBe('project');
    expect(obj?.body).toContain('primary: p/m1');
    expect(obj?.body).toContain('worker: w/m1');
    expect(parseModelRouting(obj!)).toEqual({ primary: 'p/m1', worker: 'w/m1' });
  });
  it('совпадающие значения → unchanged, новый объект не создаётся', async () => {
    const { deps, store } = makeDeps();
    await store.save(ruleObj({ body: 'primary: p/m1\nworker: w/m1\n' }));
    const res = await upsertModelRouting(deps, { primary: 'p/m1', worker: 'w/m1' }, 'wolf-init');
    expect(res.action).toBe('unchanged');
    expect(res.id).toBe('mem_20260901_old_aa0009');
    expect(store.objects.size).toBe(1);
  });
  it('иные значения → superseded: старый погашен и ссылается на новый, активный один', async () => {
    const { deps, store } = makeDeps();
    await store.save(ruleObj());
    const res = await upsertModelRouting(deps, { primary: 'p/m2', worker: 'w/m2' }, 'wolf-init');
    expect(res.action).toBe('superseded');
    expect(res.supersededId).toBe('mem_20260901_old_aa0009');
    const old = await store.get('mem_20260901_old_aa0009');
    expect(old?.status).toBe('superseded');
    expect(old?.superseded_by).toBe(res.id);
    const active = await findModelRouting(store);
    expect(active?.id).toBe(res.id);
    expect(parseModelRouting(active!)).toEqual({ primary: 'p/m2', worker: 'w/m2' });
  });
});
