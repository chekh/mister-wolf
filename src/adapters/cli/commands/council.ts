// REL-231-A P04/W4 (AC-A3, AC-W4-1, AC-W4-6): CLI-группа `wolf council record`
// — тонкая обёртка над доменной recordCouncil (W3): чтение envelope из
// JSON-файла, атрибуция штатным CLI-механизмом (resolveCreatedBy, как add),
// вывод JSON {memory_id, created, recovered} + человекочитаемой строки.
// Валидацию и запись делает домен — адаптер не дублирует (AC-W4-6).
// baseDir инъектится для тестов (прецедент: memory-add.ts).
import { Command } from 'commander';
import { readFile, stat } from 'fs/promises';
import { safeCwd } from '../cli-entry.js';
import { recordCouncil, MAX_BODY_BYTES, type CouncilRecordEnvelope } from '../../../app/use-cases/record-council.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { resolveCreatedBy } from '../../../domain/actor.js';
import { UserFacingError } from '../../../domain/errors.js';
import { withCliCall } from './with-cli-call.js';

export interface CouncilRecordOptions {
  input: string;
  createdBy?: string;
}

/** Читает envelope из --input-файла и делегирует домену (одна операция с MCP). */
export async function runCouncilRecordAction(baseDir: string, options: CouncilRecordOptions): Promise<void> {
  // W8/F2: транспортный гард ДО чтения — oversized-файл не читаем целиком
  // (доменная проверка 256 KiB тела в recordCouncil остаётся авторитетной).
  let size: number;
  try {
    size = (await stat(options.input)).size;
  } catch {
    throw new UserFacingError(`cannot read council envelope file: ${options.input}`);
  }
  if (size > MAX_BODY_BYTES) {
    throw new UserFacingError(`council envelope file exceeds 256 KiB limit (${size} bytes): ${options.input}`);
  }
  let raw: string;
  try {
    raw = await readFile(options.input, 'utf8');
  } catch {
    throw new UserFacingError(`cannot read council envelope file: ${options.input}`);
  }
  let envelope: unknown;
  try {
    envelope = JSON.parse(raw);
  } catch (err) {
    throw new UserFacingError(
      `council envelope file is not valid JSON: ${options.input} (${err instanceof Error ? err.message : String(err)})`
    );
  }
  const { store, log, clock, idGen, index, lock, relations } = createCliContainer(baseDir);
  const result = await recordCouncil(
    { store, log, clock, idGen, index, lock, relations },
    { envelope: envelope as CouncilRecordEnvelope, createdBy: resolveCreatedBy(options.createdBy) }
  );
  console.log(JSON.stringify({ memory_id: result.memoryId, created: result.created, recovered: result.recovered }));
  const state = result.recovered
    ? 'Recovered council record'
    : result.created
      ? 'Recorded council record'
      : 'Council record already present';
  console.log(`${state}: ${result.memoryId}`);
}

export function councilCommand(baseDir: string = safeCwd()): Command {
  const cmd = new Command('council').description('Manage council records (question/opinion/synthesis envelopes)');

  cmd
    .command('record')
    .description('Record a council envelope (question|opinion|synthesis) from a JSON file')
    .requiredOption('--input <json-file>', 'Path to a JSON file with the council envelope')
    .option('--created-by <actor>', 'Creator actor (default: env WOLF_ACTOR, else user:cli)')
    .action(
      withCliCall(
        'council record',
        (options: CouncilRecordOptions) => runCouncilRecordAction(baseDir, options),
        // телеметрия: только путь файла, содержимое envelope не попадает
        (options) => ({ args_summary: { input: options.input } })
      )
    );

  return cmd;
}
