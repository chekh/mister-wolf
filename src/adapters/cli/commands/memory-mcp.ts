import { Command } from 'commander';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

export function memoryMcpCommand(): Command {
  return new Command('mcp').description('Start the MCP server (stdio)').action(async () => {
    const baseDir = dirname(fileURLToPath(import.meta.url));
    const mcpEntry = join(baseDir, '../../../../dist/bootstrap/mcp.js');
    const child = spawn(process.execPath, [mcpEntry], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    await new Promise((resolve) => child.on('close', resolve));
  });
}
