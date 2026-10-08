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
    .action(async () => {
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
          console.log(`  ! ${issue}`);
        }
      }
      if (report.pruned.length > 0) {
        console.log();
        console.log(`Pruned ${report.pruned.length} dead entr${report.pruned.length === 1 ? 'y' : 'ies'}.`);
      }

      const cwd = safeCwd();
      if (existsSync(join(cwd, 'docs', 'dev'))) {
        const { store } = createCliContainer(cwd);
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
          for (const f of findings) console.log(`! ${f.file}: ${f.message}`);
        }
      }
    });
}
