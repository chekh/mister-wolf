import { buildMcpServer } from '../adapters/mcp/mcp-server.js';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { ensureCurrentSchema } from '../adapters/fs/schema-guard.js';

async function main() {
  await ensureCurrentSchema(process.cwd());
  const server = buildMcpServer(process.cwd());
  await serveStdio(async () => server);
}

main().catch((error) => {
  console.error('Fatal error in MCP server:', error);
  process.exit(1);
});
