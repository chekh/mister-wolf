import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { createExecFileGitRunner, gitInspectExitCode, runGitInspect } from '../../../app/use-cases/git-inspect.js';

/**
 * B0.5: обвязка git-inspect. Вывод — единственный JSON-объект в stdout;
 * exit-код кодирует вердикт (ADR-3), поэтому process.exitCode, а не throw.
 */
export function gitInspectCommand(): Command {
  return new Command('git-inspect')
    .description('Inspect git state (read-only) and print a JSON report with a PASS|VIOLATION|UNKNOWN verdict')
    .option('--baseline <sha>', 'baseline commit SHA the task started from')
    .option('--target <ref>', 'expected comparison target (default: upstream branch)')
    .option('--owner <id>', 'branch owner identity passed through into the report')
    .action(async (options: { baseline?: string; target?: string; owner?: string }) => {
      const report = await runGitInspect(
        { runner: createExecFileGitRunner(), exists: existsSync, now: () => new Date() },
        { cwd: process.cwd(), baseline: options.baseline, target: options.target, owner: options.owner }
      );
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = gitInspectExitCode(report.verdict);
    });
}
