import { Command } from 'commander';
import { relative } from 'path';
import { safeCwd } from '../cli-entry.js';
import { planLayoutMigration, applyLayoutMigration, type MigrationReport } from '../../fs/layout-migration.js';
import { planDocIdMigration, applyDocIdMigration, type DocIdMigrationReport } from '../../fs/doc-id-migration.js';
import { migrateRunLog, type RunLogMigrationReport } from '../../fs/run-log-migration.js';

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
