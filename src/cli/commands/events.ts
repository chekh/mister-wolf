import { Command, Option } from 'commander';
import { CaseStore } from '../../state/case-store.js';
import { join } from 'path';

export function createEventsCommand(): Command {
  return new Command('events')
    .description('Show events for a case')
    .argument('<case_id>', 'Case ID')
    .option('--type <event_type>', 'Filter by event type')
    .addOption(new Option('--json', 'Output as JSON'))
    .action(async (caseId: string, options: { type?: string; json?: boolean }) => {
      const cwd = process.cwd();
      const stateDir = join(cwd, '.wolf', 'state');
      const caseStore = new CaseStore(stateDir);

      const events = caseStore.readEvents(caseId);
      if (events.length === 0) {
        console.log('No events found.');
        return;
      }

      let filtered = events;
      if (options.type) {
        filtered = events.filter((e: any) => e.type === options.type);
      }

      if (options.json) {
        console.log(JSON.stringify(filtered, null, 2));
        return;
      }

      for (const event of filtered) {
        const e = event as any;
        const ts = e.timestamp ? new Date(e.timestamp).toISOString() : '';
        console.log(`[${ts}] ${e.type}${e.step_id ? ` (${e.step_id})` : ''}`);
        if (e.payload && Object.keys(e.payload).length > 0) {
          console.log(`  ${JSON.stringify(e.payload)}`);
        }
      }
    });
}
