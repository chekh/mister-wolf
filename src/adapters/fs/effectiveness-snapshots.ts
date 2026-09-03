/**
 * M2 (D6, Q9): снапшоты отчётов эффективности — .wolf/metrics/effectiveness-snapshots.jsonl.
 * Append-only, полная копия EffectivenessReport + ts; хранить «только последние N»
 * не будем — история нужна для трендов (решение D6 спеки аналитики).
 */
import { appendFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { metricsDir } from './project-paths.js';
import type { EffectivenessReport } from '../../app/use-cases/effectiveness.js';

export interface SnapshotEntry {
  /** ISO8601 момента снапшота. */
  ts: string;
  report: EffectivenessReport;
}

export function snapshotsPath(baseDir: string): string {
  return join(metricsDir(baseDir), 'effectiveness-snapshots.jsonl');
}

/** Все снапшоты в порядке записи; отсутствующий/битый лог → максимально читаемое. */
export function readSnapshots(baseDir: string): SnapshotEntry[] {
  let raw: string;
  try {
    raw = readFileSync(snapshotsPath(baseDir), 'utf-8');
  } catch {
    return [];
  }
  const out: SnapshotEntry[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) out.push(parsed as SnapshotEntry);
    } catch {
      // малформ-строка пропускается: лог append-only, битая строка не роняет контур
    }
  }
  return out;
}

/** Аппенд полного отчёта с таймстампом; ts задаёт вызывающий код (тестируемость). */
export function appendSnapshot(baseDir: string, report: EffectivenessReport, ts: string): void {
  mkdirSync(metricsDir(baseDir), { recursive: true });
  appendFileSync(snapshotsPath(baseDir), JSON.stringify({ ts, report } satisfies SnapshotEntry) + '\n');
}
