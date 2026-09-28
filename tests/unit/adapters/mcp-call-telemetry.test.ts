import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { join } from 'path';
import { buildMcpServer } from '../../../src/adapters/mcp/mcp-server.js';
import { readSignals } from '../../../src/adapters/fs/session-metrics-log.js';
import { getWolfVersion } from '../../../src/adapters/version.js';

// версия из package.json корня ворктри (не из кэша getWolfVersion) — источник истины теста
const rootVersion = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf-8')
) as { version: string };

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
    // P2 D2: detail несёт runtime-версию Wolf из package.json
    expect(ev.detail?.wolf_version).toBe(rootVersion.version);
    expect(ev.detail?.wolf_version).toBe(getWolfVersion());
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
    // P2 D2: wolf_version пишется и в error-ветке (единый record)
    expect(ev.detail?.wolf_version).toBe(rootVersion.version);
    expect(ev.orchestration.actor).toBe('system:wolf');
  });

  // Волна 0 0.1: обогащение detail по инструменту + error-поля
  it('wave0 add: detail.args_summary с type/title/extra_keys, без body', async () => {
    const tools = toolsOf(dir);
    await tools.add.handler({
      type: 'decision',
      title: 'Заголовок объекта',
      body: 'СЕКРЕТНОЕ-ТЕЛО-НЕ-В-ТЕЛЕМЕТРИЮ',
      createdBy: 'user:mcp-test',
      thread: 'thr_1',
    });
    const ev = readSignals(dir)
      .filter((e) => e.event === 'mcp_call')
      .at(-1);
    const summary = ev?.detail?.args_summary as Record<string, unknown>;
    expect(summary).toEqual({
      type: 'decision',
      title: 'Заголовок объекта',
      extra_keys: ['thread'],
    });
    expect(JSON.stringify(ev?.detail)).not.toContain('СЕКРЕТНОЕ-ТЕЛО');
  });

  it('wave0 get: detail.memory_id = id вызванного объекта', async () => {
    const tools = toolsOf(dir);
    const created = (await tools.add.handler({ type: 'context', title: 'для get', createdBy: 'u' })) as {
      content: Array<{ text: string }>;
    };
    const id = created.content[0]?.text?.match(/Created memory object: (\S+)/)?.[1];
    expect(id).toBeTruthy();
    await tools.get.handler({ id });
    const ev = readSignals(dir)
      .filter((e) => e.event === 'mcp_call')
      .at(-1);
    expect(ev?.tool_name).toBe('get');
    expect(ev?.detail?.memory_id).toBe(id);
  });

  it('wave0 search: detail.memory_ids содержит id найденных; пустой поиск → пустой массив', async () => {
    const tools = toolsOf(dir);
    const created = (await tools.add.handler({
      type: 'context',
      title: 'уникальный-заголовок-qwerty',
      createdBy: 'u',
    })) as {
      content: Array<{ text: string }>;
    };
    const id = created.content[0]?.text?.match(/Created memory object: (\S+)/)?.[1];
    await tools.search.handler({ query: 'уникальный-заголовок-qwerty' });
    const hit = readSignals(dir)
      .filter((e) => e.event === 'mcp_call')
      .at(-1);
    expect(hit?.detail?.memory_ids).toContain(id);

    await tools.search.handler({ query: 'такого-точно-нет-в-памяти-zzz999' });
    const miss = readSignals(dir)
      .filter((e) => e.event === 'mcp_call')
      .at(-1);
    expect(miss?.detail?.memory_ids).toEqual([]);
  });

  it('wave0 error: detail.error.message + detail.error_class_id (classifyError)', async () => {
    const tools = toolsOf(dir);
    await expect(tools.add.handler({ type: 'rule', title: 'x', createdBy: 'u' })).rejects.toThrow(
      /Type validation failed: scope/
    );
    const ev = readSignals(dir)
      .filter((e) => e.event === 'mcp_call')
      .at(-1);
    expect((ev?.detail?.error as { message: string }).message).toContain('Type validation failed');
    expect(typeof ev?.detail?.error_class_id).toBe('string');
    expect(ev?.detail?.error_class_id).toBe('invalid_input');
  });
});
