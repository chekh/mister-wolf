import * as fs from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';

export type RunLogMigrationReport = { moved: false } | { moved: true; from: string; to: string; lineCount: number };

/**
 * Одноразовая архивация legacy .wolf/run-log.jsonl (P1 D4): сигнальный лог —
 * канонический источник, но analytics на переходном периоде конкатенирует
 * legacy-файл с сигналами → двойной счёт у обновившихся. Команда выносит файл
 * в .wolf/metrics/archive/run-log-<дата>-legacy.jsonl (rename, содержимое не
 * переписывается — файл может быть большим). Идемпотентна: файла нет →
 * moved: false без побочных действий (archive-каталог не создаётся).
 */
export async function migrateRunLog(baseDir: string): Promise<RunLogMigrationReport> {
  const from = join(baseDir, '.wolf', 'run-log.jsonl');
  if (!existsSync(from)) return { moved: false };

  // счётчик строк — ДО rename (после файла на старом месте уже нет)
  let lineCount: number;
  try {
    lineCount = await countLines(from);
  } catch (err: unknown) {
    throw new Error(`read ${from} (run-log migration): ${errText(err)}`);
  }

  const archiveDir = join(baseDir, '.wolf', 'metrics', 'archive');
  await fs.mkdir(archiveDir, { recursive: true }).catch((err: unknown) => {
    throw new Error(`mkdir ${archiveDir} (run-log migration): ${errText(err)}`);
  });

  // дата — ЛОКАЛЬНЫЙ день запуска (не UTC); коллизия имени → следующий
  // свободный суффикс -2, -3, … — детерминированно, без перезаписи
  const date = localDateStamp();
  let to = join(archiveDir, `run-log-${date}-legacy.jsonl`);
  for (let n = 2; existsSync(to); n++) to = join(archiveDir, `run-log-${date}-legacy-${n}.jsonl`);

  await fs.rename(from, to).catch((err: unknown) => {
    throw new Error(`rename ${from} -> ${to} (run-log migration): ${errText(err)}`);
  });
  return { moved: true, from, to, lineCount };
}

/** Локальная дата YYYY-MM-DD (не UTC) — архив привязан к дню запуска машины. */
function localDateStamp(d = new Date()): string {
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
}

/** Потоковый подсчёт строк: считаем '\n'; последняя строка без '\n' — тоже строка; пустой файл → 0. */
function countLines(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(path);
    let newlines = 0;
    let lastByte = -1;
    stream.on('data', (chunk: string | Buffer) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0a) newlines++;
      lastByte = buf[buf.length - 1];
    });
    stream.on('end', () => resolve(lastByte === -1 ? 0 : lastByte === 0x0a ? newlines : newlines + 1));
    stream.on('error', reject);
  });
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
