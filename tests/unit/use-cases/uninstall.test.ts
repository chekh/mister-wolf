// U-1..U-11 (test-plan волны 2.16.2): planUninstall/executeUninstall — удаление только
// wolf-контента. Oracle: design.md §C4 + ADR-2 (sync-state primary, fallback штампа,
// AGENTS.md не трогаем, точные значения ключей, .wolf/ keep / --purge).
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  planUninstall,
  executeUninstall,
  type UninstallDeps,
} from '../../../src/app/use-cases/uninstall.js';
import type { PlatformAdapter } from '../../../../src/ports/platform-adapter.port.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-uninstall-'));
});
afterEach(() => {
  chmodSync(dir, 0o755);
  rmSync(dir, { recursive: true, force: true });
});

const STAMP = '// wolf:rendered base=mr-wolf.md set=2.16.1\nbody\n';

/** Реальные ФС-операции + фейковые адаптеры поверх tmp-каталога. */
function makeDeps(over: Partial<UninstallDeps> = {}): UninstallDeps {
  const realAdapters: PlatformAdapter[] = over.adapters ?? [];
  const rest = { ...over } as Partial<UninstallDeps>;
  delete rest.adapters;
  return {
    baseDir: dir,
    syncStateFiles: () => {
      try {
        const parsed = JSON.parse(readFileSync(join(dir, '.opencode/wolf-sync-state.json'), 'utf-8'));
        return parsed.files as Record<string, string>;
      } catch {
        return null;
      }
    },
    readFile: (abs) => {
      try {
        return readFileSync(abs, 'utf-8');
      } catch {
        return null;
      }
    },
    exists: (abs) => existsSync(abs),
    listFiles: (root) => {
      if (!existsSync(root)) return [];
      const out: string[] = [];
      const walk = (d: string) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, e.name);
          if (e.isDirectory()) walk(p);
          else out.push(p);
        }
      };
      walk(root);
      return out;
    },
    listDirs: (root) => {
      if (!existsSync(root)) return [];
      const out: string[] = [];
      const walk = (d: string) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, e.name);
          if (e.isDirectory()) {
            out.push(p);
            walk(p);
          }
        }
      };
      walk(root);
      return out;
    },
    removeFile: async (abs) => rmSync(abs),
    removeDirIfEmpty: async (abs) => {
      if (!existsSync(abs)) return false;
      if (readdirSync(abs).length > 0) return false;
      rmSync(abs, { recursive: true });
      return true;
    },
    removeTree: async (abs) => rmSync(abs, { recursive: true, force: true }),
    adapters: realAdapters,
    ...rest,
  };
}

const ADAPTERS: PlatformAdapter[] = [
  {
    id: 'opencode',
    detect: (root) => existsSync(join(root, '.opencode')),
    readConfig: async () => null,
    writeConfig: async () => ({ action: 'written' }),
    removeWolf: async () => false,
    removeWolfKeys: async () => ({ action: 'removed', keys: ['mcp.wolf'] }),
  } as PlatformAdapter,
] as PlatformAdapter[];

function seedSyncedProject(): void {
  for (const d of ['.opencode/agents', '.opencode/plugins']) mkdirSync(join(dir, d), { recursive: true });
  writeFileSync(join(dir, '.opencode/agents/mr-wolf.md'), STAMP);
  writeFileSync(join(dir, '.opencode/plugins/wolf-router.ts'), STAMP);
  writeFileSync(join(dir, '.opencode/plugins/foreign.ts'), '// no stamp\n');
  writeFileSync(join(dir, 'AGENTS.md'), '<!-- wolf:onboarding v2 -->\ncontent\n');
  writeFileSync(join(dir, '.opencode/wolf-sync-state.json'), JSON.stringify({ files: { '.opencode/agents/mr-wolf.md': 'x', '.opencode/plugins/wolf-router.ts': 'y', 'AGENTS.md': 'z' } }));
}

describe('planUninstall/executeUninstall (REQ-03)', () => {
  it('U-1: план (execute без yes) не меняет файловую систему', async () => {
    seedSyncedProject();
    const before = readdirSync(join(dir, '.opencode'), { recursive: true }).sort();
    const deps = makeDeps({ adapters: ADAPTERS });
    const plan = await planUninstall(deps);
    const r = await executeUninstall(deps, plan, { yes: false, purge: false });
    expect(r.actions).toEqual([]);
    expect(readdirSync(join(dir, '.opencode'), { recursive: true }).sort()).toEqual(before);
  });

  it('U-2: --yes удаляет штампованное из state; чужой файл нетронут; пустые каталоги убраны', async () => {
    seedSyncedProject();
    const deps = makeDeps({ adapters: ADAPTERS });
    const plan = await planUninstall(deps);
    await executeUninstall(deps, plan, { yes: true, purge: false });
    expect(existsSync(join(dir, '.opencode/agents/mr-wolf.md'))).toBe(false);
    expect(existsSync(join(dir, '.opencode/plugins/wolf-router.ts'))).toBe(false);
    expect(existsSync(join(dir, '.opencode/plugins/foreign.ts'))).toBe(true);
    expect(existsSync(join(dir, '.opencode/agents'))).toBe(false); // пустой каталог удалён
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);
  });

  it('U-3: легаси без sync-state — fallback по штампу', async () => {
    mkdirSync(join(dir, '.opencode/skills/wolf-review'), { recursive: true });
    mkdirSync(join(dir, '.opencode/skills/other'), { recursive: true });
    writeFileSync(join(dir, '.opencode/skills/wolf-review/SKILL.md'), STAMP);
    writeFileSync(join(dir, '.opencode/skills/other/NOTE.md'), 'user content');
    const deps = makeDeps({ adapters: ADAPTERS }); // sync-state отсутствует → null
    const plan = await planUninstall(deps);
    const targets = plan.entries.filter((e) => e.kind === 'file').map((e) => e.target);
    expect(targets.some((t) => t.includes('wolf-review'))).toBe(true);
    expect(targets.some((t) => t.includes('other/NOTE.md'))).toBe(false);
  });

  it('U-4: AGENTS.md не в entries на удаление; skip-строка kept by design', async () => {
    seedSyncedProject();
    const deps = makeDeps({ adapters: ADAPTERS });
    const plan = await planUninstall(deps);
    const agents = plan.entries.find((e) => e.target === 'AGENTS.md');
    expect(agents?.kind).toBe('skip');
    expect(agents?.detail).toContain('kept by design');
  });

  it('U-5: конфиги чистятся через адаптеры', async () => {
    seedSyncedProject();
    const calls: string[] = [];
    const adapter = {
      ...ADAPTERS[0],
      removeWolfKeys: async () => {
        calls.push('opencode');
        return { action: 'removed' as const, keys: ['mcp.wolf', 'default_agent=mr-wolf', 'subagent_depth=2'] };
      },
    } as PlatformAdapter;
    const deps = makeDeps({ adapters: [adapter] });
    const plan = await planUninstall(deps);
    const r = await executeUninstall(deps, plan, { yes: true, purge: false });
    expect(calls).toEqual(['opencode']);
    expect(r.actions.join('\n')).toContain('config opencode');
  });

  it('U-7: .wolf/ сохраняется с сообщением; --purge удаляет', async () => {
    seedSyncedProject();
    mkdirSync(join(dir, '.wolf/memory'), { recursive: true });
    const deps = makeDeps({ adapters: ADAPTERS });
    const plan1 = await planUninstall(deps);
    const r1 = await executeUninstall(deps, plan1, { yes: true, purge: false });
    expect(existsSync(join(dir, '.wolf'))).toBe(true);
    expect(r1.actions.join('\n')).toMatch(/\.wolf.*(kept|сохран)/i);
    const plan2 = await planUninstall(deps);
    const r2 = await executeUninstall(deps, plan2, { yes: true, purge: true });
    expect(existsSync(join(dir, '.wolf'))).toBe(false);
    expect(r2.actions.join('\n')).toContain('.wolf');
  });

  it('U-8: отсутствующие конфиги → skip с причиной; пустой проект → nothing to remove', async () => {
    const skipAdapter = {
      ...ADAPTERS[0],
      removeWolfKeys: async () => ({ action: 'skipped' as const, reason: 'no opencode.json' }),
    } as PlatformAdapter;
    // Установка есть (.opencode), конфига нет → конфиг-строка со skip-причиной.
    mkdirSync(join(dir, '.opencode'), { recursive: true });
    const deps = makeDeps({ adapters: [skipAdapter] });
    const plan = await planUninstall(deps);
    expect(plan.entries.filter((e) => e.kind === 'file')).toEqual([]);
    const r = await executeUninstall(deps, plan, { yes: true, purge: false });
    expect(r.actions.join('\n')).toContain('no opencode.json');
    // Совсем пустой проект → nothing to remove.
    const emptyDir = mkdtempSync(join(tmpdir(), 'wolf-uninstall-empty-'));
    try {
      const emptyDeps = makeDeps({ baseDir: emptyDir, adapters: [skipAdapter] });
      const emptyPlan = await planUninstall(emptyDeps);
      const emptyR = await executeUninstall(emptyDeps, emptyPlan, { yes: true, purge: false });
      expect(emptyR.actions.join('\n')).toContain('nothing to remove');
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('U-9: идемпотентность — повторный прогон ничего не удаляет, exit-совместимый отчёт', async () => {
    seedSyncedProject();
    const deps = makeDeps({ adapters: ADAPTERS });
    const plan1 = await planUninstall(deps);
    await executeUninstall(deps, plan1, { yes: true, purge: false });
    const plan2 = await planUninstall(deps);
    expect(plan2.entries.filter((e) => e.kind === 'file' || e.kind === 'purge')).toEqual([]);
    const r2 = await executeUninstall(deps, plan2, { yes: true, purge: false });
    expect(r2.actions.join('\n')).toContain('nothing to remove');
  });

  it('U-11: частичный сбой (read-only файл) → ошибка в отчёте, остальные удалены', async () => {
    seedSyncedProject();
    const failing = makeDeps({
      adapters: ADAPTERS,
      removeFile: async (abs) => {
        if (abs.endsWith('wolf-router.ts')) throw new Error('EACCES: read-only');
        rmSync(abs);
      },
    });
    const plan = await planUninstall(failing);
    const r = await executeUninstall(failing, plan, { yes: true, purge: false });
    expect(r.errors.join('\n')).toContain('EACCES');
    expect(existsSync(join(dir, '.opencode/agents/mr-wolf.md'))).toBe(false);
  });
});
