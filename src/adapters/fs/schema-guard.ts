import * as fs from 'fs/promises';
import { join } from 'path';
import { withMemoryLock } from './memory-lock.js';
import { readSchemaVersion, writeSchemaVersionIfAbsent, CURRENT_SCHEMA_VERSION } from './schema-version.js';
import { applyLayoutMigration } from './layout-migration.js';
import { objectsDir } from './project-paths.js';
import { UserFacingError } from '../../domain/errors.js';

/**
 * Ленивая миграция схемы (спека §3, уровень 2): guard в точках входа (cli/mcp).
 * - проекта нет → 'ok' (команды сами дадут диагностику);
 * - битый config.yaml → UserFacingError с хинтом `wolf init --recreate`
 *   (сама recovery-команда обходит guard в cli-entry — иначе циркулярность);
 * - схема новее бинаря → честный отказ «обнови wolf», без записи;
 * - легаси → миграция под эксклюзивным .wolf/migrate.lock, с бэкапом носителя схемы
 *   (fs-layout + config.yaml; SQLite — лишь кэш, не бэкапится), маркер пишется атомарно.
 */
export async function ensureCurrentSchema(baseDir: string): Promise<'ok' | 'migrated'> {
  const version = await readSchemaVersion(baseDir);
  if (version === null) return 'ok';
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new UserFacingError(
      `Project schema v${version} is newer than this wolf (supports v${CURRENT_SCHEMA_VERSION}). Update wolf: npm install -g mister-wolf`
    );
  }
  if (version === CURRENT_SCHEMA_VERSION) return 'ok';
  return withMemoryLock(join(baseDir, '.wolf'), () => migrateLegacy(baseDir), undefined, 'migrate.lock');
}

async function migrateLegacy(baseDir: string): Promise<'migrated'> {
  // повторная проверка под локом: параллельный процесс мог уже мигрировать
  const again = await readSchemaVersion(baseDir);
  if (again === CURRENT_SCHEMA_VERSION) return 'migrated';
  if (again !== null && again > CURRENT_SCHEMA_VERSION) {
    throw new UserFacingError(
      `Project schema v${again} is newer than this wolf (supports v${CURRENT_SCHEMA_VERSION}). Update wolf: npm install -g mister-wolf`
    );
  }

  // бэкап носителя схемы до изменения: config.yaml + легаси objects/ (спека §3)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(baseDir, '.wolf', 'backup', stamp);
  await fs.mkdir(backupDir, { recursive: true });
  await fs.copyFile(join(baseDir, '.wolf', 'config.yaml'), join(backupDir, 'config.yaml')).catch(() => undefined);
  await fs.cp(objectsDir(baseDir), join(backupDir, 'objects'), { recursive: true }).catch(() => undefined);

  await applyLayoutMigration(baseDir); // идемпотентен: пустой objects/ → no-op
  await writeSchemaVersionIfAbsent(baseDir); // проставит CURRENT атомарно
  return 'migrated';
}
