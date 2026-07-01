import { buildMcpServer } from '../adapters/mcp/mcp-server.js';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

async function main() {
  const server = buildMcpServer(process.cwd());
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error in MCP server:', error);
  process.exit(1);
});
