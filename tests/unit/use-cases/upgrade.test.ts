import { describe, it, expect } from 'vitest';
import {
  compareVersions,
  isUnderGlobalPrefix,
  runUpgrade,
  type UpgradeDeps,
} from '../../../src/app/use-cases/upgrade.js';

// U1 брифа: сравнение версий (equal/older/newer) и детекция linked/registry.
// Спавн npm за DI-швом UpgradeDeps — мокаем шов, реальный npm не участвует.

const GLOBAL_BIN = '/usr/local/lib/node_modules/mister-wolf/dist/bootstrap/cli.js';

function makeDeps(over: Partial<UpgradeDeps> = {}): UpgradeDeps {
  return {
    currentVersion: '2.1.0',
    binaryPath: GLOBAL_BIN,
    npmPrefix: '/usr/local',
    registryVersion: async () => '9.9.9',
    installLatest: async () => {},
    ...over,
  };
}

describe('compareVersions (equal/older/newer)', () => {
  it.each([
    ['2.2.0', '2.2.0', 0],
    ['2.2.0', '2.10.0', -1], // числовое сравнение, не лексикографика (10 > 9)
    ['2.10.0', '2.2.0', 1],
    ['2.2.0', '3.0.0', -1],
    ['10.0.0', '9.0.0', 1],
    ['v2.2.0', '2.2.0', 0], // npm view иногда отдаёт с 'v'
    ['2.2.0-beta.1', '2.2.0', 0], // консервативно: пре-релиз не «новее» релиза
    ['мусор', '0.0.0', 0], // непарсибл-токены = 0: детерминированно, без NaN
  ])('%s vs %s → %d', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});

describe('isUnderGlobalPrefix (linked vs registry-установка)', () => {
  it('бинарь под префиксом → глобальная установка', () => {
    expect(isUnderGlobalPrefix(GLOBAL_BIN, '/usr/local')).toBe(true);
  });
  it('бинарь вне префикса (npm link / репо) → linked', () => {
    expect(isUnderGlobalPrefix('/Users/x/dev/mister-wolf/dist/bootstrap/cli.js', '/usr/local')).toBe(false);
  });
  it('префикс-близнец не матчится без разделителя (/usr/localX ≠ /usr/local)', () => {
    expect(isUnderGlobalPrefix('/usr/localX/bin/wolf', '/usr/local')).toBe(false);
  });
  it('проверить невозможно (null на любом конце — npm недоступен/бинарь не резолвится) → отказ', () => {
    expect(isUnderGlobalPrefix(null, '/usr/local')).toBe(false);
    expect(isUnderGlobalPrefix(GLOBAL_BIN, null)).toBe(false);
    expect(isUnderGlobalPrefix(null, null)).toBe(false);
  });
});

describe('runUpgrade', () => {
  it('версии равны → up-to-date, install не вызывается', async () => {
    const installLatest = vi.fn();
    const deps = makeDeps({ registryVersion: async () => '2.1.0', installLatest });
    const outcome = await runUpgrade(deps, false);
    expect(outcome).toEqual({ kind: 'up-to-date', current: '2.1.0' });
    expect(installLatest).not.toHaveBeenCalled();
  });

  it('registry новее + --check → available, install не вызывается', async () => {
    const installLatest = vi.fn();
    const outcome = await runUpgrade(makeDeps({ installLatest }), true);
    expect(outcome).toEqual({ kind: 'available', current: '2.1.0', latest: '9.9.9' });
    expect(installLatest).not.toHaveBeenCalled();
  });

  it('registry новее + install-путь → installLatest(from, to), updated', async () => {
    const installLatest = vi.fn();
    const outcome = await runUpgrade(makeDeps({ installLatest }), false);
    expect(installLatest).toHaveBeenCalledWith('2.1.0', '9.9.9');
    expect(outcome).toEqual({ kind: 'updated', from: '2.1.0', to: '9.9.9' });
  });

  it('registry старее локальной → local-newer, install не вызывается', async () => {
    const installLatest = vi.fn();
    const outcome = await runUpgrade(makeDeps({ registryVersion: async () => '1.0.0', installLatest }), false);
    expect(outcome).toEqual({ kind: 'local-newer', current: '2.1.0', latest: '1.0.0' });
    expect(installLatest).not.toHaveBeenCalled();
  });

  it('linked-копия + install-путь → linked-refusal ДО обращения к registry', async () => {
    const registryVersion = vi.fn(async () => '9.9.9');
    const installLatest = vi.fn();
    const outcome = await runUpgrade(
      makeDeps({ binaryPath: '/Users/x/dev/mister-wolf/dist/bootstrap/cli.js', registryVersion, installLatest }),
      false
    );
    expect(outcome).toEqual({ kind: 'linked-refusal', binaryPath: '/Users/x/dev/mister-wolf/dist/bootstrap/cli.js' });
    expect(registryVersion).not.toHaveBeenCalled();
    expect(installLatest).not.toHaveBeenCalled();
  });

  it('linked-копия + --check → проверка работает (read-only), available', async () => {
    const outcome = await runUpgrade(
      makeDeps({ binaryPath: '/Users/x/dev/mister-wolf/dist/bootstrap/cli.js', npmPrefix: null }),
      true
    );
    expect(outcome).toEqual({ kind: 'available', current: '2.1.0', latest: '9.9.9' });
  });

  it('ошибка registry (spawn/npm падает) → проброс', async () => {
    const deps = makeDeps({
      registryVersion: async () => {
        throw new Error('npm view failed');
      },
    });
    await expect(runUpgrade(deps, false)).rejects.toThrow('npm view failed');
  });

  it('сбой npm install → проброс', async () => {
    const deps = makeDeps({
      installLatest: async () => {
        throw new Error('install failed');
      },
    });
    await expect(runUpgrade(deps, false)).rejects.toThrow('install failed');
  });
});
