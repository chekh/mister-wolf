import { fromJsonSchema, type McpServer } from '@modelcontextprotocol/server';
import {
  MemorySearchInputSchema,
  MemoryAddInputSchema,
  MemoryGetInputSchema,
  MemoryListInputSchema,
} from './mcp-schemas.js';
import { searchMemory } from '../../app/use-cases/search-memory.js';
import { addMemoryObject } from '../../app/use-cases/add-memory-object.js';
import { getMemoryObject } from '../../app/use-cases/get-memory-object.js';
import { listMemoryObjects } from '../../app/use-cases/list-memory-objects.js';
import { createCliContainer } from '../../bootstrap/container.js';

export function registerMemoryTools(server: McpServer, deps: ReturnType<typeof createCliContainer>): void {
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
      const text = results.map((r) => `${r.object.id} [${r.object.type}] ${r.object.title}`).join('\n');
      return { content: [{ type: 'text' as const, text: text || 'No results.' }] };
    }
  );

  server.registerTool(
    'memory_get',
    {
      description: 'Get a memory object by id',
      inputSchema: fromJsonSchema(MemoryGetInputSchema),
    },
    async (input: unknown) => {
      const args = input as { id: string };
      const object = await getMemoryObject(deps.store, args.id);
      if (!object) {
        return { content: [{ type: 'text' as const, text: `Memory object not found: ${args.id}` }] };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(object, null, 2) }] };
    }
  );

  server.registerTool(
    'memory_list',
    {
      description: 'List memory objects with optional filters',
      inputSchema: fromJsonSchema(MemoryListInputSchema),
    },
    async (input: unknown) => {
      const args = input as {
        type?: string;
        status?: string;
        stale?: boolean;
        memoryClass?: string;
        truthRole?: string;
        lifetime?: string;
      };
      const objects = await listMemoryObjects(deps.store, args);
      const text = objects.map((o) => `${o.id} [${o.type}] ${o.title}`).join('\n');
      return { content: [{ type: 'text' as const, text: text || 'No memory objects.' }] };
    }
  );

  server.registerTool(
    'memory_add',
    {
      description: 'Add a generic memory object',
      inputSchema: fromJsonSchema(MemoryAddInputSchema),
    },
    async (input: unknown) => {
      const args = input as {
        type: string;
        title: string;
        body?: string;
        tags?: string[];
        confidence?: 'low' | 'medium' | 'high';
        importance?: number;
        memoryClass?: string;
        truthRole?: string;
        lifetime?: string;
        createdBy: string;
      };
      const result = await addMemoryObject(deps, {
        type: args.type as never,
        title: args.title,
        body: args.body,
        createdBy: args.createdBy,
        tags: args.tags,
        confidence: args.confidence,
        importance: args.importance,
        memoryClass: args.memoryClass as never,
        truthRole: args.truthRole as never,
        lifetime: args.lifetime as never,
      });
      return {
        content: [{ type: 'text' as const, text: `Created memory object: ${result.object.id}` }],
      };
    }
  );
}
