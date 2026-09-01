import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ClaudeAdapter } from '../../../../src/adapters/platforms/claude-adapter.js';
import { CANONICAL_MCP_COMMAND, PLATFORM_ADAPTERS } from '../../../../src/adapters/platforms/index.js';
import type { McpCommand } from '../../../../src/ports/platform-adapter.port.js';

const cmd: McpCommand = { command: 'wolf', args: ['mcp'] };
let dir: string;
// ponytail: permission-тест неприменим под root (Docker CI): root игнорирует права каталога
const isRoot = process.getuid?.() === 0;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-claude-adapter-'));
});
afterEach(() => {
  chmodSync(dir, 0o755);
  rmSync(dir, { recursive: true, force: true });
});

const WOLF_ENTRY = { command: 'wolf', args: ['mcp'] };

describe('ClaudeAdapter.detect (маркеры: .mcp.json / .claude/)', () => {
  it('detects .mcp.json', () => {
    writeFileSync(join(dir, '.mcp.json'), '{}');
    expect(new ClaudeAdapter().detect(dir)).toBe(true);
  });

  it('detects .claude/ directory', () => {
    mkdirSync(join(dir, '.claude'));
    expect(new ClaudeAdapter().detect(dir)).toBe(true);
  });

  it('no markers → not detected', () => {
    expect(new ClaudeAdapter().detect(dir)).toBe(false);
  });
});

describe('ClaudeAdapter.writeConfig', () => {
  it('creates .mcp.json with canonical mcpServers.wolf', async () => {
    expect(await new ClaudeAdapter().writeConfig(dir, cmd)).toEqual({ action: 'written' });
    const cfg = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf-8'));
    expect(cfg.mcpServers.wolf).toEqual(WOLF_ENTRY);
  });

  it('idempotent: second call unchanged, content identical', async () => {
    const adapter = new ClaudeAdapter();
    await adapter.writeConfig(dir, cmd);
    const before = readFileSync(join(dir, '.mcp.json'), 'utf-8');
    expect(await adapter.writeConfig(dir, cmd)).toEqual({ action: 'unchanged' });
    expect(readFileSync(join(dir, '.mcp.json'), 'utf-8')).toBe(before);
  });

  it('replaces a manual dev entry but keeps foreign servers', async () => {
    writeFileSync(
      join(dir, '.mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            wolf: { command: 'node', args: ['dist/bootstrap/mcp.js'] },
            sqlite: { command: 'sqlite' },
          },
        },
        null,
        2
      )
    );
    expect(await new ClaudeAdapter().writeConfig(dir, cmd)).toEqual({ action: 'replaced' });
    const cfg = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf-8'));
    expect(cfg.mcpServers.wolf).toEqual(WOLF_ENTRY);
    expect(cfg.mcpServers.sqlite).toEqual({ command: 'sqlite' });
  });

  it('readConfig returns null when no .mcp.json', async () => {
    expect(await new ClaudeAdapter().readConfig(dir)).toBeNull();
  });

  it.skipIf(isRoot)('no write permission → fails without partial write', async () => {
    writeFileSync(join(dir, '.mcp.json'), '{}');
    chmodSync(dir, 0o555);
    await expect(new ClaudeAdapter().writeConfig(dir, cmd)).rejects.toThrow();
    chmodSync(dir, 0o755);
    expect(JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf-8'))).toEqual({});
  });
});

describe('ClaudeAdapter.removeWolf', () => {
  it('removes only the wolf entry', async () => {
    const adapter = new ClaudeAdapter();
    await adapter.writeConfig(dir, cmd);
    expect(await adapter.removeWolf(dir)).toBe(true);
    const cfg = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf-8'));
    expect(cfg.mcpServers).toBeUndefined();
  });

  it('returns false when nothing to remove', async () => {
    expect(await new ClaudeAdapter().removeWolf(dir)).toBe(false);
  });
});

describe('adapter registry', () => {
  it('CANONICAL_MCP_COMMAND is { wolf, [mcp] } — never npx (спека §4)', () => {
    expect(CANONICAL_MCP_COMMAND).toEqual({ command: 'wolf', args: ['mcp'] });
  });

  it('PLATFORM_ADAPTERS covers opencode and claude', () => {
    expect(PLATFORM_ADAPTERS.map((a) => a.id).sort()).toEqual(['claude', 'opencode']);
  });
});
