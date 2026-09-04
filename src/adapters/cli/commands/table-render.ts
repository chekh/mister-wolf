/**
 * D8-генератор Unicode-таблиц (единственный для dashboard + analytics): визуальная
 * ширина (wide-char = 2), клип ячеек до 40, рамки ┌┬┐├┼┤└┴┘ с инвариантом «позиции
 * │ в данных == позициям ┬/┼/┴ в рамках». Ноль зависимостей; …, ✓, ✗, ·, спарклайны
 * считаются шириной 1. `for…of` итерирует code points — суррогатные пары учтены.
 */

/** Минимальная таблица wide-диапазонов: Hangul, Jamo, CJK (вкл. extension A и
 * compatibility), fullwidth forms, всё > 0xFFFF (суррогатные пары). */
function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0xa4cf) || // CJK радикалы..Yi (покрывает 0x3400–0x4DBF, 0x4E00–0x9FFF)
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK extension A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK unified
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK compatibility ideographs
    (cp >= 0xff00 && cp <= 0xff60) || // fullwidth forms
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    cp > 0xffff // суррогатные пары (astral)
  );
}

/** Визуальная ширина строки в колонках терминала (wide-символ = 2). */
export function visualWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    w += isWide(ch.codePointAt(0) ?? 0) ? 2 : 1;
  }
  return w;
}

/** Обрезка ячейки: визуальная ширина > 40 → code points до ≤39 + '…'
 * (ширина терминала НЕ читается — детерминизм e2e). */
export function clip(text: string): string {
  if (visualWidth(text) <= 40) return text;
  let out = '';
  let w = 0;
  for (const ch of text) {
    const cw = isWide(ch.codePointAt(0) ?? 0) ? 2 : 1;
    if (w + cw > 39) break; // '…' добавит 1 колонку → итог ≤ 40
    out += ch;
    w += cw;
  }
  return `${out}…`;
}

/** Дополнение пробелами ДО визуальной ширины w; ячейка шире w — как есть
 * (не обрезаем и не ломаем выравнивание остальных колонок). */
function padVis(s: string, w: number): string {
  const pad = w - visualWidth(s);
  return pad > 0 ? s + ' '.repeat(pad) : s;
}

/** Unicode-таблица: `│` между колонками, рамки ┌┬┐├┼┤└┴┘; ширины колонок —
 * от клипнутых ячеек (header тоже клипается — инвариант длин строк безусловный). */
export function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(visualWidth(clip(h)), ...rows.map((r) => visualWidth(clip(r[i] ?? ''))))
  );
  const rowLine = (cells: string[]) =>
    '│' + cells.map((c, i) => ` ${padVis(clip(c ?? ''), widths[i] ?? 0)} `).join('│') + '│';
  const border = (left: string, mid: string, right: string) =>
    left + widths.map((w) => '─'.repeat(w + 2)).join(mid) + right;
  return [
    border('┌', '┬', '┐'),
    rowLine(headers),
    border('├', '┼', '┤'),
    ...rows.map(rowLine),
    border('└', '┴', '┘'),
  ].join('\n');
}
