import { describe, it, expect } from 'vitest';
import { toolStats } from '../../../src/app/use-cases/tool-stats.js';
import { MemoryStore } from '../../../src/ports/memory-store.port.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';
import type { SignalEvent } from '../../../src/adapters/fs/session-metrics-log.js';

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

function runSignal(weighted: number, tools?: string[], model = 'glm'): SignalEvent {
  return {
    ts: '2026-09-04T00:00:00.000Z',
    event: 'run',
    session_id: 's1',
    gen_ai: { modelID: model, agent: 'a' },
    orchestration: { task: 't', actor: 'user:cli' },
    weighted,
    ...(tools !== undefined ? { tools } : {}),
  };
}

const RUN_LOG = [
  JSON.stringify({ weighted: 100, tools: ['my-tool'] }),
  JSON.stringify({ weighted: 200, tools: ['my-tool'] }),
  JSON.stringify({ weighted: 300, tools: ['my-tool'] }),
  JSON.stringify({ weighted: 900 }),
  JSON.stringify({ weighted: 1000 }),
].join('\n');

describe('toolStats (C3: экономика переиспользования; P1 D4 — сигнальный источник)', () => {
  it('пустые сигналы + null runLogText → insufficient с reason от analyzeEconomy', async () => {
    const result = await toolStats({ store: mockStore([]) }, { signals: [], runLogText: null });
    expect(result.economy.sufficient).toBe(false);
    expect(result.economy.reason).toContain('not enough data');
    expect(result.economy.toolRuns).toBe(0);
    expect(result.economy.totalRuns).toBe(0);
    expect(result.economy.medianAll).toBeNull();
  });

  it('run-сигналы с tools (v2) → sufficient без run-log вовсе', async () => {
    const signals = [
      runSignal(10, ['wolf-search']),
      runSignal(20, ['wolf-search']),
      runSignal(30, ['wolf-search']),
      runSignal(400),
      runSignal(500),
    ];
    const result = await toolStats({ store: mockStore([]) }, { signals, runLogText: null });
    expect(result.economy.sufficient).toBe(true);
    expect(result.economy.toolRuns).toBe(3);
    expect(result.economy.totalRuns).toBe(5);
    expect(result.economy.medianTool).toBe(20);
    expect(result.economy.medianAll).toBe(30);
  });

  it('переходный мерж: сигналы + legacy run-log → entries обоих источников', async () => {
    const signals = [runSignal(1, ['x']), runSignal(2, ['x']), runSignal(3, ['x'])];
    const result = await toolStats({ store: mockStore([]) }, { signals, runLogText: RUN_LOG });
    expect(result.economy.sufficient).toBe(true);
    // toolRuns: 3 сигнальных (tools:['x']) + 3 legacy (tools:['my-tool']);
    // totalRuns: 3 сигнальных + 5 legacy
    expect(result.economy.toolRuns).toBe(6);
    expect(result.economy.totalRuns).toBe(8);
  });

  it('только legacy run-log → sufficient по данным (compat без сигналов)', async () => {
    const result = await toolStats({ store: mockStore([]) }, { signals: [], runLogText: RUN_LOG });
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
      { signals: [], runLogText: null }
    );
    expect(result.tools).toEqual([
      { id: 'a', name: 'a-tool', status: 'candidate', usage_count: 0, last_used_at: null },
      { id: 'b', name: 'z-tool', status: 'active', usage_count: 4, last_used_at: null },
    ]);
  });
});
