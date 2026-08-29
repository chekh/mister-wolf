import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildMcpServer } from '../../../src/adapters/mcp/mcp-server.js';
import { MemorySearchInputSchema, ThinkingAddInputSchema } from '../../../src/adapters/mcp/mcp-schemas.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
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
    const result = await tools.create_thread.handler({
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
    const blocker = await tools.create_blocker.handler({
      title: 'Blocker MCP',
      impact: 'blocks tests',
      createdBy: 'agent:test',
    });
    const id = blocker.content[0].text.replace('Created blocker: ', '');
    const resolved = await tools.resolve_blocker.handler({ id });
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
    const result = await tools.scan.handler({});
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
    const result = await tools.brief.handler({});
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('# Agent Brief');
  });

  it('runs a full thinking cycle: start -> add -> conclude creates decision with trace', async () => {
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;

    const started = await tools.start_thinking.handler({ goal: 'Decide auth', createdBy: 'agent:test' });
    const seqId = started.content[0].text.replace('Started thinking sequence: ', '');
    expect(seqId).toMatch(/^mem_/);

    const added = await tools.add_thought.handler({ sequenceId: seqId, type: 'hypothesis', text: 'JWT suffices' });
    expect(added.content[0].text).toContain('Added thought: mem_');

    const concluded = await tools.conclude_thinking.handler({
      sequenceId: seqId,
      title: 'Use JWT',
      body: 'Chosen.',
      createdBy: 'agent:test',
    });
    const decisionId = concluded.content[0].text.replace('Created decision: ', '');
    expect(decisionId).toMatch(/^mem_/);

    const store = new MarkdownMemoryStore(dir);
    const decision = await store.get(decisionId);
    expect(decision?.body).toContain('## Thinking trace');
    expect(decision?.body).toContain('1. [hypothesis] JWT suffices');
  });

  it('abandons a thinking sequence', async () => {
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    const started = await tools.start_thinking.handler({ goal: 'Spike', createdBy: 'agent:test' });
    const seqId = started.content[0].text.replace('Started thinking sequence: ', '');
    const abandoned = await tools.abandon_thinking.handler({ sequenceId: seqId });
    expect(abandoned.content[0].text).toBe(`Abandoned thinking sequence: ${seqId}`);
  });

  it('rejects an invalid thought type', async () => {
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    await expect(tools.add_thought.handler({ sequenceId: 'mem_x', type: 'guess', text: 'x' })).rejects.toThrow();
    // ошибка схемы по букве спеки (§4 Task 3): zod-enum отклоняет невалидный тип независимо от гварда use-case
    expect(() => ThinkingAddInputSchema.parse({ sequenceId: 'mem_x', type: 'guess', text: 'x' })).toThrow();
  });

  it('analyzes memory via insights tool', async () => {
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    const result = await tools.insights.handler({});
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('Insights [patterns]');
  });

  it('rejects invalid insights type', async () => {
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    await expect(tools.insights.handler({ type: 'bogus' })).rejects.toThrow(/Allowed:/);
  });
  it('creates a rule', async () => {
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    const result = await tools.create_rule.handler({
      title: 'Rule MCP',
      body: 'Test rule body',
      scope: 'project',
      createdBy: 'user:test',
    });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toMatch(/rule_/);
  });

  it('rejects agent-created rules', async () => {
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    await expect(
      tools.create_rule.handler({
        title: 'Bad rule',
        body: 'Test rule body',
        scope: 'project',
        createdBy: 'agent:test',
      })
    ).rejects.toThrow('Rules can only be created by explicit user request');
  });
});

describe('memoryMcpCommand', () => {
  it('is registered in CLI', () => {
    const cli = createCli();
    const command = cli.commands.find((c) => c.name() === 'mcp');
    expect(command).toBeDefined();
  });
});
