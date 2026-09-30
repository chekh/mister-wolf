import { Command } from 'commander';
import { ProjectsRegistry } from '../../../adapters/fs/projects-registry.js';
import { wolfUserConfigDir } from '../../../adapters/fs/user-config.js';
import { buildProjectsList, renderProjectsList } from '../../../app/use-cases/build-projects-list.js';

export function projectsCommand(): Command {
  return new Command('projects').description('List registered projects: activity and memory size').action(async () => {
    const rows = await buildProjectsList({ registry: new ProjectsRegistry(wolfUserConfigDir()) });
    if (rows.length === 0) {
      console.log('No registered projects. Run `wolf init` inside a project.');
      return;
    }
    const { table, summary } = renderProjectsList(rows, new Date());
    console.log(table);
    console.log();
    console.log(summary);
  });
}
