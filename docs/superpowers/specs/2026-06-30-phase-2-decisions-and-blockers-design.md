# Design Spec: Phase 2 — Decisions and Blockers

**Date:** 2026-06-30
**Status:** Approved for implementation
**Topic:** Add `decision` and `blocker` memory types to Mr. Wolf, following the pattern established in Phase 1 (work-thread, info-request, article).

---

## 1. Purpose

Phase 1 gave Mr. Wolf three structured artifact types tied to work threads: threads, info requests, and articles. Phase 2 extends the system with two more first-class memory objects:

- **Decision** — a recorded architectural or process choice, with rationale and lifecycle.
- **Blocker** — an obstacle that prevents forward progress, with optional workaround.

Both types may exist independently or be linked to a work thread. The goal is to capture _why_ something was done and _what is stopping work_ in a retrievable, machine-readable form.

---

## 2. Scope

### In scope

- Two new memory types: `decision` and `blocker`.
- Schemas, use-cases, and CLI commands for each type.
- Optional linkage to a `work-thread` via `thread?: string`.
- Status transitions: active → superseded/obsolete for decisions; active → resolved/obsolete for blockers.
- Inclusion of active decisions and blockers in the agent brief and thread brief.
- Unit tests for the new use-cases.

### Out of scope

- Automatic conflict detection between decisions.
- Scope-based decision matching (file/module/area).
- Policy engine or lifecycle automation.
- Blocker priority/severity/assignment fields.
- Reverse links from threads to decisions/blockers.

These belong to later phases (governance, relations, policy engine).

---

## 3. Data Model

### 3.1. `decision`

```yaml
id: mem_20260630_use_sqlite_for_search_abc123
type: decision
title: Use SQLite FTS5 for full-text search
status: active
review_state: accepted
confidence: high
importance: 0.8
created_at: '2026-06-30T12:00:00.000Z'
updated_at: '2026-06-30T12:00:00.000Z'
created_by: user:cli
schema_version: 1
source:
  kind: manual
related:
  files: []
  docs: []
  decisions: []
tags: []
superseded_by: null
thread: mem_20260630_schema_driven_memory_control_pla_300359
body: >-
  SQLite is already a dependency. FTS5 gives good enough ranking for the
  MVP without introducing external services. Can be reconsidered when
  semantic search is needed.
```

**Schema fields:**

- `type: 'decision'`
- `status: 'active' | 'superseded' | 'rejected' | 'obsolete'`
- `thread?: string` — optional parent work thread
- `body: string` — rationale and context of the decision

All other fields come from `MemoryObjectSchema`.

### 3.2. `blocker`

```yaml
id: mem_20260630_tests_fail_on_ci_abc123
type: blocker
title: Tests fail on CI due to missing sqlite3 native bindings
status: active
review_state: proposed
confidence: high
importance: 0.9
created_at: '2026-06-30T12:00:00.000Z'
updated_at: '2026-06-30T12:00:00.000Z'
created_by: agent:opencode
schema_version: 1
source:
  kind: manual
related:
  files: []
  docs: []
  decisions: []
tags: []
superseded_by: null
thread: mem_20260630_schema_driven_memory_control_pla_300359
impact: >-
  Every CI run fails on `better-sqlite3` compilation. Local development is
  unaffected.
workaround: Run tests only on macOS runners temporarily.
body: ''
```

**Schema fields:**

- `type: 'blocker'`
- `status: 'active' | 'resolved' | 'obsolete'`
- `thread?: string` — optional parent work thread
- `impact: string` — what is blocked and why
- `workaround?: string` — optional temporary mitigation
- `body: string` — additional notes (default empty)

---

## 4. Use-Cases

### 4.1. `createDecision`

**Input:**

- `title: string`
- `body: string`
- `thread?: string`
- `createdBy: string`

**Behavior:**

1. Generate id, timestamps, default fields.
2. `review_state` = `'accepted'` if created by user, `'proposed'` if created by agent.
3. `status` = `'active'`.
4. Validate against `DecisionSchema`.
5. Save to store and append `memory.added` event.

### 4.2. `createBlocker`

**Input:**

- `title: string`
- `impact: string`
- `workaround?: string`
- `thread?: string`
- `createdBy: string`

**Behavior:**

1. Generate id, timestamps, default fields.
2. `review_state` = `'accepted'` if created by user, `'proposed'` if created by agent.
3. `status` = `'active'`.
4. Validate against `BlockerSchema`.
5. Save to store and append `memory.added` event.

### 4.3. `resolveBlocker`

**Input:**

- `id: string`

**Behavior:**

1. Load blocker from store.
2. Set `status` to `'resolved'` and update `updated_at`.
3. Save and append `memory.resolved` event.

### 4.4. Reuse `supersedeMemoryObject`

The existing `supersedeMemoryObject` use-case already supports any memory type. It is sufficient for both decisions and blockers.

---

## 5. CLI Commands

### 5.1. Decision

```bash
# Create a decision
wolf memory decision add --title "Use SQLite FTS5 for full-text search" \
  --body "SQLite is already a dependency..." \
  --thread mem_20260630_schema_driven_memory_control_pla_300359 \
  --created-by user:cli

# List all decisions
wolf memory decision list

# List decisions for a thread
wolf memory decision list --thread mem_20260630_schema_driven_memory_control_pla_300359
```

### 5.2. Blocker

```bash
# Create a blocker
wolf memory blocker add --title "Tests fail on CI" \
  --impact "Every CI run fails on better-sqlite3 compilation." \
  --workaround "Run tests only on macOS runners temporarily." \
  --thread mem_20260630_schema_driven_memory_control_pla_300359 \
  --created-by agent:opencode

# List blockers
wolf memory blocker list
wolf memory blocker list --thread <thread-id>

# Resolve a blocker
wolf memory blocker resolve mem_20260630_tests_fail_on_ci_abc123
```

---

## 6. Brief Integration

### 6.1. Agent Brief

`generate-agent-brief` should include:

- Active decisions under **Active Memory**.
- Active blockers under a new **Blockers** section, because they are actionable and time-sensitive.

### 6.2. Thread Brief

`get-thread-brief` should include:

- Decisions linked to the thread under a **Decisions** section.
- Active blockers linked to the thread under a **Blockers** section.

Both appear regardless of `review_state` unless explicitly filtered later.

---

## 7. Tests

For each use-case add one focused test:

- `createDecision` — creates an active decision with correct defaults.
- `createBlocker` — creates an active blocker with workaround.
- `resolveBlocker` — transitions status to resolved and emits event.
- CLI commands are covered by existing integration patterns where applicable.

Use the existing in-memory store and clock fixtures.

---

## 8. Files to Create/Modify

### Create

- `src/domain/schemas/decision-schema.ts`
- `src/domain/schemas/blocker-schema.ts`
- `src/app/use-cases/create-decision.ts`
- `src/app/use-cases/create-blocker.ts`
- `src/app/use-cases/resolve-blocker.ts`
- `src/adapters/cli/commands/memory-decision.ts`
- `src/adapters/cli/commands/memory-blocker.ts`
- Tests for the three new use-cases.

### Modify

- `src/domain/memory-types.ts` — add `'blocker'` to `MEMORY_TYPES` (`'decision'` already exists).
- `src/adapters/fs/fs-project-initializer.ts` — add `'blocker'` to default config types.
- `src/adapters/cli/cli-entry.ts` — register `memory decision` and `memory blocker` commands.
- `src/app/use-cases/generate-agent-brief.ts` — include active decisions and blockers.
- `src/app/use-cases/get-thread-brief.ts` — include thread-linked decisions and blockers.
- `docs/user-guide.md` — document new commands.

---

## 9. Open Questions Deferred

- Should `blocker` have a severity/importance separate from `importance`? Deferred to governance phase.
- Should decisions be auto-detected from commit messages or code comments? Deferred to session extraction phase.
- Should resolved blockers remain in thread brief? For now yes, under a separate **Resolved Blockers** subsection if needed later.

---

## 10. Success Criteria

- `wolf memory decision add` and `wolf memory blocker add` work from CLI.
- Active decisions and blockers appear in `wolf memory brief`.
- Thread brief shows decisions and blockers linked to that thread.
- All tests pass.
- `docs/user-guide.md` is updated.
