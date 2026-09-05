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

describe('MCP stdio: tools/list exposes phase 8 tools', () => {
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

  it('lists tools including search, add, transition, brief, scan, create_rule (phase 6+)', async () => {
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

    const names = (tools.result?.tools ?? []).map((t) => t.name);
    // core MCP tools
    expect(names).toContain('search');
    expect(names).toContain('add');
    expect(names).toContain('get');
    expect(names).toContain('list');
    expect(names).toContain('transition');
    expect(names).toContain('brief');
    expect(names).toContain('scan');
    expect(names).toContain('create_rule');
    expect(names).toContain('recap');
    expect(names).toContain('ping');
    // at least 14 tools registered
    expect(names.length).toBeGreaterThanOrEqual(14);
  });

  it('tools/call analytics with view=campaign returns campaign payload (P3 D4)', async () => {
    // initialize выполнен предыдущим it — сразу вызов тула
    const res = (await sendAndReceive(child, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'analytics', arguments: { view: 'campaign' } },
    })) as { result?: { content?: { type: string; text?: string }[] } };
    const text = res.result?.content?.[0]?.text ?? '';
    expect(text).not.toBe('');
    const payload = JSON.parse(text) as { view: string; campaign?: { rows: unknown[] } };
    expect(payload.view).toBe('campaign');
    expect(payload.campaign).toBeDefined();
    expect(Array.isArray(payload.campaign?.rows)).toBe(true);
  });
});
