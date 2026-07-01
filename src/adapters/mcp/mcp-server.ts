import { fromJsonSchema, McpServer } from '@modelcontextprotocol/server';
import { createCliContainer } from '../../bootstrap/container.js';
import { registerMemoryTools } from './mcp-tools.js';

export function buildMcpServer(baseDir: string): McpServer {
  const deps = createCliContainer(baseDir);
  const server = new McpServer({ name: 'mr-wolf', version: '0.1.0' });

  registerMemoryTools(server, deps);

  server.registerTool(
    'ping',
    {
      description: 'Health check for the Mr. Wolf MCP server',
      inputSchema: fromJsonSchema({ type: 'object', properties: {} }),
    },
    async () => ({ content: [{ type: 'text' as const, text: 'pong' }] })
  );

  return server;
}
