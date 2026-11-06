/**
 * English slug записи памяти (2.32.0, Q1): slug даёт агент-создатель, CLI только
 * нормализует регистр/разделители и валидирует формат. Перевода и транслитерации
 * здесь нет и не будет: неподходящий вход даёт fallback в генераторе ID, а не
 * «тихий» русский slug.
 */
export const MEMORY_SLUG_MAX = 40;

/** Формат slug: нижний регистр, a-z0-9 и дефисы между словами. */
export const MEMORY_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Обрезка по границе слова: не длиннее max, без висящего дефиса. */
function cap(slug: string, max: number): string {
  if (slug.length <= max) return slug;
  const head = slug.slice(0, max);
  const cut = head.lastIndexOf('-');
  const capped = cut > 0 ? head.slice(0, cut) : head;
  return capped.replace(/-+$/, '');
}

/**
 * Нормализованный slug или `null`, если вход не является английским slug.
 * Нормализация: trim → нижний регистр → пробелы/подчёркивания → дефис →
 * сжатие и обрезка дефисов → cap(MEMORY_SLUG_MAX). Кириллица, точки и прочие
 * символы не вычищаются — такой вход честно невалиден.
 */
export function normalizeMemorySlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const prepared = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (prepared === '') return null;
  const capped = cap(prepared, MEMORY_SLUG_MAX);
  return MEMORY_SLUG_RE.test(capped) ? capped : null;
}
