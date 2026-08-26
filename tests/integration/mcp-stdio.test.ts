import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';

describe('MCP stdio server', () => {
  let dir: string;
  let child: ReturnType<typeof spawn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-mcp-stdio-'));
    child = spawn(process.execPath, [join(process.cwd(), 'dist/bootstrap/mcp.js')], {
      cwd: dir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  });

  afterEach(() => {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  });

  it('responds to initialize', async () => {
    const initMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0.1.0' } },
    };
    const response = await sendAndReceive(child, initMessage);
    expect(response.result).toBeDefined();
  });

  it('calls the recap tool after initialize', async () => {
    const initMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0.1.0' } },
    };
    await sendAndReceive(child, initMessage);

    const response = (await sendAndReceive(child, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'recap', arguments: {} },
    })) as { result?: { content?: { type: string; text: string }[] } };

    expect(response.result).toBeDefined();
    const text = response.result?.content?.[0]?.text ?? '';
    expect(text).toContain('## Active rules');
    expect(text).toContain('## Active work threads');
    expect(text).toContain('## Open blockers');
    expect(text).toContain('## Open questions');
    expect(text).toContain('## Open info requests');
    expect(text).toContain('## Recent decisions');
  });

  function sendAndReceive(proc: typeof child, message: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout')), 5000);
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
              proc.stdout.off('data', handler);
              resolve(parsed);
              return;
            }
          } catch {
            // Ignore non-JSON lines such as logs.
          }
        }
      };
      proc.stdout.on('data', handler);
      proc.stdin.write(JSON.stringify(message) + '\n');
    });
  }
});
