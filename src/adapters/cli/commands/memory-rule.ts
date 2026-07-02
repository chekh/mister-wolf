import { Command } from 'commander';
import { createRule } from '../../../app/use-cases/create-rule.js';
import { listMemoryObjects } from '../../../app/use-cases/list-memory-objects.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryRuleCommand(): Command {
  const rule = new Command('rule').description('Manage rules');

  rule
    .command('add')
    .description('Add a rule (user only)')
    .requiredOption('--title <title>', 'Rule title')
    .requiredOption('--body <body>', 'Rule body')
    .requiredOption('--scope <scope>', 'Rule scope (project|global)')
    .option('--applies-to <items>', 'Comma-separated paths/patterns')
    .option('--trigger <trigger>', 'When to apply the rule')
    .option('--created-by <actor>', 'Creator actor', 'user:cli')
    .action(async (options) => {
      const { store, log, clock, idGen, index } = createCliContainer(process.cwd());
      const result = await createRule(
        { store, log, clock, idGen, index },
        {
          title: options.title,
          body: options.body,
          scope: options.scope,
          appliesTo: options.appliesTo ? options.appliesTo.split(',').map((t: string) => t.trim()) : [],
          trigger: options.trigger,
          createdBy: options.createdBy,
        }
      );
      console.log(`Created rule: ${result.object.id}`);
    });

  rule
    .command('list')
    .description('List rules')
    .action(async () => {
      const { store } = createCliContainer(process.cwd());
      const objects = await listMemoryObjects(store, { type: 'rule' });
      for (const obj of objects) {
        console.log(`${obj.id} [${obj.status}] [${(obj as { scope?: string }).scope ?? ''}] ${obj.title}`);
      }
    });

  return rule;
}
