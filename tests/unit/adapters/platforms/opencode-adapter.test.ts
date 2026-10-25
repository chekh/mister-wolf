import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, chmodSync, statSync } from 'fs';
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

/** Нативная запись opencode v2 (6.3): без codemode/enabled/timeout. */
const WOLF_ENTRY = { type: 'local', command: ['wolf', 'mcp'], disabled: false };
const NATIVE = (): Record<string, unknown> => ({ servers: { wolf: WOLF_ENTRY } });
const ALL_KEYS = ['mcp.servers.wolf', 'default_agent=mr-wolf', 'subagent_depth=2'];
const readCfg = (): Record<string, any> => JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));

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
  it('6.3-1: creates opencode.json with native mcp.servers.wolf + default_agent', async () => {
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    // F6: честный лог — configFile + фактические ключи (метки из реестра)
    expect(result).toEqual({
      action: 'written',
      configFile: 'opencode.json',
      keys: ALL_KEYS,
    });
    const cfg = readCfg();
    expect(cfg.mcp.servers.wolf).toEqual(WOLF_ENTRY);
    expect(cfg.mcp.wolf).toBeUndefined(); // легаси-форма не пишется
    expect(cfg.default_agent).toBe('mr-wolf');
  });

  it('6.3-1: нативная запись не содержит codemode/enabled/timeout', async () => {
    await new OpencodeAdapter().writeConfig(dir, cmd);
    const cfg = readCfg();
    const entry = cfg.mcp.servers.wolf as Record<string, unknown>;
    expect(Object.keys(entry).sort()).toEqual(['command', 'disabled', 'type']);
    expect(entry.disabled).toBe(false);
  });

  it('idempotent: second call is unchanged and file content identical', async () => {
    const adapter = new OpencodeAdapter();
    await adapter.writeConfig(dir, cmd);
    const before = readFileSync(join(dir, 'opencode.json'), 'utf-8');
    expect(await adapter.writeConfig(dir, cmd)).toEqual({
      action: 'unchanged',
      configFile: 'opencode.json',
      keys: ALL_KEYS,
    });
    expect(readFileSync(join(dir, 'opencode.json'), 'utf-8')).toBe(before);
  });

  it('6.3-3: чужой легаси mcp.wolf (другая команда) не трогается, нативная запись создаётся + reason', async () => {
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
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result.action).toBe('written');
    expect(result.keys).toEqual(ALL_KEYS);
    expect(result.reason).toContain('deprecated and foreign (command differs)');
    const cfg = readCfg();
    expect(cfg.mcp.servers.wolf).toEqual(WOLF_ENTRY); // нативная запись создана
    expect(cfg.mcp.wolf).toEqual({ type: 'local', command: ['node', 'dist/bootstrap/mcp.js'] }); // чужое цело
    expect(cfg.mcp.other).toEqual({ type: 'local', command: ['x'] });
  });

  it('reads opencode.jsonc with comments (comments are lost on rewrite — documented trade-off)', async () => {
    writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // my config\n  "plugin": ["p"],\n}');
    expect(await new OpencodeAdapter().writeConfig(dir, cmd)).toEqual({
      action: 'written',
      configFile: 'opencode.jsonc',
      keys: ALL_KEYS,
    });
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.jsonc'), 'utf-8'));
    expect(cfg.mcp.servers.wolf).toEqual(WOLF_ENTRY);
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
    mcp: NATIVE(),
    default_agent: 'mr-wolf',
    experimental: { subagent_depth: 2 },
  });

  it('ключ отсутствует → устанавливается (v1-конфиг с корректным mcp.servers.wolf, но без default_agent)', async () => {
    writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ mcp: NATIVE() }));
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result).toEqual({
      action: 'written', // unchanged считается по ВСЕМ ключам
      configFile: 'opencode.json',
      keys: ALL_KEYS,
    });
    const cfg = readCfg();
    expect(cfg.default_agent).toBe('mr-wolf');
    expect(cfg.mcp.servers.wolf).toEqual(WOLF_ENTRY);
  });

  it('равен mr-wolf → unchanged по всем ключам, файл не трогается', async () => {
    writeFileSync(join(dir, 'opencode.json'), CANONICAL);
    expect(await new OpencodeAdapter().writeConfig(dir, cmd)).toEqual({
      action: 'unchanged',
      configFile: 'opencode.json',
      keys: ALL_KEYS,
    });
    expect(readFileSync(join(dir, 'opencode.json'), 'utf-8')).toBe(CANONICAL);
  });

  it('отличен → НЕ трогаем: unchanged + reason, значение сохраняется', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ mcp: NATIVE(), default_agent: 'other', experimental: { subagent_depth: 2 } })
    );
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    // F6: занятый чужим default_agent ключ — НЕ наш, в keys его нет
    expect(result).toEqual({
      action: 'unchanged',
      reason: 'default_agent=other is taken; mr-wolf not assigned',
      configFile: 'opencode.json',
      keys: ['mcp.servers.wolf', 'subagent_depth=2'],
    });
    const cfg = readCfg();
    expect(cfg.default_agent).toBe('other');
  });

  it('нативная запись расходится И default_agent занят → replaced, ключ сохранён, reason прокинут', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({
        mcp: { servers: { wolf: { type: 'local', command: ['node', 'dist/mcp.js'] } } },
        default_agent: 'other',
      })
    );
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result.action).toBe('replaced');
    expect(result.reason).toBe(
      'default_agent=other is taken; mr-wolf not assigned; replaced non-canonical mcp.servers.wolf entry with the canonical Wolf entry'
    );
    const cfg = readCfg();
    expect(cfg.mcp.servers.wolf).toEqual(WOLF_ENTRY);
    expect(cfg.default_agent).toBe('other');
  });
});

describe('OpencodeAdapter.writeConfig: subagent_depth в experimental (opencode v2)', () => {
  // Схема https://opencode.ai/config.json: experimental.subagent_depth — единственный действующий
  // путь; верхнеуровневый subagent_depth помечен deprecated и в v2 игнорируется.
  const read = readCfg;

  it('ключ отсутствует → experimental.subagent_depth = 2', async () => {
    writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ mcp: NATIVE(), default_agent: 'mr-wolf' }));
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result).toEqual({
      action: 'written',
      configFile: 'opencode.json',
      keys: ALL_KEYS,
    });
    const cfg = read();
    expect(cfg.experimental).toEqual({ subagent_depth: 2 });
    expect(cfg.subagent_depth).toBeUndefined(); // верхнеуровневый ключ не создаётся
  });

  it('чужие поля experimental сохраняются (6.2-4: регресс соседей)', async () => {
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
      keys: ALL_KEYS,
    });
    expect(readFileSync(join(dir, 'opencode.json'), 'utf-8')).toBe(before);
  });

  it('6.3-6: unchanged не перезаписывает файл (mtime и байты те же)', async () => {
    const adapter = new OpencodeAdapter();
    await adapter.writeConfig(dir, cmd);
    const file = join(dir, 'opencode.json');
    const before = readFileSync(file, 'utf-8');
    const mtime = statSync(file).mtimeMs;
    await new Promise((r) => setTimeout(r, 20));
    expect((await adapter.writeConfig(dir, cmd)).action).toBe('unchanged');
    expect(statSync(file).mtimeMs).toBe(mtime);
    expect(readFileSync(file, 'utf-8')).toBe(before);
  });

  it('чужое experimental.subagent_depth = 1 → unchanged + reason, значение сохранено', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ mcp: NATIVE(), default_agent: 'mr-wolf', experimental: { subagent_depth: 1 } })
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
      JSON.stringify({ mcp: NATIVE(), default_agent: 'mr-wolf', experimental: { subagent_depth: 'two' } })
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
      JSON.stringify({ mcp: NATIVE(), default_agent: 'mr-wolf', experimental: { subagent_depth: 3 } })
    );
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    // F6: ключ совместим (>=2) — наш, значение фактическое (3)
    expect(result).toEqual({
      action: 'unchanged',
      configFile: 'opencode.json',
      keys: ['mcp.servers.wolf', 'default_agent=mr-wolf', 'subagent_depth=3'],
    });
    expect(read().experimental.subagent_depth).toBe(3);
  });

  it('легаси верхнеуровневый = 2 → миграция в experimental, верхнеуровневый удалён', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ mcp: NATIVE(), default_agent: 'mr-wolf', subagent_depth: 2 })
    );
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result).toEqual({
      action: 'written',
      reason: 'migrated subagent_depth to experimental.subagent_depth',
      configFile: 'opencode.json',
      keys: ALL_KEYS,
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
      JSON.stringify({ mcp: NATIVE(), default_agent: 'mr-wolf', subagent_depth: 1 })
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
        mcp: NATIVE(),
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
        mcp: NATIVE(),
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
    expect(result.keys).toEqual(['mcp.servers.wolf', 'default_agent=mr-wolf']);
  });

  it('комбинированный конфликт: default_agent + экспериментальный depth → один reason из двух частей', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ mcp: NATIVE(), default_agent: 'other', experimental: { subagent_depth: 1 } })
    );
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    // F6: оба ключа заняты чужими значениями → в keys только канонический mcp.servers.wolf
    expect(result).toEqual({
      action: 'unchanged',
      reason:
        'default_agent=other is taken; mr-wolf not assigned; experimental.subagent_depth=1 is taken; the three-level scheme will not work, set >=2',
      configFile: 'opencode.json',
      keys: ['mcp.servers.wolf'],
    });
  });
});

describe('6.3: обе формы MCP — нативная приоритетна, легаси мигрируется только наш', () => {
  const LEGACY_OURS = { type: 'local', command: ['wolf', 'mcp'], enabled: true };

  it('6.3-2: наш легаси mcp.wolf → миграция в нативную форму, легаси снят', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({
        mcp: { wolf: LEGACY_OURS },
        default_agent: 'mr-wolf',
        experimental: { subagent_depth: 2 },
      })
    );
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result.action).toBe('written');
    expect(result.reason).toBe('removed deprecated top-level mcp.wolf (migrated to mcp.servers.wolf)');
    const cfg = readCfg();
    expect(cfg.mcp).toEqual({ servers: { wolf: WOLF_ENTRY } });
  });

  it('6.3-2: миграция легаси идемпотентна (второй прогон — unchanged)', async () => {
    writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ mcp: { wolf: LEGACY_OURS } }));
    const adapter = new OpencodeAdapter();
    await adapter.writeConfig(dir, cmd);
    const migrated = readFileSync(join(dir, 'opencode.json'), 'utf-8');
    expect((await adapter.writeConfig(dir, cmd)).action).toBe('unchanged');
    expect(readFileSync(join(dir, 'opencode.json'), 'utf-8')).toBe(migrated);
  });

  it('6.3-4: пользователь сам мигрировал (только нативная) → unchanged, второй ключ не пишется', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({
        mcp: { servers: { wolf: WOLF_ENTRY }, other: { type: 'local', command: ['x'] } },
        default_agent: 'mr-wolf',
        experimental: { subagent_depth: 2 },
      })
    );
    const before = readFileSync(join(dir, 'opencode.json'), 'utf-8');
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result.action).toBe('unchanged');
    expect(readFileSync(join(dir, 'opencode.json'), 'utf-8')).toBe(before);
    expect(readCfg().mcp.wolf).toBeUndefined();
  });

  it('6.3-5: обе формы, нативная канонична, легаси наш → нативная не меняется, легаси снимается', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({
        mcp: { servers: { wolf: WOLF_ENTRY, other: { type: 'local', command: ['x'] } }, wolf: LEGACY_OURS },
        default_agent: 'mr-wolf',
        experimental: { subagent_depth: 2 },
      })
    );
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result.action).toBe('written');
    expect(result.reason).toContain('removed deprecated top-level mcp.wolf');
    const cfg = readCfg();
    expect(cfg.mcp.servers).toEqual({ wolf: WOLF_ENTRY, other: { type: 'local', command: ['x'] } });
    expect(cfg.mcp.wolf).toBeUndefined();
  });

  it('6.3-5: обе формы, легаси чужой → unchanged с reason, ничего не пишется (нативная действует)', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({
        mcp: { servers: { wolf: WOLF_ENTRY }, wolf: { type: 'local', command: ['node', 'x.js'] } },
        default_agent: 'mr-wolf',
        experimental: { subagent_depth: 2 },
      })
    );
    const before = readFileSync(join(dir, 'opencode.json'), 'utf-8');
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result.action).toBe('unchanged');
    expect(result.reason).toContain('deprecated and foreign');
    expect(readFileSync(join(dir, 'opencode.json'), 'utf-8')).toBe(before);
  });

  it('6.3-8: чужая нативная запись → replaced + reason (идемпотентная канонизация)', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({
        mcp: { servers: { wolf: { type: 'local', command: ['node', 'dist/mcp.js'] }, other: { type: 'local' } } },
        default_agent: 'mr-wolf',
        experimental: { subagent_depth: 2 },
      })
    );
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result.action).toBe('replaced');
    expect(result.reason).toContain('replaced non-canonical mcp.servers.wolf entry');
    expect(readCfg().mcp.servers).toEqual({ wolf: WOLF_ENTRY, other: { type: 'local' } });
  });
});

describe('OpencodeAdapter.writeConfig: не-объектный контейнер (конфликт, а не молчаливый no-op)', () => {
  it('mcp строкой → reason, файл не перезаписан, mcp в keys не заявлен', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ mcp: 'broken', default_agent: 'mr-wolf', experimental: { subagent_depth: 2 } })
    );
    const before = readFileSync(join(dir, 'opencode.json'), 'utf-8');
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result.action).toBe('unchanged');
    expect(result.reason).toContain('mcp path is not an object');
    expect(result.keys).toEqual(['default_agent=mr-wolf', 'subagent_depth=2']);
    expect(readFileSync(join(dir, 'opencode.json'), 'utf-8')).toBe(before);
  });
});

describe('OpencodeAdapter.removeWolf (6.3: обе формы, только наша запись)', () => {
  it('removes only the native wolf entry, keeps other servers', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ mcp: { servers: { wolf: WOLF_ENTRY, other: { type: 'local', command: ['x'] } } } })
    );
    expect(await new OpencodeAdapter().removeWolf(dir)).toBe(true);
    const cfg = readCfg();
    expect(cfg.mcp).toEqual({ servers: { other: { type: 'local', command: ['x'] } } });
  });

  it('removes legacy mcp.wolf, если он наш', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ mcp: { wolf: { type: 'local', command: ['wolf', 'mcp'], enabled: true } } })
    );
    expect(await new OpencodeAdapter().removeWolf(dir)).toBe(true);
    expect(readCfg().mcp).toBeUndefined();
  });

  it('removes both forms in one pass', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({
        mcp: { servers: { wolf: WOLF_ENTRY }, wolf: { type: 'local', command: ['wolf', 'mcp'], enabled: true } },
      })
    );
    expect(await new OpencodeAdapter().removeWolf(dir)).toBe(true);
    expect(readCfg()).toEqual({});
  });

  it('6.3-8: чужую нативную запись не удаляет → false, файл не тронут', async () => {
    const before = JSON.stringify({
      mcp: { servers: { wolf: { type: 'local', command: ['node', 'dist/mcp.js'] } } },
    });
    writeFileSync(join(dir, 'opencode.json'), before);
    expect(await new OpencodeAdapter().removeWolf(dir)).toBe(false);
    expect(readFileSync(join(dir, 'opencode.json'), 'utf-8')).toBe(before);
  });

  it('returns false when there is nothing to remove', async () => {
    expect(await new OpencodeAdapter().removeWolf(dir)).toBe(false);
  });

  it('drops the mcp key entirely when it becomes empty', async () => {
    writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ mcp: { servers: { wolf: WOLF_ENTRY } } }));
    expect(await new OpencodeAdapter().removeWolf(dir)).toBe(true);
    expect(readCfg().mcp).toBeUndefined();
  });
});

describe('OpencodeAdapter.removeWolfKeys (2.16.2 uninstall, F-07 + 6.3: точные наши значения, обе формы)', () => {
  it('OC-K1: удаляет нативную запись + default_agent=mr-wolf + experimental.subagent_depth=2, чужой сервер сохраняет', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({
        mcp: { servers: { wolf: WOLF_ENTRY, other: { type: 'local', command: ['x'] } } },
        default_agent: 'mr-wolf',
        experimental: { subagent_depth: 2 },
        model: 'local/coder',
      })
    );
    const r = await new OpencodeAdapter().removeWolfKeys(dir);
    expect(r.action).toBe('removed');
    expect(r.keys).toEqual(ALL_KEYS);
    const cfg = readCfg();
    expect(cfg.mcp).toEqual({ servers: { other: { type: 'local', command: ['x'] } } });
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
    expect(readCfg().experimental).toEqual({ todo: true });
  });

  it('OC-K1c: пользовательский experimental.subagent_depth=3 не трогаем', async () => {
    writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ experimental: { subagent_depth: 3 } }));
    const r = await new OpencodeAdapter().removeWolfKeys(dir);
    expect(r.action).toBe('unchanged');
    expect(readCfg().experimental).toEqual({ subagent_depth: 3 });
  });

  it('OC-K1d: легаси верхнеуровневый subagent_depth=2 (наш) удаляется', async () => {
    writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ subagent_depth: 2 }));
    const r = await new OpencodeAdapter().removeWolfKeys(dir);
    expect(r.action).toBe('removed');
    expect(readCfg().subagent_depth).toBeUndefined();
  });

  it('OC-K2: пользовательские subagent_depth=5 и чужой default_agent сохраняются', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ default_agent: 'my-agent', experimental: { subagent_depth: 5 } })
    );
    const r = await new OpencodeAdapter().removeWolfKeys(dir);
    expect(r.action).toBe('unchanged');
    expect(readCfg()).toEqual({ default_agent: 'my-agent', experimental: { subagent_depth: 5 } });
  });

  it('OC-K3: нет конфига → skipped с причиной', async () => {
    const r = await new OpencodeAdapter().removeWolfKeys(dir);
    expect(r.action).toBe('skipped');
    expect(r.reason).toContain('no opencode.json');
  });

  it('6.3-7: удаляет обе наши формы, чужие MCP-серверы целы, пустой mcp.servers не остаётся', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({
        mcp: {
          servers: { wolf: WOLF_ENTRY },
          wolf: { type: 'local', command: ['wolf', 'mcp'], enabled: true },
          other: { type: 'local', command: ['x'] },
        },
      })
    );
    const r = await new OpencodeAdapter().removeWolfKeys(dir);
    expect(r.action).toBe('removed');
    expect(r.keys).toEqual(['mcp.servers.wolf']);
    expect(readCfg().mcp).toEqual({ other: { type: 'local', command: ['x'] } });
  });

  it('6.3-7: пустой mcp удаляется целиком, если в нём были только наши формы', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({
        mcp: { servers: { wolf: WOLF_ENTRY }, wolf: { type: 'local', command: ['wolf', 'mcp'], enabled: true } },
        theme: 'system',
      })
    );
    const r = await new OpencodeAdapter().removeWolfKeys(dir);
    expect(r.action).toBe('removed');
    expect(readCfg()).toEqual({ theme: 'system' });
  });

  it('6.3-8: чужую нативную запись не удаляет (unchanged, файл не тронут)', async () => {
    const before = JSON.stringify({
      mcp: { servers: { wolf: { type: 'local', command: ['node', 'dist/mcp.js'] } } },
    });
    writeFileSync(join(dir, 'opencode.json'), before);
    const r = await new OpencodeAdapter().removeWolfKeys(dir);
    expect(r.action).toBe('unchanged');
    expect(readFileSync(join(dir, 'opencode.json'), 'utf-8')).toBe(before);
  });
});

describe('OpencodeAdapter.configIssues (6.3: doctor видит обе формы)', () => {
  const FULL = {
    mcp: { servers: { wolf: WOLF_ENTRY } },
    default_agent: 'mr-wolf',
    experimental: { subagent_depth: 2 },
  };

  it('нет wolf-сервера → issue missing + отсутствующие ключи', async () => {
    writeFileSync(join(dir, 'opencode.json'), '{"theme":"system"}\n');
    expect(await new OpencodeAdapter().configIssues(dir)).toEqual([
      'opencode: wolf entry missing — run wolf init',
      'opencode: default_agent is not set — mr-wolf is not the default agent; run wolf init',
      'opencode: experimental.subagent_depth is not set — the three-level scheme needs >=2; run wolf init',
    ]);
  });

  it('конфиг-файла нет → один issue (платформа детектится по .opencode)', async () => {
    expect(await new OpencodeAdapter().configIssues(dir)).toEqual(['opencode: wolf entry missing — run wolf init']);
  });

  it('нативная форма + остальные ключи → issues пусто (пользователь сам мигрировал)', async () => {
    writeFileSync(join(dir, 'opencode.json'), JSON.stringify(FULL));
    expect(await new OpencodeAdapter().configIssues(dir)).toEqual([]);
  });

  it('легаси нашего образца → «migrate», не missing', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ ...FULL, mcp: { wolf: { type: 'local', command: ['wolf', 'mcp'], enabled: true } } })
    );
    const issues = await new OpencodeAdapter().configIssues(dir);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('deprecated top-level mcp.wolf');
  });

  it('битый JSONC → issue «fix it», а не совет запустить init', async () => {
    writeFileSync(join(dir, 'opencode.json'), '{ broken');
    const issues = await new OpencodeAdapter().configIssues(dir);
    expect(issues).toEqual(['opencode: config is not valid JSONC — fix it or remove the file, then run wolf init']);
  });

  it('обе формы: нативная приоритетна, чужой легаси помечен', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ ...FULL, mcp: { servers: { wolf: WOLF_ENTRY }, wolf: { type: 'local', command: ['x'] } } })
    );
    const issues = await new OpencodeAdapter().configIssues(dir);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('foreign and deprecated');
  });
});
