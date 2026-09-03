import { describe, it, expect } from 'vitest';
import { sparkline, renderTable } from '../../../src/adapters/cli/commands/dashboard.js';

describe('dashboard render helpers (D8: console unicode)', () => {
  it('sparkline: [] -> empty string, all zeros -> flat bars, proportional otherwise', () => {
    expect(sparkline([])).toBe('');
    expect(sparkline([0, 0])).toBe('▁▁');
    expect(sparkline([1, 2, 4, 8])).toBe('▁▂▄█');
    expect(sparkline([5])).toBe('█');
  });

  it('renderTable: unicode frame and column separator', () => {
    const out = renderTable(
      ['a', 'b'],
      [
        ['1', '2'],
        ['3', '4'],
      ]
    );
    expect(out).toContain('│');
    expect(out).toContain('┌');
    expect(out).toContain('└');
  });
});
