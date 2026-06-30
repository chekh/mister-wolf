import { Command } from 'commander';
import { createInfoRequest } from '../../../app/use-cases/create-info-request.js';
import { listMemoryObjects } from '../../../app/use-cases/list-memory-objects.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { InfoRequest } from '../../../domain/schemas/info-request-schema.js';

export function memoryInfoRequestCommand(): Command {
  const infoRequest = new Command('info-request').description('Manage info requests');

  infoRequest
    .command('create')
    .description('Create an info request')
    .requiredOption('--title <title>', 'Request title')
    .requiredOption('--thread <thread-id>', 'Parent thread id')
    .requiredOption('--question <question>', 'Question to answer')
    .requiredOption('--detour-reason <reason>', 'Why this derails the main session')
    .requiredOption('--expected-answer <answers>', 'Comma-separated expected answer items')
    .option('--needed-for <items>', 'Comma-separated items this answer is needed for')
    .option('--preliminary-answer <answer>', 'Preliminary answer', '')
    .option('--created-by <actor>', 'Creator actor', 'user:cli')
    .action(async (options) => {
      const { store, log, clock, idGen, index, relations } = createCliContainer(process.cwd());
      const result = await createInfoRequest(
        { store, log, clock, idGen, index, relations },
        {
          title: options.title,
          thread: options.thread,
          question: options.question,
          detourReason: options.detourReason,
          expectedAnswer: options.expectedAnswer.split(',').map((s: string) => s.trim()),
          neededFor: options.neededFor ? options.neededFor.split(',').map((s: string) => s.trim()) : [],
          preliminaryAnswer: options.preliminaryAnswer,
          createdBy: options.createdBy,
        }
      );
      console.log(`Created info request: ${result.object.id}`);
    });

  infoRequest
    .command('list')
    .description('List info requests')
    .option('--thread <thread-id>', 'Filter by thread')
    .action(async (options) => {
      const { store } = createCliContainer(process.cwd());
      const objects = await listMemoryObjects(store, { type: 'info-request' });
      for (const obj of objects) {
        if (options.thread && (obj as InfoRequest).thread !== options.thread) continue;
        console.log(`${obj.id} [${obj.status}] ${obj.title}`);
      }
    });

  return infoRequest;
}
