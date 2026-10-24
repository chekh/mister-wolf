// src/adapters/fs/update-map.ts
// T1 (волна 2.19.0, ADR-1): карта обновления — zod-схема wire-формата
// update-map.json (полный инвентарь состава релиза, корень пакета) и
// загрузчик из packageRoot. Путь в FileEntry/FaceEntry — относительно
// templates/ пакета: base/agents/*.md, base/skills/<name>/SKILL.md,
// base/commands/*.md, base/playbooks/*.md, opencode/plugins/* — те же
// корни, что обходит templateFiles() рендерера (opencode-renderer.ts).
import { readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { UserFacingError } from '../../domain/errors.js';
import { packageRoot as defaultPackageRoot } from '../render/templates-root.js';

/** Полный X.Y.Z — голые миноры запрещены (AGENTS.md). */
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

export const UpdateCategorySchema = z.enum(['new', 'changed', 'unchanged', 'deprecated', 'removed']);
export type UpdateCategory = z.infer<typeof UpdateCategorySchema>;

export const FileKindSchema = z.enum(['agent', 'skill', 'command', 'plugin']);
export type FileKind = z.infer<typeof FileKindSchema>;

export const FileEntrySchema = z.object({
  path: z.string().min(1),
  kind: FileKindSchema,
  category: UpdateCategorySchema,
});
export type FileEntry = z.infer<typeof FileEntrySchema>;

export const FaceEntrySchema = z.object({
  template: z.string().min(1),
  owner_skill: z.string().min(1),
  category: UpdateCategorySchema,
  /** true = сеять недостающее лицо (seed-missing-only); false = репортить, не мутировать (deprecated). */
  seed: z.boolean(),
});
export type FaceEntry = z.infer<typeof FaceEntrySchema>;

export const UpdateMapSchema = z.object({
  version: z.string().regex(SEMVER_RE),
  prev: z.string().regex(SEMVER_RE),
  /** ВСЕ файловые цели base-set — полный инвентарь, не компоновка дельт. */
  files: z.array(FileEntrySchema),
  faces: z.array(FaceEntrySchema),
  agents_md: z.object({ category: UpdateCategorySchema, mode: z.literal('append-block') }),
  /** Пусто = релиз без миграций схемы. */
  schema_migrations: z.array(z.object({ from: z.number().int(), to: z.number().int() })),
  /** Классы вне покрытия v1 — граница «не трогать чужое» объявлена явно. */
  outside_v1: z.array(z.string()),
});
export type UpdateMap = z.infer<typeof UpdateMapSchema>;

/** Сравнение полных версий X.Y.Z: -1 (a<b) | 0 | 1 (a>b). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1;
  }
  return 0;
}

function readCliVersion(pkgRoot: string): string {
  let version: unknown;
  try {
    version = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')).version;
  } catch {
    throw new UserFacingError(`package.json not found or corrupted at ${pkgRoot}`);
  }
  if (typeof version !== 'string' || !SEMVER_RE.test(version)) {
    throw new UserFacingError(`package.json at ${pkgRoot} has no valid X.Y.Z version`);
  }
  return version;
}

/**
 * Читает и валидирует update-map.json из корня пакета. Карта из будущего
 * (version новее CLI) — честный отказ, не молчаливое использование.
 */
export function loadUpdateMap(pkgRoot: string = defaultPackageRoot()): UpdateMap {
  const mapPath = join(pkgRoot, 'update-map.json');
  let raw: string;
  try {
    raw = readFileSync(mapPath, 'utf8');
  } catch {
    throw new UserFacingError(`update-map.json not found at ${mapPath} — reinstall the package`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new UserFacingError(
      `update-map.json is corrupted (invalid JSON): ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const result = UpdateMapSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new UserFacingError(`update-map.json is invalid at ${issue.path.join('.')}: ${issue.message}`);
  }
  const cliVersion = readCliVersion(pkgRoot);
  if (compareVersions(result.data.version, cliVersion) > 0) {
    throw new UserFacingError(
      `update-map.json version ${result.data.version} is newer than CLI ${cliVersion} — update wolf first`
    );
  }
  return result.data;
}
