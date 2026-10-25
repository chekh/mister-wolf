import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { OpencodeAdapter, parseOpencodeVersion } from '../../../../src/adapters/platforms/opencode-adapter.js';
import type { McpCommand } from '../../../../src/ports/platform-adapter.port.js';

const cmd: McpCommand = { command: 'wolf', args: ['mcp'] };
let dir: string;
// ponytail: permission-тест неприменим под root (Docker CI): root игнорирует права каталога
const isRoot = process.getuid?.() === 0;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-oc-adapter-'));
});
afterEach(() => {
  chmodSync(dir, 0o755);
  rmSync(dir, { recursive: true, force: true });
});

const WOLF_ENTRY = { type: 'local', command: ['wolf', 'mcp'], enabled: true };

describe('OpencodeAdapter.detect (маркеры: opencode.json / opencode.jsonc / .opencode/)', () => {
  it('detects opencode.json', () => {
    writeFileSync(join(dir, 'opencode.json'), '{}');
    expect(new OpencodeAdapter().detect(dir)).toBe(true);
  });

  it('detects opencode.jsonc', () => {
    writeFileSync(join(dir, 'opencode.jsonc'), '{}');
    expect(new OpencodeAdapter().detect(dir)).toBe(true);
  });

  it('detects .opencode/ directory', () => {
    mkdirSync(join(dir, '.opencode'));
    expect(new OpencodeAdapter().detect(dir)).toBe(true);
  });

  it('no markers → not detected', () => {
    expect(new OpencodeAdapter().detect(dir)).toBe(false);
  });
});

describe('parseOpencodeVersion (диапазон поддержки: v1 >= 1.18.29 + v2)', () => {
  it('v1: 1.18.35 → v1', () => {
    expect(parseOpencodeVersion('1.18.35')).toEqual({ status: 'v1', version: '1.18.35', raw: '1.18.35' });
  });

  it('v2: "opencode v2.0.24" → v2 (raw сохранён)', () => {
    expect(parseOpencodeVersion('opencode v2.0.24')).toEqual({
      status: 'v2',
      version: '2.0.24',
      raw: 'opencode v2.0.24',
    });
  });

  it('порог: 1.18.29 → v1', () => {
    expect(parseOpencodeVersion('1.18.29').status).toBe('v1');
  });

  it('ниже порога v1: 1.18.28 → unsupported', () => {
    expect(parseOpencodeVersion('1.18.28')).toEqual({
      status: 'unsupported',
      version: '1.18.28',
      raw: '1.18.28',
    });
  });

  it('major 0: 0.9.0 → unsupported', () => {
    expect(parseOpencodeVersion('0.9.0').status).toBe('unsupported');
  });

  it('мусор → unparseable, raw = trimmed входа', () => {
    expect(parseOpencodeVersion('  not a version \n')).toEqual({
      status: 'unparseable',
      raw: 'not a version',
    });
  });
});

describe('OpencodeAdapter.detectVersion', () => {
  it('opencode отсутствует на PATH → absent (не бросает)', async () => {
    vi.stubEnv('PATH', '');
    try {
      const info = await new OpencodeAdapter().detectVersion(dir);
      expect(info.status).toBe('absent');
      expect(info.message).toBeTruthy();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('OpencodeAdapter.writeConfig', () => {
  it('creates opencode.json with canonical mcp.wolf entry + default_agent', async () => {
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    // F6: честный лог — configFile + фактические ключи
    expect(result).toEqual({
      action: 'written',
      configFile: 'opencode.json',
      keys: ['mcp.wolf', 'default_agent=mr-wolf', 'subagent_depth=2'],
    });
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp.wolf).toEqual(WOLF_ENTRY);
    expect(cfg.default_agent).toBe('mr-wolf');
  });

  it('idempotent: second call is unchanged and file content identical', async () => {
    const adapter = new OpencodeAdapter();
    await adapter.writeConfig(dir, cmd);
    const before = readFileSync(join(dir, 'opencode.json'), 'utf-8');
    expect(await adapter.writeConfig(dir, cmd)).toEqual({
      action: 'unchanged',
      configFile: 'opencode.json',
      keys: ['mcp.wolf', 'default_agent=mr-wolf', 'subagent_depth=2'],
    });
    expect(readFileSync(join(dir, 'opencode.json'), 'utf-8')).toBe(before);
  });

  it('replaces a foreign wolf command (dogfooders: node dist/...) but keeps other servers', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify(
        {
          mcp: {
            wolf: { type: 'local', command: ['node', 'dist/bootstrap/mcp.js'] },
            other: { type: 'local', command: ['x'] },
          },
        },
        null,
        2
      )
    );
    expect(await new OpencodeAdapter().writeConfig(dir, cmd)).toEqual({
      action: 'replaced',
      configFile: 'opencode.json',
      keys: ['mcp.wolf', 'default_agent=mr-wolf', 'subagent_depth=2'],
    });
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp.wolf).toEqual(WOLF_ENTRY);
    expect(cfg.mcp.other).toEqual({ type: 'local', command: ['x'] });
  });

  it('reads opencode.jsonc with comments (comments are lost on rewrite — documented trade-off)', async () => {
    writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // my config\n  "plugin": ["p"],\n}');
    expect(await new OpencodeAdapter().writeConfig(dir, cmd)).toEqual({
      action: 'written',
      configFile: 'opencode.jsonc',
      keys: ['mcp.wolf', 'default_agent=mr-wolf', 'subagent_depth=2'],
    });
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.jsonc'), 'utf-8'));
    expect(cfg.mcp.wolf).toEqual(WOLF_ENTRY);
    expect(cfg.plugin).toEqual(['p']);
  });

  it('readConfig returns null when no config file', async () => {
    expect(await new OpencodeAdapter().readConfig(dir)).toBeNull();
  });

  it('refuses a non-object config before touching the file', async () => {
    const raw = '[1,2,3]';
    writeFileSync(join(dir, 'opencode.json'), raw);
    await expect(new OpencodeAdapter().writeConfig(dir, cmd)).rejects.toThrow(/opencode\.json/);
    expect(readFileSync(join(dir, 'opencode.json'), 'utf-8')).toBe(raw);
  });

  it('broken JSONC → UserFacingError (parity with ClaudeAdapter), file untouched', async () => {
    const raw = '{ nope';
    writeFileSync(join(dir, 'opencode.jsonc'), raw);
    await expect(new OpencodeAdapter().writeConfig(dir, cmd)).rejects.toThrow(/not valid JSONC/);
    expect(readFileSync(join(dir, 'opencode.jsonc'), 'utf-8')).toBe(raw);
  });

  it.skipIf(isRoot)('no write permission → fails without partial write (atomicity)', async () => {
    writeFileSync(join(dir, 'opencode.json'), '{}');
    chmodSync(dir, 0o555); // каталог read-only: tmp-файл для atomic rename не создать
    await expect(new OpencodeAdapter().writeConfig(dir, cmd)).rejects.toThrow();
    chmodSync(dir, 0o755);
    expect(JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'))).toEqual({});
  });
});

describe('OpencodeAdapter.writeConfig: merge default_agent (§6.1)', () => {
  const CANONICAL = JSON.stringify({
    mcp: { wolf: WOLF_ENTRY },
    default_agent: 'mr-wolf',
    experimental: { subagent_depth: 2 },
  });

  it('ключ отсутствует → устанавливается (v1-конфиг с корректным mcp.wolf, но без default_agent)', async () => {
    writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ mcp: { wolf: WOLF_ENTRY } }));
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result).toEqual({
      action: 'written', // unchanged считается по ВСЕМ ключам
      configFile: 'opencode.json',
      keys: ['mcp.wolf', 'default_agent=mr-wolf', 'subagent_depth=2'],
    });
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.default_agent).toBe('mr-wolf');
    expect(cfg.mcp.wolf).toEqual(WOLF_ENTRY);
  });

  it('равен mr-wolf → unchanged по всем ключам, файл не трогается', async () => {
    writeFileSync(join(dir, 'opencode.json'), CANONICAL);
    expect(await new OpencodeAdapter().writeConfig(dir, cmd)).toEqual({
      action: 'unchanged',
      configFile: 'opencode.json',
      keys: ['mcp.wolf', 'default_agent=mr-wolf', 'subagent_depth=2'],
    });
    expect(readFileSync(join(dir, 'opencode.json'), 'utf-8')).toBe(CANONICAL);
  });

  it('отличен → НЕ трогаем: unchanged + reason, значение сохраняется', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ mcp: { wolf: WOLF_ENTRY }, default_agent: 'other', experimental: { subagent_depth: 2 } })
    );
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    // F6: занятый чужим default_agent ключ — НЕ наш, в keys его нет
    expect(result).toEqual({
      action: 'unchanged',
      reason: 'default_agent=other is taken; mr-wolf not assigned',
      configFile: 'opencode.json',
      keys: ['mcp.wolf', 'subagent_depth=2'],
    });
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.default_agent).toBe('other');
  });

  it('mcp.wolf расходится И default_agent занят → rewrite mcp (триггер — любое расхождение), ключ сохранён, reason прокинут', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ mcp: { wolf: { type: 'local', command: ['node', 'dist/mcp.js'] } }, default_agent: 'other' })
    );
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result.action).toBe('replaced');
    expect(result.reason).toBe('default_agent=other is taken; mr-wolf not assigned');
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp.wolf).toEqual(WOLF_ENTRY);
    expect(cfg.default_agent).toBe('other');
  });
});

describe('OpencodeAdapter.writeConfig: subagent_depth в experimental (opencode v2)', () => {
  // Схема https://opencode.ai/config.json: experimental.subagent_depth — единственный действующий
  // путь; верхнеуровневый subagent_depth помечен deprecated и в v2 игнорируется.
  const read = (): Record<string, any> => JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));

  it('ключ отсутствует → experimental.subagent_depth = 2', async () => {
    writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ mcp: { wolf: WOLF_ENTRY }, default_agent: 'mr-wolf' }));
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result).toEqual({
      action: 'written',
      configFile: 'opencode.json',
      keys: ['mcp.wolf', 'default_agent=mr-wolf', 'subagent_depth=2'],
    });
    const cfg = read();
    expect(cfg.experimental).toEqual({ subagent_depth: 2 });
    expect(cfg.subagent_depth).toBeUndefined(); // верхнеуровневый ключ не создаётся
  });

  it('чужие поля experimental сохраняются', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ experimental: { todo: true, subagent_depth: 2 }, model: 'local/coder' })
    );
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result.action).toBe('written');
    const cfg = read();
    expect(cfg.experimental).toEqual({ todo: true, subagent_depth: 2 });
    expect(cfg.model).toBe('local/coder');
    expect(cfg.subagent_depth).toBeUndefined();
  });

  it('идемпотентность: второй вызов — unchanged, файл байт-в-байт', async () => {
    const adapter = new OpencodeAdapter();
    await adapter.writeConfig(dir, cmd);
    const before = readFileSync(join(dir, 'opencode.json'), 'utf-8');
    expect(await adapter.writeConfig(dir, cmd)).toEqual({
      action: 'unchanged',
      configFile: 'opencode.json',
      keys: ['mcp.wolf', 'default_agent=mr-wolf', 'subagent_depth=2'],
    });
    expect(readFileSync(join(dir, 'opencode.json'), 'utf-8')).toBe(before);
  });

  it('чужое experimental.subagent_depth = 1 → unchanged + reason, значение сохранено', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ mcp: { wolf: WOLF_ENTRY }, default_agent: 'mr-wolf', experimental: { subagent_depth: 1 } })
    );
    const before = readFileSync(join(dir, 'opencode.json'), 'utf-8');
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result.action).toBe('unchanged');
    expect(result.reason).toContain('experimental.subagent_depth=1 is taken');
    expect(readFileSync(join(dir, 'opencode.json'), 'utf-8')).toBe(before);
  });

  it('чужое не-число experimental.subagent_depth = "two" → unchanged + reason', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ mcp: { wolf: WOLF_ENTRY }, default_agent: 'mr-wolf', experimental: { subagent_depth: 'two' } })
    );
    const before = readFileSync(join(dir, 'opencode.json'), 'utf-8');
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result.action).toBe('unchanged');
    expect(result.reason).toContain('experimental.subagent_depth=two is taken');
    expect(readFileSync(join(dir, 'opencode.json'), 'utf-8')).toBe(before);
  });

  it('experimental.subagent_depth = 3 → unchanged без reason, значение сохранено', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ mcp: { wolf: WOLF_ENTRY }, default_agent: 'mr-wolf', experimental: { subagent_depth: 3 } })
    );
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    // F6: ключ совместим (>=2) — наш, значение фактическое (3)
    expect(result).toEqual({
      action: 'unchanged',
      configFile: 'opencode.json',
      keys: ['mcp.wolf', 'default_agent=mr-wolf', 'subagent_depth=3'],
    });
    expect(read().experimental.subagent_depth).toBe(3);
  });

  it('легаси верхнеуровневый = 2 → миграция в experimental, верхнеуровневый удалён', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ mcp: { wolf: WOLF_ENTRY }, default_agent: 'mr-wolf', subagent_depth: 2 })
    );
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result).toEqual({
      action: 'written',
      reason: 'migrated subagent_depth to experimental.subagent_depth',
      configFile: 'opencode.json',
      keys: ['mcp.wolf', 'default_agent=mr-wolf', 'subagent_depth=2'],
    });
    const cfg = read();
    expect(cfg.experimental).toEqual({ subagent_depth: 2 });
    expect(cfg.subagent_depth).toBeUndefined();
    // миграция идемпотентна: второй прогон ничего не пишет
    const migrated = readFileSync(join(dir, 'opencode.json'), 'utf-8');
    expect((await new OpencodeAdapter().writeConfig(dir, cmd)).action).toBe('unchanged');
    expect(readFileSync(join(dir, 'opencode.json'), 'utf-8')).toBe(migrated);
  });

  it('легаси верхнеуровневый = 1 → конфликт без записи (deprecated, в v2 не действует)', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ mcp: { wolf: WOLF_ENTRY }, default_agent: 'mr-wolf', subagent_depth: 1 })
    );
    const before = readFileSync(join(dir, 'opencode.json'), 'utf-8');
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result.action).toBe('unchanged');
    expect(result.reason).toContain('subagent_depth=1 is taken');
    expect(result.reason).toContain('deprecated');
    expect(result.reason).toContain('experimental.subagent_depth');
    expect(readFileSync(join(dir, 'opencode.json'), 'utf-8')).toBe(before);
  });

  it('оба ключа, оба наши (2) → действует experimental, легаси-ключ удаляется', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({
        mcp: { wolf: WOLF_ENTRY },
        default_agent: 'mr-wolf',
        subagent_depth: 2,
        experimental: { subagent_depth: 2, todo: false },
      })
    );
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result.action).toBe('written');
    expect(result.reason).toContain('removed deprecated top-level subagent_depth=2');
    const cfg = read();
    expect(cfg.subagent_depth).toBeUndefined();
    expect(cfg.experimental).toEqual({ subagent_depth: 2, todo: false });
  });

  it('оба ключа, легаси чужой (5) → не трогаем, сообщаем как deprecated-шум', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({
        mcp: { wolf: WOLF_ENTRY },
        default_agent: 'mr-wolf',
        subagent_depth: 5,
        experimental: { subagent_depth: 2 },
      })
    );
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result.action).toBe('unchanged');
    expect(result.reason).toContain('top-level subagent_depth=5 is deprecated');
    const cfg = read();
    expect(cfg.subagent_depth).toBe(5);
    expect(cfg.experimental).toEqual({ subagent_depth: 2 });
  });

  it('experimental не объект → depth не пишется, чужое значение сохранено', async () => {
    writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ experimental: 'nope' }));
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result.reason).toContain('experimental is not an object');
    const cfg = read();
    expect(cfg.experimental).toBe('nope');
    expect(cfg.subagent_depth).toBeUndefined();
    expect(result.keys).toEqual(['mcp.wolf', 'default_agent=mr-wolf']);
  });

  it('комбинированный конфликт: default_agent + экспериментальный depth → один reason из двух частей', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ mcp: { wolf: WOLF_ENTRY }, default_agent: 'other', experimental: { subagent_depth: 1 } })
    );
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    // F6: оба ключа заняты чужими значениями → в keys только канонический mcp.wolf
    expect(result).toEqual({
      action: 'unchanged',
      reason:
        'default_agent=other is taken; mr-wolf not assigned; experimental.subagent_depth=1 is taken; the three-level scheme will not work, set >=2',
      configFile: 'opencode.json',
      keys: ['mcp.wolf'],
    });
  });
});

describe('OpencodeAdapter.removeWolf', () => {
  it('removes only the wolf entry, keeps other servers', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ mcp: { wolf: WOLF_ENTRY, other: { type: 'local', command: ['x'] } } })
    );
    expect(await new OpencodeAdapter().removeWolf(dir)).toBe(true);
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp).toEqual({ other: { type: 'local', command: ['x'] } });
  });

  it('returns false when there is nothing to remove', async () => {
    expect(await new OpencodeAdapter().removeWolf(dir)).toBe(false);
  });

  it('drops the mcp key entirely when it becomes empty', async () => {
    writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ mcp: { wolf: WOLF_ENTRY } }));
    expect(await new OpencodeAdapter().removeWolf(dir)).toBe(true);
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp).toBeUndefined();
  });
});

describe('OpencodeAdapter.removeWolfKeys (2.16.2 uninstall, F-07: точные наши значения)', () => {
  it('OC-K1: удаляет mcp.wolf + default_agent=mr-wolf + experimental.subagent_depth=2, чужой сервер сохраняет', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({
        mcp: { wolf: WOLF_ENTRY, other: { type: 'local', command: ['x'] } },
        default_agent: 'mr-wolf',
        experimental: { subagent_depth: 2 },
        model: 'local/coder',
      })
    );
    const r = await new OpencodeAdapter().removeWolfKeys(dir);
    expect(r.action).toBe('removed');
    expect(r.keys).toEqual(['mcp.wolf', 'default_agent=mr-wolf', 'subagent_depth=2']);
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp).toEqual({ other: { type: 'local', command: ['x'] } });
    expect(cfg.default_agent).toBeUndefined();
    // экспериментальная секция была только с нашим ключом → пустой объект не остаётся
    expect(cfg.experimental).toBeUndefined();
    expect(cfg.model).toBe('local/coder');
  });

  it('OC-K1b: чужие поля experimental сохраняются при удалении нашего depth', async () => {
    writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ experimental: { subagent_depth: 2, todo: true } }));
    const r = await new OpencodeAdapter().removeWolfKeys(dir);
    expect(r.action).toBe('removed');
    expect(r.keys).toEqual(['subagent_depth=2']);
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.experimental).toEqual({ todo: true });
  });

  it('OC-K1c: пользовательский experimental.subagent_depth=3 не трогаем', async () => {
    writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ experimental: { subagent_depth: 3 } }));
    const r = await new OpencodeAdapter().removeWolfKeys(dir);
    expect(r.action).toBe('unchanged');
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.experimental).toEqual({ subagent_depth: 3 });
  });

  it('OC-K1d: легаси верхнеуровневый subagent_depth=2 (наш) удаляется', async () => {
    writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ subagent_depth: 2 }));
    const r = await new OpencodeAdapter().removeWolfKeys(dir);
    expect(r.action).toBe('removed');
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.subagent_depth).toBeUndefined();
  });

  it('OC-K2: пользовательские subagent_depth=5 и чужой default_agent сохраняются', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ default_agent: 'my-agent', experimental: { subagent_depth: 5 } })
    );
    const r = await new OpencodeAdapter().removeWolfKeys(dir);
    expect(r.action).toBe('unchanged');
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg).toEqual({ default_agent: 'my-agent', experimental: { subagent_depth: 5 } });
  });

  it('OC-K3: нет конфига → skipped с причиной', async () => {
    const r = await new OpencodeAdapter().removeWolfKeys(dir);
    expect(r.action).toBe('skipped');
    expect(r.reason).toContain('no opencode.json');
  });
});
