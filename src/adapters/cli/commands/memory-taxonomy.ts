import { Command } from 'commander';
import * as fs from 'fs/promises';
import { dirname } from 'path';
import { mergeTaxonomy } from '../../../domain/taxonomy.js';
import { renderConfigYaml, loadWolfConfig } from '../../fs/config-file.js';
import { configPath } from '../../fs/project-paths.js';
import { getWolfVersion } from '../../version.js';

export function memoryTaxonomyCommand(): Command {
  const cmd = new Command('taxonomy').description('Manage memory taxonomy');

  cmd
    .command('sync')
    // P214: дамп memory_types.core больше не пишется — wolf_version-штамп
    .description('Refresh .wolf/config.yaml: project types preserved, wolf_version stamp')
    .action(async () => {
      const baseDir = process.cwd();
      const existing = await loadWolfConfig(baseDir);
      await fs.mkdir(dirname(configPath(baseDir)), { recursive: true });
      await fs.writeFile(configPath(baseDir), renderConfigYaml(existing), 'utf-8');
      console.log(
        `Synced ${configPath(baseDir)} (wolf_version: ${getWolfVersion()}, project types: ${existing?.projectTypes.length ?? 0})`
      );
    });

  cmd
    .command('show')
    .description('Print effective taxonomy (code canon + project types)')
    .action(async () => {
      const cfg = await loadWolfConfig(process.cwd());
      const { types } = mergeTaxonomy(cfg);
      for (const [name, d] of types) {
        console.log(
          `${name}${d.deprecated ? ' (deprecated)' : ''}: lifecycle=[${d.lifecycle.join(',')}] dirs=${d.subdirThread ?? '-'}/${d.subdirShared ?? '-'}`
        );
      }
    });

  return cmd;
}
