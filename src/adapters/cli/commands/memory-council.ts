import { Command } from 'commander';
import { tallyCouncilVotes } from '../../../app/use-cases/tally-council-votes.js';
import { createSynthesis } from '../../../app/use-cases/create-synthesis.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryCouncilCommand(): Command {
  const council = new Command('council').description('Council operations');

  council
    .command('tally')
    .description('Tally council votes')
    .requiredOption('--question-id <id>', 'Question ID')
    .requiredOption('--quorum <n>', 'Minimum votes required', Number)
    .option('--threshold <x>', 'Consensus threshold (0-1)', Number, 0.5)
    .action(async (options: { questionId: string; quorum: number; threshold: number }) => {
      const { store, relations } = createCliContainer(process.cwd());
      const r = await tallyCouncilVotes(
        { store, relations },
        {
          questionId: options.questionId,
          quorum: options.quorum,
          consensusThreshold: options.threshold,
        }
      );
      console.log(`Question: ${r.questionId}`);
      console.log(`Votes (${r.votes.length}/${options.quorum} quorum):`);
      for (const v of r.votes) {
        console.log(`  ${v.opinionId}  ${v.voter}  ${v.vote}`);
      }
      console.log(`Tallies: ${JSON.stringify(r.tallies)}`);
      console.log(`Quorum met: ${r.quorumMet}`);
      console.log(`Winner: ${r.winner ?? 'none'}`);
    });

  council
    .command('synthesize')
    .description('Create synthesis from council opinions')
    .requiredOption('--question-id <id>', 'Question ID')
    .requiredOption('--recommendation <text>', 'Recommendation text')
    .option('--created-by <actor>', 'Creator actor', 'user:cli')
    .action(async (options: { questionId: string; recommendation: string; createdBy: string }) => {
      const { store, log, clock, idGen, relations } = createCliContainer(process.cwd());
      const { object: synth } = await createSynthesis(
        { store, log, clock, idGen, relations },
        { questionId: options.questionId, recommendation: options.recommendation, createdBy: options.createdBy }
      );
      console.log(`Created synthesis: ${synth.id}`);
    });

  return council;
}
