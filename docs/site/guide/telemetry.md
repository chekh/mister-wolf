# Telemetry

Mr. Wolf measures its own usage — locally, deterministically, without an LLM in the logging path. This page documents what lands in `.wolf/`, which fields each event carries, and how to read the data back. Nothing leaves your machine.

## What is logged

| File                                  | Writer                                                            | Content                                          |
| ------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| `.wolf/metrics/session-metrics.jsonl` | Wolf itself: CLI commands, MCP handlers, the brief/call injectors | append-only JSONL signal log, one event per line |
| `.wolf/router.log`                    | the `wolf-router` opencode plugin                                 | playbook routing decisions (hit/miss per agent)  |

The signal log is the canonical telemetry source. A malformed line never breaks the loop: it is counted (`malformedLines`) and skipped.

This page covers the two events you will actually meet: `mcp_call` — every tool/command invocation — and `delivery` — memory injected into an agent's context.

## mcp_call

Written on every invocation of a `mr-wolf_*` MCP tool and of the instrumented CLI commands (`add`, `get`, `list`, `search`, `call`, `brief`). Top-level fields: `tool_name`, `duration_ms`, `outcome` (`ok` \| `error`; `error` only when the handler throws — a textual "not found" is `ok`) and the actor (`system:wolf` over MCP, `user:cli` for the CLI channel).

`detail` fields:

| Field            | Semantics                                                                    | Channel  |
| ---------------- | ---------------------------------------------------------------------------- | -------- |
| `method`         | invoked method / command name                                                | both     |
| `wolf_version`   | runtime Wolf version (from package.json)                                     | both     |
| `args_summary`   | `add` only: `{type ≤40 chars, title ≤80 chars, extra_keys}` — never the body | both     |
| `memory_id`      | `get` only: the requested id                                                 | both     |
| `memory_ids`     | `search` only: ids of the results, first 10                                  | both     |
| `cli_command`    | command name                                                                 | CLI only |
| `error.message`  | on error: the message, truncated to 200 chars                                | both     |
| `error.code`     | on error: the machine code, when present                                     | both     |
| `error_class_id` | on error: the deterministic error class (same classifier as `tool_error`)    | both     |

## delivery

Written when memory is actually delivered into an agent's context (`wolf brief` / `wolf call` injections, skill and frame delivery):

| Field                    | Semantics                                                    |
| ------------------------ | ------------------------------------------------------------ |
| `detail.name`            | what was delivered (memory object name)                      |
| `detail.mechanism`       | `skill` \| `frame` \| `plugin` \| `search` \| `call`         |
| `detail.target`          | delivery target, truncated to 200 chars                      |
| `detail.injection_bytes` | payload size in bytes                                        |
| `session_id`             | session key on the CLI channel (`null` over MCP — see below) |

## Session keys

- `cli-<uuid>` — produced by the CLI itself, one per invocation: a single CLI process gets a single stable id shared by all its telemetry writers. An explicitly exported `WOLF_SESSION` is never overwritten.
- `opc-<uuid>` — passed by the stamped opencode plugins (`wolf-router`, `wolf-session-start`) on every CLI spawn. A long-lived opencode process inheriting one env var would otherwise fake a single session for all deliveries. Template updates arrive with `wolf sync`.
- MCP channel — no session by design: `wolf mcp` is a long-lived server with one environment for all requests, so a single session id would be false attribution. Its events carry `session_id: null`.

## Privacy notes

- Everything is local: `.wolf/` inside your project; no network calls, no telemetry exports.
- `target` is truncated to 200 characters — full prompts are never logged.
- The memory `body` never enters telemetry: `args_summary` carries only the type, the title and the extra keys.
- `error.message` is truncated to 200 characters.
- Unknown fields are stripped by the read schema — the log is append-only and derived (safe to delete, rebuilt by usage).

## Reading it back

The `acceptance` analytics view turns these raw events into machine-checkable metrics — router miss-rate per agent, per-tool error rates and p50/p90 latency, delivery bursts, search→get follow rate, 72 h vitality:

```bash
wolf analytics --view acceptance --json
```

The same view is available over MCP (`mr-wolf_analytics` with `view: "acceptance"`). What the metrics mean: [Analytics — machine acceptance](/guide/cli/analytics#machine-acceptance).
