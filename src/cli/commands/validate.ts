import { Command } from 'commander';
import { loadWorkflow } from '../../config/loader.js';
import { validateWorkflow } from '../../config/validator.js';

export function createValidateCommand(): Command {
  return new Command('validate')
    .description('Validate a workflow YAML file without running it')
    .argument('<workflow>', 'Path to workflow YAML file')
    .action(async (workflowPath: string) => {
      try {
        const workflow = loadWorkflow(workflowPath);
        const result = validateWorkflow(workflow);
        
        if (result.success) {
          console.log('Workflow is valid.');
          process.exit(0);
        } else {
          console.error('Validation failed:');
          result.errors?.forEach((e) => console.error(`  - ${e}`));
          process.exit(1);
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
