const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bgh[po]_[A-Za-z0-9]{16,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g,
];

/** WP4 (спека 2.16 §7): doctor не печатает значения секретов.
 * Известные префиксы — по паттерну; именованные присвоения (api_key=/token:/password=)
 * маскируются значением целиком. Граница трактовки спеки: маскируется вывод doctor
 * (issues/finding'и — единственный канал, куда попадают фрагменты чужих файлов:
 * lint-artifacts.ts:103,175,196,208 печают срезы строк документов); тела объектов
 * в get/list не маскируются (владелец может ветировать). */
export function maskSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) out = out.replace(re, '[redacted]');
  return out.replace(/((?:api[-_]?key|token|secret|password)\s*[=:]\s*)(["']?)[^\s"']+\2/gi, '$1[redacted]');
}
