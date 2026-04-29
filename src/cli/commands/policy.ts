import { Command, Option } from 'commander';
import { PolicyPreflight } from '../../policy/preflight.js';
import { loadProjectConfig } from '../../config/project-config.js';
import { WorkflowDefinitionSchema } from '../../types/workflow.js';
import yaml from 'js-yaml';
import { readFileSync } from 'fs';

function loadWorkflow(path: string) {
  const content = readFileSync(path, 'utf-8');
  const parsed = yaml.load(content);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid workflow file: ${path}`);
  }
  return WorkflowDefinitionSchema.parse(parsed);
}

export function createPolicyCommand(): Command {
  const policy = new Command('policy').description('Manage workflow policies');

  policy
    .command('check')
    .description('Check workflow policy before running')
    .argument('<workflow.yaml>', 'Workflow file to check')
    .addOption(new Option('--json', 'Output as JSON'))
    .action(async (workflowPath: string, options: { json?: boolean }) => {
      const config = loadProjectConfig();
      const preflight = new PolicyPreflight();
      const workflow = loadWorkflow(workflowPath);
      const report = preflight.evaluate(workflow, config.policy);

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(`Policy check: ${report.overall.toUpperCase()}`);
        console.log(`  Allowed: ${report.steps_allowed}`);
        console.log(`  Ask: ${report.steps_ask}`);
        console.log(`  Denied: ${report.steps_denied}`);
        for (const d of report.decisions) {
          console.log(`  [${d.decision.toUpperCase()}] ${d.subject.step_id}: ${d.reason}`);
        }
      }

      if (report.overall === 'deny') {
        process.exit(1);
      }
    });

  return policy;
}
