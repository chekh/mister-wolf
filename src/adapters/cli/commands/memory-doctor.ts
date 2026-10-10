import { Command } from 'commander';
import { join, sep } from 'path';
import { existsSync, readdirSync, realpathSync } from 'fs';
import { readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { runDoctor } from '../../../app/use-cases/doctor.js';
import { runArtifactLint } from '../../../app/use-cases/lint-artifacts.js';
import { ProjectsRegistry } from '../../../adapters/fs/projects-registry.js';
import { wolfUserConfigDir } from '../../../adapters/fs/user-config.js';
import { readSchemaVersion } from '../../../adapters/fs/schema-version.js';
import { artifactFs } from '../../../adapters/fs/artifact-fs.js';
import { templatesRoot } from '../../../adapters/render/templates-root.js';
import { PLATFORM_ADAPTERS } from '../../../adapters/platforms/index.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { safeCwd } from '../cli-entry.js';
import { repairStorage } from '../../../app/use-cases/repair-storage.js';
import { eventsPath } from '../../../adapters/fs/project-paths.js';
import { maskSecrets } from '../../../domain/mask-secrets.js';
import { UserFacingError } from '../../../domain/errors.js';

/**
 * Песочницы (спека 2.14 §8.2): записи под os.tmpdir() чистим с пометкой sandbox.
 * macOS-нюанс: os.tmpdir() возвращает `/var/folders/…`, а пути в реестре часто
 * `/private/var/folders/…` (realpath) — сравниваем с обоими написаними + `/tmp`
 * (и его realpath) для явных tmp-песочниц.
 */
function isSandboxPath(p: string): boolean {
  const roots = new Set<string>();
  for (const r of [tmpdir(), '/tmp']) {
    roots.add(r);
    try {
      roots.add(realpathSync(r));
    } catch {
      // корня нет — пропускаем
    }
  }
  for (const r of roots) {
    if (p === r || p.startsWith(r + sep)) return true;
  }
  return false;
}

async function readFileOrNull(p: string): Promise<string | null> {
  try {
    return await readFile(p, 'utf-8');
  } catch {
    return null;
  }
}

export function memoryDoctorCommand(): Command {
  return new Command('doctor')
    .description('Check all registered projects: binary vs schema version, platform configs, prune dead entries')
    .option('--repair', 'repair storage in the current project: rebuild index, backfill memory.added events', false)
    .option('--dry-run', 'with --repair: print the plan without writing', false)
    .action(async (options: { repair?: boolean; dryRun?: boolean }) => {
      if (options.dryRun && !options.repair) {
        throw new UserFacingError('--dry-run is used with --repair: wolf doctor --repair --dry-run');
      }
      if (options.repair) {
        const cwd = safeCwd();
        const { store, log, clock, idGen, index, lock, memoryRoot } = createCliContainer(cwd);
        const events = eventsPath(memoryRoot);
        const report = await repairStorage(
          {
            store,
            log,
            clock,
            idGen,
            index,
            lock,
            readEventLines: async () => {
              try {
                return (await readFile(events, 'utf-8')).split('\n').filter((l) => l.trim() !== '');
              } catch {
                return [];
              }
            },
          },
          { dryRun: options.dryRun === true }
        );
        console.log(`# wolf doctor --repair${options.dryRun ? ' (dry-run)' : ''}`);
        for (const a of report.actions) console.log(`- ${a}`);
        console.log(
          `reindexed: ${report.reindexed}, events backfilled: ${report.eventsAppended}, dangling events: ${report.danglingEvents}`
        );
        return;
      }
      const registry = new ProjectsRegistry(wolfUserConfigDir());
      const report = await runDoctor({
        registry,
        readSchema: (p) => readSchemaVersion(p),
        exists: async (p) => existsSync(p),
        adapters: PLATFORM_ADAPTERS,
        cwd: safeCwd(),
        isSandbox: isSandboxPath,
        readFile: readFileOrNull,
      });

      console.log(`# wolf doctor — binary schema v${report.binarySchemaVersion}`);
      console.log(`registry: ${join(wolfUserConfigDir(), 'projects.yaml')}`);
      console.log();
      if (report.entries.length === 0) {
        console.log('No registered projects. Run `wolf init` inside a project.');
        return;
      }
      for (const e of report.entries) {
        if (e.status === 'sandbox') {
          console.log(`- ${e.path}: sandbox — pruned (os tmpdir)`);
          continue;
        }
        const schema = e.schemaVersion === null ? '-' : `v${e.schemaVersion}`;
        let hint = '';
        if (e.status === 'outdated-binary') hint = ' — update wolf: npm install -g mister-wolf';
        if (e.status === 'outdated-project') hint = ' — run any wolf command inside the project (lazy migration)';
        if (e.status === 'not-initialized') hint = ' — not initialized: run wolf init inside the project';
        if (e.status === 'missing') hint = ' — pruned (path no longer exists)';
        console.log(`- ${e.path}: ${e.status} (schema ${schema})${hint}`);
        for (const issue of e.issues) {
          console.log(`  ! ${maskSecrets(issue)}`);
        }
      }
      if (report.pruned.length > 0) {
        console.log();
        console.log(`Pruned ${report.pruned.length} dead entr${report.pruned.length === 1 ? 'y' : 'ies'}.`);
      }

      const cwd = safeCwd();
      // Контейнер общий для артефакт- и осиротевшей-секций (WP3 §6.2):
      // store + memoryRoot (поле из задачи 4), resolveMemoryRoot тут не нужен.
      const { store, memoryRoot } = createCliContainer(cwd);
      if (existsSync(join(cwd, 'docs', 'dev'))) {
        const toolOwners = new Set<string>();
        for (const t of await store.list({ type: 'tool' })) {
          // archived-тулы не гасят призрака: гасят только живые регистрации (контракт e2e intake)
          if (t.status === 'archived') continue;
          const owner = (t as { owner_skill?: string }).owner_skill;
          if (typeof owner === 'string' && owner !== '') toolOwners.add(owner);
        }
        const baseSkillsDir = join(templatesRoot(), 'skills');
        const baseSkillNames = new Set(existsSync(baseSkillsDir) ? readdirSync(baseSkillsDir) : []);
        const findings = await runArtifactLint({
          fs: artifactFs(),
          baseDir: cwd,
          toolOwners,
          baseSkillNames,
        });
        if (findings.length > 0) {
          console.log();
          console.log('## Artifacts (docs/dev)');
          for (const f of findings) console.log(`! ${f.file}: ${maskSecrets(f.message)}`);
        }
      }

      // WP3 §6.2: осиротевшие worktree-scope — находка; очистка вручную (promote/edit), P3
      const worktreesDir = join(memoryRoot, '.git', 'worktrees');
      const live = existsSync(worktreesDir) ? readdirSync(worktreesDir) : [];
      const orphan = new Map<string, number>();
      for (const o of await store.list()) {
        const s = (o as { scope?: string }).scope;
        if (typeof s === 'string' && s.startsWith('worktree:') && !live.includes(s.slice('worktree:'.length))) {
          orphan.set(s, (orphan.get(s) ?? 0) + 1);
        }
      }
      if (orphan.size > 0) {
        console.log();
        console.log('## Orphaned worktree scopes (manual cleanup — promote or edit)');
        for (const [scope, n] of orphan) console.log(`! ${scope}: ${n} object(s) — worktree no longer exists`);
      }
    });
}
