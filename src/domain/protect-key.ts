// src/domain/protect-key.ts
// REQ-05 (design §4.1): единственная точка правды о ключе `protect` в
// YAML-frontmatter. Чистая логика без I/O: грамматика (parseProtect),
// нормализация (normalizeManaged), вставка/снятие ключа построчной правкой.
// Регекса штампа `wolf:rendered` здесь нет — он живёт только в stamp.ts (§4.4).

/** Разобранное значение ключа: `true` / `X.Y.Z` / null (false, пусто, вне грамматики). */
export interface ProtectValue {
  /** Держать локальный контент (в т.ч. fail-safe для недописанного/битого значения). */
  held: boolean;
  value: 'true' | string | null;
  raw: string | null;
  /** Значение вне грамматики (`yes`, `2.19`, кавычки, пусто) — держим, но предупреждаем (ADR-5). */
  unrecognized?: true;
}

export interface InsertProtectResult {
  content: string;
  changed: boolean;
  error?: 'no-yaml-frontmatter' | 'frontmatter-unparsable';
}

interface Line {
  text: string;
  eol: '\n' | '\r\n' | '';
}

const FENCE = '---';
const KEY_LINE = /^protect\s*:\s*(.*?)\s*$/;
/** Строка ключа в блоке — для нормализации (шире грамматики: снимаем и `false`). */
const KEY_ANY = /^protect\s*:/;
const FULL_VERSION = /^\d+\.\d+\.\d+$/;

function splitLines(content: string): Line[] {
  const out: Line[] = [];
  let i = 0;
  while (i < content.length) {
    const nl = content.indexOf('\n', i);
    if (nl === -1) {
      out.push({ text: content.slice(i), eol: '' });
      break;
    }
    const crlf = nl > i && content[nl - 1] === '\r';
    out.push({ text: content.slice(i, crlf ? nl - 1 : nl), eol: crlf ? '\r\n' : '\n' });
    i = nl + 1;
  }
  return out;
}

const joinLines = (lines: Line[]): string => lines.map((l) => l.text + l.eol).join('');

/** Границы frontmatter в строках: первая строка файла — `---`, закрывающая — следующая `---`. */
function frontmatter(lines: Line[]): { open: number; close: number } | null {
  if (lines.length === 0 || lines[0].text !== FENCE) return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].text === FENCE) return { open: 0, close: i };
  }
  return null;
}

export function parseProtect(content: string): ProtectValue {
  const lines = splitLines(content);
  const fm = frontmatter(lines);
  if (!fm) return { held: false, value: null, raw: null };
  for (let i = fm.open + 1; i < fm.close; i++) {
    const m = lines[i].text.match(KEY_LINE);
    if (!m) continue;
    const raw = m[1];
    if (raw === '' || raw === '~' || raw === 'null') return { held: true, value: null, raw, unrecognized: true };
    if (raw === 'true') return { held: true, value: 'true', raw };
    if (raw === 'false') return { held: false, value: null, raw };
    if (FULL_VERSION.test(raw)) return { held: true, value: raw, raw };
    return { held: true, value: null, raw, unrecognized: true };
  }
  return { held: false, value: null, raw: null };
}

/** Контент без строк ключа (все они, внутри frontmatter): единая база сравнения и свидетеля. */
export function normalizeManaged(content: string): string {
  const lines = splitLines(content);
  const fm = frontmatter(lines);
  if (!fm) return content;
  const kept = lines.filter((l, i) => !(i > fm.open && i < fm.close && KEY_ANY.test(l.text)));
  return joinLines(kept);
}

export function insertProtect(content: string, value: 'true' | string): InsertProtectResult {
  const lines = splitLines(content);
  const fm0 = frontmatter(lines);
  if (!fm0) return { content, changed: false, error: 'no-yaml-frontmatter' };

  const normalized = lines.filter((l, i) => !(i > fm0.open && i < fm0.close && KEY_ANY.test(l.text)));
  const fm = frontmatter(normalized);
  if (!fm) return { content, changed: false, error: 'frontmatter-unparsable' };
  const closeEol: '\n' | '\r\n' = normalized[fm.close].eol === '\r\n' ? '\r\n' : '\n';
  const result = joinLines([
    ...normalized.slice(0, fm.close),
    { text: `protect: ${value}`, eol: closeEol },
    ...normalized.slice(fm.close),
  ]);

  // Структурная проверка ДО возврата (§4.1 п.3): границы блока, распознавание значения,
  // взаимная обратимость с нормализацией. Файл пишет вызывающий — но только валидный контент.
  const check = splitLines(result);
  const fm1 = frontmatter(check);
  if (!fm1 || fm1.close !== fm.close + 1 || check[fm1.close].text !== FENCE) {
    return { content, changed: false, error: 'frontmatter-unparsable' };
  }
  const parsed = parseProtect(result);
  const expected = value === 'true' ? parsed.held && parsed.value === 'true' : parsed.held && parsed.value === value;
  if (!expected) return { content, changed: false, error: 'frontmatter-unparsable' };
  if (reinstateProtectLine(result, value) !== result) {
    return { content, changed: false, error: 'frontmatter-unparsable' };
  }
  return { content: result, changed: result !== content };
}

/** Обратимость (в): нормализованный контент + строка ключа перед закрывающим `---`. */
function reinstateProtectLine(content: string, value: 'true' | string): string {
  const lines = splitLines(normalizeManaged(content));
  const fm = frontmatter(lines);
  if (!fm) return content;
  const eol: '\n' | '\r\n' = lines[fm.close].eol === '\r\n' ? '\r\n' : '\n';
  return joinLines([...lines.slice(0, fm.close), { text: `protect: ${value}`, eol }, ...lines.slice(fm.close)]);
}

/** Снятие: удаляет все строки ключа, остальное байт-в-байт. */
export function removeProtect(content: string): string {
  return normalizeManaged(content);
}
