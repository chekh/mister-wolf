// R-1..R-6 (test-plan волны 2.16.2): repairPlatform — ремонт платформы v1→v2
// (syncBaseSet + writeConfig), гвард, dry-run, идемпотентность, mutated-skip, orphaned.
// Oracle: design.md §C3 (гвард F-01/F-10, orphaned-рекомендация F-02, ADR-3).
import { describe, expect, it } from 'vitest';
import { repairPlatform, type RepairPlatformDeps } from '../../../src/app/use-cases/repair-platform.js';

function makeDeps(over: Partial<RepairPlatformDeps> = {}): RepairPlatformDeps {
  return {
    baseDir: '/proj',
    detect: () => true,
    syncStateFiles: () => ({ '.opencode/plugins/wolf-router.ts': 'x' }),
    mismatch: async () => ['opencode: installed under v1 (set 2.14.0 < 2.14.1), runtime v2 — run wolf doctor --repair'],
    syncBaseSet: async () => ({
      outcomes: [
        { file: '.opencode/plugins/wolf-router.ts', action: 'updated' },
        { file: 'AGENTS.md', action: 'updated' },
      ],
      orphaned: [],
    }),
    writeConfig: async () => ({ action: 'unchanged' }),
    ...over,
  };
}

describe('repairPlatform (REQ-02, design §C3)', () => {
  it('R-1: чинит — sync перерендеривает, конфиг канонизируется, mismatch-строки в отчёте', async () => {
    const r = await repairPlatform(makeDeps({ writeConfig: async () => ({ action: 'replaced' }) }), { dryRun: false });
    expect(r.skipped).toBeNull();
    expect(r.actions).toContainEqual(expect.stringContaining('wolf-router.ts — updated'));
    expect(r.actions).toContainEqual(expect.stringContaining('writeConfig: replaced'));
    expect(r.plan).toContainEqual(expect.stringContaining('installed under v1'));
  });

  it('R-2: идемпотентность — второй прогон (identical/unchanged) без записей', async () => {
    const r = await repairPlatform(
      makeDeps({
        syncBaseSet: async () => ({
          outcomes: [{ file: '.opencode/plugins/wolf-router.ts', action: 'skipped', reason: 'content identical' }],
          orphaned: [],
        }),
        writeConfig: async () => ({ action: 'unchanged' }),
      }),
      { dryRun: false }
    );
    expect(r.actions.some((a) => a.includes('updated'))).toBe(false);
    expect(r.actions).toContainEqual(expect.stringContaining('unchanged'));
  });

  it('R-3: dry-run — только план, sync/writeConfig не вызываются', async () => {
    let called = 0;
    const r = await repairPlatform(
      makeDeps({
        syncBaseSet: async () => {
          called += 1;
          return { outcomes: [], orphaned: [] };
        },
        writeConfig: async () => {
          called += 1;
          return { action: 'written' };
        },
      }),
      { dryRun: true }
    );
    expect(called).toBe(0);
    expect(r.actions).toEqual([]);
    expect(r.plan.length).toBeGreaterThan(0);
  });

  it('R-4/F-01/F-10: нет установки → skip «no opencode install», ноль записей', async () => {
    const r = await repairPlatform(makeDeps({ detect: () => false }), { dryRun: false });
    expect(r.skipped).toBe('no opencode install');
    expect(r.actions).toEqual([]);
  });

  it('R-4b/F-10: установка есть, wolf-контента нет → skip «no wolf-managed content»', async () => {
    const r = await repairPlatform(makeDeps({ syncStateFiles: () => null }), { dryRun: false });
    expect(r.skipped).toBe('no wolf-managed content in .opencode');
    expect(r.actions).toEqual([]);
  });

  it('R-5/F-02: orphaned попадает в отчёт с рекомендацией, не удаляется', async () => {
    const r = await repairPlatform(
      makeDeps({ syncBaseSet: async () => ({ outcomes: [], orphaned: ['.opencode/plugins/old.ts'] }) }),
      { dryRun: false }
    );
    expect(r.orphaned).toContain('.opencode/plugins/old.ts');
    expect(r.orphanedNote).toContain('wolf uninstall');
  });
});
