import { Command, Option } from 'commander';
import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { SQLiteIndex } from '../../state/sqlite-index.js';
import { CaseStore } from '../../state/case-store.js';
import { GateStore } from '../../state/gate-store.js';
import { InProcessEventBus } from '../../kernel/event-bus.js';
import { WorkflowEngine } from '../../workflow/engine.js';
import { RunnerRegistry } from '../../workflow/runner-registry.js';
import { EchoRunner } from '../../workflow/runners/echo.js';
import { ShellRunner } from '../../workflow/runners/shell.js';
import { ManualGateRunner } from '../../workflow/runners/manual-gate.js';

export function createCasesCommand(): Command {
  const cases = new Command('cases')
    .description('Manage workflow cases');

  cases
    .command('list')
    .description('List all workflow cases')
    .option('--status <status>', 'Filter by status (created, running, paused, completed, failed)')
    .action(async (options: { status?: string }) => {
      const cwd = process.cwd();
      const casesDir = join(cwd, '.wolf', 'state', 'cases');
      const sqlitePath = join(cwd, '.wolf', 'state', 'wolf.sqlite');

      const rows: { caseId: string; status: string; updated: string }[] = [];

      if (existsSync(sqlitePath)) {
        const index = new SQLiteIndex(sqlitePath);
        const cases = index.listCases(options.status);
        for (const c of cases) {
          rows.push({ caseId: c.id, status: c.status, updated: '' });
        }
      } else {
        if (!existsSync(casesDir)) {
          console.log('No cases found.');
          return;
        }

        const caseDirs = readdirSync(casesDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);

        if (caseDirs.length === 0) {
          console.log('No cases found.');
          return;
        }

        for (const caseId of caseDirs) {
          const caseDir = join(casesDir, caseId);
          const caseYamlPath = join(caseDir, 'case.yaml');
          const stateJsonPath = join(caseDir, 'state.json');

          let status = 'unknown';
          let updated = '';

          if (existsSync(caseYamlPath)) {
            const content = readFileSync(caseYamlPath, 'utf-8');
            const meta = yaml.load(content) as Record<string, unknown>;
            status = String(meta.status || 'unknown');
            updated = String(meta.updated_at || '');
          } else if (existsSync(stateJsonPath)) {
            const content = readFileSync(stateJsonPath, 'utf-8');
            const state = JSON.parse(content) as Record<string, unknown>;
            status = String(state.status || 'unknown');
            updated = String(state.updated_at || '');
          }

          if (options.status && status !== options.status) {
            continue;
          }

          rows.push({ caseId, status, updated });
        }
      }

      if (rows.length === 0) {
        console.log('No cases found.');
        return;
      }

      console.log('CASE_ID\t\t\tSTATUS\t\tUPDATED');
      for (const row of rows) {
        console.log(`${row.caseId}\t${row.status}\t\t${row.updated}`);
      }
    });

  cases
    .command('inspect')
    .description('Inspect a specific case')
    .argument('<case_id>', 'Case ID to inspect')
    .option('--events', 'Include events')
    .addOption(new Option('--json', 'Output as JSON'))
    .action(async (caseId: string, options: { events?: boolean; json?: boolean }) => {
      const cwd = process.cwd();
      const caseDir = join(cwd, '.wolf', 'state', 'cases', caseId);

      if (!existsSync(caseDir)) {
        console.error(`Case not found: ${caseId}`);
        process.exit(1);
      }

      const stateJsonPath = join(caseDir, 'state.json');
      if (existsSync(stateJsonPath)) {
        const content = readFileSync(stateJsonPath, 'utf-8');
        const state = JSON.parse(content);

        if (options.json) {
          console.log(JSON.stringify(state, null, 2));
          return;
        }

        console.log('State:');
        console.log(JSON.stringify(state, null, 2));
      }

      if (options.events) {
        const eventsPath = join(caseDir, 'events.jsonl');
        if (existsSync(eventsPath)) {
          const content = readFileSync(eventsPath, 'utf-8');
          const events = content
            .split('\n')
            .filter((line: string) => line.trim())
            .map((line: string) => JSON.parse(line));
          console.log('\nEvents:');
          console.log(JSON.stringify(events, null, 2));
        } else {
          console.log('\nNo events found.');
        }
      }
    });

  cases
    .addCommand(
      new Command('cancel')
        .description('Cancel a running or paused case')
        .argument('<case_id>', 'Case ID to cancel')
        .action(async (caseId: string) => {
          const cwd = process.cwd();
          const stateDir = join(cwd, '.wolf', 'state');
          const caseStore = new CaseStore(stateDir);
          const gateStore = new GateStore(caseStore);
          const bus = new InProcessEventBus();
          const registry = new RunnerRegistry();
          registry.register(new EchoRunner());
          registry.register(new ShellRunner());
          registry.register(new ManualGateRunner());
          const engine = new WorkflowEngine(registry, caseStore, gateStore, bus);

          try {
            await engine.cancel(caseId);
            console.log(`Case ${caseId} cancelled.`);
            process.exit(0);
          } catch (err) {
            console.error('Error:', err instanceof Error ? err.message : String(err));
            process.exit(1);
          }
        })
    );

  return cases;
}
