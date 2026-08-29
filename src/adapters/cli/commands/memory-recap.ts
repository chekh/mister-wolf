import { Command } from 'commander';
import { generateRecap, renderRecap } from '../../../app/use-cases/generate-recap.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryRecapCommand(): Command {
  return new Command('recap')
    .description('Summarize active project memory: rules, threads, blockers, questions, decisions')
    .action(async () => {
      const { store } = createCliContainer(process.cwd());
      console.log(renderRecap(await generateRecap({ store })));
    });
}
