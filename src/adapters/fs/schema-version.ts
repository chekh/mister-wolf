import * as fs from 'fs/promises';
import yaml from 'js-yaml';
import { configPath } from './project-paths.js';
import { writeFileAtomic } from './markdown-memory-store.js';
import { UserFacingError } from '../../domain/errors.js';

/** Версия схемы layout v2 (+ маркер в config.yaml). Легаси-проекты без маркера = 1. */
export const CURRENT_SCHEMA_VERSION = 2;
export const LEGACY_SCHEMA_VERSION = 1;

function parseConfig(raw: string): Record<string, unknown> {
  try {
    const doc = yaml.load(raw);
    return doc !== null && typeof doc === 'object' ? (doc as Record<string, unknown>) : {};
  } catch (err) {
    throw new UserFacingError(
      `.wolf/config.yaml is corrupted: ${err instanceof Error ? err.message : String(err)}. Fix it manually or run: wolf init --recreate`
    );
  }
}

/** Версия схемы проекта; null = проект не инициализирован (.wolf/config.yaml отсутствует). */
export async function readSchemaVersion(baseDir: string): Promise<number | null> {
  let raw: string;
  try {
    raw = await fs.readFile(configPath(baseDir), 'utf-8');
  } catch {
    return null;
  }
  const doc = parseConfig(raw);
  return typeof doc.schema_version === 'number' ? doc.schema_version : LEGACY_SCHEMA_VERSION;
}

/** Проставляет schema_version: CURRENT, если маркер отсутствует. Атомарно (tmp + rename). */
export async function writeSchemaVersionIfAbsent(baseDir: string): Promise<void> {
  let raw: string;
  try {
    raw = await fs.readFile(configPath(baseDir), 'utf-8');
  } catch {
    return; // нет конфига — init ещё не прошёл
  }
  const doc = parseConfig(raw);
  if (doc.schema_version === CURRENT_SCHEMA_VERSION) return;
  doc.schema_version = CURRENT_SCHEMA_VERSION;
  await writeFileAtomic(configPath(baseDir), yaml.dump(doc, { sortKeys: false, lineWidth: 120 }));
}
