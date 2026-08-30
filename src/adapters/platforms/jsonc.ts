/**
 * Минимальный JSONC-парсер: вырезает // и блок-комментарии вне строк,
 * прощает trailing commas. Для opencode.jsonc и ручных конфигов с комментариями.
 */
export function parseJsonc(text: string): unknown {
  const noComments = text.replace(
    /("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (match, str: string | undefined) => (str !== undefined ? str : '')
  );
  const noTrailingCommas = noComments.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(noTrailingCommas);
}
