import { describe, it, expect } from 'vitest';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';

describe('HashIdGenerator', () => {
  it('generates stable memory id', () => {
    const gen = new HashIdGenerator();
    const date = new Date('2026-06-29T14:00:00Z');
    const id = gen.generateMemoryId(date, 'Router reconnect failure mode');
    expect(id).toMatch(/^mem_20260629_router_reconnect_failure_mode_[a-f0-9]{6}$/);
  });
});
