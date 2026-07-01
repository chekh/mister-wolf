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

  function sendAndReceive(proc: typeof child, message: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout')), 5000);
      const handler = (data: Buffer) => {
        clearTimeout(timeout);
        proc.stdout.off('data', handler);
        const lines = data.toString().trim().split('\n');
        const response = JSON.parse(lines[lines.length - 1]);
        resolve(response);
      };
      proc.stdout.on('data', handler);
      proc.stdin.write(JSON.stringify(message) + '\n');
    });
  }
});
