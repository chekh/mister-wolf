import { describe, it, expect, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { ProjectsRegistry } from '../../../src/adapters/fs/projects-registry.js';
import { buildProjectsList, renderProjectsList, formatBytes } from '../../../src/app/use-cases/build-projects-list.js';

// P330/2.14 §11.4 (юнит вычислений): фиксированные mtime через utimesSync,
// «сейчас» — контролируемая дата рендера. Активное окно 7д (константа §8.1).
const NOW = new Date('2026-09-30T12:00:00.000Z');
const RECENT = new Date('2026-09-29T12:00:00.000Z'); // 1д назад — активен
const OLD = new Date('2026-09-01T12:00:00.000Z'); // 29д назад — не активен

const dirs: string[] = [];
function tmpDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

/** Живой проект: .wolf/memory с events.jsonl заданного размера и mtime (+ вложенный файл). */
function liveProject(eventsBytes: number, mtime: Date, extraBytes = 0): string {
  const dir = tmpDir('wolf-projects-unit-');
  const memDir = join(dir, '.wolf', 'memory');
  mkdirSync(memDir, { recursive: true });
  writeFileSync(join(memDir, 'events.jsonl'), 'x'.repeat(eventsBytes));
  if (extraBytes > 0) {
    mkdirSync(join(memDir, 'shared', 'decisions'), { recursive: true });
    writeFileSync(join(memDir, 'shared', 'decisions', 'mem_x.md'), 'y'.repeat(extraBytes));
  }
  utimesSync(join(memDir, 'events.jsonl'), mtime, mtime);
  return dir;
}

describe('buildProjectsList (P330/2.14 §8.1: вычисляемая статистика реестра)', () => {
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it('вычисляет имя/версию/активность/размер; отсутствующий путь — missing', async () => {
    const registry = new ProjectsRegistry(tmpDir('wolf-projects-cfg-'));
    const fresh = liveProject(1000, RECENT, 24);
    const stale = liveProject(500, OLD);
    const gone = join(tmpDir('wolf-projects-gone-'), 'deleted-subdir');
    await registry.register(fresh, 2);
    await registry.register(stale, 1);
    await registry.register(gone, 2);

    const rows = await buildProjectsList({ registry });
    expect(rows).toHaveLength(3);
    const byPath = Object.fromEntries(rows.map((r) => [r.path, r]));

    expect(byPath[fresh]).toMatchObject({
      name: basename(fresh),
      schemaVersion: 2,
      lastActivity: RECENT,
      memoryBytes: 1024,
      missing: false,
    });
    expect(byPath[stale]).toMatchObject({ schemaVersion: 1, lastActivity: OLD, memoryBytes: 500, missing: false });
    expect(byPath[gone]).toMatchObject({ lastActivity: null, memoryBytes: null, missing: true });
  });

  it('сортировка по активности: свежие сверху, без лога ниже, missing в конец', async () => {
    const registry = new ProjectsRegistry(tmpDir('wolf-projects-cfg-'));
    const fresh = liveProject(10, RECENT);
    const stale = liveProject(10, OLD);
    const noEvents = tmpDir('wolf-projects-unit-'); // живой путь, events.jsonl нет
    mkdirSync(join(noEvents, '.wolf', 'memory'), { recursive: true });
    const gone = join(tmpDir('wolf-projects-gone-'), 'nope');
    for (const [p, v] of [
      [stale, 2],
      [gone, 2],
      [fresh, 2],
      [noEvents, 2],
    ] as const) {
      await registry.register(p, v);
    }

    const rows = await buildProjectsList({ registry });
    expect(rows.map((r) => r.path)).toEqual([fresh, stale, noEvents, gone]);
  });

  it('рендер: таблица с missing-строкой и сводкой «проектов N | активны за 7д: K | размер»', () => {
    const fresh = liveProject(1000, RECENT);
    const stale = liveProject(500, OLD);
    const noEvents = tmpDir('wolf-projects-unit-');
    mkdirSync(join(noEvents, '.wolf', 'memory'), { recursive: true });
    const rows = [
      {
        name: 'gone',
        path: '/definitely/gone',
        schemaVersion: null,
        lastActivity: null,
        memoryBytes: null,
        missing: true,
      },
      { name: 'stale', path: stale, schemaVersion: 1, lastActivity: OLD, memoryBytes: 500, missing: false },
      { name: 'fresh', path: fresh, schemaVersion: 2, lastActivity: RECENT, memoryBytes: 1000, missing: false },
      { name: 'noevents', path: noEvents, schemaVersion: 2, lastActivity: null, memoryBytes: 0, missing: false },
    ];
    const { table, summary } = renderProjectsList(rows, NOW);
    // порядок в таблице = сортировка из билдера применяется в команде; здесь — как передали
    expect(table).toContain('имя');
    expect(table).toContain('размер памяти');
    expect(table).toContain('missing');
    expect(table).toContain('1000 B');
    expect(table).toContain('2026-09-29');
    expect(summary).toBe('проектов 4 | активны за 7д: 1 | суммарный размер памяти: 1.5 KB');
  });

  it('formatBytes: B без дробей, KB/MB с одной десятичной', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });
});
