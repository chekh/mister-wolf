import { describe, it, expect } from 'vitest';
import { MEMORY_SLUG_MAX, normalizeMemorySlug } from '../../../src/domain/memory-slug.js';

describe('normalizeMemorySlug (2.32.0, Q1)', () => {
  it('валидный english slug проходит без изменений', () => {
    expect(normalizeMemorySlug('release-plan')).toBe('release-plan');
    expect(normalizeMemorySlug('plan-2-32-0')).toBe('plan-2-32-0');
    expect(normalizeMemorySlug('v2')).toBe('v2');
  });

  it('нормализует регистр и разделители', () => {
    expect(normalizeMemorySlug('Release Plan')).toBe('release-plan');
    expect(normalizeMemorySlug('release_plan')).toBe('release-plan');
    expect(normalizeMemorySlug('  release   plan  ')).toBe('release-plan');
    expect(normalizeMemorySlug('release---plan')).toBe('release-plan');
  });

  it('кириллица и не-ASCII невалидны: null, а не «чистый» slug', () => {
    expect(normalizeMemorySlug('релиз')).toBeNull();
    expect(normalizeMemorySlug('Правила работы')).toBeNull();
    expect(normalizeMemorySlug('🚀🎉')).toBeNull();
    expect(normalizeMemorySlug('a.b')).toBeNull();
    expect(normalizeMemorySlug('a b')).toBe('a-b');
  });

  it('пустые и не-строки → null', () => {
    expect(normalizeMemorySlug('')).toBeNull();
    expect(normalizeMemorySlug('   ')).toBeNull();
    expect(normalizeMemorySlug(undefined)).toBeNull();
    expect(normalizeMemorySlug(42)).toBeNull();
  });

  it('длинный slug обрезается по границе слова и без висящего дефиса', () => {
    const long = `${'a'.repeat(MEMORY_SLUG_MAX + 5)} tail`;
    const slug = normalizeMemorySlug(long);
    expect(slug).not.toBeNull();
    expect((slug as string).length).toBeLessThanOrEqual(MEMORY_SLUG_MAX);
    expect((slug as string).endsWith('-')).toBe(false);
  });
});
