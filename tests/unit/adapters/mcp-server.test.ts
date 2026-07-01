import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildMcpServer } from '../../../src/adapters/mcp/mcp-server.js';

describe('buildMcpServer', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-mcp-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('registers at least one tool', async () => {
    const server = buildMcpServer(dir);
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
    expect(Object.keys(tools).length).toBeGreaterThan(0);
  });
});
