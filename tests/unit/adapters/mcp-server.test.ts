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
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    const result = await tools.memory_search.handler({ query: 'router' });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
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
    const result = await tools.memory_add.handler({
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
    const addResult = await tools.memory_add.handler({
      type: 'lesson',
      title: 'Get by id test',
      body: 'We can fetch an object by id.',
      createdBy: 'agent:mcp-test',
    });
    const id = addResult.content[0].text.replace('Created memory object: ', '');
    const result = await tools.memory_get.handler({ id });
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
    await tools.memory_add.handler({
      type: 'lesson',
      title: 'List lesson one',
      createdBy: 'agent:mcp-test',
    });
    await tools.memory_add.handler({
      type: 'decision',
      title: 'List decision one',
      createdBy: 'agent:mcp-test',
    });
    const result = await tools.memory_list.handler({ type: 'lesson' });
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
    const addResult = await tools.memory_add.handler({
      type: 'lesson',
      title: 'Transition test',
      createdBy: 'agent:mcp-test',
    });
    const id = addResult.content[0].text.replace('Created memory object: ', '');
    const result = await tools.memory_transition.handler({ id, status: 'stale' });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('Transitioned');
  });

  it('creates a work thread', async () => {
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    const result = await tools.memory_create_thread.handler({
      title: 'Thread MCP',
      goal: 'Test MCP',
      createdBy: 'agent:test',
    });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toMatch(/thread_/);
  });

  it('creates and resolves a blocker', async () => {
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    const blocker = await tools.memory_create_blocker.handler({
      title: 'Blocker MCP',
      impact: 'blocks tests',
      createdBy: 'agent:test',
    });
    const id = blocker.content[0].text.replace('Created blocker: ', '');
    const resolved = await tools.memory_resolve_blocker.handler({ id });
    expect(resolved.content).toHaveLength(1);
    expect(resolved.content[0].text).toContain('Resolved');
  });

  it('scans the project', async () => {
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    const result = await tools.memory_scan.handler({});
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('Project scan');
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
    const result = await tools.memory_brief.handler({});
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('# Agent Brief');
  });
});
