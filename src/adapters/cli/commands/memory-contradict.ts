// src/adapters/cli/commands/memory-contradict.ts
import { Command } from 'commander';
import { safeCwd } from '../cli-entry.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { JsonlMicroNoteDeliveryLog, type ImportReport } from '../../../adapters/fs/jsonl-micro-note-delivery-log.js';
import {
  reportMicroNoteContradiction,
  resolveMicroNoteSuppression,
  divergenceWarning,
} from '../../../app/use-cases/micro-note-contradiction.js';
import {
  suppressionBlockState,
  deliverableMicroNote,
  remainingBlockNotice,
} from '../../../app/use-cases/micro-note-delivery.js';
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
    .option('--revision <revision>', 'Observed revision (12–64 hex) the contradiction was seen on (REQ-333-5)')
    .action(async (options: { note: string; reason: string; evidence: string; revision?: string }) => {
      const { store, clock, idGen } = createCliContainer(baseDir);
      const result = await reportMicroNoteContradiction(
        { store, clock, log: journal(), idGen },
        {
          note_id: options.note,
          reason: options.reason,
          contradiction_evidence: options.evidence,
          observed_revision: options.revision,
        }
      );
      // AC-1.2: вывод report содержит id записи противоречия
      console.log(
        `Contradiction recorded: ${result.suppression_id} for ${result.note_evidence} (suppressed until resolved)`
      );
      console.log(`Suppressed at: ${result.suppressed_at}`);
      console.log(`Evidence: ${result.contradiction_evidence}`);
      // REQ-333-5 (ADR-340-5): расхождение наблюдаемой и текущей ревизий —
      // успех, но с явным предупреждением (текущая ревизия не подавляется)
      if (result.divergence) console.log(divergenceWarning(result.divergence));
    });

  cmd
    .command('resolve')
    .description('Resolve one suppression record by its id (closes exactly one record; the audit row stays)')
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
      const { store, clock } = createCliContainer(baseDir);
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
      // REQ-333-6 (AC-6.1): честный статус — закрывается ровно одна запись;
      // доставку могут по-прежнему держать другие открытые записи текущей ревизии
      const objects = await store.list();
      const note = objects.find((o) => o.id === result.memory_id);
      console.log(remainingBlockNotice(note, journal().suppressions()));
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
        // актуальность по ТОМУ Ж правилу, что фильтр доставки (suppressionBlockState);
        // REQ-333-6 (AC-6.2): deliverable — адресована ли запись доставляемому
        // micro-note (запись строки из блокировки исключается). deliverable —
        // ПЕРЕД block: сценарии ревью 3.3.1 якорят `block: <state>$` (правки их
        // тестов запрещены), формат строки продолжает заканчиваться блокировкой.
        // T-333-8.5 (F-4): один снимок подавлений (`open`) на всю команду —
        // suppressions() не вызывается на каждую строку.
        console.log(
          `${s.suppression_id} ${s.memory_id}@${s.revision} ${s.reason} (suppressed at ${s.suppressed_at}) deliverable: ${deliverableMicroNote(byId.get(s.memory_id), open, s.suppression_id)} block: ${suppressionBlockState(s, byId.get(s.memory_id))}`
        );
      }
    });

  // REQ-333-1 (ADR-340-3): идемпотентный досмотр wt-журналов ≤3.3.1; в
  // loss-состоянии адаптер отказывает с подсказкой restore. Отчёт — источники,
  // счётчики, re-id; отказавший источник завершает команду ошибкой (REQ-03).
  cmd
    .command('import')
    .description('Idempotently scan pre-upgrade worktree journals into the shared suppression journal')
    .action(async () => {
      const report = journal().importWorktreeJournals();
      printImportReport(report);
    });

  // REQ-333-4 (ADR-340-2): явное восстановление утраченного журнала из
  // замороженного index.sqlite + wt-журналов; отчёт называет источники,
  // счётчики, re-id и явную границу потерь; путь сброса — в выводе.
  cmd
    .command('restore')
    .description('Rebuild a lost suppression journal from index.sqlite and worktree journals (loss state only)')
    .action(async () => {
      const report = journal().restoreFromSources();
      printImportReport(report);
      console.log(
        'Reset path: remove BOTH the journal marker (.wolf/memory/micro-note-delivery.migrated.json) and the journal file — the next access performs a fresh first import.'
      );
    });

  return cmd;
}

function printImportReport(report: ImportReport): void {
  console.log('Import report:');
  for (const s of report.sources) {
    if (s.refused) {
      console.log(`- ${s.path} (${s.kind}): REFUSED — ${s.refused}`);
      continue;
    }
    const counts = `suppressions=${s.imported.suppressions}, deliveries=${s.imported.deliveries}, observations=${s.imported.observations}`;
    const reid = s.reid.length > 0 ? `; re-id: ${s.reid.map((r) => `${r.from} -> ${r.to}`).join(', ')}` : '';
    console.log(`- ${s.path} (${s.kind}): imported ${counts}${reid}`);
  }
  console.log(`Unrecoverable: ${report.unrecoverable}`);
}
