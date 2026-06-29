# Design Spec: Project Semantic Memory Core

**Date:** 2026-06-29
**Status:** Draft for review
**Topic:** Pivot Mr. Wolf from universal agent orchestrator to local-first Project Semantic Memory layer for AI coding agents.

---

## 1. Purpose

Mr. Wolf becomes a **local-first Project Semantic Memory layer** that turns project documentation, decisions, plans, notes, agent sessions, lessons, and code-linked artifacts into governed, searchable, agent-readable memory objects.

It is not another agent. It is a memory substrate that existing agents (OpenCode, Claude Code, Codex, Cursor) can read and write through CLI and, later, MCP.

**Architecture decision:** Mr. Wolf will be implemented as a modular monolith with clean internal boundaries. The project will not use workspaces/packages during the current phase. Instead, the codebase will be organized around a stable domain model and use-cases. CLI and MCP are inbound adapters; filesystem and SQLite are outbound adapters. Markdown memory objects are the operational source of truth; SQLite is a disposable derived index. This keeps development fast while allowing future extraction into `@mr-wolf/core`, `@mr-wolf/cli`, and `@mr-wolf/mcp`.

---

## 2. Core Principles

1. **Project-first, not agent-first.** Memory belongs to the project, not to a specific agent or conversation.
2. **Memory object files are the operational source of truth.** Markdown objects and YAML frontmatter are canonical. The JSONL event log is an immutable audit trail. SQLite and any future indexes are derived caches and may be rebuilt at any time.
3. **Thin adapters, thick domain.** CLI and MCP contain no business logic. They call the same use-cases.
4. **Inbound vs outbound adapters.** CLI and MCP are inbound adapters. Filesystem and SQLite are outbound adapters.
5. **Governed write protocol.** Not everything is stored — only knowledge that changes project understanding, explains decisions, prevents repeated mistakes, or links documents and code.
6. **Memory invalidation, not deletion.** Outdated memory is superseded or invalidated, never silently erased.
7. **Progressive indexing.** Start with file paths, tags, and FTS5. Embeddings and graph retrieval are optional later.

---

## 3. Non-Goals

For the current phase the following are explicitly out of scope:

- Autonomous orchestrator or multi-agent crew runtime.
- Mandatory vector database or graph database.
- Web UI.
- Full planning engine.
- Automatic code modification by Mr. Wolf itself.
- Remote A2A agents.
- Enterprise RBAC.

---

## 4. Memory Object Model

### 4.1. Base Memory Object

A memory object is a Markdown file with YAML frontmatter.

```yaml
---
id: mem_2026_06_29_router_reconnect
type: lesson
title: Router reconnect failure mode
status: active
review_state: accepted
confidence: high
importance: 0.82
created_at: 2026-06-29T14:00:00Z
updated_at: 2026-06-29T14:00:00Z
created_by: user:chekh
schema_version: 1
source:
  kind: session
  path: .wolf/memory/objects/sessions/2026-06-29-router-work.md
related:
  files:
    - src/router/reconnect.ts
  docs:
    - docs/architecture/router.md
  decisions:
    - mem_2026_06_28_router_retry_policy
tags:
  - router
  - reconnect
  - failure
superseded_by: null
---
# Router reconnect failure mode

During the reconnect investigation, we found that...
```

### 4.2. Initial Types

Only six types for MVP-A:

- `document` — existing project docs/specs/notes brought into memory view.
- `decision` — ADR-like records: what was decided, why, constraints.
- `lesson` — things learned, especially from failed attempts or surprises.
- `observation` — facts about the project, codebase, or environment.
- `session-summary` — summary of an agent session and its outcomes.
- `open-question` — unresolved questions with context.

Future types (not now): `failed-attempt`, `constraint`, `research-note`, `plan`, `artifact`, `spec-link`.

### 4.3. Status Lifecycle

```text
active → superseded
```

- `status` — lifecycle of the knowledge itself:
  - `active` — currently trusted.
  - `superseded` — replaced by another memory object; pointer stored in `superseded_by`.
- `review_state` — trust level of the entry:
  - `accepted` — reviewed or created by a human.
  - `proposed` — created by an agent, awaiting review.
  - `rejected` — explicitly excluded from active context.

`invalidated` status is deferred to MVP-D (Memory Governance). For MVP-A the default `review_state` is `accepted` for human-created objects and `proposed` for agent-created objects. Search returns only `active` objects by default and respects caller policy on `review_state`.

### 4.4. Memory Event

Every mutation of memory creates an append-only event in `.wolf/memory/events.jsonl`:

```json
{
  "id": "evt_2026_06_29_abc123",
  "type": "memory.added",
  "timestamp": "2026-06-29T14:00:00Z",
  "actor": "user:chekh",
  "payload": {
    "memory_id": "mem_2026_06_29_router_reconnect"
  }
}
```

---

## 5. Storage Model

### 5.1. Project Layout

```text
.wolf/
  config.yaml

  memory/
    events.jsonl

    objects/
      decisions/
      lessons/
      observations/
      sessions/
      documents/
      questions/

    briefs/
      project-brief.md
      agent-brief.md
      active-warnings.md

  cache/
    index.sqlite
```

### Type-to-Directory Mapping

| Type              | Directory               |
| ----------------- | ----------------------- |
| `decision`        | `objects/decisions/`    |
| `lesson`          | `objects/lessons/`      |
| `observation`     | `objects/observations/` |
| `session-summary` | `objects/sessions/`     |
| `document`        | `objects/documents/`    |
| `open-question`   | `objects/questions/`    |

External documents (`docs/`, `adr/`, etc.) are registered as `document` objects by reference. The scanner must not copy or rewrite user-managed files by default. A `document` object stores source path, content hash, optional summary, and links, but not the full duplicated content.

### 5.2. Source of Truth

- `.wolf/memory/**/*.md` — memory objects (operational source of truth).
- `.wolf/memory/events.jsonl` — immutable audit trail of memory mutations.
- `docs/`, `specs/`, `adr/`, `plans/`, `notes/` in project root — user-managed documents registered by reference, not copied.

### 5.3. Derived Cache

- `.wolf/cache/index.sqlite` — FTS5 index, tags, related links, ranking signals. May be deleted and rebuilt at any time.

---

## 6. Indexing Model

MVP-A indexing is file-based and FTS5:

- Each memory object is parsed from Markdown.
- Frontmatter fields `id`, `type`, `status`, `review_state`, `tags`, `title`, `related.*` are extracted.
- Full text of `title + body` is indexed with SQLite FTS5.
- `related.files` paths are stored as code links.
- Search returns ranked results by FTS rank, tag overlap, and recency.
- Default search returns only `status: active` objects. `review_state` filtering depends on caller policy.
- Superseded objects are hidden unless `--include-superseded` is passed.

Embeddings and graph indexes are deferred.

---

## 7. Architecture

### 7.1. Layer Direction

```text
              bootstrap
                 |
        --------------------
        |                  |
  inbound adapters   outbound adapters
  cli / mcp          fs / sqlite
        |                  |
        v                  v
              app/use-cases
                   |
        --------------------
        |                  |
     domain             ports
```

Dependency rule:

```text
domain imports nothing.
app imports domain and ports.
adapters import ports (and app DTOs where needed).
bootstrap wires adapters into use-cases.
CLI and MCP import only use-cases or the container.
```

Ports are contracts owned by the application core; adapters implement them.

### 7.2. Directory Layout

```text
src/
  domain/
    memory-object/     # entity, invariants, value objects
    memory-link/       # link entity and validation
    memory-event/      # event types and factories
    memory-types/      # base types, enums
    policies/          # write protocol rules
    schemas/           # Zod schemas for domain

  app/
    use-cases/         # one file per use-case
    services/          # memory-service, relevance-service, stale-memory-service

  ports/
    memory-store.port.ts
    event-log.port.ts
    search-index.port.ts
    project-scanner.port.ts
    file-system.port.ts
    clock.port.ts
    id-generator.port.ts
    brief-renderer.port.ts

  adapters/
    fs/
      markdown-memory-store.ts
      jsonl-event-log.ts
      project-file-scanner.ts
      brief-renderer.ts

    sqlite/
      sqlite-search-index.ts
      sqlite-schema.ts

    cli/
      commands/
      cli-entry.ts

    mcp/
      mcp-server.ts
      mcp-tools.ts

  bootstrap/
    create-container.ts
    cli.ts
    mcp.ts

  config/
    wolf-config.ts
```

### 7.3. Dependency Rules

- `domain` imports nothing from `app`, `ports`, or `adapters`.
- `app` imports `domain` and `ports` only.
- `adapters` import `app`, `ports`, and `domain`.
- `bootstrap` wires everything.
- CLI and MCP import only use-cases or the container.

---

## 8. Use-Cases

MVP-A commands map to use-cases:

- `init-project-memory.ts` — create `.wolf/memory` structure and config.
- `add-memory-object.ts` — create a memory object and append event.
- `search-memory.ts` — query FTS index and return ranked objects.
- `get-memory-object.ts` — load object by id.
- `link-memory-object.ts` — add code/doc/decision link to an object.
- `build-agent-brief.ts` — generate `agent-brief.md` from active memory.
- `supersede-memory-object.ts` — mark old object superseded by new.
- `scan-project.ts` — discover external docs and register them as `document` objects.
- `validate-memory.ts` — check object against write protocol.

---

## 9. CLI Interface

```bash
wolf memory init
wolf memory add --type lesson
wolf memory list [--type lesson] [--status active]
wolf memory search "router reconnect"
wolf memory search "router reconnect" --type lesson --related-file src/router/index.ts
wolf memory get <id>
wolf memory link <id> src/router/index.ts
wolf memory brief                       # prints project brief to stdout
wolf memory brief --for-agent <name>    # prints agent brief to stdout
wolf memory brief --write .wolf/memory/briefs/project-brief.md
wolf memory scan
wolf memory supersede <old-id> <new-id>
wolf memory rebuild-index
```

MCP tools mirror use-cases:

- `memory.search`
- `memory.get`
- `memory.add_observation`
- `memory.add_decision`
- `memory.add_lesson`
- `memory.link_to_code`
- `memory.get_project_brief`
- `memory.get_active_warnings`
- `memory.supersede`

---

## 10. Write Protocol

A memory object is accepted only if it satisfies at least one of:

- Changes understanding of the project.
- Explains a decision or constraint.
- Prevents repetition of a mistake.
- Links documents, code, or decisions.
- Contains useful context for a future agent.

The `validate-memory.ts` use-case encodes these rules as warnings, not hard blocks. A hard block applies only to malformed required fields (`id`, `type`, `title`, `created_at`).

---

## 11. Rebuild / Recovery Rules

1. Deleting `.wolf/cache/` must never destroy canonical memory.
2. `wolf memory rebuild-index` scans `.wolf/memory/**/*.md` and rebuilds `.wolf/cache/index.sqlite`.
3. Events are replayed only for audit or diagnostics; object files are the operational truth. Event sourcing is intentionally not used as a state-reconstruction mechanism in MVP.

---

## 12. Roadmap

### Phase 1 — Reframe

Rewrite README to reflect new positioning. Archive old concept docs to `docs/archive/` and old specs to `docs/superpowers/archive/`. Remove or deprecate orchestrator-related commands from CLI. Publish new `docs/concept-v3.md` with the Project Semantic Memory vision.

### Phase 2 — Core Memory

Domain model, Markdown storage, JSONL event log, CLI commands `init`, `add`, `list`, `get`, `validate`.

### Phase 3 — Index & Search

`rebuild-index`, SQLite FTS5 index, `search`, tags, related links, ranking.

### Phase 4 — Project Scan

`scan` registers external docs by reference, detects orphan docs and missing memory links.

### Phase 5 — Agent Brief (MVP-B)

`brief` prints to stdout, `brief --write`, `export AGENTS.md`, `active-warnings.md`.

### Phase 6 — Case Learning (MVP-C)

`session-summary`, lessons, decisions, observations, `supersede`.

### Phase 7 — Memory Governance (MVP-D)

`check-before-edit`, stale-memory detection, `invalidated` status, confidence/importance decay.

### Phase 8 — Code Linking (MVP-E)

Memory object → file, memory object → symbol, optional code-intelligence backends.

### Phase 9 — Integrations

MCP server verified for OpenCode, Claude Code, Codex, Cursor.

---

## 13. Archive / Repurpose

### Archive (remove from active surface)

- Workflow engine, runners, graph orchestration.
- Agent registry, model router, model providers.
- Streaming model response code.
- Gate lifecycle, approval workflows.

### Repurpose

- Policy engine → Memory Governance Engine (write protocol, check-before-edit, trust rules).
- SQLite index experience → memory search index.
- CLI structure with Commander.js → memory commands.
- File-based persistence patterns → Markdown object store.
- Zod-based config loading and validation → `.wolf/config.yaml` loader.
- TypeScript strict mode, build scripts, vitest setup → keep as-is.

---

## 14. Memory Trust Boundary

Memory is a trust boundary. Entries injected into agent context influence future agent decisions, so provenance and trust must be explicit.

Each memory object preserves provenance:

- `created_by` — actor that created the object (`user:<name>` or `agent:<name>`).
- `source.kind` — origin category (`session`, `file`, `manual`, `scan`).
- `source.path` or `source.session_id` — pointer to origin.
- `review_state` — `accepted`, `proposed`, or `rejected`.
- `confidence` and `importance` — explicit trust and relevance signals.
- `related` — links to files, docs, and decisions.

Future governance may restrict which objects are injected into agent context based on `review_state`, `confidence`, `source.kind`, or staleness.

Agent-created objects default to `review_state: proposed`. Human-created objects default to `review_state: accepted`. Only `accepted` objects are included in agent briefs by default; callers may opt into `proposed` objects.

---

## 15. Open Questions

1. **Config file.** `.wolf/config.yaml` becomes the canonical config. `wolf.yaml` is supported read-only during one transition phase and triggers a deprecation warning with a suggested `wolf memory migrate-config`.
2. **User-managed docs registration.** Explicit `wolf memory scan` only. Automatic watch is deferred to a later phase as a separate `wolf memory watch` command.
3. **Id format.** `mem_YYYYMMDD_<slug>_<shortHash>` for memory objects, where `shortHash` prevents collisions for same-day/same-slug objects. Events: `evt_YYYYMMDD_HHMMSS_<shortHash>`. Other typed prefixes may be introduced later.
4. **Confidence/importance.** Explicit with defaults: `confidence: medium | high | low`; `importance: 0.0–1.0` default `0.5`. Derived usage scores (`recall_count`, `last_recalled_at`) are deferred.

---

## 16. Status

**Approved with revisions.** This spec is ready as the basis for reorganizing Mr. Wolf into a Project Semantic Memory layer. Next step is writing the implementation plan.
