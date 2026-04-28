import { Command } from 'commander';
import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { CaseStore } from '../../state/case-store.js';
import { GateStore } from '../../state/gate-store.js';

export function createGatesCommand(): Command {
  return new Command('gates')
    .description('Manage manual gates')
    .command('list')
    .description('List gates')
    .option('--case <case_id>', 'Filter by case ID')
    .action(async (options: { case?: string }) => {
      const cwd = process.cwd();
      const casesDir = join(cwd, '.wolf', 'state', 'cases');

      if (!existsSync(casesDir)) {
        console.log('No gates found.');
        return;
      }

      const caseDirs = readdirSync(casesDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      const rows: { gateId: string; caseId: string; stepId: string; status: string; requestedAt: string }[] = [];

      for (const caseId of caseDirs) {
        if (options.case && caseId !== options.case) {
          continue;
        }

        const statePath = join(casesDir, caseId, 'state.json');
        if (!existsSync(statePath)) continue;

        const content = readFileSync(statePath, 'utf-8');
        const state = JSON.parse(content) as Record<string, unknown>;
        const gates = (state.gates || {}) as Record<string, Record<string, unknown>>;

        for (const [gateId, gate] of Object.entries(gates)) {
          rows.push({
            gateId,
            caseId,
            stepId: String(gate.step_id || ''),
            status: String(gate.status || ''),
            requestedAt: String(gate.requested_at || ''),
          });
        }
      }

      if (rows.length === 0) {
        console.log('No gates found.');
        return;
      }

      console.log('GATE_ID\t\t\t\tCASE_ID\t\t\tSTEP_ID\t\tSTATUS\t\tREQUESTED_AT');
      for (const row of rows) {
        console.log(`${row.gateId}\t${row.caseId}\t${row.stepId}\t${row.status}\t${row.requestedAt}`);
      }
    });
}

export function createApproveCommand(): Command {
  return new Command('approve')
    .description('Approve a gate')
    .argument('<gate_id>', 'Gate ID to approve')
    .action(async (gateId: string) => {
      const cwd = process.cwd();
      const stateDir = join(cwd, '.wolf', 'state');
      const caseStore = new CaseStore(stateDir);
      const gateStore = new GateStore(caseStore);

      try {
        gateStore.approveGate(gateId, 'cli-user');
        console.log(`Gate ${gateId} approved.`);
        process.exit(0);
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

export function createRejectCommand(): Command {
  return new Command('reject')
    .description('Reject a gate')
    .argument('<gate_id>', 'Gate ID to reject')
    .action(async (gateId: string) => {
      const cwd = process.cwd();
      const stateDir = join(cwd, '.wolf', 'state');
      const caseStore = new CaseStore(stateDir);
      const gateStore = new GateStore(caseStore);

      try {
        gateStore.rejectGate(gateId, 'cli-user');
        console.log(`Gate ${gateId} rejected.`);
        process.exit(0);
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
