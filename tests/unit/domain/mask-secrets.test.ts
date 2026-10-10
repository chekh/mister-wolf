import { describe, it, expect } from 'vitest';
import { maskSecrets } from '../../../src/domain/mask-secrets.js';

describe('maskSecrets (WP4)', () => {
  it('masks known token prefixes', () => {
    expect(maskSecrets('key sk-abcdef1234567890 end')).toBe('key [redacted] end');
    expect(maskSecrets(`ghp_${'a'.repeat(20)}`)).toBe('[redacted]');
    expect(maskSecrets('xoxb-123456789012')).toBe('[redacted]');
    expect(maskSecrets(`AKIA${'A'.repeat(16)}`)).toBe('[redacted]'); // реальный AWS AccessKey = AKIA + 16
  });

  it('masks named assignments', () => {
    expect(maskSecrets('api_key = supersecret123')).toBe('api_key = [redacted]');
    expect(maskSecrets('token: "abcdef123456"')).toBe('token: [redacted]');
  });

  it('leaves normal text alone', () => {
    expect(maskSecrets('run npm test and wolf call')).toBe('run npm test and wolf call');
  });
});
