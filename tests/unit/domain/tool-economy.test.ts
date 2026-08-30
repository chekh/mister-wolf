import { describe, it, expect } from 'vitest';
import { analyzeEconomy, median, parseRunLog, RunLogEntry } from '../../../src/domain/tool-economy.js';

function entry(weighted: number | undefined, tools?: string[]): RunLogEntry {
  return { title: 't', weighted, ...(tools ? { tools } : {}) };
}

describe('median', () => {
  it('нечётная длина — центральный элемент', () => {
    expect(median([300, 100, 100])).toBe(100);
  });
  it('чётная длина — среднее двух центральных', () => {
    expect(median([100, 200, 300, 900])).toBe(250);
  });
  it('пустой массив — null', () => {
    expect(median([])).toBeNull();
  });
});

describe('parseRunLog', () => {
  it('возвращает валидные строки и молча пропускает битые', () => {
    const text = [
      JSON.stringify({ ts: 'a', weighted: 10, tools: ['t1'] }),
      '{битая json',
      JSON.stringify({ ts: 'b', weighted: 20 }),
      '',
      '   ',
      JSON.stringify({ ts: 'c', weighted: 30, tools: [] }),
    ].join('\n');
    const entries = parseRunLog(text);
    expect(entries).toHaveLength(3);
    expect(entries[0]?.weighted).toBe(10);
    expect(entries[1]?.weighted).toBe(20);
    expect(entries[2]?.weighted).toBe(30);
  });
  it('не-объект (число) пропускается', () => {
    expect(parseRunLog('42')).toEqual([]);
  });
});

describe('analyzeEconomy', () => {
  it('меньше minSample tool-задач → sufficient false, реальные числа в reason', () => {
    const entries = [entry(100, ['t']), entry(200, ['t']), entry(900), entry(1000)];
    const result = analyzeEconomy(entries);
    expect(result.sufficient).toBe(false);
    expect(result.reason).toContain('tool-задач: 2');
    expect(result.reason).toContain('всего: 4');
    expect(result.reason).toContain('≥ 3');
    expect(result.toolRuns).toBe(2);
    expect(result.totalRuns).toBe(4);
    expect(result.medianTool).toBeNull();
    expect(result.savingsPct).toBeNull();
  });

  it('достаточно данных → медианы и savingsPct по hand-calc (≈66.7)', () => {
    const entries = [entry(100, ['t']), entry(100, ['t']), entry(300, ['t']), entry(900), entry(1000)];
    const result = analyzeEconomy(entries);
    expect(result.sufficient).toBe(true);
    expect(result.toolRuns).toBe(3);
    expect(result.totalRuns).toBe(5);
    expect(result.medianTool).toBe(100);
    expect(result.medianAll).toBe(300);
    expect(result.savingsPct).toBeCloseTo((1 - 100 / 300) * 100, 5);
    expect(result.savingsPct).toBeCloseTo(66.67, 2);
  });

  it('entries с невалидным weighted не считаются ни в одну группу', () => {
    const entries = [
      entry(100, ['t']),
      entry(100, ['t']),
      entry(100, ['t']),
      entry(Number.NaN),
      entry(undefined, ['t']), // tools есть, weighted нет → не marked
    ];
    const result = analyzeEconomy(entries);
    expect(result.toolRuns).toBe(3);
    expect(result.totalRuns).toBe(3);
    expect(result.sufficient).toBe(true);
  });

  it('medianAll = 0 при достаточном объёме → sufficient true, savingsPct null', () => {
    const entries = [entry(0, ['t']), entry(0, ['t']), entry(0, ['t'])];
    const result = analyzeEconomy(entries);
    expect(result.sufficient).toBe(true);
    expect(result.medianTool).toBe(0);
    expect(result.medianAll).toBe(0);
    expect(result.savingsPct).toBeNull();
  });

  it('кастомный minSample уважается', () => {
    const entries = [entry(5, ['t']), entry(5, ['t']), entry(5)];
    const result = analyzeEconomy(entries, 2);
    expect(result.sufficient).toBe(true);
    expect(result.medianTool).toBe(5);
    expect(result.medianAll).toBe(5);
    expect(result.savingsPct).toBe(0);
  });
});
