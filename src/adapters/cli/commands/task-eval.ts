import { Command, Option } from 'commander';
import { safeCwd } from '../cli-entry.js';
import { appendTaskEvaluatedSignal } from '../../fs/session-metrics-log.js';

// P0 D3: `wolf task-eval` — ручная фиксация вердикта по задаче в сигнальный лог
// (event task_evaluated, writer (д) в session-metrics-log.ts). Дефолт scorer=human
// живёт здесь (спека D3); baseDir инъектится для тестов (прецедент: analytics.ts).
export function taskEvalCommand(baseDir: string = safeCwd()): Command {
  return (
    new Command('task-eval')
      .description('Record a task verdict into the signal log (event task_evaluated)')
      .addOption(
        new Option('--verdict <verdict>', 'Task verdict')
          .choices(['accepted', 'rejected', 'partial', 'inconclusive'])
          .makeOptionMandatory()
      )
      .addOption(
        new Option('--scorer <scorer>', 'Who evaluated the task')
          .choices(['human', 'deterministic', 'llm_judge', 'hidden_tests'])
          .default('human')
      )
      .option('--session <id>', 'Session id')
      .option('--task-id <id>', 'Task id')
      .option('--note <text>', 'Free-form note')
      // ponytail: явный radix 10 — commander передаёт дефолт как previous, bare parseInt принял бы его за radix
      .option('--criteria-passed <n>', 'Criteria passed count', (v: string) => parseInt(v, 10))
      .option('--criteria-total <m>', 'Criteria total count', (v: string) => parseInt(v, 10))
      .option('--critical-failure', 'Mark a critical failure', false)
      .action(async (options) => {
        appendTaskEvaluatedSignal(baseDir, {
          verdict: options.verdict,
          scorer: options.scorer,
          ...(options.session !== undefined ? { sessionId: options.session } : {}),
          ...(options.taskId !== undefined ? { taskId: options.taskId } : {}),
          ...(options.criteriaPassed !== undefined ? { criteriaPassed: options.criteriaPassed } : {}),
          ...(options.criteriaTotal !== undefined ? { criteriaTotal: options.criteriaTotal } : {}),
          ...(options.criticalFailure ? { criticalFailure: true } : {}),
          ...(options.note !== undefined ? { note: options.note } : {}),
        });
        console.log(
          `task verdict recorded: verdict=${options.verdict} scorer=${options.scorer}` +
            (options.session !== undefined ? ` session=${options.session}` : '')
        );
      })
  );
}
