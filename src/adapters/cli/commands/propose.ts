// src/adapters/cli/commands/propose.ts
import { Command, Option } from 'commander';
import { safeCwd } from '../cli-entry.js';
import { saveProposal, type ProposalObject } from '../../../app/use-cases/save-proposal.js';
import { deliverProposal } from '../../../app/use-cases/deliver-proposal.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { UserFacingError } from '../../../domain/errors.js';

/** Волна 2.17 T-09 (design §«CLI: проектируемые команды», REQ-08/REQ-09):
 * группа `wolf propose` — тонкая обёртка над saveProposal/deliverProposal;
 * list читает записи facet='proposal' через store (признак предложения —
 * сам фасет, REQ-08 AC1).
 *
 * ADR-5: атрибуция — только env (WOLF_ACTOR); --created-by не экспортируется
 * (автор = env-атрибуция, REQ-09 AC3) — скрытая ловушка, прецедент face.ts. */

/** Скрытая ловушка ADR-5: парсится, но не показывается в help; отказ — в action. */
function createdByTrap(sub: Command): Command {
  const trap = new Option('--created-by <actor>', '');
  trap.hidden = true;
  return sub.addOption(trap);
}

function denyCreatedBy(options: { createdBy?: string }): void {
  if (options.createdBy !== undefined) {
    throw new UserFacingError(
      'propose commands do not accept --created-by: the author is env-only (WOLF_ACTOR, design ADR-5 / REQ-09)'
    );
  }
}

interface AddOptions {
  addressee: string;
  basis: string;
  change: string;
  benefit: string;
  bounds: string;
  createdBy?: string;
}

interface ListOptions {
  addressee?: string;
  pending?: boolean;
  delivered?: boolean;
  createdBy?: string;
}

// baseDir инъектится для тестов (прецедент: face.ts).
export function proposeCommand(baseDir: string = safeCwd()): Command {
  const cmd = new Command('propose').description('Manage proposals: save a signal, deliver it, list (REQ-08/09)');

  createdByTrap(
    cmd
      .command('add')
      .description('Save a proposal as a facet=proposal signal (author from env; not auto-applied)')
      .requiredOption('--addressee <a>', 'Addressee: any actor, including user:owner')
      .requiredOption('--basis <t>', 'Observation/experience the proposal is based on')
      .requiredOption('--change <t>', 'Proposed change')
      .requiredOption('--benefit <t>', 'Expected benefit')
      .requiredOption('--bounds <t>', 'Applicability bounds: where it applies and where not')
      .argument('[body]', 'Proposal body text')
  ).action(async (body: string | undefined, options: AddOptions) => {
    denyCreatedBy(options);
    const { store, log, clock, idGen, index, lock, declarations } = createCliContainer(baseDir);
    const saved = await saveProposal(
      { store, log, clock, idGen, index, lock, declarations },
      {
        addressee: options.addressee,
        basis: options.basis,
        proposedChange: options.change,
        expectedBenefit: options.benefit,
        applicabilityBounds: options.bounds,
        body,
      }
    );
    console.log(`Proposal saved: ${saved.id} (pending; deliver with: wolf propose deliver ${saved.id})`);
  });

  createdByTrap(
    cmd
      .command('deliver')
      .description('Deliver a saved proposal to its addressee (explicit step; the text is not applied)')
      .argument('<id>', 'Proposal memory id')
  ).action(async (id: string, options: { createdBy?: string }) => {
    denyCreatedBy(options);
    const { store, log, clock, idGen, index, lock } = createCliContainer(baseDir);
    const delivered = await deliverProposal({ store, log, clock, idGen, index, lock }, id);
    console.log(`Proposal delivered: ${id} -> ${delivered.addressee}`);
    console.log('The proposal stays a signal: applying it is the steward/owner decision (REQ-09).');
  });

  createdByTrap(
    cmd
      .command('list')
      .description('List proposals (facet=proposal) with pending/delivered marker')
      .option('--addressee <a>', 'Filter by addressee')
      .option('--pending', 'Only undelivered proposals')
      .option('--delivered', 'Only delivered proposals')
  ).action(async (options: ListOptions) => {
    denyCreatedBy(options);
    if (options.pending && options.delivered) {
      throw new UserFacingError('use either --pending or --delivered, not both');
    }
    const { store } = createCliContainer(baseDir);
    const all = (await store.list({ facet: 'proposal' })) as ProposalObject[];
    const filtered = all
      .filter((p) => options.addressee === undefined || p.addressee === options.addressee)
      .filter((p) => {
        const delivered = p.delivered_at !== undefined;
        if (options.pending) return !delivered;
        if (options.delivered) return delivered;
        return true;
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (filtered.length === 0) {
      console.log('No proposals.');
      return;
    }
    for (const p of filtered) {
      const mark = p.delivered_at !== undefined ? `[delivered]  at=${p.delivered_at}` : '[pending]';
      console.log(`${p.id}  ${mark}  -> ${p.addressee}  ${p.title}`);
    }
  });

  return cmd;
}
