# MCP Server Integration Design

> Date: 2026-07-01
> Scope: Phase 7 — Integrations (MCP server)
> Status: Approved

## Goal

Expose Mr. Wolf's project semantic memory through the Model Context Protocol (MCP) so that host tools such as OpenCode, Claude Code, Cursor, and Codex can read and write memory objects directly, without shelling out to the CLI.

## Architecture

Mr. Wolf keeps its hexagonal structure. The MCP server is a new **inbound adapter** that sits alongside the existing CLI adapter. It reuses the same use-cases and container.

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Host tool     │────▶│  MCP stdio       │────▶│  MCP tools      │
│ (OpenCode etc.) │     │  transport       │     │  (adapters/mcp) │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
                                               ┌─────────────────┐
                                               │  app/use-cases  │
                                               └────────┬────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │  domain / ports  │
                                               └─────────────────┘
```

## Files

- `src/adapters/mcp/mcp-server.ts` — builds and configures `McpServer`, registers all tools
- `src/adapters/mcp/mcp-tools.ts` — tool definitions and handlers; maps MCP tool calls to use-cases
- `src/adapters/mcp/mcp-schemas.ts` — JSON Schema inputs for each tool, derived from existing Zod v3 types
- `src/bootstrap/mcp.ts` — entry point that wires `StdioServerTransport`
- `src/adapters/cli/commands/memory-mcp.ts` — optional `wolf mcp` CLI alias that spawns the same server
- `tests/unit/adapters/mcp-server.test.ts` — in-memory server tests
- `tests/integration/mcp-stdio.test.ts` — stdio JSON-RPC integration test

## Transport

Use **stdio** transport only. The host launches `node dist/bootstrap/mcp.js` in the project directory. The server uses `process.cwd()` as the project root and creates the CLI container from it.

## Tools (mirror of CLI)

| Tool                         | Use-case                 | Notes                                   |
| ---------------------------- | ------------------------ | --------------------------------------- |
| `memory_search`              | `searchMemory`           | query + optional filters                |
| `memory_list`                | `listMemoryObjects`      | filters by type/status/stale/governance |
| `memory_get`                 | `getMemoryObject`        | by id                                   |
| `memory_add`                 | `addMemoryObject`        | generic object creation                 |
| `memory_transition`          | `transitionMemoryObject` | lifecycle transitions                   |
| `memory_create_thread`       | `createWorkThread`       |                                         |
| `memory_create_info_request` | `createInfoRequest`      |                                         |
| `memory_create_article`      | `createArticle`          |                                         |
| `memory_create_decision`     | `createDecision`         |                                         |
| `memory_create_blocker`      | `createBlocker`          |                                         |
| `memory_resolve_blocker`     | `resolveBlocker`         |                                         |
| `memory_scan`                | `scanProject`            | scans current directory                 |
| `memory_brief`               | `generateAgentBrief`     | returns brief text                      |

Resources and prompts are **out of scope** for this iteration to keep the surface small and the adapter focused.

## Input schemas

Tool inputs are declared as JSON Schema objects in `mcp-schemas.ts`. They are derived from existing Zod v3 schemas and CLI option signatures. Example:

```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string" },
    "type": { "type": "string" },
    "status": { "type": "string" },
    "confidence": { "type": "string", "enum": ["low", "medium", "high"] },
    "tags": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["query"]
}
```

## Error handling

- Validation errors and missing objects are returned as tool errors with a clear text message.
- Unexpected exceptions are caught at the tool handler level and returned as MCP `CallToolResult` with `isError: true`.
- No stack traces are leaked to the host.

## Testing

- **Unit:** instantiate `McpServer` in-process, call `server.server.callTool`, assert on returned content. Use temporary directories for each test.
- **Integration:** spawn `node dist/bootstrap/mcp.js` as a child process, send JSON-RPC `initialize` and `tools/call` messages over stdin/stdout, verify responses.

## Dependencies

Add to `package.json`:

```json
"@modelcontextprotocol/server": "^2.0.0-alpha.2"
```

Keep existing `zod` v3. Do **not** add `zod/v4`.

## CLI alias

Add `wolf mcp` command that simply runs the same bootstrap module. This gives users a discoverable way to start the server manually for debugging.

## Security

- The server only accesses files under `process.cwd()` via the existing `MarkdownMemoryStore` and `SQLiteSearchIndex`.
- All writes go through existing use-cases and event-logging.
- No arbitrary file-path parameters are accepted from tool inputs.

## Out of scope

- SSE or HTTP transport
- MCP resources and prompts
- Tool authentication or per-tool permissions
- IDE/CI hooks and export formats (covered by later Phase 7 sub-projects)

## Success criteria

1. `node dist/bootstrap/mcp.js` starts and responds to `initialize` over stdio.
2. All 13 tools can be called in-memory and return correct text results.
3. `wolf mcp` command exists and launches the server.
4. `npm run check` passes.
