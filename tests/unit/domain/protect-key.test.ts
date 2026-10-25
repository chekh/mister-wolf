// tests/unit/domain/protect-key.test.ts
// REQ-05 AC4/AC5, design §4.1: грамматика ключа protect, нормализация (байт-в-байт
// вне строк ключа), вставка последней строкой блока с CRLF-сохранением и
// структурной проверкой до записи, снятие = нормализация.
import { parseProtect, normalizeManaged, insertProtect, removeProtect } from '../../../src/domain/protect-key.js';

const doc = (front: string, body = 'body: x\n'): string => `---\n${front}---\n${body}`;

describe('parseProtect — грамматика §4.1', () => {
  it('нет frontmatter — не защищён', () => {
    expect(parseProtect('just text\n')).toEqual({ held: false, value: null, raw: null });
  });

  it('protect: true — держит', () => {
    expect(parseProtect(doc('protect: true\n'))).toEqual({ held: true, value: 'true', raw: 'true' });
  });

  it('protect: X.Y.Z — держит с версией', () => {
    expect(parseProtect(doc('protect: 2.19.0\n'))).toEqual({ held: true, value: '2.19.0', raw: '2.19.0' });
  });

  it('protect: false — не защищён, без unrecognized', () => {
    expect(parseProtect(doc('protect: false\n'))).toEqual({ held: false, value: null, raw: 'false' });
  });

  it.each([['protect:\n'], ['protect: ~\n'], ['protect: null\n']])(
    'недописанный ключ %j — held + unrecognized (ADR-5)',
    (front) => {
      const r = parseProtect(doc(front));
      expect(r.held).toBe(true);
      expect(r.value).toBeNull();
      expect(r.unrecognized).toBe(true);
    }
  );

  it.each([['protect: yes\n'], ['protect: 2.19\n'], ['protect: "2.19.0"\n']])(
    'значение вне грамматики %j — held + unrecognized',
    (front) => {
      const r = parseProtect(doc(front));
      expect(r.held).toBe(true);
      expect(r.value).toBeNull();
      expect(r.unrecognized).toBe(true);
    }
  );

  it('ключ в теле документа — не защита', () => {
    expect(parseProtect('---\ntitle: x\n---\nprotect: true\n')).toEqual({ held: false, value: null, raw: null });
  });

  it.each([['"protect": true\n'], ['  protect: true\n'], ['\tprotect: true\n']])(
    'ключ вне грамматики (%j) — не защита (граница)',
    (front) => {
      expect(parseProtect(doc(front)).held).toBe(false);
    }
  );

  it('дубли: берётся ПЕРВЫЙ ключ файла', () => {
    expect(parseProtect(doc('protect: true\nprotect: 2.19.0\n')).value).toBe('true');
    expect(parseProtect(doc('protect: 9.9.9\nprotect: false\n')).value).toBe('9.9.9');
  });

  it('CRLF-frontmatter разбирается', () => {
    expect(parseProtect('---\r\nprotect: true\r\n---\r\nbody\r\n')).toEqual({
      held: true,
      value: 'true',
      raw: 'true',
    });
  });
});

describe('normalizeManaged — нормализация §4.1', () => {
  it('удаляет все строки ключа, остальное байт-в-байт', () => {
    const src = doc('title: x\nprotect: true\nversion: 1\n', 'body: x\n');
    expect(normalizeManaged(src)).toBe(doc('title: x\nversion: 1\n', 'body: x\n'));
  });

  it('снимает дубли', () => {
    expect(normalizeManaged(doc('protect: true\nprotect: 2.19.0\n'))).toBe(doc(''));
  });

  it('protect: false тоже снимается (нормализация шире грамматики)', () => {
    expect(normalizeManaged(doc('protect: false\n'))).toBe(doc(''));
  });

  it('без frontmatter — байт-в-байт', () => {
    const src = '# title\nprotect: true\n';
    expect(normalizeManaged(src)).toBe(src);
  });

  it('ключ в теле не удаляется', () => {
    const src = '---\ntitle: x\n---\nprotect: true\n';
    expect(normalizeManaged(src)).toBe(src);
  });

  it('ключи вне грамматики (кавычки/отступ/таб) не удаляются', () => {
    const src = doc('"protect": true\n  protect: true\n\tprotect: true\n');
    expect(normalizeManaged(src)).toBe(src);
  });

  it('незакрытый frontmatter — байт-в-байт', () => {
    const src = '---\nprotect: true\nbody\n';
    expect(normalizeManaged(src)).toBe(src);
  });

  it('CRLF: остальные строки и переводы строк сохранены', () => {
    const src = '---\r\nprotect: true\r\ntitle: x\r\n---\r\nbody\r\n';
    expect(normalizeManaged(src)).toBe('---\r\ntitle: x\r\n---\r\nbody\r\n');
  });

  it('идемпотентна и для файла без ключа возвращает тот же контент', () => {
    const fixtures = [
      doc('title: x\n'),
      '---\r\nprotect: true\r\n---\r\nbody\r\n',
      '# no frontmatter\n',
      '---\nprotect: true\n',
      doc('protect: false\n'),
    ];
    for (const f of fixtures) {
      const once = normalizeManaged(f);
      expect(normalizeManaged(once)).toBe(once);
    }
    expect(normalizeManaged(doc('title: x\n'))).toBe(doc('title: x\n'));
  });
});

describe('insertProtect — вставка §4.1', () => {
  it('ключ встаёт последней строкой блока; комментарии и порядок сохранены', () => {
    const src = doc('# comment\ntitle: x\nversion: 1\n', 'body\n');
    const r = insertProtect(src, 'true');
    expect(r.error).toBeUndefined();
    expect(r.changed).toBe(true);
    expect(r.content).toBe(doc('# comment\ntitle: x\nversion: 1\nprotect: true\n', 'body\n'));
  });

  it('повторная вставка того же значения идемпотентна (changed=false)', () => {
    const once = insertProtect(doc('title: x\n'), 'true');
    const twice = insertProtect(once.content, 'true');
    expect(twice.changed).toBe(false);
    expect(twice.content).toBe(once.content);
  });

  it('замена существующего ключа не оставляет дублей', () => {
    const src = doc('protect: true\ntitle: x\n');
    const r = insertProtect(src, '2.19.0');
    expect(r.content).toBe(doc('title: x\nprotect: 2.19.0\n'));
    expect(parseProtect(r.content).value).toBe('2.19.0');
  });

  it('пустой блок — ключ первой строкой блока', () => {
    const r = insertProtect('---\n---\nbody\n', 'true');
    expect(r.content).toBe('---\nprotect: true\n---\nbody\n');
  });

  it('CRLF: вставленная строка использует EOL закрывающего разделителя', () => {
    const r = insertProtect('---\r\ntitle: x\r\n---\r\nbody\r\n', 'true');
    expect(r.content).toBe('---\r\ntitle: x\r\nprotect: true\r\n---\r\nbody\r\n');
  });

  it('нет frontmatter — отказ no-yaml-frontmatter, контент не меняется', () => {
    const src = '# agents\nprotect: true\n';
    const r = insertProtect(src, 'true');
    expect(r).toEqual({ content: src, changed: false, error: 'no-yaml-frontmatter' });
  });

  it('незакрытый frontmatter — отказ, контент не меняется', () => {
    const src = '---\ntitle: x\n';
    const r = insertProtect(src, 'true');
    expect(r).toEqual({ content: src, changed: false, error: 'no-yaml-frontmatter' });
  });
});

describe('removeProtect — снятие §4.1', () => {
  it('снимает ключ и возвращает исходный байт-контент', () => {
    const src = doc('title: x\n', 'body\n');
    const inserted = insertProtect(src, 'true').content;
    expect(removeProtect(inserted)).toBe(src);
  });

  it('снятие не добавляет и не переставляет ключи', () => {
    const src = doc('title: x\nversion: 1\n');
    const inserted = insertProtect(src, '2.19.0').content;
    expect(removeProtect(inserted)).toBe(src);
  });

  it('без frontmatter — no-op', () => {
    expect(removeProtect('text\n')).toBe('text\n');
  });
});
