// src/adapters/cli/commands/memory-contradict.ts
import { Command } from 'commander';
import { safeCwd } from '../cli-entry.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { JsonlMicroNoteDeliveryLog } from '../../../adapters/fs/jsonl-micro-note-delivery-log.js';
import {
  reportMicroNoteContradiction,
  resolveMicroNoteSuppression,
} from '../../../app/use-cases/micro-note-contradiction.js';
import { suppressionBlockState } from '../../../app/use-cases/micro-note-delivery.js';
import { UserFacingError } from '../../../domain/errors.js';

/**
 * Волна R-4 (REQ-R4-1) + патч 3.3.1 (REQ-331-1/4/5): пользовательский маршрут
 * жизненного цикла противоречий микро-заметок. report подавляет доставку до
 * разрешения и печатает id записи; resolve адресует ЗАПИСЬ журнала (--id
 * <suppression_id>, AC-1.3) — переданный --note больше не поддерживается и
 * отказывает с перечнем открытых id записей заметки (переходная подсказка,
 * AC-1.4); list — read-only обзор открытых подавлений с ревизией и актуальностью
 * блокировки (design §9, правило то же, что фильтр доставки, AC-5.4). Журнал —
 * постоянный JSONL вне .wolf/cache (REQ-331-2). Ошибки use-case/порта
 * пробрасываются как UserFacingError без подмены текстов.
 */
export function memoryContradictCommand(baseDir: string = safeCwd()): Command {
  const cmd = new Command('contradict').description(
    'Micro-note contradictions: report/resolve/list (REQ-R4-1; suppression journal)'
  );
  const journal = (): JsonlMicroNoteDeliveryLog => new JsonlMicroNoteDeliveryLog(baseDir);

  cmd
    .command('report')
    .description('Record a contradiction against an active micro-note (suppresses delivery until resolved)')
    .requiredOption('--note <id>', 'Memory id of the micro-note')
    .requiredOption('--reason <reason>', 'Why the note is contradicted')
    .requiredOption('--evidence <evidence>', 'Verbatim observation contradicting the note')
    .action(async (options: { note: string; reason: string; evidence: string }) => {
      const { store, clock, idGen } = createCliContainer(baseDir);
      const result = await reportMicroNoteContradiction(
        { store, clock, log: journal(), idGen },
        { note_id: options.note, reason: options.reason, contradiction_evidence: options.evidence }
      );
      // AC-1.2: вывод report содержит id записи противоречия
      console.log(
        `Contradiction recorded: ${result.suppression_id} for ${result.note_evidence} (suppressed until resolved)`
      );
      console.log(`Suppressed at: ${result.suppressed_at}`);
      console.log(`Evidence: ${result.contradiction_evidence}`);
    });

  cmd
    .command('resolve')
    .description('Resolve one suppression record by its id (delivery resumes; audit row stays)')
    .option('--id <suppression_id>', 'Suppression record id (cnr_…; see: wolf contradict list)')
    .option('--note <id>', 'Deprecated note addressing: refused with the list of open record ids')
    .requiredOption('--resolution <resolution>', 'How the contradiction was resolved')
    .action(async (options: { id?: string; note?: string; resolution: string }) => {
      if (!options.id) {
        if (options.note !== undefined) {
          // AC-1.4 (переходная подсказка): адресация по заметке — дефект P1-1,
          // обратной совместимости флага нет; перечень — фактические открытые id.
          const open = journal()
            .suppressions()
            .filter((s) => s.resolved_at === null && s.memory_id === options.note);
          const listed =
            open.length > 0
              ? open.map((s) => `"${s.suppression_id}"`).join(', ')
              : 'no open suppressions for this note';
          throw new UserFacingError(
            `resolve addresses a suppression record by --id; --note is not supported since 3.3.1 — open suppressions for note "${options.note}": ${listed}`
          );
        }
        throw new UserFacingError('resolve requires --id <suppression_id> (see: wolf contradict list)');
      }
      const { clock } = createCliContainer(baseDir);
      const result = resolveMicroNoteSuppression(
        { clock, log: journal() },
        { suppression_id: options.id, resolution: options.resolution }
      );
      // Точный id@rev12 — из записи журнала (аудит сохраняется и после резолва)
      const record = journal()
        .suppressions()
        .find((s) => s.suppression_id === result.suppression_id);
      console.log(
        `Suppression resolved: ${record?.note_evidence ?? result.suppression_id} (resolved at ${result.resolved_at})`
      );
    });

  cmd
    .command('list')
    .description('List open micro-note suppressions with revision and block actuality (read-only)')
    .action(async () => {
      const { store } = createCliContainer(baseDir);
      const log = journal();
      const objects = await store.list();
      const byId = new Map(objects.map((o) => [o.id, o]));
      const open = log.suppressions().filter((s) => s.resolved_at === null);
      if (open.length === 0) {
        console.log('no open suppressions');
        return;
      }
      for (const s of open) {
        // AC-5.1/AC-5.2/AC-5.4: id, note@revision записи, reason, suppressed_at и
        // актуальность по ТОМУ Ж правилу, что фильтр доставки (suppressionBlockState)
        console.log(
          `${s.suppression_id} ${s.memory_id}@${s.revision} ${s.reason} (suppressed at ${s.suppressed_at}) block: ${suppressionBlockState(s, byId.get(s.memory_id))}`
        );
      }
    });

  return cmd;
}
