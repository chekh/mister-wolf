import { Command } from 'commander';
import { bootstrapProject } from '../../../app/use-cases/bootstrap-project.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { resolveCreatedBy } from '../../../domain/actor.js';

export function memoryBootstrapCommand(): Command {
  return new Command('bootstrap')
    .description('Scan the project and draft starting memory: proposed rules, document-refs, work thread')
    .option('--created-by <actor>', 'Creator actor (default: env WOLF_ACTOR, else user:cli)')
    .action(async (options) => {
      const { store, log, clock, idGen, scanner, index, lock, declarations, fs } = createCliContainer(process.cwd());
      const result = await bootstrapProject(
        { store, log, clock, idGen, scanner, index, lock, declarations, fs },
        { baseDir: process.cwd(), createdBy: resolveCreatedBy(options.createdBy) }
      );
      console.log(result.brief);
    });
}
