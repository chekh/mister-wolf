import { describe, it, expect } from 'vitest';
import { resolveListType } from '../../src/app/use-cases/list-memory-objects.js';

const KNOWN = ['decision', 'lesson', 'document', 'document-ref', 'rule'];
const ALIASES: Readonly<Record<string, string>> = { document: 'document-ref' };

describe('resolveListType (спека 2.1.0 §2.2 F10)', () => {
  it('точный тип — без изменений', () => {
    expect(resolveListType('lesson', KNOWN, ALIASES)).toEqual({ type: 'lesson' });
  });

  it('алиас document → document-ref + warning', () => {
    expect(resolveListType('document', KNOWN, ALIASES)).toEqual({
      type: 'document-ref',
      warning: "тип 'document' устарел, используйте 'document-ref'",
    });
  });

  it("unknown 'documnt' → ближайший 'document-ref' (алиас подставлен каноном) + допустимые", () => {
    const res = resolveListType('documnt', KNOWN, ALIASES);
    expect(res.error).toBeDefined();
    expect(res.error).toContain("неизвестный тип 'documnt'");
    expect(res.error).toContain("ближайший: 'document-ref'");
    expect(res.error).toContain(`допустимые: ${[...KNOWN].sort().join(', ')}`);
  });

  it("расстояние > 2 ('zzz') — без «ближайший», только допустимые", () => {
    const res = resolveListType('zzz', KNOWN, ALIASES);
    expect(res.error).toContain("неизвестный тип 'zzz'");
    expect(res.error).toContain('допустимые:');
    expect(res.error).not.toContain('ближайший');
  });
});
