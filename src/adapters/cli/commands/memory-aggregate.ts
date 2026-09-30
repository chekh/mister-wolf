import { Command } from 'commander';
import { safeCwd } from '../cli-entry.js';
import { applyAggregate } from '../../../app/use-cases/apply-aggregate.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { resolveCreatedBy } from '../../../domain/actor.js';

// 2.14 §7.3: `wolf aggregate apply <id>` — plumbing-подтверждение агрегата
// владельцем (Стюард создаёт proposed-агрегат, владелец применяет).
// baseDir инъектится для тестов (прецедент: memory-add.ts).
export function memoryAggregateCommand(baseDir: string = safeCwd()): Command {
  const cmd = new Command('aggregate').description('Apply a proposed lesson aggregate (steward plumbing)');

  cmd
    .command('apply')
    .description('Apply a proposed aggregate: activate it and archive its sources')
    .argument('<aggregate-id>', 'Aggregate memory object id')
    .option('--created-by <actor>', 'Actor performing the apply (default: env WOLF_ACTOR, else user:cli)')
    .action(async (aggregateId: string, options: { createdBy?: string }) => {
      const { store, log, clock, idGen, index, relations, lock } = createCliContainer(baseDir);
      const result = await applyAggregate(
        { store, log, clock, idGen, index, relations, lock },
        aggregateId,
        resolveCreatedBy(options.createdBy)
      );
      if (result.noop) {
        console.log(`no-op: aggregate active, all sources archived (${aggregateId})`);
        return;
      }
      console.log(`Applied aggregate ${aggregateId}`);
      console.log(`activated: ${result.activated ? 'yes' : 'no'}`);
      console.log(`archived: ${result.archived.length} (skipped: ${result.skipped.length})`);
      for (const id of result.archived) console.log(`archived source: ${id}`);
    });

  return cmd;
}
