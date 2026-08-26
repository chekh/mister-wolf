import { McpServer } from '@modelcontextprotocol/server';
import {
  EmptyInputSchema,
  MemorySearchInputSchema,
  MemoryAddInputSchema,
  MemoryGetInputSchema,
  MemoryListInputSchema,
  MemoryTransitionInputSchema,
  MemoryCreateThreadInputSchema,
  MemoryCreateInfoRequestInputSchema,
  MemoryCreateArticleInputSchema,
  MemoryCreateDecisionInputSchema,
  MemoryCreateBlockerInputSchema,
  MemoryResolveBlockerInputSchema,
  MemoryCreateRuleInputSchema,
  InsightsInputSchema,
} from './mcp-schemas.js';
import { searchMemory } from '../../app/use-cases/search-memory.js';
import { addMemoryObject } from '../../app/use-cases/add-memory-object.js';
import { getMemoryObject } from '../../app/use-cases/get-memory-object.js';
import { listMemoryObjects } from '../../app/use-cases/list-memory-objects.js';
import { transitionMemoryObject } from '../../app/use-cases/transition-memory-object.js';
import { createWorkThread } from '../../app/use-cases/create-work-thread.js';
import { createInfoRequest } from '../../app/use-cases/create-info-request.js';
import { createArticle } from '../../app/use-cases/create-article.js';
import { createDecision } from '../../app/use-cases/create-decision.js';
import { createBlocker } from '../../app/use-cases/create-blocker.js';
import { resolveBlocker } from '../../app/use-cases/resolve-blocker.js';
import { scanProject } from '../../app/use-cases/scan-project.js';
import { generateAgentBrief } from '../../app/use-cases/generate-agent-brief.js';
import { generateInsights, renderInsights } from '../../app/use-cases/generate-insights.js';
import { generateRecap, renderRecap } from '../../app/use-cases/generate-recap.js';
import { createRule } from '../../app/use-cases/create-rule.js';
import { createCliContainer } from '../../bootstrap/container.js';

export function registerMemoryTools(
  server: McpServer,
  deps: ReturnType<typeof createCliContainer>,
  baseDir: string
): void {
  server.registerTool(
    'search',
    {
      description: 'Search project memory objects by query and optional filters',
      inputSchema: MemorySearchInputSchema,
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
        file_path?: string;
        limit?: number;
        includeSuperseded?: boolean;
      };
      const results = await searchMemory({ index: deps.index }, args);
      const text = results.map((r) => `${r.object.id} [${r.object.type}] ${r.object.title}`).join('\n');
      return { content: [{ type: 'text' as const, text: text || 'No results.' }] };
    }
  );

  server.registerTool(
    'get',
    {
      description: 'Get a memory object by id',
      inputSchema: MemoryGetInputSchema,
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
    'list',
    {
      description: 'List memory objects with optional filters',
      inputSchema: MemoryListInputSchema,
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
    'add',
    {
      description: 'Add a generic memory object',
      inputSchema: MemoryAddInputSchema,
    },
    async (input: unknown) => {
      const args = input as {
        type: string;
        title: string;
        body?: string;
        tags?: string[];
        confidence?: 'low' | 'medium' | 'high';
        importance?: number;
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
      });
      return {
        content: [{ type: 'text' as const, text: `Created memory object: ${result.object.id}` }],
      };
    }
  );

  server.registerTool(
    'transition',
    {
      description: 'Transition a memory object to a new lifecycle status',
      inputSchema: MemoryTransitionInputSchema,
    },
    async (input: unknown) => {
      const args = input as { id: string; status: string };
      await transitionMemoryObject(deps, args.id, args.status as never, 'agent:mcp');
      return { content: [{ type: 'text' as const, text: `Transitioned ${args.id} to ${args.status}.` }] };
    }
  );

  server.registerTool(
    'create_thread',
    {
      description: 'Create a work thread',
      inputSchema: MemoryCreateThreadInputSchema,
    },
    async (input: unknown) => {
      const args = input as {
        title: string;
        goal: string;
        currentState?: string;
        nextSteps?: string[];
        createdBy: string;
      };
      const result = await createWorkThread(deps, args);
      return { content: [{ type: 'text' as const, text: `Created thread: ${result.object.id}` }] };
    }
  );

  server.registerTool(
    'create_info_request',
    {
      description: 'Create an information request',
      inputSchema: MemoryCreateInfoRequestInputSchema,
    },
    async (input: unknown) => {
      const args = input as {
        title: string;
        thread: string;
        question: string;
        detourReason: string;
        neededFor?: string[];
        expectedAnswer: string[];
        preliminaryAnswer?: string;
        createdBy: string;
      };
      const result = await createInfoRequest(deps, args);
      return { content: [{ type: 'text' as const, text: `Created info request: ${result.object.id}` }] };
    }
  );

  server.registerTool(
    'create_article',
    {
      description: 'Create an article',
      inputSchema: MemoryCreateArticleInputSchema,
    },
    async (input: unknown) => {
      const args = input as {
        title: string;
        thread: string;
        summary: string;
        body: string;
        answers?: string[];
        supports?: string[];
        evidence?: string[];
        createdBy: string;
      };
      const result = await createArticle(deps, args);
      return { content: [{ type: 'text' as const, text: `Created article: ${result.object.id}` }] };
    }
  );

  server.registerTool(
    'create_decision',
    {
      description: 'Create a decision',
      inputSchema: MemoryCreateDecisionInputSchema,
    },
    async (input: unknown) => {
      const args = input as {
        title: string;
        body: string;
        thread?: string;
        basedOn?: string[];
        createdBy: string;
      };
      const result = await createDecision(deps, args);
      return { content: [{ type: 'text' as const, text: `Created decision: ${result.object.id}` }] };
    }
  );

  server.registerTool(
    'create_blocker',
    {
      description: 'Create a blocker',
      inputSchema: MemoryCreateBlockerInputSchema,
    },
    async (input: unknown) => {
      const args = input as {
        title: string;
        impact: string;
        workaround?: string;
        thread?: string;
        createdBy: string;
      };
      const result = await createBlocker(deps, args);
      return { content: [{ type: 'text' as const, text: `Created blocker: ${result.object.id}` }] };
    }
  );

  server.registerTool(
    'resolve_blocker',
    {
      description: 'Resolve a blocker',
      inputSchema: MemoryResolveBlockerInputSchema,
    },
    async (input: unknown) => {
      const args = input as { id: string; resolvedBy?: string };
      await resolveBlocker(deps, args.id, args.resolvedBy);
      return { content: [{ type: 'text' as const, text: `Resolved blocker: ${args.id}` }] };
    }
  );

  server.registerTool(
    'scan',
    {
      description: 'Scan the project and register documents',
      inputSchema: EmptyInputSchema,
    },
    async () => {
      const result = await scanProject(deps, baseDir);
      return { content: [{ type: 'text' as const, text: `Project scan complete: ${result.object.id}` }] };
    }
  );

  server.registerTool(
    'brief',
    {
      description: 'Generate the agent brief from the latest scan and memory',
      inputSchema: EmptyInputSchema,
    },
    async () => {
      const scanResult = await scanProject(deps, baseDir);
      const brief = await generateAgentBrief(deps, baseDir, scanResult.snapshot);
      return { content: [{ type: 'text' as const, text: brief.content }] };
    }
  );

  server.registerTool(
    'insights',
    {
      description: 'Heuristic pattern analysis over project memory (Level 1, no LLM)',
      inputSchema: InsightsInputSchema,
    },
    async (input: unknown) => {
      const args = input as {
        topic?: string;
        type?: 'patterns' | 'technical_debt' | 'decisions' | 'lessons' | 'activity';
      };
      const report = await generateInsights(
        { store: deps.store, clock: deps.clock },
        { topic: args.topic, analysisType: args.type }
      );
      return { content: [{ type: 'text' as const, text: renderInsights(report) }] };
    }
  );

  server.registerTool(
    'recap',
    {
      description:
        'Summary of active project memory: rules, work threads, blockers, questions, info requests, recent decisions',
      inputSchema: EmptyInputSchema,
    },
    async () => {
      const report = await generateRecap({ store: deps.store });
      return { content: [{ type: 'text' as const, text: renderRecap(report) }] };
    }
  );

  server.registerTool(
    'create_rule',
    {
      description: 'Create a rule (user request only)',
      inputSchema: MemoryCreateRuleInputSchema,
    },
    async (input: unknown) => {
      const args = input as {
        title: string;
        body: string;
        scope: 'project' | 'global';
        appliesTo?: string[];
        trigger?: string;
        createdBy: string;
      };
      const result = await createRule(deps, args);
      return { content: [{ type: 'text' as const, text: `Created rule: ${result.object.id}` }] };
    }
  );
}
