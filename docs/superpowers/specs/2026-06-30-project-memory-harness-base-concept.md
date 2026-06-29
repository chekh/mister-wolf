# Mr. Wolf: Project Memory Harness — Base Concept

**Date:** 2026-06-30  
**Status:** Draft for review  
**Scope:** Foundation concept and architecture for the MVP. Implementation is phased; Phase 1 is limited to `work-thread`, `info-request`, and `article`.

---

## 1. What Mr. Wolf Is

Mr. Wolf is a **local-first project memory harness** for AI-assisted development.

It does not replace agents, subagents, OpenSpec, Superpowers, AGENTS.md, ADRs, documentation, or tests. It makes project artifacts visible, structured, linked, searchable, and reusable across sessions.

The project, not the chat session, owns memory.

---

## 2. What Problem It Solves

AI coding sessions are temporary. A project continues across sessions, models, agents, and documents. Important artifacts accumulate:

- specs and plans
- decisions and their rationale
- side questions that need deeper investigation
- answers prepared in separate sessions
- blockers and their resolution
- rules, conventions, lessons

If these artifacts are not registered, classified, linked, and retrievable, agents repeat work, regress decisions, and lose context.

Mr. Wolf stores project memory as typed, file-native artifacts with metadata, lifecycle, relations, search, and retrieval commands.

---

## 3. Core Principles

1. **Project-first, not session-first.** Memory belongs to the project, not to a chat or agent.
2. **Files are source of truth.** Markdown/YAML objects are canonical. SQLite, indexes, and briefs are derived.
3. **No centralization trap.** Mr. Wolf does not delete, rewrite, or merge source documents. It registers them by reference and links them.
4. **Typed artifacts.** Every memory object has a domain type and a memory classification.
5. **Explicit relations.** Links between artifacts are explicit and queryable.
6. **Do not pollute the main session.** Side investigations that should become reusable knowledge become `info-request` → `article`.
7. **Do not defer reasoning.** An agent must give a preliminary answer before creating an `info-request` when possible. Info-requests are for evidence collection, not for avoiding thinking.
8. **Memory is not a task manager.** Ordinary TODOs do not become memory artifacts.

---

## 4. Artifact Model

### 4.1 Domain Types (MVP)

Only the types needed for the MVP are implemented initially. The data model must not block future schema-driven types.

| Type | Purpose |
|---|---|
| `work-thread` | Long-running line of work across sessions |
| `info-request` | Deferred side investigation |
| `article` | Reusable answer or project knowledge |
| `decision` | Accepted or proposed project decision |
| `blocker` | Obstacle preventing progress |
| `open-question` | Lightweight unresolved question |
| `session-checkpoint` | Summary of what changed in a session |
| `document` | Registered project document |
| `external-artifact` | File produced by external skill/framework |

`document` and `external-artifact` differ mainly in provenance: `document` is project-native, `external-artifact` is produced by a skill/framework like Superpowers or OpenSpec.

### 4.2 Memory Classification (Concept for Later Phases)

Every artifact will eventually carry a memory class, truth role, and lifetime. These are orthogonal to domain type. For Phase 1 only `status` and `review_state` are used; full classification is introduced in Phase 6.

**Future memory class:**

```text
canonical     — source-of-truth or registered source document
curated       — reviewed or accepted project knowledge
working       — active work-in-progress
observed      — captured signal from session, scan, or event
derived       — generated view, brief, or summary
archived      — historical context, not active instruction
```

**Future lifetime:**

```text
session
short_term
long_term
permanent
```

**Future truth role:**

```text
source_of_truth
accepted_knowledge
proposed_knowledge
generated_view
historical_context
verification_artifact
supporting_evidence
```

**Review state (used from Phase 1):**

```text
proposed
accepted
rejected
```

Agent-created artifacts default to `proposed`. Human-authored artifacts may be `accepted`.

**Lifecycle status (used from Phase 1):**

```text
active
open
resolved
stale
conflicting
superseded
archived
```

Artifacts are not deleted. They are superseded or archived.

### 4.3 Required Metadata

Every artifact must have:

```yaml
id: <artifact-id>
type: <domain-type>
title: <string>
status: <lifecycle-status>
review_state: <review-state>
created_at: <iso-datetime>
updated_at: <iso-datetime>
created_by: <actor>
schema_version: 1
source:
  kind: manual | session | file | scan
  path: <optional-path>
  session_id: <optional>
body: <markdown>
```

Phase 1 adds domain-specific fields for `work-thread`, `info-request`, and `article`. Classification fields (`memory_class`, `truth_role`, `lifetime`) are omitted until Phase 6.

---

## 5. Work Thread

A `work-thread` represents a long-running line of work that spans multiple sessions.

Required fields:

```yaml
id: thread_...
type: work-thread
title: ...
goal: ...
current_state: ...
status: active | paused | completed | archived
next_steps: []
```

Purpose:

- Provide startup context for new sessions.
- Track current state.
- Link info-requests, articles, decisions, blockers, documents, and checkpoints.
- Support `thread diff`.

`current_state` is free text maintained by the agent or human at the end of each session. There is no automation that keeps it fresh.

---

## 6. Info Request

An `info-request` is a deferred side investigation. It is not a task, ticket, or subagent message.

It exists when answering a question now would substantially derail the main session and the answer should become reusable project knowledge.

Required fields:

```yaml
id: ireq_...
type: info-request
title: ...
status: open | answered | rejected | obsolete | archived
review_state: proposed
thread: thread_...
question: >
detour_reason: >
needed_for:
  - decision: ...
  - blocker: ...
  - spec: ...
  - rule: ...
  - thread: ...
expected_answer: []
preliminary_answer: >
```

Rules:

- `question`, `detour_reason`, `needed_for`, and `expected_answer` are required.
- The creating agent should give a `preliminary_answer` when possible.
- Info-requests are not created for ordinary implementation tasks.
- `detour_reason` is required even for human-created requests to enforce the discipline.

---

## 7. Article

An `article` is a reusable answer to an info-request or a self-contained piece of project knowledge.

Required fields:

```yaml
id: art_...
type: article
title: ...
status: proposed | accepted | stale | superseded | archived
review_state: proposed
thread: thread_...
summary: >
answers:
  - ireq_...
supports:
  - decision: ...
  - spec: ...
  - rule: ...
evidence: []
```

Body sections:

```markdown
# Title

## Summary
## Context
## Assumptions
## Answer
## Options Considered
## Recommendation
## Risks
## Evidence
## When To Revisit
## Links
```

Only `Summary`, `Answer`, and `Evidence` are strongly recommended.

---

## 8. Decision

A `decision` is an accepted or proposed project decision. An article may support it, but does not automatically become it.

Required fields:

```yaml
id: dec_...
type: decision
title: ...
decision: >
rationale: >
status: active | superseded | archived
review_state: proposed | accepted
based_on:
  - article: art_...
  - document: doc_...
  - external-artifact: ext_...
updates:
  - path: ...
  - rule: ...
supersedes:
  - dec_...
```

---

## 9. Relations

Relations between artifacts are explicit. MVP uses a local file as canonical storage:

```text
.wolf/memory/relations.jsonl
```

Each relation:

```json
{
  "subject": "ireq_...",
  "predicate": "answered_by",
  "object": "art_...",
  "created_at": "2026-06-30T12:00:00Z",
  "source": "agent",
  "confidence": "high"
}
```

Core predicates:

```text
answers / answered_by
supports / supported_by
based_on / basis_for
updates / updated_by
supersedes / superseded_by
blocks / blocked_by
resolves / resolved_by
related_to
produced_by
```

Relations may be mirrored in artifact frontmatter for readability, but `relations.jsonl` is canonical. Frontmatter relation lists are generated from `relations.jsonl` during save/load.

---

## 10. Document Registration

Project files are registered as memory artifacts by reference. Mr. Wolf does not copy or rewrite them.

Configuration:

```yaml
artifact_sources:
  - id: docs
    path: docs/**/*.md
    type: document
    memory_class: canonical
    truth_role: source_of_truth

  - id: superpowers_specs
    path: superpowers/specs/**/*.md
    type: external-artifact
    origin: external_skill
    producer: superpowers
    memory_class: canonical
    truth_role: proposed_knowledge
```

Scanner behavior:

1. Discover configured files.
2. Compute content hash.
3. Register or update artifact record.
4. Do not rewrite external files.
5. Mark missing files as stale.
6. Skip secrets, binaries, large files, dependencies, and generated caches.

---

## 11. Storage Layout

```text
.wolf/
  config.yaml
  memory/
    objects/
      threads/
      info-requests/
      articles/
      decisions/
      blockers/
      open-questions/
      sessions/
      documents/
      external-artifacts/
    relations.jsonl
    events.jsonl
  cache/
    index.sqlite
```

Rules:

- Markdown/YAML objects are canonical.
- `relations.jsonl` is canonical for explicit relations in MVP.
- `events.jsonl` is an audit trail, not operational source of truth.
- SQLite is derived and rebuildable.
- Generated briefs are derived.

---

## 12. CLI Namespace

All commands live under `wolf memory` to keep a single namespace:

```bash
wolf memory init
wolf memory scan
wolf memory search "..."

wolf memory thread create "..."
wolf memory thread list
wolf memory thread get <id>
wolf memory thread brief <id>
wolf memory thread diff <id> --since <session-id>

wolf memory info-request create ...
wolf memory info-request list
wolf memory info-request get <id>
wolf memory info-request close <id>

wolf memory article add ...
wolf memory article list
wolf memory article get <id>
wolf memory article accept <id>

wolf memory decision add ...
wolf memory decision supersede <old> --by <new>

wolf memory blocker add ...
wolf memory blocker resolve <id>

wolf memory session checkpoint --thread <id>
```

Long subcommand names are intentional to keep the surface explicit and agent-safe.

---

## 13. Architecture

### 13.1 Layer Direction

```text
              CLI / MCP (inbound)
                    |
              app/use-cases
                    |
      ┌─────────────┼─────────────┐
      |             |             |
   domain       policies       ports
      |                         |
   schemas                   adapters
                              fs / sqlite
```

Rules:

- `domain` imports nothing.
- `app` imports `domain` and `ports`.
- `adapters` implement `ports`.
- CLI contains no business logic.

### 13.2 What Is Not in MVP

- No vector database.
- No graph database backend.
- No MCP server.
- No hooks.
- No web UI.
- No real-time file watcher.
- No automatic LLM extraction from every file.
- No generic schema pack marketplace.
- No genealogy/writing/research domain packs.
- No complex policy engine.

The architecture may prepare boundaries for these, but they are not implemented.

---

## 14. Phased Roadmap

| Phase | Focus | Deliverable |
|---|---|---|
| 1 | Work threads, info requests, articles | Create and link the three core artifacts; thread brief |
| 2 | Decisions and blockers | Decisions based on articles; blockers resolved by articles |
| 3 | Document and artifact registration | Configurable scan of project files and external skill outputs |
| 4 | Relations and session checkpoints | `relations.jsonl`, session checkpoints, thread diff |
| 5 | Search and indexing | SQLite FTS5, search, list filters, rebuild-index |
| 6 | Agent brief and governance readiness | Thread-aware agent brief, validation rules, lifecycle transitions |

Phase 1 is the only scope for the first implementation plan.

---

## 15. Open Questions

1. Should `external-artifact` be merged into `document` with different `origin`/`producer`, or kept separate?
2. Should `current_state` in a work thread be versioned, or overwritten on each update?
3. Should `relations.jsonl` be append-only like `events.jsonl`, or mutable?
4. Should `info-request` require `thread` at creation, or allow unthreaded requests?
5. How does an article declare that it supersedes a previous article?

---

## 16. Status

Base concept drafted. Next step: write implementation plan for Phase 1 (work-thread + info-request + article).
