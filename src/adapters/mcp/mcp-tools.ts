import { McpServer } from '@modelcontextprotocol/server';
import {
  EmptyInputSchema,
  MemorySearchInputSchema,
  MemoryAddInputSchema,
  MemoryGetInputSchema,
  MemoryListInputSchema,
  MemoryTransitionInputSchema,
} from './mcp-schemas.js';
import { searchMemory } from '../../app/use-cases/search-memory.js';
import { addMemoryObject } from '../../app/use-cases/add-memory-object.js';
import { getMemoryObject } from '../../app/use-cases/get-memory-object.js';
import { listMemoryObjects } from '../../app/use-cases/list-memory-objects.js';
import { transitionMemoryObject } from '../../app/use-cases/transition-memory-object.js';
import { scanProjectCached } from '../../app/use-cases/scan-project.js';
import { openScanSnapshotCache } from '../fs/scan-snapshot-cache.js';
import { projectTreeSignature } from '../fs/heuristic-project-scanner.js';
import { generateAgentBrief } from '../../app/use-cases/generate-agent-brief.js';
import { generateRecap, renderRecap } from '../../app/use-cases/generate-recap.js';
import { createCliContainer } from '../../bootstrap/container.js';
import { appendMcpCallSignal, appendMemoryStageSignal, addArgsSummary } from '../../adapters/fs/session-metrics-log.js';
import { normalizeAddInputKeys } from './mcp-schemas.js';
import { getWolfVersion } from '../version.js';
import { resolveSessionId } from '../../domain/actor.js';

/**
 * Каталог MCP-тулов после диеты 2.13 (спека §6.2, §7 C11): ровно 7, порог ≤ 12.
 * `ping` — отдельный health-check в mcp-server.ts, в каталог не входит.
 */
export const MCP_TOOL_NAMES = ['search', 'get', 'list', 'add', 'transition', 'brief', 'recap'] as const;

/** Подсказки для тулов, удалённых в 2.13 (механика — зеркало CLI removed-commands.ts). */
const REMOVED_TOOL_HINTS: Readonly<Record<string, string>> = {
  create_thread: 'use `add` (types) or `transition` (statuses)',
  create_info_request: 'use `add` (types) or `transition` (statuses)',
  create_article: 'use `add` (types) or `transition` (statuses)',
  create_decision: 'use `add` (types) or `transition` (statuses)',
  create_blocker: 'use `add` (types) or `transition` (statuses)',
  create_rule: 'use `add` (types) or `transition` (statuses)',
  resolve_blocker: 'use `transition` (statuses)',
  scan: 'use the CLI `wolf scan`; `brief` rescans automatically on structural changes',
  insights: 'use the CLI `wolf analytics`',
  analytics: 'use the CLI `wolf analytics --json`',
  start_thinking: 'use the CLI `wolf think start`',
  add_thought: 'use the CLI `wolf think add`',
  conclude_thinking: 'use the CLI `wolf think conclude`',
  abandon_thinking: 'use the CLI `wolf think abandon`',
};

/**
 * P223 (спека 2.13 §6.2/§10.4): сообщение для вызова несуществующего тула —
 * вместо сухого «Tool X not found» агент получает каталог и migration-подсказку.
 */
export function mcpToolNotFoundMessage(name: string): string {
  const catalog = MCP_TOOL_NAMES.join('/');
  const removed = REMOVED_TOOL_HINTS[name];
  if (removed) {
    return `tool '${name}' was removed in wolf 2.13 — ${removed}. Available: ${catalog}.`;
  }
  return `unknown tool '${name}' — available: ${catalog}; create_* tools were removed in 2.13, use \`add\` (types) or \`transition\` (statuses)`;
}

/** Detail mcp_call по инструменту (args_summary/memory_id; body в телеметрию не попадает). */
const enrichDetail = (name: string, input: unknown): Record<string, unknown> => {
  const detail: Record<string, unknown> = { method: name, wolf_version: getWolfVersion() };
  if (name === 'add') {
    // то же деструктурирование, что в handler'е add: extra = per-type поля, body не нужен
    const { type, title, body, tags, confidence, importance, createdBy, ...extra } = input as {
      type: string;
      title: string;
      body?: string;
      tags?: string[];
      confidence?: 'low' | 'medium' | 'high';
      importance?: number;
      createdBy: string;
    } & Record<string, unknown>;
    detail.args_summary = addArgsSummary({ type, title, extra });
  } else if (name === 'get') {
    const id = (input as { id?: unknown }).id;
    if (typeof id === 'string') detail.memory_id = id;
  }
  return detail;
};

/**
 * T011: Standard Schema v1-обёртка над inputSchema. SDK валидирует input ДО вызова
 * handler'а — schema-фейлы не доходили до withMcpCall (error-rate add недоизмерался).
 * Обёртка: (а) нормализует camelCase-ключи add → snake_case (агенты путаются с
 * соседним create_info_request); (б) пишет mcp_call outcome=error при issues.
 * Дублей с withMcpCall нет: schema-failure → handler не вызывается.
 * jsonSchema делегируется zod-схеме — tools/list не меняется.
 */
const wrapInputSchema = (name: string, inner: unknown, baseDir: string): unknown => {
  const std = (
    inner as {
      readonly '~standard'?: {
        readonly validate: (value: unknown) => unknown;
        readonly jsonSchema?: unknown;
      };
    }
  )['~standard'];
  if (!std) return inner; // не-zod схема (fromJsonSchema и т.п.) — как есть
  return {
    ['~standard']: {
      version: 1,
      vendor: 'mister-wolf',
      validate: async (value: unknown): Promise<unknown> => {
        const normalized = name === 'add' ? normalizeAddInputKeys(value) : value;
        const result = await std.validate(normalized);
        const issues = (result as { issues?: unknown[] } | null | undefined)?.issues;
        if (Array.isArray(issues) && issues.length > 0) {
          try {
            appendMcpCallSignal(baseDir, {
              tool: name,
              outcome: 'error',
              durationMs: 0,
              detail: enrichDetail(name, normalized),
              error: {
                message: issues
                  .map((i) => String((i as { message?: unknown }).message ?? ''))
                  .join('; ')
                  .slice(0, 200),
              },
            });
          } catch {
            // телеметрия не должна ломать валидацию
          }
        }
        return result;
      },
      jsonSchema: std.jsonSchema,
    },
  };
};

export function registerMemoryTools(
  server: McpServer,
  deps: ReturnType<typeof createCliContainer>,
  baseDir: string
): void {
  // P1 D5: телеметрия mcp_call вокруг каждого handler'а. Дешёвая: appendMcpCallSignal
  // с signalKey(mcp_call) = null → без reparse лога; сбой телеметрии не ломает вызов.
  // Волна 0 0.1: обогащение detail по инструменту (args_summary/memory_id/memory_ids,
  // error.message/code + error_class_id — см. appendMcpCallSignal).
  const withMcpCall = (
    name: string,
    handler: (input: unknown) => Promise<unknown>
  ): ((input: unknown) => Promise<unknown>) => {
    const record = (
      outcome: 'ok' | 'error',
      startedAt: number,
      input: unknown,
      error?: unknown,
      extraDetail?: Record<string, unknown>
    ): void => {
      try {
        appendMcpCallSignal(baseDir, {
          tool: name,
          outcome,
          durationMs: Date.now() - startedAt,
          detail: { ...enrichDetail(name, input), ...extraDetail },
          ...(error !== undefined
            ? {
                error: {
                  message: error instanceof Error ? error.message : String(error),
                  code:
                    typeof (error as { code?: unknown })?.code === 'string'
                      ? (error as { code: string }).code
                      : undefined,
                },
              }
            : {}),
        });
      } catch {
        // телеметрия не должна ломать вызов
      }
    };
    return async (input: unknown) => {
      const startedAt = Date.now();
      try {
        const result = await handler(input);
        // search: id найденных объектов — из owned-формата текста `${id} [${type}] ${title}`;
        // непарсящиеся строки молча пропускаются
        let extra: Record<string, unknown> | undefined;
        if (name === 'search') {
          const text = (result as { content?: Array<{ text?: string }> })?.content?.[0]?.text;
          if (typeof text === 'string') {
            extra = {
              memory_ids: text
                .split('\n')
                .map((l) => l.match(/^([\w-]+) \[/)?.[1])
                .filter(Boolean)
                .slice(0, 10),
            };
          }
        }
        record('ok', startedAt, input, undefined, extra);
        return result;
      } catch (err) {
        record('error', startedAt, input, err);
        throw err;
      }
    };
  };

  const registered: string[] = [];
  const register = (
    name: string,
    config: { description: string; inputSchema: unknown },
    handler: (input: unknown) => Promise<unknown>
  ): void => {
    registered.push(name);
    // as never: registerTool перегружен (standard-schema + deprecated raw-shape),
    // Parameters<> берёт последний оверлоад и требует ZodRawShape — наши ZodObject туда не входят.
    // T011: inputSchema оборачивается (нормализация ключей add + телеметрия schema-фейлов).
    server.registerTool(
      name,
      { ...config, inputSchema: wrapInputSchema(name, config.inputSchema, baseDir) } as never,
      withMcpCall(name, handler) as never
    );
  };

  register(
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
      // P2 D1: авто-писатель memory_stage(retrieved); сбой телеметрии не ломает вызов
      if (results.length > 0) {
        try {
          appendMemoryStageSignal(baseDir, {
            stage: 'retrieved',
            memoryIds: results.map((r) => r.object.id),
            actor: 'system:wolf',
            sessionId: resolveSessionId(),
          });
        } catch {
          // телеметрия не должна ломать вызов
        }
      }
      const text = results.map((r) => `${r.object.id} [${r.object.type}] ${r.object.title}`).join('\n');
      return { content: [{ type: 'text' as const, text: text || 'No results.' }] };
    }
  );

  register(
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
      // P2 D1: объект найден → retrieved; not found → событие НЕ пишется
      try {
        appendMemoryStageSignal(baseDir, {
          stage: 'retrieved',
          memoryIds: [object.id],
          actor: 'system:wolf',
          sessionId: resolveSessionId(),
        });
      } catch {
        // телеметрия не должна ломать вызов
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(object, null, 2) }] };
    }
  );

  register(
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

  register(
    'add',
    {
      description: 'Add a generic memory object',
      inputSchema: MemoryAddInputSchema,
    },
    async (input: unknown) => {
      // rest = per-type поля таксономии; валидацию и required-логику делает домен
      const { type, title, body, tags, confidence, importance, createdBy, ...extra } = input as {
        type: string;
        title: string;
        body?: string;
        tags?: string[];
        confidence?: 'low' | 'medium' | 'high';
        importance?: number;
        createdBy: string;
      } & Record<string, unknown>;
      const result = await addMemoryObject(deps, {
        type: type as never,
        title,
        body,
        createdBy,
        tags,
        confidence,
        importance,
        extra,
      });
      return {
        content: [{ type: 'text' as const, text: `Created memory object: ${result.object.id}` }],
      };
    }
  );

  register(
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

  register(
    'brief',
    {
      description: 'Generate the agent brief from the latest scan and memory',
      inputSchema: EmptyInputSchema,
    },
    async () => {
      // T013/P105: инкрементальный скан — полный scanProject только при изменении
      // дерева (сигнатура каталогов/package.json/.git/HEAD), иначе персистный
      // кэш снапшота (.wolf/cache/scan-snapshot.json)
      const scanResult = await scanProjectCached(
        { ...deps, treeSignature: projectTreeSignature, snapshotCache: openScanSnapshotCache(baseDir) },
        baseDir
      );
      const brief = await generateAgentBrief(deps, baseDir, scanResult.snapshot);
      // P2 D1: бриф реально инъекцировал объекты → injected
      if (brief.injectedIds.length > 0) {
        try {
          appendMemoryStageSignal(baseDir, {
            stage: 'injected',
            memoryIds: brief.injectedIds,
            actor: 'system:wolf',
            sessionId: resolveSessionId(),
          });
        } catch {
          // телеметрия не должна ломать вызов
        }
      }
      return { content: [{ type: 'text' as const, text: brief.content }] };
    }
  );

  register(
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

  // P223: регистр обязан равняться каталогу MCP_TOOL_NAMES — рассинхрон ловится
  // здесь при старте сервера, а не в доке/у агентов (спека 2.13 §6.2).
  const actual = [...registered].sort().join(',');
  const expected = [...MCP_TOOL_NAMES].sort().join(',');
  if (actual !== expected) {
    throw new Error(`MCP catalog drift: registered [${actual}] != MCP_TOOL_NAMES [${expected}]`);
  }
}
