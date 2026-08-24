import { Command } from 'commander';
import { recordRelation } from '../../../app/use-cases/record-relation.js';
import { RelationPredicate } from '../../../domain/schemas/relation-schema.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryRelationCommand(): Command {
  const cmd = new Command('relation').description('Manage relations between memory objects');

  cmd
    .command('add')
    .description('Record a relation between two memory objects')
    .argument('<subject>', 'Subject memory object id')
    .argument('<predicate>', 'Relation predicate')
    .argument('<object>', 'Object memory object id')
    .option('--source <source>', 'Relation source', 'agent')
    .action(async (subject: string, predicate: string, object: string, options: { source: string }) => {
      const { relations, idGen, lock } = createCliContainer(process.cwd());
      await recordRelation(
        { relations, idGen, lock },
        new Date(),
        subject,
        predicate as RelationPredicate,
        object,
        options.source as 'manual' | 'agent' | 'system'
      );
      console.log(`Recorded relation: ${subject} -${predicate}- ${object}`);
    });

  return cmd;
}
