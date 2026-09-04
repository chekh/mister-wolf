import { Command } from 'commander';
import { scanProject } from '../../../app/use-cases/scan-project.js';
import { generateAgentBrief } from '../../../app/use-cases/generate-agent-brief.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { appendMemoryStageSignal } from '../../fs/session-metrics-log.js';
import { resolveCreatedBy, resolveSessionId } from '../../../domain/actor.js';

export function memoryBriefCommand(): Command {
  return new Command('brief')
    .description('Generate the agent brief from the latest scan and memory')
    .action(async () => {
      const { store, log, clock, idGen, scanner, fs, index } = createCliContainer(process.cwd());
      const scanResult = await scanProject({ store, log, clock, idGen, scanner, index }, process.cwd());
      const brief = await generateAgentBrief({ store, fs, clock }, process.cwd(), scanResult.snapshot);
      // P2 D1: бриф инъекцировал объекты → injected; пусто → событие НЕ пишется
      if (brief.injectedIds.length > 0) {
        try {
          appendMemoryStageSignal(process.cwd(), {
            stage: 'injected',
            memoryIds: brief.injectedIds,
            actor: resolveCreatedBy(undefined),
            sessionId: resolveSessionId(),
          });
        } catch {
          // телеметрия не должна ломать основной поток
        }
      }
      console.log(brief.content);
      console.error(`Brief saved to ${brief.path}`);
    });
}
