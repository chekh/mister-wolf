// src/adapters/render/sync-state.ts
// Свидетель последнего рендера: sha256 нормализованного контента, ЗАПИСАННОГО
// рендерером, + происхождение записи (design §4.2, ADR-8) и база. `origin:'keep'`
// отличает «владелец принял локальный контент» (правило 6.5 §4.3) от «волф это
// писал», иначе следующий проход молча перезаписал бы принятое.
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseStamp } from './stamp.js';

export interface SyncEntry {
  /** sha256 нормализованного контента (вычисление — обязанность вызывающего, §4.2). */
  hash: string;
  /** render — запись рендерера/эталона; keep — владелец принял локальный контент. */
  origin: 'render' | 'keep';
  /** Версия базы, на которой сделана запись (X.Y.Z). */
  base: string;
}

export interface SyncState {
  /** rel-путь от baseDir → свидетель; строка — легаси-запись 2.19.0 (читается как render). */
  files: Record<string, string | SyncEntry>;
}

const statePath = (baseDir: string): string => join(baseDir, '.opencode', 'wolf-sync-state.json');

export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/** Легаси-строка → свидетель: origin render, base — из штампа файла или 0.0.0. */
function normalizeEntry(baseDir: string, rel: string, raw: string | SyncEntry): SyncEntry | null {
  if (typeof raw === 'string') {
    const abs = join(baseDir, rel);
    const stamp = existsSync(abs) ? parseStamp(readFileSync(abs, 'utf-8')) : null;
    return { hash: raw, origin: 'render', base: stamp?.set ?? '0.0.0' };
  }
  if (!raw || typeof raw !== 'object' || typeof raw.hash !== 'string') return null;
  return {
    hash: raw.hash,
    origin: raw.origin === 'keep' ? 'keep' : 'render',
    base: typeof raw.base === 'string' ? raw.base : '0.0.0',
  };
}

/** Толерантная загрузка: нет файла / битый JSON → пустое состояние (bootstrap-поведение).
 *  Легаси-строки нормализуются в памяти; файл переписывается при первой сохраняемой операции. */
export function loadSyncState(baseDir: string): SyncState {
  const p = statePath(baseDir);
  if (!existsSync(p)) return { files: {} };
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as Partial<SyncState>;
    if (parsed && typeof parsed === 'object' && parsed.files && typeof parsed.files === 'object') {
      return { files: normalizeFiles(baseDir, parsed.files) };
    }
  } catch {
    // битый JSON == нет свидетеля
  }
  return { files: {} };
}

function normalizeFiles(baseDir: string, files: Record<string, string | SyncEntry>): Record<string, SyncEntry> {
  const out: Record<string, SyncEntry> = {};
  for (const [rel, raw] of Object.entries(files)) {
    const entry = normalizeEntry(baseDir, rel, raw);
    if (entry) out[rel] = entry;
  }
  return out;
}

/** Атомарная запись (NFR-04): tmp в том же каталоге + rename; после успеха `*.tmp` нет. */
export function saveSyncState(baseDir: string, state: SyncState): void {
  const dir = join(baseDir, '.opencode');
  mkdirSync(dir, { recursive: true });
  const path = statePath(baseDir);
  const tmp = join(dir, `.wolf-sync-state.json.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
    renameSync(tmp, path);
  } catch (err) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      // best-effort: исходная ошибка важнее
    }
    throw err;
  }
}
