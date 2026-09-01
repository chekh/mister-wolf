import { describe, it, expect } from 'vitest';
import { runDoctor } from '../../../src/app/use-cases/doctor.js';
import { CURRENT_SCHEMA_VERSION } from '../../../src/adapters/fs/schema-version.js';
import type { PlatformAdapter } from '../../../src/ports/platform-adapter.port.js';

/** Fake-адаптер: detect по списку путей, конфиг с/без wolf-записи. */
function fakeAdapter(id: string, detectedPaths: string[], wolfInPaths: string[] = []): PlatformAdapter {
  return {
    id,
    detect: (root: string) => detectedPaths.includes(root),
    readConfig: async (root: string) =>
      detectedPaths.includes(root) ? { mcp: wolfInPaths.includes(root) ? { wolf: {} } : {} } : null,
    writeConfig: async () => ({ action: 'written' as const }),
    removeWolf: async () => false,
  } as PlatformAdapter;
}

function makeDeps(
  rows: { path: string; schema_version: number }[],
  existing: string[],
  adapters: PlatformAdapter[] = []
) {
  return {
    registry: {
      list: async () => rows.map((r) => ({ ...r, initialized_at: '2026-08-30T00:00:00.000Z' })),
      remove: async (path: string) => {
        const before = rows.length;
        const idx = rows.findIndex((r) => r.path === path);
        if (idx >= 0) rows.splice(idx, 1);
        return before !== rows.length;
      },
    },
    readSchema: async (path: string) => rows.find((r) => r.path === path)?.schema_version ?? null,
    exists: async (path: string) => existing.includes(path),
    adapters,
  };
}

describe('runDoctor (спека §3: версия бинаря vs схема, валидность конфигов платформ, чистка)', () => {
  it('ok for a current project', async () => {
    const deps = makeDeps([{ path: '/a', schema_version: CURRENT_SCHEMA_VERSION }], ['/a']);
    const report = await runDoctor(deps);
    expect(report.binarySchemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(report.entries).toEqual([{ path: '/a', status: 'ok', schemaVersion: CURRENT_SCHEMA_VERSION, issues: [] }]);
    expect(report.pruned).toEqual([]);
  });

  it('outdated-binary when project schema is newer (обнови wolf)', async () => {
    const deps = makeDeps([{ path: '/a', schema_version: CURRENT_SCHEMA_VERSION + 1 }], ['/a']);
    const report = await runDoctor(deps);
    expect(report.entries[0].status).toBe('outdated-binary');
  });

  it('outdated-project when project schema is legacy (ленивая миграция при следующей команде)', async () => {
    const deps = makeDeps([{ path: '/a', schema_version: 1 }], ['/a']);
    const report = await runDoctor(deps);
    expect(report.entries[0].status).toBe('outdated-project');
  });

  it('no schema/config at all (readSchema → null) → not-initialized, same semantics as guard (init, не миграция)', async () => {
    const deps = { ...makeDeps([{ path: '/a', schema_version: 1 }], ['/a']), readSchema: async () => null };
    const report = await runDoctor(deps);
    expect(report.entries[0].status).toBe('not-initialized');
    expect(report.entries[0].schemaVersion).toBeNull();
  });

  it('missing path → pruned from registry', async () => {
    const deps = makeDeps([{ path: '/gone', schema_version: CURRENT_SCHEMA_VERSION }], []);
    const report = await runDoctor(deps);
    expect(report.entries[0].status).toBe('missing');
    expect(report.pruned).toEqual(['/gone']);
  });

  it('empty registry → empty report', async () => {
    const deps = makeDeps([], []);
    const report = await runDoctor(deps);
    expect(report.entries).toEqual([]);
    expect(report.pruned).toEqual([]);
  });

  it('detected platform without wolf entry → issue with re-init hint (валидность конфигов платформ)', async () => {
    const adapter = fakeAdapter('opencode', ['/a'], []); // платформа есть, wolf-записи нет
    const deps = makeDeps([{ path: '/a', schema_version: CURRENT_SCHEMA_VERSION }], ['/a'], [adapter]);
    const report = await runDoctor(deps);
    expect(report.entries[0].issues).toEqual(['opencode: wolf entry missing — run wolf init']);
  });

  it('detected platform with wolf entry → no issues', async () => {
    const adapter = fakeAdapter('opencode', ['/a'], ['/a']);
    const deps = makeDeps([{ path: '/a', schema_version: CURRENT_SCHEMA_VERSION }], ['/a'], [adapter]);
    const report = await runDoctor(deps);
    expect(report.entries[0].issues).toEqual([]);
  });
});
