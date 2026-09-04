import { describe, it, expect } from 'vitest';
import { renderTable } from '../../../src/adapters/cli/commands/dashboard.js';

/** Независимый оракул визуальной ширины (минимальная wide-таблица из ТЗ). */
function oracleWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    w +=
      (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
      (cp >= 0x2e80 && cp <= 0xa4cf) || // CJK радикалы..Yi
      (cp >= 0x3400 && cp <= 0x4dbf) ||
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
      (cp >= 0xf900 && cp <= 0xfaff) || // CJK compatibility
      (cp >= 0xff00 && cp <= 0xff60) || // fullwidth forms
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      cp > 0xffff // суррогатные пары
        ? 2
        : 1;
  }
  return w;
}

/** Позиции вхождения символов из targets — в ВИЗУАЛЬНЫХ колонках (wide = 2). */
function charIndices(line: string, targets: Set<string>): number[] {
  const idx: number[] = [];
  let col = 0;
  for (const ch of line) {
    if (targets.has(ch)) idx.push(col);
    col += oracleWidth(ch);
  }
  return idx;
}

describe('renderTable: инварианты выравнивания Unicode-таблиц', () => {
  const cases: Array<{ name: string; headers: string[]; rows: string[][] }> = [
    {
      name: 'обычные ячейки',
      headers: ['a', 'b'],
      rows: [
        ['1', '2'],
        ['3', '4'],
      ],
    },
    { name: 'ячейка длиннее 40 клипается', headers: ['id', 'title'], rows: [['x'.repeat(60), 'ok']] },
    { name: 'wide-char 中', headers: ['中文', 'v'], rows: [['文', '1']] },
    { name: '… ✓ ✗ · спарклайны', headers: ['…', '✓', '✗'], rows: [['·', '▄█', '中']] },
  ];

  for (const { name, headers, rows } of cases) {
    it(`${name}: рамки совпадают с контентом по позициям`, () => {
      const lines = renderTable(headers, rows).split('\n');
      expect(lines.length).toBe(4 + rows.length);

      // (в) рамки сверху/снизу
      expect(lines[0].startsWith('┌')).toBe(true);
      expect(lines[lines.length - 1].startsWith('└')).toBe(true);

      // (а) все строки одной ВИЗУАЛЬНОЙ длины
      const widths = lines.map(oracleWidth);
      for (const w of widths) expect(w).toBe(widths[0]);

      // (б) позиции │ в строках данных == позициям стыков ┌┬┐/├┼┤/└┴┘ в рамках
      // (включая углы: ведущий │ на колонке 0, хвостовой — на последней)
      const top = charIndices(lines[0], new Set(['┌', '┬', '┐']));
      const mid = charIndices(lines[2], new Set(['├', '┼', '┤']));
      const bottom = charIndices(lines[lines.length - 1], new Set(['└', '┴', '┘']));
      expect(mid).toEqual(top);
      expect(bottom).toEqual(top);
      for (const line of [lines[1], ...lines.slice(3, lines.length - 1)]) {
        expect(charIndices(line, new Set(['│']))).toEqual(top);
      }
    });
  }
});
