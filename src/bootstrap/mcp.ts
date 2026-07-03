import { buildMcpServer } from '../adapters/mcp/mcp-server.js';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

async function main() {
  const server = buildMcpServer(process.cwd());
  await serveStdio(async () => server);
}

main().catch((error) => {
  console.error('Fatal error in MCP server:', error);
  process.exit(1);
});
