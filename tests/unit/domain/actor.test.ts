import { describe, it, expect } from 'vitest';
import { resolveCreatedBy } from '../../../src/domain/actor.js';

describe('resolveCreatedBy (W1: actor-атрибуция)', () => {
  it('явный флаг побеждает env и дефолт', () => {
    expect(resolveCreatedBy('agent:lead', { WOLF_ACTOR: 'agent:other' } as NodeJS.ProcessEnv)).toBe('agent:lead');
  });

  it('env WOLF_ACTOR используется, когда флаг не задан', () => {
    expect(resolveCreatedBy(undefined, { WOLF_ACTOR: 'agent:worker-1' } as NodeJS.ProcessEnv)).toBe('agent:worker-1');
  });

  it('без флага и env — дефолт user:cli', () => {
    expect(resolveCreatedBy(undefined, {} as NodeJS.ProcessEnv)).toBe('user:cli');
  });

  it('пустые значения флага/env игнорируются как незаданные', () => {
    expect(resolveCreatedBy('  ', { WOLF_ACTOR: '' } as NodeJS.ProcessEnv)).toBe('user:cli');
  });
});
