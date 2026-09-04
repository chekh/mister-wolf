import { Command, Option } from 'commander';
import { safeCwd } from '../cli-entry.js';
import { appendMemoryStageSignal } from '../../fs/session-metrics-log.js';
import { resolveCreatedBy } from '../../../domain/actor.js';
import { UserFacingError } from '../../../domain/errors.js';

// P2 D1: `wolf memory-stage` — ручная фиксация стадии жизненного цикла памяти
// (event memory_stage, writer (е) в session-metrics-log.ts). baseDir инъектится
// для тестов (прецедент: task-eval.ts).
export function memoryStageCommand(baseDir: string = safeCwd()): Command {
  return new Command('memory-stage')
    .description('Record a memory lifecycle stage into the signal log (event memory_stage)')
    .addOption(
      new Option('--stage <stage>', 'Memory lifecycle stage')
        .choices(['retrieved', 'injected', 'cited', 'applied'])
        .makeOptionMandatory()
    )
    .option('--ids <ids>', 'Comma-separated memory object ids')
    .option('--actor <actor>', 'Actor attribution (default: WOLF_ACTOR env or user:cli)')
    .option('--session <id>', 'Session id')
    .action(async (options) => {
      const memoryIds = (options.ids ?? '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
      if (memoryIds.length === 0) {
        throw new UserFacingError('no memory ids provided: --ids <id,...>');
      }
      appendMemoryStageSignal(baseDir, {
        stage: options.stage,
        memoryIds,
        actor: resolveCreatedBy(options.actor),
        ...(options.session !== undefined ? { sessionId: options.session } : {}),
      });
      console.log(`memory stage recorded: stage=${options.stage} ids=${memoryIds.length}`);
    });
}
