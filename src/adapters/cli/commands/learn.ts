// src/adapters/cli/commands/learn.ts
import { Command } from 'commander';
import { safeCwd } from '../cli-entry.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { loadWolfConfigSync } from '../../fs/config-file.js';
import { resolveCreatedBy } from '../../../domain/actor.js';
import { acceptLearningChange, applyLearningChange } from '../../../app/use-cases/apply-learning-change.js';
import { rollbackLearningChange } from '../../../app/use-cases/rollback-learning-change.js';
import { registerLearningQueueCommands } from './learn-queue.js';

/**
 * 3.2.0 T-06 (REQ-08, design §9): группа `wolf learn` — тонкие обёртки
 * accept/apply/rollback-learning-change. suggest/propose ничего не активируют:
 * применение возможно только этой командой и только в режиме apply-approved
 * (конфиг learning.mode / env WOLF_LEARNING_MODE). Атрибуция — env WOLF_ACTOR
 * (ADR-5, прецедент propose.ts).
 */
export function learnCommand(baseDir: string = safeCwd()): Command {
  const cmd = new Command('learn').description(
    'Learning cycle: due queue, signal index audit, ack/dismiss, accept / apply / rollback approved candidates (REQ-03/REQ-08/REQ-12)'
  );

  cmd
    .command('accept')
    .description('Record the owner acceptance decision (proposed/trialled → approved; nothing is applied yet)')
    .argument('<id>', 'Learning candidate memory id')
    .requiredOption('--verdict-ref <ref>', 'Reference to the independent verdict/evidence (trial result, review)')
    .option('--accepted-by <actor>', 'Accepting actor (default: env WOLF_ACTOR, then user:owner)')
    .action(async (id: string, options: { verdictRef: string; acceptedBy?: string }) => {
      const { store, log, clock, idGen, lock } = createCliContainer(baseDir);
      const result = await acceptLearningChange(
        { store, log, clock, idGen, lock },
        {
          candidateId: id,
          acceptedBy: resolveCreatedBy(options.acceptedBy, process.env, 'user:owner'),
          verdictRef: options.verdictRef,
        }
      );
      console.log(`Candidate accepted: ${result.change_id} (phase=approved; apply with: wolf learn apply ${id})`);
    });

  cmd
    .command('apply')
    .description(
      'Apply exactly the accepted version of an approved candidate (preflight baseline hashes, journaled recovery; repeat apply is a noop)'
    )
    .argument('<id>', 'Learning candidate memory id')
    .action(async (id: string) => {
      const { store, log, clock, idGen, index, lock } = createCliContainer(baseDir);
      const result = await applyLearningChange(
        {
          store,
          log,
          clock,
          idGen,
          index,
          lock,
          baseDir,
          env: process.env,
          config: loadWolfConfigSync(baseDir),
        },
        id
      );
      if (result.noop) {
        console.log(`No-op: learning change ${result.change_id} is already active (nothing re-applied)`);
        return;
      }
      for (const path of result.applied) console.log(`applied: ${path}`);
      for (const path of result.recovered) console.log(`recovered (interrupted run, not rewritten): ${path}`);
      console.log(
        `Learning change ${result.change_id} applied (activated=${result.activated}; rollback: wolf learn rollback ${id})`
      );
    });

  cmd
    .command('rollback')
    .description(
      'Restore the exact previous content of an applied candidate (refuses on any later foreign edit; repeat rollback is a noop)'
    )
    .argument('<id>', 'Learning candidate memory id')
    .action(async (id: string) => {
      const { store, log, clock, idGen, lock } = createCliContainer(baseDir);
      const result = await rollbackLearningChange({ store, log, clock, idGen, lock, baseDir }, id);
      if (result.noop) {
        console.log(`No-op: learning change ${result.change_id} is already rolled_back`);
        return;
      }
      for (const path of result.restored) console.log(`restored: ${path}`);
      for (const path of result.already_restored) {
        console.log(`already restored (interrupted rollback, not rewritten): ${path}`);
      }
      console.log(`Learning change ${result.change_id} rolled back (previous exact hashes)`);
    });

  // Интеграция 3.2.0 (design §9, решение ведущего): очередь сигналов живёт
  // в той же группе — `wolf learn due|list|ack|dismiss` (T-05) рядом с
  // accept/apply/rollback (T-06).
  registerLearningQueueCommands(cmd, baseDir);

  return cmd;
}
