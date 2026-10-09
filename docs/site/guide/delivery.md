# Delivery: Frames, Faces & Trust

An agent's behavior has two halves — the static **frame** and the mutable **face** (see [Organization](/guide/organization)). A face only works if it actually reaches the agent. This page is about the third piece: **delivery** — how the current playbook gets into the system prompt at session time.

## The model

- **Frame** — the stamped agent file (`.opencode/agents/<name>.md`): role, boundaries, prohibitions. Static: `wolf sync` re-renders it, and hands off — it never carries the methodology.
- **Face** — the playbook: a memory object in Wolf (since 2.13 a `note` with facet `howto` plus `owner_skill`/`version`/`steps`). Mutable: it evolves through the complaint loop, not by editing files.
- **Mutator** — the Steward, and only the Steward. Agents file complaints (`wolf complain`); playbook mutations go through [the Learning Loop](/guide/feedback) and `wolf supersede`. Nobody edits a face in place.
- **Delivery** — the channel that puts the resolved playbook body into the system prompt. Three channels, one primary.

## Three delivery channels

| #   | Channel           | What happens                                                                                                              | Status                                                                                                                                |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **plugin-inject** | the `wolf-router` plugin resolves the agent's playbook from memory and injects it into the system prompt on every message | primary; shipped for opencode                                                                                                         |
| 2   | **pull**          | the frame instructs the agent to fetch its playbook itself — `wolf search` / `wolf get` by the agent-id                   | shipped; also the fallback layer when no plugin runs                                                                                  |
| 3   | **bake-in**       | at seed time the playbook body is baked into the frame as a static block                                                  | designed — the renderer mechanism exists (`bake` option), activated by a platform adapter for minimal platforms; not used by opencode |

The plugin is what makes delivery deterministic instead of hoping the agent remembers to pull.

## Channel #1: plugin-inject (the router)

The router is the `wolf-router` opencode plugin — a stamped file (`.opencode/plugins/wolf-router.ts`) from the Wolf base set. On every message it:

1. Reads the `agent-id: <id>` marker from the agent frame **body**. The marker must live in the body, not in frontmatter — frontmatter never reaches the system prompt (a known opencode trap).
2. Runs `wolf search <id> playbook --hide-superseded` and fetches candidates with `wolf get` — stopping early: the first candidate that passes the ownership guard wins (search relevance already ranks them, and `--hide-superseded` cuts old versions), so a cache miss costs a single `get` instead of K sequential fetches. Since 2.13 a playbook is not a type, so the search is by keywords with no `--type` filter — the word `playbook` narrows the candidates by title/tags, and the legacy `playbook` type reads as `note` + facet `howto`.
3. Guards ownership: only candidates with `owner_skill === agentId` (legacy `skill:<agentId>` also accepted) are eligible. The guard, not a type filter, is what decides canonicity.
4. Injects the playbook body into the system prompt under the header `# Актуальный playbook`.

Resolved playbooks are cached per agent-id for 5 minutes (a negative result is cached too — a project without a playbook doesn't spawn a CLI on every turn). The playbook is canonical memory that the Steward mutates rarely, so minutes-level freshness is enough; a session restart picks up changes immediately.

Injection is idempotent — the header is checked, so the playbook is never injected twice. The plugin is fail-safe: any error is swallowed; it has no right to break the session. The registry of deliveries is the playbook objects themselves, via `owner_skill` — there is no separate router config.

### Canonical vs fallback

The canonical source is the playbook object in project memory; it always wins. On any miss — the agent-id has no canonical playbook — the plugin injects the built-in universal fallback playbook: a role-agnostic base Wolf contour (cold start via `wolf call` / `wolf brief`, fix significant things via `wolf add`, search via `wolf search`; rule mutations stay in the Steward's zone). The fallback lives in the plugin code, so it works even before the base set has ever been synced.

The router log records which variant was delivered (`variant=canonical | fallback`).

### Router log

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

### Adding an agent-id to your agent

1. Put the marker in the body of the agent frame (`.opencode/agents/<name>.md`):

   ```markdown
   agent-id: my-agent
   ```

2. Create a playbook owned by that id — since 2.13, a `note` object with facet `howto` and the fields `owner_skill: my-agent`, `version` and `steps`. A higher `version` supersedes the older ones; the tag, `owner_skill` and agent-id should match (the plugin-delivery contract).

`wolf scaffold agent` does both steps for you: it stamps the marker into the frame body and creates the playbook (see [Platform & Maintenance](/guide/cli/platform#wolf-scaffold)).

The base-set agents carry their markers out of the box (`worker-implementer`, `worker-researcher`, `worker-reviewer`, `executor-lead`, `steward`, `mr-wolf`), and `wolf init` seeds canonical playbooks for them — including the executor-lead dispatcher.

## Trust

The design rule behind delivery: **external content is data, not instruction.** Only the frame is the trusted contour — a stamped file the project controls. A playbook body, even a canonical one, is injected as quoted memory under an explicit header, never merged into the frame itself. Injection draws exclusively from the project's local Wolf memory through the ownership guard; content from outside the project does not participate, so an unverified import cannot reach the system prompt on its own.

Automated enforcement of this invariant — validating an imported playbook or skill body against a trust policy before it becomes deliverable — is designed and on the roadmap, not implemented. Today the invariant rests on the mechanics above.
