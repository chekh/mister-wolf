// src/adapters/cli/commands/learn-queue.ts
import { Command } from 'commander';
import { createCliContainer } from '../../../bootstrap/container.js';
import { loadWolfConfigSync } from '../../../adapters/fs/config-file.js';
import {
  getLearningDue,
  listSignalPage,
  type LearningDueResult,
  type SignalPageResult,
} from '../../../app/use-cases/learning-queries.js';
import { ackLearningBatch, dismissLearningSignal } from '../../../app/use-cases/learning-queue-actions.js';

/**
 * 3.2.0 T-05 (REQ-03, REQ-12, NFR-05, design §9): очередь сигналов цикла
 * обучения — due-подсказка, аудит индекса, ack/dismiss. Отдельная группа и файл
 * (learn-queue.ts / learnQueueCommand): `wolf learn` (accept/apply/rollback)
 * принадлежит T-06, файл learn.ts — его область записи; слияние групп —
 * решение ведущего на интеграции (design §9: точное имя — по реестру).
 *
 * due — детерминированная read-only подсказка (курсор не двигается, ничего не
 * диспетчируется); list — аудит индекса страницами; ack/dismiss — явные
 * мутации очереди. База сигналов читается из индекса (без body-scan), тела
 * записей страницы вызывающий читает отдельно через `wolf get`.
 */

interface JsonOptions {
  json?: boolean;
}

function printDue(result: LearningDueResult): void {
  if (result.mode === 'off') {
    console.log(`learning mode is "off" — the queue proposes no work (REQ-12); cursor=${result.cursor}`);
    return;
  }
  if (result.items.length === 0) {
    console.log(`Queue is empty (cursor=${result.cursor}) — no work for the steward: 0 model calls (NFR-01, REQ-12).`);
    return;
  }
  console.log(
    `Due queue: ${result.items.length} shown of ${result.pending_count} pending (cursor=${result.cursor}, limit=${result.limit}, mode=${result.mode})`
  );
  for (const item of result.items) {
    console.log(`  seq=${item.seq}  ${item.memory_id}  [${item.type}]  changed=${item.changed_at}  ${item.title}`);
  }
  console.log('Read-only hint: nothing dispatched, cursor unchanged. Ack a processed batch with: wolf learn-queue ack');
}

function printSignalPage(result: SignalPageResult): void {
  for (const item of result.items) {
    console.log(
      `  seq=${item.seq}  ${item.memory_id}  [${item.type}]  ${item.status}  ${item.disposition}  changed=${item.changed_at}  ${item.title}`
    );
  }
  if (result.has_more) {
    console.log(`Next page: wolf learn-queue list --after-seq ${result.next_after_seq} --limit ${result.limit}`);
  } else {
    console.log(`End of index (${result.items.length} shown).`);
  }
}

// baseDir инъектится для тестов (прецедент: face.ts, propose.ts).
// Интеграция 3.2.0 (решение ведущего, design §9): подкоманды очереди
// присоединяются к общей группе `wolf learn` (learn.ts), отдельной группы
// `learn-queue` больше нет.
export function registerLearningQueueCommands(cmd: Command, baseDir: string): void {
  cmd
    .command('due')
    .description(
      'Deterministic due queue: new/changed signals after the cursor (bounded page; read-only; nothing dispatched)'
    )
    .option('--limit <n>', 'Max entries on the page (1..200)', '20')
    .option('--json', 'JSON output')
    .action((options: { limit: string } & JsonOptions) => {
      const { index } = createCliContainer(baseDir);
      const result = getLearningDue(
        { signals: index, env: process.env, config: loadWolfConfigSync(baseDir) },
        { limit: Number(options.limit) }
      );
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else printDue(result);
    });

  cmd
    .command('list')
    .description('Audit the signal index page by seq (all signals incl. processed; works in any mode)')
    .option('--limit <n>', 'Max entries on the page (1..200)', '20')
    .option('--after-seq <n>', 'Show signals with seq greater than this (pagination)', '0')
    .option('--json', 'JSON output')
    .action((options: { limit: string; afterSeq: string } & JsonOptions) => {
      const { index } = createCliContainer(baseDir);
      const result = listSignalPage(
        { signals: index },
        { limit: Number(options.limit), after_seq: Number(options.afterSeq) }
      );
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else printSignalPage(result);
    });

  cmd
    .command('ack')
    .description('Mark the processed batch: advance the cursor (monotonic; does not dispatch anything)')
    .option('--seq <n>', 'Advance to this seq (default: the highest indexed seq)')
    .action((options: { seq?: string }) => {
      const { index } = createCliContainer(baseDir);
      const result = ackLearningBatch(
        { signals: index, env: process.env, config: loadWolfConfigSync(baseDir) },
        { seq: options.seq === undefined ? undefined : Number(options.seq) }
      );
      console.log(
        result.advanced
          ? `Cursor advanced: ${result.cursor_before} -> ${result.cursor} (mode=${result.mode})`
          : `Cursor unchanged at ${result.cursor} (mode=${result.mode}; it never moves backwards)`
      );
    });

  cmd
    .command('dismiss <id>')
    .description('Dismiss a signal: excluded from due; a new revision does not bring it back automatically (REQ-03)')
    .action((id: string) => {
      const { index } = createCliContainer(baseDir);
      const result = dismissLearningSignal({ signals: index }, { memory_id: id });
      console.log(
        `Signal dismissed: ${result.memory_id} (disposition=${result.disposition}; it will not return automatically)`
      );
    });
}
