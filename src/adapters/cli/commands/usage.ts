import { readFileSync } from 'fs';
import { Command, Option } from 'commander';
import { safeCwd } from '../cli-entry.js';
import { DEFAULT_USAGE_DB_PATH } from '../../fs/opencode-usage-db.js';
import { importUsage, type ImportUsageOptions, type ImportUsageResult } from '../../../app/use-cases/import-usage.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD → локальная полночь; ошибка формата → сообщение для пользователя. */
function parseDay(value: string, label: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`${label} must be YYYY-MM-DD, got '${value}'`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error(`${label} is not a valid date: '${value}'`);
  }
  return date.getTime();
}

function readTaskMap(path: string): Record<string, string> {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    throw new Error(`cannot read --task-map ${path}: ${(error as Error).message}`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`--task-map ${path} must be a JSON object {session_id: task_id}`);
  }
  const map: Record<string, string> = {};
  for (const [sessionId, taskId] of Object.entries(raw)) {
    if (typeof taskId === 'string') map[sessionId] = taskId;
  }
  return map;
}

/** Пустое значение печатается как unknown, не как 0 (нули — настоящие данные). */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'unknown';
  return String(value);
}

function printResult(result: ImportUsageResult): void {
  console.log(
    `appended=${result.appended} duplicate=${result.duplicate} skipped incomplete=${result.skippedIncomplete}`
  );
  if (result.runs.length === 0) {
    console.log('no run events in window: unknown coverage, not zero usage');
  } else {
    console.log(['run_id', 'agent', 'model', 'tokens', 'generation_ms', 'task', 'attempt'].join(' | '));
    for (const run of result.runs) {
      const tokens = run.tokens ? `${run.tokens.input}/${run.tokens.output}/${run.tokens.cacheRead}` : null;
      console.log(
        [
          cell(run.runId),
          cell(run.agent),
          cell(run.model),
          cell(tokens),
          cell(run.generationMs),
          cell(run.taskId),
          cell(run.attempts ? run.attempts.join(',') : null),
        ].join(' | ')
      );
    }
  }
  console.log('source limitations:');
  for (const limitation of result.limitations) console.log(`- ${limitation}`);
}

export function usageCommand(baseDir: string = safeCwd()): Command {
  const usage = new Command('usage').description('Import OpenCode session usage into the signal log');
  usage.addCommand(
    new Command('import')
      .description('Import OpenCode session usage into the signal log')
      .option('--db <path>', 'Path to opencode.db (read-only)', DEFAULT_USAGE_DB_PATH)
      .option('--since <date>', 'Start date (YYYY-MM-DD, local midnight)')
      .addOption(new Option('--until <date>', 'End date (YYYY-MM-DD, inclusive local day)'))
      .option('--task-map <path>', 'JSON object {session_id: task_id}')
      .option('--dry-run', 'Read and report without writing the signal log', false)
      .option('--json', 'Print ImportUsageResult as JSON', false)
      .action((options) => {
        try {
          const opts: ImportUsageOptions = { dbPath: options.db, dryRun: options.dryRun === true };
          if (options.since !== undefined) opts.sinceMs = parseDay(options.since, '--since');
          if (options.until !== undefined) opts.untilMs = parseDay(options.until, '--until') + DAY_MS;
          if (options.taskMap !== undefined) opts.taskMap = readTaskMap(options.taskMap);
          const result = importUsage(baseDir, opts);
          if (options.json === true) console.log(JSON.stringify(result, null, 2));
          else printResult(result);
        } catch (error) {
          console.error(`usage import failed: ${(error as Error).message}`);
          process.exitCode = 1;
        }
      })
  );
  return usage;
}
