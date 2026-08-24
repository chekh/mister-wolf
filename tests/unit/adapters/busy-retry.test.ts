import { describe, it, expect } from 'vitest';
import { runWithBusyRetry } from '../../../src/adapters/sqlite/busy-retry.js';

describe('runWithBusyRetry', () => {
  it('retries SQLITE_BUSY twice then succeeds', () => {
    let calls = 0;
    const fn = () => {
      calls++;
      if (calls <= 2) throw new Error('SQLITE_BUSY: locked');
      return 'ok';
    };
    const result = runWithBusyRetry(fn);
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('rethrows non-busy errors immediately', () => {
    let calls = 0;
    const fn = () => {
      calls++;
      throw new TypeError('not a busy error');
    };
    expect(() => runWithBusyRetry(fn)).toThrow(TypeError);
    expect(calls).toBe(1);
  });
});
