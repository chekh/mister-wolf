import { Command } from 'commander';
import { relative } from 'path';
import { spawnSync } from 'child_process';
import { safeCwd } from '../cli-entry.js';
import { planLayoutMigration, applyLayoutMigration, type MigrationReport } from '../../fs/layout-migration.js';
import { planDocIdMigration, applyDocIdMigration, type DocIdMigrationReport } from '../../fs/doc-id-migration.js';
import { migrateRunLog, type RunLogMigrationReport } from '../../fs/run-log-migration.js';
import {
  planTaxonomyMigration,
  applyTaxonomyMigration,
  type TaxonomyMigrationReport,
} from '../../fs/taxonomy-migration.js';

export function memoryMigrateCommand(): Command {
  const migrate = new Command('migrate')
    .description('One-time migration: objects/<type>/ -> threads/<tid>/<subdir>/ + shared/')
    .option('--apply', 'perform the migration (default: dry-run)', false)
    .action(async ({ apply }) => {
      const baseDir = safeCwd();
      const report: MigrationReport = apply ? await applyLayoutMigration(baseDir) : await planLayoutMigration(baseDir);
      printMigrationReport(report, apply ? 'apply' : 'dry-run');
      process.exitCode = report.conflicts.length > 0 ? 2 : 0;
    });
  // `--apply` у родителя migrate остаётся за layout; doc-ids — свой токен (спека 2.1.0 §2.6).
  // Commander скармливает конфликтующий по имени флаг РОДИТЕЛЮ (проверено на v12),
  // поэтому подкоманда читает обе опции — свою и родительскую.
  migrate.addCommand(
    new Command('doc-ids')
      .description('One-time migration of document-ref ids to canonical format (spec 2.1.0 §2.6); --apply to perform')
      .option('--apply', 'perform the migration (default: dry-run)', false)
      .action(async (opts, cmd) => {
        const apply = Boolean(opts.apply) || Boolean(cmd.parent?.opts().apply);
        const baseDir = safeCwd();
        const report: DocIdMigrationReport = apply
          ? await applyDocIdMigration(baseDir)
          : await planDocIdMigration(baseDir);
        printDocIdReport(report, apply ? 'apply' : 'dry-run');
        process.exitCode = report.conflicts.length > 0 ? 2 : 0;
      })
  );
  // run-log: архивация legacy-файла тривиальна и идемпотентна — dry-run не нужен
  // (спека P1: двойной счёт у обновившихся, пока analytics мержит legacy-файл).
  migrate.addCommand(
    new Command('run-log')
      .description('Archive legacy .wolf/run-log.jsonl to .wolf/metrics/archive (idempotent)')
      .action(async () => {
        const baseDir = safeCwd();
        try {
          const report = await migrateRunLog(baseDir);
          printRunLogReport(report, baseDir);
        } catch (err: unknown) {
          console.error(`Error: wolf migrate run-log failed: ${err instanceof Error ? err.message : String(err)}`);
          process.exitCode = 1;
        }
      })
  );
  // taxonomy (спека 2.13 §8.2): 26 старых типов → 7 + фасеты; dry-run по умолчанию.
  // --apply читается и у родителя (прецедент doc-ids: commander скармливает
  // конфликтующий по имени флаг родителю).
  migrate.addCommand(
    new Command('taxonomy')
      .description('One-time migration to the 7-type taxonomy (spec 2.13 §8.2); --apply to perform')
      .option('--apply', 'perform the migration (default: dry-run)', false)
      .option('--force', 'apply even if .wolf/memory is not in a clean git state', false)
      .action(async (opts, cmd) => {
        const apply = Boolean(opts.apply) || Boolean(cmd.parent?.opts().apply);
        const baseDir = safeCwd();
        // §8.2.4: перед --apply — чистый git-статус .wolf/memory (не-git/грязный → --force)
        if (apply && !opts.force) {
          const git = spawnSync('git', ['status', '--porcelain', '--', '.wolf/memory'], {
            cwd: baseDir,
            encoding: 'utf-8',
          });
          const clean = git.status === 0 && git.stdout.trim() === '';
          if (!clean) {
            console.error(
              'Refusing to apply: .wolf/memory must be in a clean git state (spec 2.13 §8.2.4).\n' +
                '  Commit .wolf/memory first; rollback = git checkout .wolf/memory + wolf rebuild-index.\n' +
                '  Or rerun with --force.'
            );
            process.exitCode = 1;
            return;
          }
        }
        const report: TaxonomyMigrationReport = apply
          ? await applyTaxonomyMigration(baseDir)
          : await planTaxonomyMigration(baseDir);
        printTaxonomyReport(report, apply ? 'apply' : 'dry-run');
        // §8.2: exit 2 при конфликтах (даже с --apply: конфликтные файлы не тронуты,
        // остальной план выполняется)
        process.exitCode = report.conflicts.length > 0 ? 2 : 0;
      })
  );
  return migrate;
}

function printMigrationReport(report: MigrationReport, mode: string): void {
  console.log(`# wolf migrate — layout v2 (mode: ${mode})`);
  console.log();
  console.log(`source: .wolf/memory/objects (${report.entries.length} objects)`);
  console.log();

  // table header
  console.log('| #  | id | type | from | to |');
  console.log('|----|-----|------|------|----|');
  report.entries.forEach((e, i) => {
    const from = e.from.replace(/^\.wolf\/memory\//, '');
    const to = e.to.replace(/^\.wolf\/memory\//, '');
    console.log(`| ${i + 1}  | ${e.id} | ${e.type} | ${from} | ${to} |`);
  });

  // document split stats
  const docRef = report.entries.filter((e) => e.type === 'document-ref').length;
  const docNative = report.entries.filter((e) => e.type === 'document-native').length;
  const docTotal = docRef + docNative;
  if (docTotal > 0) {
    console.log(`document split: ${docTotal} (ref ${docRef} / native ${docNative})`);
  }

  const moved = mode === 'apply' ? report.entries.filter((e) => e.action !== 'conflict').length : 0;
  console.log(
    `moved: ${moved}${mode === 'dry-run' ? ' (dry-run)' : ''} | conflicts: ${report.conflicts.length} | unparsable (untouched): ${report.problems.length}`
  );
}

function printDocIdReport(report: DocIdMigrationReport, mode: 'dry-run' | 'apply'): void {
  console.log(`# wolf migrate doc-ids (mode: ${mode})`);
  console.log();

  console.log('| id | new id | from | to |');
  console.log('|----|--------|------|----|');
  for (const e of report.entries) {
    const from = e.from.replace(/^\.wolf\/memory\//, '');
    const to = e.to.replace(/^\.wolf\/memory\//, '');
    const mark = e.action === 'conflict' ? ' **CONFLICT**' : '';
    console.log(`| ${e.id} | ${e.newId}${mark} | ${from} | ${to} |`);
  }

  console.log();
  console.log(
    `renamed: ${report.renamed}${mode === 'dry-run' ? ' (dry-run)' : ''}` +
      ` | refs rewritten: ${report.refsRewritten}` +
      ` | conflicts: ${report.conflicts.length}` +
      ` | problems: ${report.problems.length}`
  );
  for (const p of report.problems) {
    console.log(`problem: ${p.path}: ${p.error}`);
  }
  if (report.conflicts.length > 0) {
    console.log('conflicts (untouched):');
    for (const c of report.conflicts) console.log(`  ${c.id} -> ${c.newId}: target ${c.to} is taken by another object`);
  }
}

function printRunLogReport(report: RunLogMigrationReport, baseDir: string): void {
  console.log('# wolf migrate run-log');
  console.log();
  if (!report.moved) {
    console.log('nothing to migrate');
    return;
  }
  console.log(`from: ${relative(baseDir, report.from)}`);
  console.log(`to: ${relative(baseDir, report.to)}`);
  console.log(`lines: ${report.lineCount}`);
}

function printTaxonomyReport(report: TaxonomyMigrationReport, mode: 'dry-run' | 'apply'): void {
  const rel = (p: string) => p.replace(/^\.wolf\/memory\//, '');
  console.log(`# wolf migrate taxonomy (mode: ${mode})`);
  console.log();

  console.log('| id | old type | new (facet/status) | from | to |');
  console.log('|----|----------|--------------------|------|----|');
  for (const e of report.entries) {
    let detail = e.newType;
    if (e.facet !== undefined) detail += ` / facet: ${e.facet}`;
    if (e.threadStatusChange !== undefined) detail += ` / thread -> ${e.threadStatusChange}`;
    console.log(`| ${e.id} | ${e.oldType} | ${detail} | ${rel(e.from)} | ${rel(e.to)} |`);
  }

  console.log();
  const summary = Object.entries(report.summaryByType)
    .map(([t, n]) => `${t}: ${n}`)
    .join(', ');
  console.log(`summary by type: ${summary || '(nothing to migrate)'}`);

  if (report.threadStatusChanges.length > 0) {
    console.log();
    console.log('thread status changes:');
    for (const t of report.threadStatusChanges) {
      console.log(`  ${t.threadId}: ${t.from} -> ${t.to} (cause: ${t.causeType} ${t.causeId})`);
    }
  }

  if (report.callInjections.length > 0) {
    console.log();
    console.log('active call-injections (WARNING):');
    for (const c of report.callInjections) console.log(`  ${c.id}: ${rel(c.from)} -> ${rel(c.to)}`);
    console.log('  after migration these stop being delivered by the call pool (spec 2.13 §5.4);');
    console.log('  move trigger_keywords to a lesson/rule or archive them');
  }

  if (report.conflicts.length > 0) {
    console.log();
    console.log('conflicts (untouched):');
    for (const c of report.conflicts) console.log(`  ${c.id}: ${c.reason}`);
  }

  if (report.unparsable.length > 0) {
    console.log();
    console.log('unparsable (untouched):');
    for (const p of report.unparsable) console.log(`  ${rel(p.path)}: ${p.error}`);
  }

  console.log();
  const migrated = mode === 'apply' ? report.entries.length : 0;
  console.log(
    `migrated: ${migrated}${mode === 'dry-run' ? ' (dry-run)' : ''}` +
      ` | thread status changes: ${report.threadStatusChanges.length}` +
      ` | conflicts: ${report.conflicts.length}` +
      ` | unparsable: ${report.unparsable.length}`
  );
  console.log('rollback: git checkout .wolf/memory && wolf rebuild-index');
  if (mode === 'apply') console.log('next: run wolf rebuild-index');
}
