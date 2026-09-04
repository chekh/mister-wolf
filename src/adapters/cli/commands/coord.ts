import { Command, Option } from 'commander';
import { safeCwd } from '../cli-entry.js';
import { appendCoordEventSignal } from '../../fs/session-metrics-log.js';
import { resolveCreatedBy } from '../../../domain/actor.js';

// P2 D3: `wolf coord` — фиксация координационного события между агентами
// (event coord_event, writer (ж) в session-metrics-log.ts). baseDir инъектится
// для тестов (прецедент: task-eval.ts).
export function coordCommand(baseDir: string = safeCwd()): Command {
  return new Command('coord')
    .description('Record a coordination event into the signal log (event coord_event)')
    .addOption(
      new Option('--kind <kind>', 'Coordination event kind')
        .choices(['handoff', 'review', 'acceptance', 'blocker', 'escalation'])
        .makeOptionMandatory()
    )
    .option('--from <actor>', 'Source actor (default: WOLF_ACTOR env or user:cli)')
    .option('--to <actor>', 'Target actor')
    .option(
      '--ref <ids>',
      'Comma-separated referenced object ids',
      (v: string, previous: string[]) =>
        previous.concat(
          v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        ),
      []
    )
    .option('--note <text>', 'Free-form note')
    .option('--actor <actor>', 'Writer actor attribution (default: WOLF_ACTOR env or user:cli)')
    .action(async (options) => {
      const actorFrom = resolveCreatedBy(options.from);
      appendCoordEventSignal(baseDir, {
        kind: options.kind,
        actorFrom,
        ...(options.to !== undefined ? { actorTo: options.to } : {}),
        refs: options.ref,
        ...(options.note !== undefined ? { note: options.note } : {}),
        actor: resolveCreatedBy(options.actor),
      });
      console.log(
        `coord event recorded: kind=${options.kind} from=${actorFrom}` +
          (options.to !== undefined ? ` -> ${options.to}` : '')
      );
    });
}
