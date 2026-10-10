import { describe, it, expect } from 'vitest';
import { repairStorage, type RepairDeps } from '../../../src/app/use-cases/repair-storage.js';

/** Фикстура: 2 объекта в markdown; журнал — 1 валидный added, 1 dangling,
 * опционально битая строка. appended-события видны readEventLines (идемпотентность). */
function fixture(opts: { broken?: boolean } = {}) {
  const objects = [
    {
      id: 'mem_20260101__a_abc123',
      type: 'note',
      created_at: '2026-01-01T00:00:00.000Z',
      created_by: 'user:x',
      tags: ['t'],
    },
    {
      id: 'mem_20260101__b_def456',
      type: 'note',
      created_at: '2026-01-02T00:00:00.000Z',
      created_by: 'user:y',
      tags: [],
    },
  ];
  const lines: string[] = [
    JSON.stringify({ type: 'memory.added', payload: { memory_id: 'mem_20260101__a_abc123' } }),
    JSON.stringify({ type: 'memory.added', payload: { memory_id: 'mem_20260101__gone_999999' } }),
    ...(opts.broken ? ['{"type": "memory.added", broken'] : []),
  ];
  const rebuilds = { n: 0 }; // box: number в return копируется по значению — замыкание должно быть видно
  const deps: RepairDeps = {
    store: { list: async () => objects } as never,
    log: { append: async (e: object) => void lines.push(JSON.stringify(e)) } as never,
    clock: { now: () => new Date('2026-10-10T00:00:00.000Z') } as never,
    idGen: { generateEventId: () => 'evt_test' } as never,
    index: {
      rebuild: async () => {
        rebuilds.n += 1;
      },
    } as never,
    readEventLines: async () => lines,
  };
  return { deps, lines, rebuilds };
}

describe('repairStorage (WP4)', () => {
  it('dry-run prints the plan without writing', async () => {
    const d = fixture();
    const report = await repairStorage(d.deps, { dryRun: true });
    expect(report.actions.join('\n')).toContain('rebuild from 2');
    expect(report.actions.join('\n')).toContain('backfill 1');
    expect(report.eventsAppended).toBe(1);
    expect(d.lines.length).toBe(2); // ничего не дописано
    expect(d.rebuilds.n).toBe(0);
  });

  it('apply backfills missing memory.added from markdown and rebuilds the index', async () => {
    const d = fixture();
    const report = await repairStorage(d.deps, { dryRun: false });
    expect(report.reindexed).toBe(2);
    expect(d.rebuilds.n).toBe(1);
    expect(report.eventsAppended).toBe(1);
    const backfilled = JSON.parse(d.lines[2]) as { timestamp: string; type: string };
    expect(backfilled.type).toBe('memory.added');
    expect(backfilled.timestamp).toBe('2026-01-02T00:00:00.000Z');
  });

  it('re-run is a no-op (idempotent)', async () => {
    const d = fixture();
    await repairStorage(d.deps, { dryRun: false });
    const report = await repairStorage(d.deps, { dryRun: false });
    expect(report.eventsAppended).toBe(0);
    expect(report.actions.join('\n')).toContain('nothing to repair');
  });

  it('damaged journal line is tolerated', async () => {
    const d = fixture({ broken: true });
    const report = await repairStorage(d.deps, { dryRun: false });
    expect(report.eventsAppended).toBe(1);
  });

  it('dangling events are counted, never deleted', async () => {
    const d = fixture();
    const report = await repairStorage(d.deps, { dryRun: false });
    expect(report.danglingEvents).toBe(1);
    expect(d.lines.some((l) => l.includes('mem_20260101__gone_999999'))).toBe(true);
  });
});
