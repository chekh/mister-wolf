import { Command } from 'commander';
import { join } from 'path';
import { createCliContainer } from '../../../bootstrap/container.js';
import { ProjectsRegistry } from '../../../adapters/fs/projects-registry.js';
import { wolfUserConfigDir } from '../../../adapters/fs/user-config.js';
import { PLATFORM_ADAPTERS, CANONICAL_MCP_COMMAND } from '../../../adapters/platforms/index.js';
import { writeSchemaVersionIfAbsent } from '../../../adapters/fs/schema-version.js';
import { ensureCurrentSchema } from '../../../adapters/fs/schema-guard.js';
import { initProject, recreateConfig } from '../../../app/use-cases/init-project.js';
import { isNpxRun } from '../../../domain/npx.js';
import { UserFacingError } from '../../../domain/errors.js';

export function memoryInitCommand(): Command {
  return new Command('init')
    .description('Initialize Mr. Wolf memory for this project (idempotent, non-interactive)')
    .option('--platform <ids>', 'explicit platform list (comma-separated: opencode,claude); replaces the current set')
    .option('--recreate', 'backup a corrupted .wolf/config.yaml and re-create it from defaults', false)
    .action(async (options: { platform?: string; recreate?: boolean }) => {
      const baseDir = process.cwd();
      if (options.recreate) {
        await recreateConfig(baseDir);
        // восстановление = приведение к валидному СОСТОЯНИЮ, а не тихий штамп маркера ниже:
        // легаси-схема (1/без маркера) мигрирует здесь (layout + маркер), иначе markSchemaCurrent
        // дописал бы v2 без layout-миграции и objects/ остался бы осиротевшим навсегда;
        // схема из будущего — честный отказ «обнови wolf» (спека §3), а не даунгрейд 99→2
        await ensureCurrentSchema(baseDir);
      }

      let platformIds: string[] | undefined;
      if (options.platform !== undefined) {
        platformIds = options.platform
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s !== '');
        const known = new Set(PLATFORM_ADAPTERS.map((a) => a.id));
        const unknown = platformIds.filter((id) => !known.has(id));
        if (unknown.length > 0) {
          throw new UserFacingError(`Unknown platform(s): ${unknown.join(', ')} (known: ${[...known].join(', ')})`);
        }
      }

      const { initializer, store, log, clock, idGen, scanner, index, lock } = createCliContainer(baseDir);
      const registry = new ProjectsRegistry(wolfUserConfigDir());
      const result = await initProject(
        {
          initializer,
          registry,
          adapters: PLATFORM_ADAPTERS,
          mcpCommand: CANONICAL_MCP_COMMAND,
          npx: isNpxRun(),
          scanDeps: { store, log, clock, idGen, scanner, index, lock },
          markSchemaCurrent: (dir) => writeSchemaVersionIfAbsent(dir),
        },
        baseDir,
        { platformIds }
      );

      console.log('# wolf init');
      console.log(`- memory skeleton: ensured (${join(baseDir, '.wolf')})`);
      console.log(`- scan: ${result.documentCount} document(s) registered`);
      for (const outcome of result.platformOutcomes) {
        const label =
          outcome.platform === 'none' || outcome.platform === 'npx'
            ? 'platform configs'
            : `platform ${outcome.platform}`;
        console.log(`- ${label}: ${outcome.action}${outcome.reason ? ` — ${outcome.reason}` : ''}`);
      }
      if (result.npx) {
        console.log(
          '  → this was an npx try-out; to connect your platform: npm install -g mister-wolf, then re-run: wolf init'
        );
      } else {
        console.log('Restart your agent platform to pick up the MCP server.');
        if (result.platformOutcomes.some((o) => o.platform === 'claude' && o.action !== 'removed')) {
          console.log('Claude Code: approve the project-scoped MCP server on first start.');
        }
      }
      console.log(`Project registered: ${join(wolfUserConfigDir(), 'projects.yaml')}`);

      // §3: ненулевой exit — только если при явном --platform не записано ни одного конфига
      const wroteSomething = result.platformOutcomes.some((o) =>
        ['written', 'replaced', 'unchanged'].includes(o.action)
      );
      if (platformIds !== undefined && !wroteSomething) process.exitCode = 1;
    });
}
