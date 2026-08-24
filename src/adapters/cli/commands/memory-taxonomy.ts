import { Command } from 'commander';
import * as fs from 'fs/promises';
import { dirname } from 'path';
import { MEMORY_TYPES } from '../../../domain/memory-types.js';
import { mergeTaxonomy } from '../../../domain/taxonomy.js';
import { renderConfigYaml, loadWolfConfig } from '../../fs/config-file.js';
import { configPath } from '../../fs/project-paths.js';

const MEMORY_TYPES_COUNT = MEMORY_TYPES.length;

export function memoryTaxonomyCommand(): Command {
  const cmd = new Command('taxonomy').description('Manage memory taxonomy');

  cmd
    .command('sync')
    .description('Regenerate memory_types.core in .wolf/config.yaml from code canon')
    .action(async () => {
      const baseDir = process.cwd();
      const existing = await loadWolfConfig(baseDir);
      await fs.mkdir(dirname(configPath(baseDir)), { recursive: true });
      await fs.writeFile(configPath(baseDir), renderConfigYaml(existing), 'utf-8');
      console.log(`Synced ${configPath(baseDir)} (core types: ${MEMORY_TYPES_COUNT})`);
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
