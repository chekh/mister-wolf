import { createHash } from 'crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { cacheDir } from './project-paths.js';

/** P108 (спека 4.C): TTL файлов реестра сессий — GC по mtime при любом обращении. */
export const SESSION_TTL_MS = 7 * 86_400_000;

export interface SessionDeliveryRegistry {
  /** memory_id → checksum блока на момент последней доставки в сессию. */
  delivered: Record<string, string>;
  /** Суммарные байты доставок сессии (порог-предупреждение — P109, 4.D). */
  injectedBytes: number;
}

/** Контрольная сумма текста блока: sha256 → первые 16 hex. Нужна и use-case, и команде. */
export function checksumBlock(block: string): string {
  return createHash('sha256').update(block, 'utf8').digest('hex').slice(0, 16);
}

function sessionsDir(baseDir: string): string {
  return join(cacheDir(baseDir), 'sessions');
}

/** Ключи продюсятся самим волком (cli-<uuid>, opc-<uuid>) либо приходят из env;
 * посторонние символы схлопываем — ключ попадает в имя файла (граница доверия). */
function safeKey(sessionKey: string): string {
  return sessionKey.replace(/[^A-Za-z0-9._-]/g, '_');
}

function registryPath(baseDir: string, sessionKey: string): string {
  return join(sessionsDir(baseDir), `${safeKey(sessionKey)}.json`);
}

/** GC: удаляет *.json старше SESSION_TTL_MS по mtime. Сбой удаления одного файла
 * не роняет основной поток (реестр — derived-кэш). */
function gcSessions(dir: string): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // каталога нет — штатно
  }
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const name of entries) {
    try {
      const path = join(dir, name);
      const st = statSync(path);
      if (st.isFile() && name.endsWith('.json') && st.mtimeMs < cutoff) unlinkSync(path);
    } catch {
      // один битый файл не останавливает GC остальных
    }
  }
}

/** Читает реестр сессии; отсутствует/битый → пустой (нет дедупликации — поведение 2.11). */
export function loadSessionRegistry(baseDir: string, sessionKey: string): SessionDeliveryRegistry {
  gcSessions(sessionsDir(baseDir));
  try {
    const parsed = JSON.parse(readFileSync(registryPath(baseDir, sessionKey), 'utf8')) as {
      delivered?: unknown;
      injectedBytes?: unknown;
    };
    return {
      delivered:
        parsed && typeof parsed === 'object' && parsed.delivered !== null && typeof parsed.delivered === 'object'
          ? (parsed.delivered as Record<string, string>)
          : {},
      injectedBytes: typeof parsed?.injectedBytes === 'number' ? parsed.injectedBytes : 0,
    };
  } catch {
    return { delivered: {}, injectedBytes: 0 };
  }
}

/** Чистая проверка: id в реестре с той же checksum → блок уже доставлен в сессию. */
export function isDelivered(registry: SessionDeliveryRegistry, id: string, checksum: string): boolean {
  return registry.delivered[id] === checksum;
}

/** Обновляет delivered-checksum'ы, инкрементит injectedBytes на сумму bytes,
 * атомарная запись (tmp+rename — прецедент signal-counts.json). */
export function recordDeliveries(
  baseDir: string,
  sessionKey: string,
  entries: { id: string; checksum: string; bytes: number }[]
): void {
  if (entries.length === 0) return;
  const registry = loadSessionRegistry(baseDir, sessionKey); // GC — здесь
  for (const e of entries) {
    registry.delivered[e.id] = e.checksum;
    registry.injectedBytes += e.bytes;
  }
  const dir = sessionsDir(baseDir);
  const path = registryPath(baseDir, sessionKey);
  const tmp = `${path}.tmp`; // не матчится GC-маской *.json
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(tmp, JSON.stringify(registry));
    renameSync(tmp, path);
  } catch {
    // derived-кэш: сбой записи = нет дедупликации на следующем вызове, не ошибка
  }
}
