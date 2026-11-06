import { describe, it, expect } from 'vitest';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';

const DAY = new Date('2026-11-06T14:00:00Z');

describe('HashIdGenerator — 2.32.0 (Q1/Q2): english slug + fallback', () => {
  it('S09: english slug → mem_<date>_<slug>_<hash6>', () => {
    const gen = new HashIdGenerator();
    expect(gen.generateMemoryId(DAY, 'release-plan')).toMatch(/^mem_20261106_release-plan_[0-9a-f]{6}$/);
  });

  it('S11: одинаковый slug+дата даёт одинаковый ID (детерминизм, без миллисекунд)', () => {
    const gen = new HashIdGenerator();
    const a = gen.generateMemoryId(DAY, 'release-plan');
    const later = new Date('2026-11-06T23:59:59.999Z');
    expect(gen.generateMemoryId(later, 'release-plan')).toBe(a);
  });

  it('S11: хеш не зависит от времени суток, но зависит от даты', () => {
    const gen = new HashIdGenerator();
    const today = gen.generateMemoryId(DAY, 'release-plan');
    const tomorrow = gen.generateMemoryId(new Date('2026-11-07T00:00:00Z'), 'release-plan');
    expect(tomorrow).not.toBe(today);
    expect(tomorrow.startsWith('mem_20261107_release-plan_')).toBe(true);
  });

  it('S10: нормализация регистра и разделителей', () => {
    const gen = new HashIdGenerator();
    expect(gen.generateMemoryId(DAY, '  Release Plan ')).toBe(gen.generateMemoryId(DAY, 'release-plan'));
    expect(gen.generateMemoryId(DAY, 'release_plan')).toBe(gen.generateMemoryId(DAY, 'release-plan'));
    expect(gen.generateMemoryId(DAY, 'release---plan')).toBe(gen.generateMemoryId(DAY, 'release-plan'));
  });

  it('S10: транслитерации нет — кириллица даёт fallback без слов', () => {
    const gen = new HashIdGenerator();
    const id = gen.generateMemoryId(DAY, 'Правила работы с памятью проекта');
    expect(id).toMatch(/^mem_20261106_[0-9a-f]{6}$/);
    expect(id).not.toMatch(/[а-яё]/i);
    expect(id).not.toContain('pravila');
    expect(id).not.toContain('pamyatyu');
  });

  it('S10: пустой/невалидный вход (эмодзи, точки, пунктуация) → fallback', () => {
    const gen = new HashIdGenerator();
    for (const bad of ['', '   ', '🚀🎉', 'a.b', 'UPPER CASE!']) {
      expect(gen.generateMemoryId(DAY, bad)).toMatch(/^mem_20261106_[0-9a-f]{6}$/);
    }
  });

  it('S10: fallback различает разные записи дня (fingerprint в хеше, не в id)', () => {
    const gen = new HashIdGenerator();
    const a = gen.generateMemoryId(DAY, undefined, 'Правила работы');
    const b = gen.generateMemoryId(DAY, undefined, 'Другое правило');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^mem_20261106_[0-9a-f]{6}$/);
    // повторный вызов с тем же входом — тот же ID
    expect(gen.generateMemoryId(DAY, undefined, 'Правила работы')).toBe(a);
  });

  it('slug длиннее 40 обрезается по границе слова', () => {
    const gen = new HashIdGenerator();
    const id = gen.generateMemoryId(DAY, 'a'.repeat(30) + '-' + 'b'.repeat(30));
    const slug = id.slice('mem_20261106_'.length, id.lastIndexOf('_'));
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('event id не изменился по форме', () => {
    const gen = new HashIdGenerator();
    expect(gen.generateEventId(DAY)).toMatch(/^evt_20261106140000_[0-9a-f]{6}$/);
  });
});
