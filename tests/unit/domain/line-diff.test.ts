// tests/unit/domain/line-diff.test.ts
// T8 (волна 2.20.0, REQ-08, design §4.10): построчный LCS с лимитами входа
// (≤ 4000 строк) и вывода (≤ 200 строк + «… ещё N строк»), детерминизм,
// группировка в хунки с контекстом. Без внешних зависимостей.
import { describe, it, expect } from 'vitest';
import { formatDiff, lineDiff } from '../../../src/domain/line-diff.js';

const text = (lines: string[]): string => `${lines.join('\n')}\n`;

describe('lineDiff: LCS, хунки, счётчики (R08-1/R08-4)', () => {
  it('идентичные тексты — пустой diff, нулевые счётчики', () => {
    const res = lineDiff(text(['a', 'b', 'c']), text(['a', 'b', 'c']));
    expect(res).toMatchObject({ hunks: [], added: 0, removed: 0, truncated: 0, inputTruncated: false });
    expect(formatDiff(res)).toEqual([]);
  });

  it('замена строки — один хунк с -старой/+новой и верными счётчиками', () => {
    const res = lineDiff(text(['a', 'old', 'c']), text(['a', 'new', 'c']));
    expect(res.removed).toBe(1);
    expect(res.added).toBe(1);
    expect(res.hunks).toHaveLength(1);
    const lines = formatDiff(res);
    expect(lines[0]).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@$/);
    expect(lines).toContain('-old');
    expect(lines).toContain('+new');
    expect(lines).toContain(' a'); // контекст
  });

  it('вставка и удаление блоков — счётчики и строки', () => {
    const ins = lineDiff(text(['a', 'c']), text(['a', 'b1', 'b2', 'c']));
    expect(ins).toMatchObject({ added: 2, removed: 0 });
    expect(formatDiff(ins)).toEqual(expect.arrayContaining(['+b1', '+b2']));

    const del = lineDiff(text(['a', 'b1', 'b2', 'c']), text(['a', 'c']));
    expect(del).toMatchObject({ added: 0, removed: 2 });
    expect(formatDiff(del)).toEqual(expect.arrayContaining(['-b1', '-b2']));
  });

  it('далёкие изменения — два хунка со своими заголовками', () => {
    const before = text(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    const after = text(['1', 'x', '3', '4', '5', '6', '7', '8', 'y', '10']);
    const res = lineDiff(before, after);
    expect(res.hunks).toHaveLength(2);
    expect(formatDiff(res).filter((l) => l.startsWith('@@'))).toHaveLength(2);
  });

  it('R08-4: вывод обрезан по лимиту с «… ещё N строк», вход — по maxInput', () => {
    const before = text(Array.from({ length: 50 }, (_, i) => `line ${i}`));
    const after = text(Array.from({ length: 50 }, (_, i) => `changed ${i}`));
    const limited = lineDiff(before, after, { maxOutput: 10 });
    expect(formatDiff(limited).length).toBeLessThanOrEqual(12); // заголовок хунка + 10 строк + «… ещё N»
    expect(limited.truncated).toBeGreaterThan(0);
    expect(formatDiff(limited).at(-1)).toMatch(/^… \d+ more lines$/);

    const big = text(Array.from({ length: 4500 }, (_, i) => `l${i}`));
    const bigEdit = `${big}extra\n`;
    const inputLimited = lineDiff(big, bigEdit);
    expect(inputLimited.inputTruncated).toBe(true);
  });

  it('детерминизм: повтор даёт байт-идентичный вывод; CRLF не шумит', () => {
    const a = 'a\r\nb\r\nc\r\n';
    const b = 'a\nB\nc\n';
    const first = formatDiff(lineDiff(a, b));
    const second = formatDiff(lineDiff(a, b));
    expect(second).toEqual(first);
    expect(first).toEqual(['@@ -1,3 +1,3 @@', ' a', '-b', '+B', ' c']);
  });
});
