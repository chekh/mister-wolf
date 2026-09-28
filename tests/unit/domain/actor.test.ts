import { describe, it, expect } from 'vitest';
import { resolveCreatedBy, ensureCliSessionId } from '../../../src/domain/actor.js';

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

describe('ensureCliSessionId (волна 0: session-key CLI)', () => {
  it('дискриминативность: 100 вызовов со свежим env → 100 уникальных id с префиксом cli-', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = ensureCliSessionId({} as NodeJS.ProcessEnv);
      expect(id.startsWith('cli-')).toBe(true);
      ids.add(id);
    }
    expect(ids.size).toBe(100);
  });

  it('стабильность: повторный вызов с тем же env-объектом возвращает тот же id (мутация env)', () => {
    const env = {} as NodeJS.ProcessEnv;
    const first = ensureCliSessionId(env);
    expect(ensureCliSessionId(env)).toBe(first);
    expect(env.WOLF_SESSION).toBe(first); // функция пишет в переданный объект
  });

  it('пустая строка/whitespace WOLF_SESSION считается незаданной → генерация', () => {
    expect(ensureCliSessionId({ WOLF_SESSION: '' } as NodeJS.ProcessEnv).startsWith('cli-')).toBe(true);
    expect(ensureCliSessionId({ WOLF_SESSION: '   ' } as NodeJS.ProcessEnv).startsWith('cli-')).toBe(true);
  });

  it('явно выставленный WOLF_SESSION не перезаписывается', () => {
    const env = { WOLF_SESSION: 'harness-session-42' } as NodeJS.ProcessEnv;
    expect(ensureCliSessionId(env)).toBe('harness-session-42');
    expect(env.WOLF_SESSION).toBe('harness-session-42');
  });
});
