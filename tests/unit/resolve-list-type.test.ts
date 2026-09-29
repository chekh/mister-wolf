import { describe, it, expect } from 'vitest';
import { resolveListType } from '../../src/app/use-cases/list-memory-objects.js';

// 2.13: 7 выживших типов + карта алиасов §5.4 (значение — spec.target)
const KNOWN = ['decision', 'lesson', 'note', 'rule', 'thread'];
const ALIASES: Readonly<Record<string, string>> = { observation: 'note', blocker: 'note', 'work-thread': 'thread' };

describe('resolveListType (спека 2.1.0 §2.2 F10 + карта §5.4 2.13)', () => {
  it('точный тип — без изменений', () => {
    expect(resolveListType('lesson', KNOWN, ALIASES)).toEqual({ type: 'lesson' });
  });

  it('алиас observation → note + warning', () => {
    expect(resolveListType('observation', KNOWN, ALIASES)).toEqual({
      type: 'note',
      warning: "type 'observation' is deprecated, use 'note'",
    });
  });

  it("unknown 'leson' → ближайший 'lesson' + допустимые", () => {
    const res = resolveListType('leson', KNOWN, ALIASES);
    expect(res.error).toBeDefined();
    expect(res.error).toContain("unknown type 'leson'");
    expect(res.error).toContain("closest: 'lesson'");
    expect(res.error).toContain(`allowed: ${[...KNOWN].sort().join(', ')}`);
  });

  it("расстояние > 2 ('zzz') — без «ближайший», только допустимые", () => {
    const res = resolveListType('zzz', KNOWN, ALIASES);
    expect(res.error).toContain("unknown type 'zzz'");
    expect(res.error).toContain('allowed:');
    expect(res.error).not.toContain('closest');
  });
});
