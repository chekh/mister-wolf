import { Command, Option } from 'commander';
import {
  startThinking,
  addThought,
  concludeThinking,
  abandonThinking,
  THOUGHT_TYPES,
  ThoughtType,
} from '../../../app/use-cases/thinking.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryThinkCommand(): Command {
  const think = new Command('think').description('Structured thinking sequences (goal -> thoughts -> conclusion)');

  think
    .command('start')
    .description('Start a thinking sequence')
    .requiredOption('--goal <goal>', 'Goal of the thinking sequence')
    .option('--thread <thread-id>', 'Parent thread id')
    .option('--created-by <actor>', 'Creator actor (accepted for surface parity; not persisted on scratch)', 'user:cli')
    .action(async (options: { goal: string; thread?: string; createdBy: string }) => {
      const { clock, idGen } = createCliContainer(process.cwd());
      const meta = await startThinking(
        { baseDir: process.cwd(), clock, idGen },
        { goal: options.goal, thread: options.thread }
      );
      console.log(`Started thinking sequence: ${meta.id}`);
    });

  think
    .command('add')
    .description('Add a thought to a thinking sequence')
    .requiredOption('--sequence <id>', 'Thinking sequence id')
    .addOption(new Option('--type <type>', 'Thought type').choices([...THOUGHT_TYPES]).makeOptionMandatory())
    .requiredOption('--text <text>', 'Thought text')
    .action(async (options: { sequence: string; type: ThoughtType; text: string }) => {
      const { clock, idGen } = createCliContainer(process.cwd());
      const thought = await addThought(
        { baseDir: process.cwd(), clock, idGen },
        { sequenceId: options.sequence, type: options.type, text: options.text }
      );
      console.log(`Added thought: ${thought.tid}`);
    });

  think
    .command('conclude')
    .description('Conclude a thinking sequence into a decision with an embedded thinking trace')
    .requiredOption('--sequence <id>', 'Thinking sequence id')
    .requiredOption('--title <title>', 'Decision title')
    .requiredOption('--body <body>', 'Decision body')
    .option('--created-by <actor>', 'Creator actor', 'user:cli')
    .action(async (options: { sequence: string; title: string; body: string; createdBy: string }) => {
      const { store, log, clock, idGen, index, relations, lock } = createCliContainer(process.cwd());
      const result = await concludeThinking(
        { baseDir: process.cwd(), store, log, clock, idGen, index, relations, lock },
        { sequenceId: options.sequence, title: options.title, body: options.body, createdBy: options.createdBy }
      );
      console.log(`Created decision: ${result.object.id}`);
    });

  think
    .command('abandon')
    .description('Abandon a thinking sequence without creating a decision')
    .requiredOption('--sequence <id>', 'Thinking sequence id')
    .action(async (options: { sequence: string }) => {
      await abandonThinking({ baseDir: process.cwd() }, { sequenceId: options.sequence });
      console.log(`Abandoned thinking sequence: ${options.sequence}`);
    });

  return think;
}
