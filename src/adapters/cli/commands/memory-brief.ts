import { Command } from 'commander';
import { scanProject } from '../../../app/use-cases/scan-project.js';
import { generateAgentBrief } from '../../../app/use-cases/generate-agent-brief.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryBriefCommand(): Command {
  return new Command('brief')
    .description('Generate the agent brief from the latest scan and memory')
    .action(async () => {
      const { store, log, clock, idGen, scanner, fs, index } = createCliContainer(process.cwd());
      const scanResult = await scanProject({ store, log, clock, idGen, scanner, index }, process.cwd());
      const brief = await generateAgentBrief({ store, fs, clock }, process.cwd(), scanResult.snapshot);
      console.log(brief.content);
      console.error(`Brief saved to ${brief.path}`);
    });
}
