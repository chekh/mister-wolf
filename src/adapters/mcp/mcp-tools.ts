import { fromJsonSchema, type McpServer } from '@modelcontextprotocol/server';
import { MemorySearchInputSchema } from './mcp-schemas.js';
import { searchMemory } from '../../app/use-cases/search-memory.js';
import { createCliContainer } from '../../bootstrap/container.js';

export function registerMemoryTools(
  server: McpServer,
  deps: ReturnType<typeof createCliContainer>
): void {
  server.registerTool(
    'memory_search',
    {
      description: 'Search project memory objects by query and optional filters',
      inputSchema: fromJsonSchema(MemorySearchInputSchema),
    },
    async (input: unknown) => {
      const args = input as {
        query: string;
        type?: string;
        status?: string;
        confidence?: 'low' | 'medium' | 'high';
        memoryClass?: string;
        truthRole?: string;
        lifetime?: string;
        tags?: string[];
        minImportance?: number;
        maxImportance?: number;
        createdAfter?: string;
        createdBefore?: string;
        limit?: number;
        includeSuperseded?: boolean;
      };
      const results = await searchMemory({ index: deps.index }, args);
      const text = results
        .map((r) => `${r.object.id} [${r.object.type}] ${r.object.title}`)
        .join('\n');
      return { content: [{ type: 'text' as const, text: text || 'No results.' }] };
    }
  );
}
