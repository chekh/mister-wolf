import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { ensureBuilt, cliPath, tmpProject } from './helpers.js';

function sendAndReceive(proc: ChildProcess, message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout')), 10_000);
    let buffer = '';
    const handler = (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.jsonrpc === '2.0') {
            clearTimeout(timeout);
            proc.stdout?.off('data', handler);
            resolve(parsed);
            return;
          }
        } catch {
          // non-JSON
        }
      }
    };
    proc.stdout?.on('data', handler);
    proc.stdin?.write(JSON.stringify(message) + '\n');
  });
}

describe('MCP stdio: 2.13 catalog diet (7 tools + ping)', () => {
  let cwd: string;
  let child: ChildProcess;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
    child = spawn('node', [cliPath, 'mcp'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  });
  afterAll(() => {
    child.kill();
    rmSync(cwd, { recursive: true, force: true });
  });

  it('tools/list exposes exactly the diet survivors + ping (spec 2.13 §6.2)', async () => {
    await sendAndReceive(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0.1.0' } },
    });

    const tools = (await sendAndReceive(child, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    })) as { result?: { tools?: { name: string }[] } };

    const names = (tools.result?.tools ?? []).map((t) => t.name).sort();
    expect(names).toEqual(['add', 'brief', 'get', 'list', 'ping', 'recap', 'search', 'transition']);
  });

  it('tools/call of a removed tool (create_thread) returns an error hinting add/transition (P223)', async () => {
    // initialize выполнен предыдущим it — сразу вызов тула
    const res = (await sendAndReceive(child, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'create_thread', arguments: {} },
    })) as { error?: { message?: string } };
    const message = res.error?.message ?? '';
    expect(message).toContain("tool 'create_thread' was removed");
    expect(message).toContain('`add`');
    expect(message).toContain('`transition`');
  });

  it('tools/call of an unknown tool lists the available catalog', async () => {
    const res = (await sendAndReceive(child, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'frobnicate', arguments: {} },
    })) as { error?: { message?: string } };
    const message = res.error?.message ?? '';
    expect(message).toContain("unknown tool 'frobnicate'");
    expect(message).toContain('search/get/list/add/transition/brief/recap');
  });
});
