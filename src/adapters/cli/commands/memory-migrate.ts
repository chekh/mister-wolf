import { Command } from 'commander';
import { planLayoutMigration, applyLayoutMigration, type MigrationReport } from '../../fs/layout-migration.js';

export function memoryMigrateCommand(): Command {
  return new Command('migrate')
    .description('One-time migration: objects/<type>/ -> threads/<tid>/<subdir>/ + shared/')
    .option('--apply', 'perform the migration (default: dry-run)', false)
    .action(async ({ apply }) => {
      const baseDir = process.cwd();
      const report: MigrationReport = apply ? await applyLayoutMigration(baseDir) : await planLayoutMigration(baseDir);
      printMigrationReport(report, apply ? 'apply' : 'dry-run');
      process.exitCode = report.conflicts.length > 0 ? 2 : 0;
    });
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
