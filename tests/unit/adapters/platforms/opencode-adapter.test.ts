import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { OpencodeAdapter } from '../../../../src/adapters/platforms/opencode-adapter.js';
import type { McpCommand } from '../../../../src/ports/platform-adapter.port.js';

const cmd: McpCommand = { command: 'wolf', args: ['mcp'] };
let dir: string;

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
  it('creates opencode.json with canonical mcp.wolf entry', async () => {
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result).toBe('written');
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp.wolf).toEqual(WOLF_ENTRY);
  });

  it('idempotent: second call is unchanged and file content identical', async () => {
    const adapter = new OpencodeAdapter();
    await adapter.writeConfig(dir, cmd);
    const before = readFileSync(join(dir, 'opencode.json'), 'utf-8');
    expect(await adapter.writeConfig(dir, cmd)).toBe('unchanged');
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
    expect(await new OpencodeAdapter().writeConfig(dir, cmd)).toBe('replaced');
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp.wolf).toEqual(WOLF_ENTRY);
    expect(cfg.mcp.other).toEqual({ type: 'local', command: ['x'] });
  });

  it('reads opencode.jsonc with comments (comments are lost on rewrite — documented trade-off)', async () => {
    writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // my config\n  "plugin": ["p"],\n}');
    expect(await new OpencodeAdapter().writeConfig(dir, cmd)).toBe('written');
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

  it('no write permission → fails without partial write (atomicity)', async () => {
    writeFileSync(join(dir, 'opencode.json'), '{}');
    chmodSync(dir, 0o555); // каталог read-only: tmp-файл для atomic rename не создать
    await expect(new OpencodeAdapter().writeConfig(dir, cmd)).rejects.toThrow();
    chmodSync(dir, 0o755);
    expect(JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'))).toEqual({});
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
