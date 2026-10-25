// REQ-03 (2.16.2): `wolf uninstall` — план по умолчанию, --yes исполняет, --purge
// дополнительно стирает .wolf/ (careful re-init паттерн: план + подтверждение).
import { Command } from 'commander';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { rm } from 'fs/promises';
import { join } from 'path';
import { PLATFORM_ADAPTERS } from '../../../adapters/platforms/index.js';
import { executeUninstall, planUninstall, type UninstallDeps } from '../../../app/use-cases/uninstall.js';
import type { SyncStateFiles } from '../../../adapters/render/sync-state.js';
import { safeCwd } from '../cli-entry.js';

function makeDeps(baseDir: string): UninstallDeps {
  return {
    baseDir,
    syncStateFiles: () => {
      try {
        const raw = readFileSync(join(baseDir, '.opencode', 'wolf-sync-state.json'), 'utf-8');
        const parsed = JSON.parse(raw) as { files?: SyncStateFiles };
        return parsed.files && typeof parsed.files === 'object' ? parsed.files : 'broken';
      } catch (err) {
        // Битый JSON ≠ отсутствующий файл: различаем для fallback-решения (F-11).
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        return 'broken';
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
    removeFile: async (abs) => rm(abs),
    removeDirIfEmpty: async (abs) => {
      if (!existsSync(abs) || readdirSync(abs).length > 0) return false;
      await rm(abs, { recursive: true });
      return true;
    },
    removeTree: async (abs) => rm(abs, { recursive: true, force: true }),
    adapters: PLATFORM_ADAPTERS,
  };
}

export function memoryUninstallCommand(): Command {
  return new Command('uninstall')
    .description('Remove wolf-managed files from this project (prints plan first; --yes executes)')
    .option('--yes', 'execute the plan (without it — plan only, nothing is written)', false)
    .option('--purge', 'with --yes: also erase .wolf/ (project memory)', false)
    .action(async (options: { yes?: boolean; purge?: boolean }) => {
      const baseDir = safeCwd();
      const deps = makeDeps(baseDir);
      const plan = await planUninstall(deps);
      console.log(
        `# wolf uninstall${options.purge ? ' --purge' : ''}${options.yes ? ' (executing)' : ' (plan only — pass --yes to execute)'}`
      );
      if (plan.entries.length === 0) {
        console.log('nothing to remove — no wolf-managed files found');
        return;
      }
      for (const e of plan.entries) {
        const mark =
          e.kind === 'file' ? 'remove' : e.kind === 'config' ? 'config' : e.kind === 'purge' ? 'purge' : 'keep';
        console.log(`- [${mark}] ${e.target}${e.detail ? ` — ${e.detail}` : ''}`);
      }
      if (options.purge && !options.yes) {
        console.log('  ! --purge without --yes: plan only, .wolf/ is NOT erased');
      }
      const r = await executeUninstall(deps, plan, { yes: options.yes === true, purge: options.purge === true });
      if (options.yes) {
        console.log();
        for (const a of r.actions) console.log(`- ${a}`);
      }
      for (const err of r.errors) console.error(`! ${err}`);
      if (r.errors.length > 0) process.exitCode = 1;
    });
}
