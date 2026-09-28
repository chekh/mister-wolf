# Router

Playbooks only help if they reach the agent. The router is the delivery layer: the `wolf-router` opencode plugin — a stamped file (`.opencode/plugins/wolf-router.ts`) from the Wolf base set — resolves the agent's current playbook and injects it into the system prompt on every message. Deterministic delivery instead of hoping the agent remembers to run `wolf search`.

## How it works

On every message the plugin:

1. Reads the `agent-id: <id>` marker from the agent frame **body**. The marker must live in the body, not in frontmatter — frontmatter never reaches the system prompt (a known opencode trap).
2. Runs `wolf search <id> --type playbook` and fetches each candidate with `wolf get`.
3. Guards ownership: only playbooks with `owner_skill === agentId` (legacy `skill:<agentId>` also accepted) are eligible.
4. Picks the highest `version` among the eligible ones.
5. Injects the playbook body into the system prompt under the header `# Актуальный playbook`.

Injection is idempotent — the header is checked, so the playbook is never injected twice. The plugin is fail-safe: any error is swallowed; it has no right to break the session. The registry of deliveries is the playbook objects themselves, via `owner_skill` — there is no separate router config.

## Canonical vs fallback

The canonical source is the playbook object in project memory; it always wins. On any miss — the agent-id has no canonical playbook — the plugin injects the built-in universal fallback playbook: a role-agnostic base Wolf contour (cold start via `wolf call` / `wolf brief`, fix significant things via `wolf add`, search via `wolf search`; rule mutations stay in the Steward's zone). The fallback lives in the plugin code, so it works even before the base set has ever been synced.

The router log records which variant was delivered (`variant=canonical | fallback`).

## Router log

Every routing decision is appended to `.wolf/router.log`:

```text
<ISO> agent-id=<id> playbook=hit name=<mem-id|fallback> variant=canonical|fallback injected=yes
<ISO> agent-id=<id> playbook=miss injected=no
```

- `hit` + `name=<mem-id> variant=canonical` — the canonical playbook was injected.
- `hit` + `name=fallback variant=fallback` — no canonical playbook; the built-in fallback was injected.
- `miss` — nothing was injected: neither canonical nor fallback answered. Rare — a CLI refusal; the agent frame then falls back to calling `wolf search` itself.

The miss-rate per agent-id is part of the acceptance metrics:

```bash
wolf analytics --view acceptance --json
```

The log's place in telemetry is covered in [Telemetry](/guide/telemetry), the metrics in [Analytics — machine acceptance](/guide/cli/analytics#machine-acceptance).

## Adding an agent-id to your agent

1. Put the marker in the body of the agent frame (`.opencode/agents/<name>.md`):

   ```markdown
   agent-id: my-agent
   ```

2. Create a playbook owned by that id — a playbook memory object with `owner_skill: my-agent`. A higher `version` supersedes the older ones; the tag, `owner_skill` and agent-id should match (the plugin-delivery contract).

`wolf scaffold agent` does both steps for you: it stamps the marker into the frame body and creates the playbook (see [Platform & Maintenance](/guide/cli/platform#wolf-scaffold)).

The base-set agents carry their markers out of the box (`worker-implementer`, `worker-researcher`, `worker-reviewer`, `executor-lead`, `steward`, `mr-wolf`), and `wolf init` seeds canonical playbooks for them — including the executor-lead dispatcher.
