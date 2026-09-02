import { createHash } from 'crypto';
import { basename } from 'path';
import { HashIdGenerator } from './hash-id-generator.js';

/**
 * Канон id document-ref (спека 2.1.0 §2.1): `mem_<YYYYMMDD>_doc_<slug>_<hash8>`.
 *
 * - `<YYYYMMDD>` — дата создания объекта (scan: текущий день; миграция: created_at);
 * - `<slug>` — basename документа без расширения, kebab-case (транслит кириллицы);
 * - `<hash8>` — первые 8 hex sha256(canonical path): путь остаётся в id только
 *   как хеш — FTS-шум от псевдо-токенов пути исчезает (F9).
 *
 * Tie-break: коллизия `slug+hash8` в пределах памяти → суффикс `-2`, `-3`, …
 * (см. withTieBreak); суффикс допускается канон-регуляркой.
 */
export const CANONICAL_DOCUMENT_ID_RE = /^mem_\d{8}_doc_[a-z0-9]+(?:-[a-z0-9]+)*_[0-9a-f]{8}(?:-\d+)?$/;

/** id соответствует канону §2.1 (с учётом tie-break-суффикса). */
export function isCanonicalDocumentId(id: string): boolean {
  return CANONICAL_DOCUMENT_ID_RE.test(id);
}

/** Канонический путь: posix-разделители, без ведущего `./`. */
export function canonicalPath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

/** Slug из basename без расширения: kebab-case, транслит кириллицы, cap 40, пусто → `doc`. */
export function documentSlug(path: string): string {
  const name = basename(canonicalPath(path)).replace(/\.[^.]+$/, '');
  const translit = name.toLowerCase().replace(/[а-яё]/g, (ch) => HashIdGenerator.CYRILLIC[ch] ?? '');
  const slug = translit
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 40)
    .replace(/^-+|-+$/g, '');
  return slug || 'doc';
}

/** Канонический id document-ref; `dateISO` — ISO-дата создания (берётся день). */
export function documentRefId(path: string, dateISO: string): string {
  const day = dateISO.slice(0, 10).replace(/-/g, '');
  const hash8 = createHash('sha256').update(canonicalPath(path)).digest('hex').slice(0, 8);
  return `mem_${day}_doc_${documentSlug(path)}_${hash8}`;
}

/** Tie-break (§2.1): если id занят другим объектом — суффикс `-2`, `-3`, … */
export function withTieBreak(id: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(id)) return id;
  for (let n = 2; ; n++) {
    const candidate = `${id}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}
