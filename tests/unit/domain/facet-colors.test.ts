import { describe, it, expect } from 'vitest';
import { colorForFacet, highlightFacet, colorsEnabled } from '../../../src/domain/facet-colors.js';
import { DEFAULT_CHARACTER_FACETS } from '../../../src/domain/memory-types.js';

describe('P212в: facet-colors', () => {
  it('карта покрывает все 7 дефолтных фасетов ANSI-кодами', () => {
    for (const facet of DEFAULT_CHARACTER_FACETS) {
      expect(colorForFacet(facet)).toMatch(/^\x1b\[\d+m$/);
    }
  });

  it('цвета по спеке: green/red/blue/yellow/magenta/dim/cyan', () => {
    expect(colorForFacet('howto')).toBe('\x1b[32m');
    expect(colorForFacet('pitfall')).toBe('\x1b[31m');
    expect(colorForFacet('context')).toBe('\x1b[34m');
    expect(colorForFacet('metric')).toBe('\x1b[33m');
    expect(colorForFacet('history')).toBe('\x1b[35m');
    expect(colorForFacet('legacy')).toBe('\x1b[2m');
    expect(colorForFacet('constraint')).toBe('\x1b[36m');
  });

  it('неизвестный фасет → null, текст остаётся плоским', () => {
    expect(colorForFacet('nope')).toBeNull();
    expect(highlightFacet('nope', true)).toBe('nope');
  });

  it('highlightFacet оборачивает фасет кодом + reset', () => {
    expect(highlightFacet('pitfall', true)).toBe('\x1b[31mpitfall\x1b[0m');
  });

  it('highlightFacet disabled → плоский текст', () => {
    expect(highlightFacet('pitfall', false)).toBe('pitfall');
  });

  it('colorsEnabled: isTTY=false/undefined → плоский вывод', () => {
    expect(colorsEnabled({ isTTY: false }, {})).toBe(false);
    expect(colorsEnabled({ isTTY: undefined }, {})).toBe(false);
  });

  it('colorsEnabled: NO_COLOR / WOLF_NO_COLOR → плоский вывод', () => {
    expect(colorsEnabled({ isTTY: true }, { NO_COLOR: '1' })).toBe(false);
    expect(colorsEnabled({ isTTY: true }, { WOLF_NO_COLOR: '1' })).toBe(false);
  });

  it('colorsEnabled: TTY без env-флагов → цвет; пустой NO_COLOR не отключает', () => {
    expect(colorsEnabled({ isTTY: true }, {})).toBe(true);
    expect(colorsEnabled({ isTTY: true }, { NO_COLOR: '' })).toBe(true);
  });
});
