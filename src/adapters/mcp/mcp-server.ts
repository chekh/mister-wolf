import { fromJsonSchema, McpServer } from '@modelcontextprotocol/server';
import { createCliContainer } from '../../bootstrap/container.js';
import { getWolfVersion } from '../version.js';
import { registerMemoryTools, mcpToolNotFoundMessage } from './mcp-tools.js';

/**
 * P223 (спека 2.13 §6.2/§10.4): SDK на неизвестный тул отвечает сухим
 * `Tool X not found`. Оборачиваем tools/call-хендлер и дописываем подсказку
 * на add/transition (расширение механики T030/removed-commands на MCP).
 * _requestHandlers — приватное поле Protocol; доступ под страховкой, при
 * смене внутренностей SDK тихо остаётся дефолт — регресс ловит e2e-кейс.
 */
function hintUnknownTools(server: McpServer): void {
  type Handler = (request: unknown, ctx: unknown) => Promise<unknown>;
  const handlers = (server as unknown as { server?: { _requestHandlers?: Map<string, Handler> } }).server
    ?._requestHandlers;
  if (!(handlers instanceof Map)) return;
  const original = handlers.get('tools/call');
  if (typeof original !== 'function') return;
  handlers.set('tools/call', async (request, ctx) => {
    try {
      return await original(request, ctx);
    } catch (err) {
      const name = (request as { params?: { name?: unknown } })?.params?.name;
      if (typeof name === 'string' && err instanceof Error && err.message === `Tool ${name} not found`) {
        err.message = mcpToolNotFoundMessage(name);
      }
      throw err;
    }
  });
}

export function buildMcpServer(baseDir: string): McpServer {
  const deps = createCliContainer(baseDir);
  const server = new McpServer({ name: 'mr-wolf', version: getWolfVersion() });

  registerMemoryTools(server, deps, baseDir);

  server.registerTool(
    'ping',
    {
      description: 'Health check for the Mr. Wolf MCP server',
      inputSchema: fromJsonSchema({ type: 'object', properties: {} }),
    },
    async () => ({ content: [{ type: 'text' as const, text: 'pong' }] })
  );

  hintUnknownTools(server);

  return server;
}
