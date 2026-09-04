import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildMcpServer } from '../../../src/adapters/mcp/mcp-server.js';
import { readSignals } from '../../../src/adapters/fs/session-metrics-log.js';

type Tools = Record<string, { handler: (args: unknown) => Promise<unknown> }>;

function toolsOf(dir: string): Tools {
  const server = buildMcpServer(dir);
  return (server as unknown as { _registeredTools: Tools })._registeredTools;
}

/** P1 D5: каждый вызов mr-wolf-* тула пишет mcp_call-сигнал в session-metrics.jsonl. */
describe('mcp_call telemetry', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-mcp-tel-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('ok-branch: list appends mcp_call with tool_name/outcome/duration/detail', async () => {
    const tools = toolsOf(dir);
    const result = (await tools.list.handler({})) as { content: Array<{ type: string; text: string }> };
    expect(result.content).toHaveLength(1); // возвращаемое значение не тронуто

    const events = readSignals(dir).filter((e) => e.event === 'mcp_call');
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.tool_name).toBe('list');
    expect(ev.outcome).toBe('ok');
    expect(typeof ev.duration_ms).toBe('number');
    expect(ev.duration_ms).toBeGreaterThanOrEqual(0);
    expect(ev.detail?.method).toBe('list');
    expect(ev.orchestration.actor).toBe('system:wolf');
    expect(ev.session_id).toBeNull();
    expect(ev.gen_ai.modelID).toBeNull();
  });

  it('error-branch: domain failure appends outcome=error and rethrows original error', async () => {
    const tools = toolsOf(dir);
    // rule без scope проходит input-схему, но доменная валидация бросает внутри handler'а
    await expect(tools.add.handler({ type: 'rule', title: 'x', createdBy: 'user:mcp-test' })).rejects.toThrow(
      /Type validation failed: scope/
    );

    const events = readSignals(dir).filter((e) => e.event === 'mcp_call');
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.tool_name).toBe('add');
    expect(ev.outcome).toBe('error');
    expect(typeof ev.duration_ms).toBe('number');
    expect(ev.detail?.method).toBe('add');
    expect(ev.orchestration.actor).toBe('system:wolf');
  });
});
