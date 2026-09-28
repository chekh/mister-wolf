// src/adapters/render/sync-state.ts
// Свидетель последнего рендера (T010): sha256 контента, ЗАПИСАННОГО рендерером.
// Канон «как мы это оставили»: отличает легитимный сдвиг канона (смена шаблона/
// версии) от локальной правки штампованного файла — которую sync не затирает.
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface SyncState {
  /** rel-путь от baseDir (например `.opencode/agents/mr-wolf.md`) → sha256-hex. */
  files: Record<string, string>;
}

const statePath = (baseDir: string): string => join(baseDir, '.opencode', 'wolf-sync-state.json');

export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/** Толерантная загрузка: нет файла / битый JSON → пустое состояние (bootstrap-поведение). */
export function loadSyncState(baseDir: string): SyncState {
  const p = statePath(baseDir);
  if (!existsSync(p)) return { files: {} };
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as Partial<SyncState>;
    if (parsed && typeof parsed === 'object' && parsed.files && typeof parsed.files === 'object') {
      return { files: parsed.files as Record<string, string> };
    }
  } catch {
    // битый JSON == нет свидетеля
  }
  return { files: {} };
}

export function saveSyncState(baseDir: string, state: SyncState): void {
  mkdirSync(join(baseDir, '.opencode'), { recursive: true });
  writeFileSync(statePath(baseDir), `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
}
