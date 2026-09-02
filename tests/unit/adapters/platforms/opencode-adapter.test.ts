import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { OpencodeAdapter } from '../../../../src/adapters/platforms/opencode-adapter.js';
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
  const CANONICAL = JSON.stringify({ mcp: { wolf: WOLF_ENTRY }, default_agent: 'mr-wolf', subagent_depth: 2 });

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
      JSON.stringify({ mcp: { wolf: WOLF_ENTRY }, default_agent: 'other', subagent_depth: 2 })
    );
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    // F6: занятый чужим default_agent ключ — НЕ наш, в keys его нет
    expect(result).toEqual({
      action: 'unchanged',
      reason: 'default_agent=other занят; mr-wolf не назначен',
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
    expect(result.reason).toBe('default_agent=other занят; mr-wolf не назначен');
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp.wolf).toEqual(WOLF_ENTRY);
    expect(cfg.default_agent).toBe('other');
  });
});

describe('OpencodeAdapter.writeConfig: merge subagent_depth', () => {
  it('ключ отсутствует → устанавливается 2', async () => {
    writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ mcp: { wolf: WOLF_ENTRY }, default_agent: 'mr-wolf' }));
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result).toEqual({
      action: 'written',
      configFile: 'opencode.json',
      keys: ['mcp.wolf', 'default_agent=mr-wolf', 'subagent_depth=2'],
    });
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.subagent_depth).toBe(2);
  });

  it('sd = 1 → НЕ трогаем: unchanged + reason, значение сохраняется', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ mcp: { wolf: WOLF_ENTRY }, default_agent: 'mr-wolf', subagent_depth: 1 })
    );
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result.action).toBe('unchanged');
    expect(result.reason).toContain('subagent_depth=1 занят');
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.subagent_depth).toBe(1);
  });

  it('sd = 3 → unchanged без reason, значение сохраняется', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ mcp: { wolf: WOLF_ENTRY }, default_agent: 'mr-wolf', subagent_depth: 3 })
    );
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    // F6: ключ совместим (>=2) — наш, значение фактическое (3)
    expect(result).toEqual({
      action: 'unchanged',
      configFile: 'opencode.json',
      keys: ['mcp.wolf', 'default_agent=mr-wolf', 'subagent_depth=3'],
    });
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.subagent_depth).toBe(3);
  });

  it('комбинированный конфликт: default_agent + subagent_depth → один reason из двух частей', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ mcp: { wolf: WOLF_ENTRY }, default_agent: 'other', subagent_depth: 1 })
    );
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    // F6: оба ключа заняты чужими значениями → в keys только канонический mcp.wolf
    expect(result).toEqual({
      action: 'unchanged',
      reason:
        'default_agent=other занят; mr-wolf не назначен; subagent_depth=1 занят; трёхуровневая схема не заработает, поставьте >=2',
      configFile: 'opencode.json',
      keys: ['mcp.wolf'],
    });
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.default_agent).toBe('other');
    expect(cfg.subagent_depth).toBe(1);
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
