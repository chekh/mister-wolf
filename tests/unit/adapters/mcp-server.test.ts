import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildMcpServer } from '../../../src/adapters/mcp/mcp-server.js';
import { getWolfVersion } from '../../../src/adapters/version.js';
import { MemoryAddInputSchema, MemorySearchInputSchema } from '../../../src/adapters/mcp/mcp-schemas.js';
import { createCli } from '../../../src/adapters/cli/cli-entry.js';

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

  it('reports version from package.json, not a hardcoded literal', () => {
    const server = buildMcpServer(dir);
    const info = (server as unknown as { server: { _serverInfo: { version: string } } }).server._serverInfo;
    expect(info.version).toBe(getWolfVersion());
  });

  it('searches memory objects', async () => {
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    const result = await tools.search.handler({ query: 'router' });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
  });

  it('search accepts file_path filter and passes it to search', async () => {
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    await tools.add.handler({
      type: 'lesson',
      title: 'Filepath filter probe',
      body: 'probe content',
      createdBy: 'agent:mcp-test',
    });
    const all = await tools.search.handler({ query: 'Filepath' });
    expect(all.content[0].text).toMatch(/mem_/);
    const filtered = await tools.search.handler({ query: 'Filepath', file_path: 'nope.ts' });
    expect(filtered.content[0].text).toBe('No results.');
  });

  it('MemorySearchInputSchema accepts file_path', () => {
    const parsed = MemorySearchInputSchema.safeParse({ query: 'router', file_path: 'src/a.ts' });
    expect(parsed.success).toBe(true);
  });

  it('adds a memory object', async () => {
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    const result = await tools.add.handler({
      type: 'lesson',
      title: 'Router reconnect failure',
      body: 'We found a failure mode with router reconnect.',
      tags: ['router'],
      createdBy: 'agent:mcp-test',
    });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toMatch(/Created memory object: mem_/);
  });

  it('gets a memory object by id', async () => {
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    const addResult = await tools.add.handler({
      type: 'lesson',
      title: 'Get by id test',
      body: 'We can fetch an object by id.',
      createdBy: 'agent:mcp-test',
    });
    const id = addResult.content[0].text.replace('Created memory object: ', '');
    const result = await tools.get.handler({ id });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('Get by id test');
  });

  it('lists memory objects with a filter', async () => {
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    await tools.add.handler({
      type: 'lesson',
      title: 'List lesson one',
      createdBy: 'agent:mcp-test',
    });
    await tools.add.handler({
      type: 'decision',
      title: 'List decision one',
      createdBy: 'agent:mcp-test',
    });
    const result = await tools.list.handler({ type: 'lesson' });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('List lesson one');
    expect(result.content[0].text).not.toContain('List decision one');
  });

  it('transitions a memory object', async () => {
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    const addResult = await tools.add.handler({
      type: 'lesson',
      title: 'Transition test',
      createdBy: 'agent:mcp-test',
    });
    const id = addResult.content[0].text.replace('Created memory object: ', '');
    const result = await tools.transition.handler({ id, status: 'stale' });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('Transitioned');
  });

  // P223 (спека 2.13 §6.2/§7 C11): диета — create-семейство, thinking×4,
  // scan, insights, analytics не регистрируются; write-back идёт через add/transition.
  it('registers exactly the 2.13 catalog and none of the removed tools', () => {
    const server = buildMcpServer(dir);
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
    const names = Object.keys(tools).sort();
    expect(names).toEqual(['add', 'brief', 'get', 'list', 'ping', 'recap', 'search', 'transition']);
    const removed = [
      'create_thread',
      'create_info_request',
      'create_article',
      'create_decision',
      'create_blocker',
      'create_rule',
      'resolve_blocker',
      'scan',
      'insights',
      'analytics',
      'start_thinking',
      'add_thought',
      'conclude_thinking',
      'abandon_thinking',
    ];
    for (const name of removed) expect(tools[name]).toBeUndefined();
  });

  it('generates an agent brief', async () => {
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    const result = await tools.brief.handler({});
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('# Agent Brief');
  });

  it('add pipeline: rule with scope survives schema parse and handler, object keeps the field', async () => {
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    // эмуляция SDK-пайплайна: Standard Schema validate → cb(parsed)
    const parsed = MemoryAddInputSchema.parse({
      type: 'rule',
      title: 'MCP pipeline rule',
      createdBy: 'user:mcp-test',
      scope: 'project',
    });
    expect(parsed.scope).toBe('project');
    const result = await tools.add.handler(parsed);
    expect(result.content[0].text).toMatch(/Created memory object: mem_/);
    const id = result.content[0].text.replace('Created memory object: ', '');
    const got = await tools.get.handler({ id });
    expect(got.content[0].text).toContain('"scope": "project"');
  });

  it('add rejects invalid scope at input schema with a clear error', () => {
    expect(() =>
      MemoryAddInputSchema.parse({
        type: 'rule',
        title: 'x',
        createdBy: 'user:mcp-test',
        scope: 'bogus',
      })
    ).toThrow(/scope/);
  });

  it('add without scope for rule passes input schema but is rejected by domain validation', async () => {
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    // handler вызывается напрямую (без parse) — объект как есть
    await expect(tools.add.handler({ type: 'rule', title: 'x', createdBy: 'user:mcp-test' })).rejects.toThrow(
      /Type validation failed: scope/
    );
  });

  // C4: полный пайплайн parse → handler для всех типов с обязательными per-type полями
  // (wave13-a: таксономия 7 типов; старые типы дают UserFacingError с подсказкой)
  it.each([
    ['rule', { scope: 'project' }],
    ['lesson', { trigger_keywords: ['kw'] }],
    ['decision', { thread: 'mem_t1' }],
    ['thread', { goal: 'g' }],
    ['complaint', { about: 'a', rule: 'r', evidence: 'e', proposal: 'p' }],
    ['tool', { name: 'n', script_path: '.wolf/tools/n.sh', language: 'bash' }],
    ['note', { facet: 'context' }],
  ] as const)('add pipeline creates %s with per-type fields', async (type, extra) => {
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    const parsed = MemoryAddInputSchema.parse({
      type,
      title: `C4 ${type}`,
      createdBy: 'user:mcp-test',
      ...extra,
    });
    const result = await tools.add.handler(parsed);
    expect(result.content[0].text).toMatch(/Created memory object: mem_/);
  });
});

describe('memoryMcpCommand', () => {
  it('is registered in CLI', () => {
    const cli = createCli();
    const command = cli.commands.find((c) => c.name() === 'mcp');
    expect(command).toBeDefined();
  });
});
