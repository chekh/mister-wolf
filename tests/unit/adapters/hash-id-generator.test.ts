import { describe, it, expect } from 'vitest';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';

describe('HashIdGenerator', () => {
  it('generates stable memory id', () => {
    const gen = new HashIdGenerator();
    const date = new Date('2026-06-29T14:00:00Z');
    const id = gen.generateMemoryId(date, 'Router reconnect failure mode');
    expect(id).toMatch(/^mem_20260629_router_reconnect_failure_mode_[a-f0-9]{6}$/);
  });

  it('transliterates cyrillic title into non-empty deterministic slug', () => {
    const gen = new HashIdGenerator();
    const date = new Date('2026-08-25T14:00:00Z');
    const id1 = gen.generateMemoryId(date, 'Правила работы с памятью проекта');
    const id2 = gen.generateMemoryId(date, 'Правила работы с памятью проекта');
    expect(id1).toMatch(/^mem_20260825_[a-z0-9][a-z0-9_]*_[a-f0-9]{6}$/);
    expect(id1).toBe(id2);
  });

  it('falls back to hash slug when title has no transliterable letters', () => {
    const gen = new HashIdGenerator();
    const date = new Date('2026-08-25T14:00:00Z');
    const id = gen.generateMemoryId(date, '🚀🎉');
    expect(id).toMatch(/^mem_20260825_[a-f0-9]{6}_[a-f0-9]{6}$/);
  });
});
