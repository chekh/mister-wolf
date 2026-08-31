import { describe, it, expect } from 'vitest';
import { parseJsonc } from '../../../../src/adapters/platforms/jsonc.js';

describe('parseJsonc', () => {
  it('parses plain JSON', () => {
    expect(parseJsonc('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips // line comments outside strings', () => {
    expect(parseJsonc('{\n  // comment\n  "a": 1 // trailing\n}\n')).toEqual({ a: 1 });
  });

  it('strips /* block comments */', () => {
    expect(parseJsonc('{ /* c */ "a": 1 }')).toEqual({ a: 1 });
  });

  it('keeps // inside string values intact', () => {
    expect(parseJsonc('{"url":"https://opencode.ai/config.json"}')).toEqual({
      url: 'https://opencode.ai/config.json',
    });
  });

  it('tolerates trailing commas', () => {
    expect(parseJsonc('{"a":1,}')).toEqual({ a: 1 });
    expect(parseJsonc('[1,2,]')).toEqual([1, 2]);
  });

  it('throws on genuinely broken input', () => {
    expect(() => parseJsonc('{nope')).toThrow(SyntaxError);
  });
});
