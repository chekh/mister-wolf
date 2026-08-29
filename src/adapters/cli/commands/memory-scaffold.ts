import { Command, Argument } from 'commander';
import { scaffoldFrame, SCAFFOLD_KINDS, type ScaffoldKind } from '../../../app/use-cases/scaffold-agent.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { resolveCreatedBy } from '../../../domain/actor.js';
import { UserFacingError } from '../../../domain/errors.js';

export function memoryScaffoldCommand(): Command {
  return new Command('scaffold')
    .description('Scaffold opencode frame (agent|skill|command) + playbook in Wolf memory')
    .addArgument(new Argument('<kind>', 'Frame kind').choices([...SCAFFOLD_KINDS]))
    .argument('<name>', 'Frame name')
    .option('--persona <text>', 'Agent frame body text (agent only)')
    .option('--model <model>', 'Agent frontmatter model (agent only)')
    .option('--from-playbook <id>', 'Reuse existing playbook id instead of creating a new one')
    .option('--created-by <actor>', 'Creator actor (default: env WOLF_ACTOR, else user:cli)')
    .action(
      async (
        kind: string,
        name: string,
        options: { persona?: string; model?: string; fromPlaybook?: string; createdBy?: string }
      ) => {
        if (kind !== 'agent' && (options.persona !== undefined || options.model !== undefined)) {
          throw new UserFacingError('--persona и --model поддерживаются только для kind=agent');
        }
        const { store, log, clock, idGen, index, relations, declarations, fs, lock } = createCliContainer(
          process.cwd()
        );
        const result = await scaffoldFrame(
          { store, log, clock, idGen, index, relations, declarations, fs, lock, baseDir: process.cwd() },
          {
            kind: kind as ScaffoldKind,
            name,
            persona: options.persona,
            model: options.model,
            fromPlaybook: options.fromPlaybook,
            createdBy: resolveCreatedBy(options.createdBy),
          }
        );
        console.log(`Created playbook: ${result.playbookId}`);
        console.log(`Created frame: ${result.framePath}`);
      }
    );
}
