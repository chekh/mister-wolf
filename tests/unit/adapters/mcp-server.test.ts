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

  it('searches memory objects', async () => {
    const server = buildMcpServer(dir);
    const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }> })._registeredTools;
    const result = await tools.memory_search.handler({ query: 'router' });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
  });
});
