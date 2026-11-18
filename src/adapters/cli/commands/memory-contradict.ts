// src/adapters/cli/commands/memory-contradict.ts
import { Command } from 'commander';
import { safeCwd } from '../cli-entry.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import {
  reportMicroNoteContradiction,
  resolveMicroNoteSuppression,
} from '../../../app/use-cases/micro-note-contradiction.js';

/**
 * Волна R-4 (REQ-R4-1): пользовательский маршрут жизненного цикла противоречий
 * микро-заметок (use-case 3.2.0 T-09, S-27) — до волны доступен только из
 * тестов. Тонкие обёртки (прецедент сабкоманд: `wolf learn`): report
 * подавляет доставку до разрешения, resolve снимает (запись аудита
 * сохраняется), list — read-only обзор открытых подавлений. Актёра в схему
 * журнала НЕ вводим (схема 3.2.0 не меняется). Точный id@rev12 — note_evidence
 * из журнала; ошибки use-case/порта пробрасываются как UserFacingError без
 * подмены текстов.
 */
export function memoryContradictCommand(baseDir: string = safeCwd()): Command {
  const cmd = new Command('contradict').description(
    'Micro-note contradictions: report/resolve/list (REQ-R4-1; suppression journal)'
  );

  cmd
    .command('report')
    .description('Record a contradiction against an active micro-note (suppresses delivery until resolved)')
    .requiredOption('--note <id>', 'Memory id of the micro-note')
    .requiredOption('--reason <reason>', 'Why the note is contradicted')
    .requiredOption('--evidence <evidence>', 'Verbatim observation contradicting the note')
    .action(async (options: { note: string; reason: string; evidence: string }) => {
      const { store, clock, index } = createCliContainer(baseDir);
      const result = await reportMicroNoteContradiction(
        { store, clock, log: index },
        { note_id: options.note, reason: options.reason, contradiction_evidence: options.evidence }
      );
      console.log(`Contradiction recorded: ${result.note_evidence} (suppressed until resolved)`);
      console.log(`Suppressed at: ${result.suppressed_at}`);
      console.log(`Evidence: ${result.contradiction_evidence}`);
    });

  cmd
    .command('resolve')
    .description('Resolve the open suppression of a micro-note (delivery resumes; audit row stays)')
    .requiredOption('--note <id>', 'Memory id of the suppressed micro-note')
    .requiredOption('--resolution <resolution>', 'How the contradiction was resolved')
    .action(async (options: { note: string; resolution: string }) => {
      const { clock, index } = createCliContainer(baseDir);
      const result = resolveMicroNoteSuppression(
        { clock, log: index },
        { note_id: options.note, resolution: options.resolution }
      );
      // Точный id@rev12 — из записи журнала (аудит сохраняется и после резолва)
      const record = index.suppressions().find((s) => s.memory_id === result.memory_id);
      console.log(
        `Suppression resolved: ${record?.note_evidence ?? result.memory_id} (resolved at ${result.resolved_at})`
      );
    });

  cmd
    .command('list')
    .description('List open micro-note suppressions (read-only)')
    .action(async () => {
      const { index } = createCliContainer(baseDir);
      const open = index.suppressions().filter((s) => s.resolved_at === null);
      if (open.length === 0) {
        console.log('no open suppressions');
        return;
      }
      for (const s of open) {
        console.log(`${s.note_evidence} ${s.reason} (suppressed at ${s.suppressed_at})`);
      }
    });

  return cmd;
}
