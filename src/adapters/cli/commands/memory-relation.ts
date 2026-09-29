import { Command } from 'commander';
import { safeCwd } from '../cli-entry.js';
import { recordRelation } from '../../../app/use-cases/record-relation.js';
import { RelationPredicate } from '../../../domain/schemas/relation-schema.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { UserFacingError } from '../../../domain/errors.js';

// relation list/remove — спека 2.13 §6.4. remove не удаляет строки:
// дописывает компенсирующую запись removed: true (append-only, прецедент
// событий); list() рёбра с removed не читает. Откат = убрать запись.
// baseDir инъектится для тестов (прецедент: memory-update.ts).
export function memoryRelationCommand(baseDir: string = safeCwd()): Command {
  const cmd = new Command('relation').description('Manage relations between memory objects');

  cmd
    .command('add')
    .description('Record a relation between two memory objects')
    .argument('<subject>', 'Subject memory object id')
    .argument('<predicate>', 'Relation predicate')
    .argument('<object>', 'Object memory object id')
    .option('--source <source>', 'Relation source', 'agent')
    .action(async (subject: string, predicate: string, object: string, options: { source: string }) => {
      const { relations, idGen, lock } = createCliContainer(baseDir);
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

  cmd
    .command('list')
    .description('List relations (--of <id>: both directions of a memory object)')
    .option('--of <id>', 'Filter by memory object id (subject or object side)')
    .option('--json', 'Output JSON')
    .action(async (options: { of?: string; json?: boolean }) => {
      const { relations } = createCliContainer(baseDir);
      let rows = await relations.list();
      if (options.of) rows = rows.filter((r) => r.subject === options.of || r.object === options.of);
      if (options.json) {
        console.log(JSON.stringify(rows, null, 2));
        return;
      }
      if (rows.length === 0) {
        console.log('No relations.');
        return;
      }
      for (const r of rows) console.log(`${r.id}  ${r.subject} -${r.predicate}-> ${r.object}`);
    });

  cmd
    .command('remove')
    .description('Remove a relation by id (appends a compensating record)')
    .argument('<id>', 'Relation id (see: relation list)')
    .action(async (id: string) => {
      const { relations, clock, lock } = createCliContainer(baseDir);
      const target = (await relations.list()).find((r) => r.id === id);
      if (!target) throw new UserFacingError(`Relation not found: ${id}`);
      const now = clock.now();
      const run = async (): Promise<void> => {
        await relations.append({
          // надгробие несёт id гасимого ребра (откат = убрать эту запись);
          // replay идёт по тройке, повторный add живит ребро новой записью
          id: target.id,
          subject: target.subject,
          predicate: target.predicate,
          object: target.object,
          created_at: target.created_at,
          source: target.source,
          confidence: target.confidence,
          removed: true,
          removed_at: now.toISOString(),
        });
        console.log(`Removed relation ${id}: ${target.subject} -${target.predicate}-> ${target.object}`);
      };
      return lock ? lock.withLock(run) : run();
    });

  return cmd;
}
