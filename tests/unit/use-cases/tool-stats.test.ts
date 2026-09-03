import { describe, it, expect } from 'vitest';
import { toolStats } from '../../../src/app/use-cases/tool-stats.js';
import { MemoryStore } from '../../../src/ports/memory-store.port.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

type Extra = Record<string, unknown>;

function mockStore(objects: Extra[]): MemoryStore {
  return {
    async list(filters) {
      return objects.filter((o) => (filters?.type ? o.type === filters.type : true)) as MemoryObject[];
    },
    async save() {
      throw new Error('not implemented');
    },
    async get() {
      return null;
    },
    async update() {
      throw new Error('not implemented');
    },
  };
}

const RUN_LOG = [
  JSON.stringify({ weighted: 100, tools: ['my-tool'] }),
  JSON.stringify({ weighted: 200, tools: ['my-tool'] }),
  JSON.stringify({ weighted: 300, tools: ['my-tool'] }),
  JSON.stringify({ weighted: 900 }),
  JSON.stringify({ weighted: 1000 }),
].join('\n');

describe('toolStats (C3: экономика переиспользования)', () => {
  it('runLogText null → sufficient false, reason про отсутствующий run-log', async () => {
    const result = await toolStats({ store: mockStore([]) }, { runLogText: null });
    expect(result.economy.sufficient).toBe(false);
    expect(result.economy.reason).toContain('run-log missing');
    expect(result.economy.toolRuns).toBe(0);
    expect(result.economy.totalRuns).toBe(0);
    expect(result.economy.medianAll).toBeNull();
  });

  it('с текстом run-log → sufficient по данным', async () => {
    const result = await toolStats({ store: mockStore([]) }, { runLogText: RUN_LOG });
    expect(result.economy.sufficient).toBe(true);
    expect(result.economy.toolRuns).toBe(3);
    expect(result.economy.totalRuns).toBe(5);
    expect(result.economy.medianTool).toBe(200);
    expect(result.economy.medianAll).toBe(300);
  });

  it('tools: сортировка по name, отсутствующие usage_count/last_used_at → 0/null', async () => {
    const result = await toolStats(
      {
        store: mockStore([
          { type: 'tool', id: 'b', title: 'B', status: 'active', name: 'z-tool', usage_count: 4 },
          { type: 'tool', id: 'a', title: 'A', status: 'candidate', name: 'a-tool' },
          { type: 'decision', id: 'd', title: 'D', status: 'active' },
        ]),
      },
      { runLogText: null }
    );
    expect(result.tools).toEqual([
      { id: 'a', name: 'a-tool', status: 'candidate', usage_count: 0, last_used_at: null },
      { id: 'b', name: 'z-tool', status: 'active', usage_count: 4, last_used_at: null },
    ]);
  });
});
