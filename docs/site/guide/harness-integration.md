# Harness integration

This page is for authors connecting an agent environment to Wolf. The integration should preserve project state and deliver the right context while keeping the user's workflow simple. Access to memory through MCP is distinct from full role orchestration and playbook delivery.

## Choose the integration depth

| Integration              | Responsibility                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| CLI or MCP memory access | Read and update project memory through supported operations                                 |
| Context delivery         | Supply relevant project state and the current methodology to a session                      |
| Agent organization       | The two-level organization: a lead hires bounded wolf-* executors directly; bounded task inputs, result contracts and independent acceptance |
| Improvement loop         | Accept authorized feedback (the Steward is temporarily paused in 3.0.0); deliver resulting face versions |

OpenCode is the main operating integration. An MCP connection on another platform does not by itself reproduce every OpenCode plugin or delegation feature. See [MCP](/guide/mcp), [Base Set](/guide/base-set) and [Delivery & Trust](/guide/delivery).

## Session identity

The CLI respects an explicitly supplied `WOLF_SESSION`; otherwise a process receives a generated `cli-<uuid>` key. OpenCode plugins supply `opc-<uuid>` keys on CLI spawns. Do not reuse one global key for every unrelated task or invent a confirmed model/variant when the harness does not expose it.

The long-lived MCP server writes events with `session_id: null` rather than falsely treating all requests as one user session. Current key and channel behavior: [Telemetry](/guide/telemetry).

`WOLF_ACTOR` identifies the actor for operations that support it; an explicit command actor option can override it. Consult the command's help rather than assuming all channels accept the same flags.

## Usage and delivery are different events

Memory commands automatically record retrieval/delivery stages. An object returned by a search has been retrieved; a delivered object has reached context. Neither establishes that the agent followed or applied it.

The former manual `memory-stage` and `coord` commands were removed. Existing stage and coordination events can still be read by analytics, but their presence does not imply a current manual writer or complete trace coverage.

Use the supported local OpenCode importer for finished assistant-turn usage:

```bash
wolf usage import --dry-run
```

Review the selected database and time window before an actual import. The command reads the local database and appends usage signals; it does not rerun tasks. Source support, deduplication, missing variant information and other limits are documented in [Telemetry](/guide/telemetry).

## Record actual acceptance

For a real evaluated task, `wolf task-eval` records the verdict and optional task/session/campaign identity. Pick the scorer that actually evaluated the artifact. Keep verification evidence with the task: the telemetry entry is an observation, not the check itself.

For optional comparisons, use separate sessions for different campaign conditions. Attribution joins by recorded session identity; unknown identities and incomplete source coverage must remain visible. See [Analytics](/guide/analytics).

## Event contracts for integration authors

Use the application's signal writer and current schema when integrating in code. The source is [`session-metrics-log.ts`](https://github.com/chekh/mister-wolf/blob/main/src/adapters/fs/session-metrics-log.ts). Events contain a timestamp, event kind, session identity, model/agent information and orchestration actor; schema-v2 identity fields support deduplication and task association.

Unknown fields are stripped on read. Schema compatibility is not permission to record secrets or full prompts. Keep telemetry failures isolated from the primary task and avoid a second competing log of project state. Event fields and privacy constraints belong to [Telemetry](/guide/telemetry); exact CLI options belong to the [command reference](/guide/cli/command-reference).

## Preserve recovery boundaries

A checkpoint should state the goal, accepted decisions, completed work, remaining questions and artifact locations. A fresh worker receives the bounded task context; a continuation receives the still-unaccepted result's state. Sharing a worktree memory root does not isolate all reads; follow [Read Isolation](/guide/read-isolation).

A saved checkpoint supports semantic recovery. It does not prove an old writer has stopped, transfer execution ownership automatically or provide durable-process crash recovery. The harness and task protocol must handle those responsibilities explicitly.
