# Router

Playbooks only help if they reach the agent. The router is the delivery layer: the `wolf-router` opencode plugin — a stamped file (`.opencode/plugins/wolf-router.ts`) from the Wolf base set — resolves the agent's current playbook and injects it into the system prompt on every message. Deterministic delivery instead of hoping the agent remembers to run `wolf search`.

## How it works

On every message the plugin:

1. Reads the `agent-id: <id>` marker from the agent frame **body**. The marker must live in the body, not in frontmatter — frontmatter never reaches the system prompt (a known opencode trap).
2. Runs `wolf search <id> --type playbook` and fetches candidates with `wolf get` — stopping early: the first candidate that passes the ownership guard wins (search relevance already ranks them, and `--hide-superseded` cuts old versions), so a cache miss costs a single `get` instead of K sequential fetches.
3. Guards ownership: only playbooks with `owner_skill === agentId` (legacy `skill:<agentId>` also accepted) are eligible.
4. Injects the playbook body into the system prompt under the header `# Актуальный playbook`.

Resolved playbooks are cached per agent-id for 5 minutes (a negative result is cached too — a project without a playbook doesn't spawn a CLI on every turn). The playbook is canonical memory that the Steward mutates rarely, so minutes-level freshness is enough; a session restart picks up changes immediately.

Injection is idempotent — the header is checked, so the playbook is never injected twice. The plugin is fail-safe: any error is swallowed; it has no right to break the session. The registry of deliveries is the playbook objects themselves, via `owner_skill` — there is no separate router config.

## Canonical vs fallback

The canonical source is the playbook object in project memory; it always wins. On any miss — the agent-id has no canonical playbook — the plugin injects the built-in universal fallback playbook: a role-agnostic base Wolf contour (cold start via `wolf call` / `wolf brief`, fix significant things via `wolf add`, search via `wolf search`; rule mutations stay in the Steward's zone). The fallback lives in the plugin code, so it works even before the base set has ever been synced.

The router log records which variant was delivered (`variant=canonical | fallback`).

## Router log

Every routing decision is appended to `.wolf/router.log`:

```text
<ISO> agent-id=<id> playbook=hit name=<mem-id|fallback> variant=canonical|fallback injected=yes ms=<resolve-ms> bytes=<body-bytes>
<ISO> agent-id=<id> playbook=miss injected=no
```

- `hit` + `name=<mem-id> variant=canonical` — the canonical playbook was injected.
- `hit` + `name=fallback variant=fallback` — no canonical playbook; the built-in fallback was injected.
- `miss` — nothing was injected: neither canonical nor fallback answered. The current plugin version does not emit this line (a CLI failure resolves to the fallback playbook); the format is kept for compatibility with logs written by older versions.
- `ms=` / `bytes=` — how long the resolve took (milliseconds) and the size of the injected body (bytes). Lines written by older versions don't carry these fields; the parser is k=v-tolerant in both directions.

The `ms=` field is the latency source for the wave acceptance threshold (router resolve p90 < 500 ms), and `bytes=` feeds the average injection size in the [delivery panel](/guide/cli/analytics#delivery-panel):

```bash
wolf analytics --view delivery --json
```

The miss-rate per agent-id remains part of the acceptance metrics (`wolf analytics --view acceptance --json`).

The log's place in telemetry is covered in [Telemetry](/guide/telemetry), the metrics in [Analytics — machine acceptance](/guide/cli/analytics#machine-acceptance).

## Adding an agent-id to your agent

1. Put the marker in the body of the agent frame (`.opencode/agents/<name>.md`):

   ```markdown
   agent-id: my-agent
   ```

2. Create a playbook owned by that id — a playbook memory object with `owner_skill: my-agent`. A higher `version` supersedes the older ones; the tag, `owner_skill` and agent-id should match (the plugin-delivery contract).

`wolf scaffold agent` does both steps for you: it stamps the marker into the frame body and creates the playbook (see [Platform & Maintenance](/guide/cli/platform#wolf-scaffold)).

The base-set agents carry their markers out of the box (`worker-implementer`, `worker-researcher`, `worker-reviewer`, `executor-lead`, `steward`, `mr-wolf`), and `wolf init` seeds canonical playbooks for them — including the executor-lead dispatcher.
