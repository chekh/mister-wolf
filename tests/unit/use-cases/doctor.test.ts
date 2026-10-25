import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runDoctor } from '../../../src/app/use-cases/doctor.js';
import { CURRENT_SCHEMA_VERSION } from '../../../src/adapters/fs/schema-version.js';
import { OpencodeAdapter } from '../../../src/adapters/platforms/opencode-adapter.js';
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

  it('D-7: detectMismatch добавляет issue-строки в entry', async () => {
    const deps = {
      ...makeDeps([{ path: '/a', schema_version: CURRENT_SCHEMA_VERSION }], ['/a']),
      detectMismatch: async () => [
        'opencode: installed under v1 (set 2.14.0 < 2.14.1), runtime v2 — run wolf doctor --repair',
      ],
    };
    const report = await runDoctor(deps);
    expect(report.entries[0].issues).toContainEqual(expect.stringContaining('--repair'));
  });

  it('D-8: без detectMismatch поведение прежнее (обратная совместимость фейков)', async () => {
    const deps = makeDeps([{ path: '/a', schema_version: CURRENT_SCHEMA_VERSION }], ['/a']);
    const report = await runDoctor(deps);
    expect(report.entries[0].issues).toEqual([]);
  });

  it('R04-3 (§4.14): после починки mcp.wolf (writeConfig — тот же вызов, что в init) совет исчезает', async () => {
    const proj = mkdtempSync(join(tmpdir(), 'wolf-doctor-repair-'));
    try {
      writeFileSync(join(proj, 'opencode.json'), '{"theme":"system"}\n');
      const adapter = new OpencodeAdapter();
      const deps = makeDeps([{ path: proj, schema_version: CURRENT_SCHEMA_VERSION }], [proj], [adapter]);

      const before = await runDoctor(deps);
      expect(before.entries[0]!.issues).toEqual(['opencode: wolf entry missing — run wolf init']);

      // §4.14: init без --platform чинит запись этим же вызовом (см. init-project.test.ts R04-1)
      const written = await adapter.writeConfig(proj, { command: 'wolf', args: ['mcp'] });
      expect(written.action).toBe('written');

      const after = await runDoctor(deps);
      expect(after.entries[0]!.issues).toEqual([]);
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });
});
