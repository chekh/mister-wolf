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

describe('MCP stdio: catalog diet (2.13 survivors + council_record + propose_candidate 3.2.0 + note_contradiction R-4, 10 tools + ping)', () => {
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

  it('tools/list exposes exactly the diet survivors + propose_candidate (3.2.0) + note_contradiction (R-4) + ping', async () => {
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
    expect(names).toEqual([
      'add',
      'brief',
      'council_record',
      'get',
      'list',
      'note_contradiction',
      'ping',
      'propose_candidate',
      'recap',
      'search',
      'transition',
    ]);
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

  it('F-1 (R4 review): tools/call note_contradiction with an incomplete input fails at the schema level, no silent pass', async () => {
    // Сквозной пин: SDK валидирует вход ДО handler'а (обёртка T011) — неполный
    // report (нет reason/contradiction_evidence) обязан вернуть ошибку схемы,
    // а не тихий вызов/пропуск. Отклонения на уровне схемы подробно покрыты в
    // note-contradiction-mcp.test.ts; здесь — живой stdio-путь.
    const res = (await sendAndReceive(child, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'note_contradiction', arguments: { action: 'report', note_id: 'mem_x' } },
    })) as {
      error?: { message?: string };
      result?: { isError?: boolean; content?: { type: string; text: string }[] };
    };
    // MCP-форма schema-failure: CallToolResult с isError=true (не JSON-RPC error),
    // handler не вызывался; текст называет тул и недостающие поля действия.
    const text = res.result?.content?.map((c) => c.text).join('\n') ?? '';
    expect(res.result?.isError).toBe(true);
    expect(text).toContain('Invalid arguments for tool note_contradiction');
    expect(text).toContain('reason');
    expect(text).toContain('contradiction_evidence');
  });
});
