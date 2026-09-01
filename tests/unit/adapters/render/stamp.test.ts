// tests/unit/adapters/render/stamp.test.ts
import { describe, expect, it } from 'vitest';
import { insertStamp, parseStamp, renderStamp } from '../../../../src/adapters/render/stamp.js';

describe('stamp', () => {
  it('md: HTML-комментарий, ровно один пробел перед -->', () => {
    expect(renderStamp({ base: 'mr-wolf.md', set: '1.0.3' }, 'mr-wolf.md')).toBe(
      '<!-- wolf:rendered base=mr-wolf.md set=1.0.3 -->'
    );
  });
  it('js/ts: // комментарий без хвоста', () => {
    expect(renderStamp({ base: 'wolf-router.ts', set: '1.0.3' }, 'wolf-router.ts')).toBe(
      '// wolf:rendered base=wolf-router.ts set=1.0.3'
    );
  });
  it('parseStamp читает оба формата', () => {
    expect(parseStamp('x\n<!-- wolf:rendered base=a set=1.0.0 -->')).toEqual({ base: 'a', set: '1.0.0' });
    expect(parseStamp('// wolf:rendered base=b set=2.0.0')).toEqual({ base: 'b', set: '2.0.0' });
    expect(parseStamp('нет штампа')).toBeNull();
  });
  it('insertStamp в md — штамп ПОСЛЕ frontmatter', () => {
    const out = insertStamp('---\ndescription: x\n---\n\n# Body\n', { base: 'a', set: '1.0.0' }, 'a.md');
    expect(out.startsWith('---\ndescription: x\n---\n<!-- wolf:rendered base=a set=1.0.0 -->\n')).toBe(true);
  });
  it('insertStamp без frontmatter — первой строкой', () => {
    expect(insertStamp('# Body\n', { base: 'a', set: '1.0.0' }, 'a.md').startsWith('<!-- wolf:rendered')).toBe(true);
  });
  it('insertStamp идемпотентен', () => {
    const once = insertStamp('# B\n', { base: 'a', set: '1.0.0' }, 'a.md');
    expect(insertStamp(once, { base: 'a', set: '1.0.1' }, 'a.md').match(/wolf:rendered/g)?.length).toBe(1);
  });
});
