# Design Spec: Mr. Wolf as Memory Control Plane

**Date:** 2026-06-29  
**Status:** Draft for review  
**Topic:** Evolve Mr. Wolf from a local memory store into a project memory control plane for OpenCode and other coding agents.

---

## 1. Purpose

Mr. Wolf today stores typed memory objects in markdown files, indexes them with FTS5, and exposes them through a CLI. The next evolution is to turn it into a **memory control plane**: a layer that does not merely hold information, but actively shapes what an agent sees, remembers, and acts upon.

The control plane operates between the repository, the agent runtime, and the developer. It observes changes in the project, maintains an up-to-date model of project knowledge, resolves conflicts between old and new knowledge, and builds the minimal task context an agent needs for a given piece of work.

---

## 2. Core Idea

A coding project produces a continuous stream of signals: commits, file edits, failed tests, passing tests, code reviews, agent sessions, documentation changes, dependency updates, architectural decisions. Most of these signals are lost between agent sessions.

The memory control plane captures the signals that matter, turns them into typed artifacts, keeps them current, links them to the code they describe, and exposes them to agents through a small, policy-driven interface.

Key shift from current state:

- From **manual input** (`memory add`) to **observed input** (scan, diff, session artifacts).
- From **search over objects** to **retrieval by task**.
- From **static status** (`active`/`superseded`) to **managed lifecycle** (valid, stale, conflicting, rejected).
- From **CLI tool** to **runtime layer** invoked by hooks, MCP tools, and scheduled checks.

---

## 3. System Model

### 3.1. Three Planes

```text
┌─────────────────────────────────────────────────────────────┐
│  Control Plane                                              │
│  - policy engine                                            │
│  - lifecycle manager                                        │
│  - task context builder                                     │
│  - conflict detector                                        │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│  Artifact Layer                                             │
│  - typed memory objects                                     │
│  - document registrations                                   │
│  - code links                                               │
│  - session extractions                                      │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│  Storage Layer                                              │
│  - markdown files (source of truth)                         │
│  - JSONL event log                                          │
│  - SQLite FTS5 index                                        │
│  - optional vector / graph cache                            │
└─────────────────────────────────────────────────────────────┘
```

### 3.2. Boundaries

- **Storage layer** persists everything and rebuilds from markdown.
- **Artifact layer** normalizes project signals into typed objects.
- **Control plane** decides what enters memory, when it expires, and what reaches the agent.

---

## 4. Lifecycle of a Memory Signal

```text
1. Observe
   commit, file change, scan, agent session, manual input

2. Extract candidate
   parse diff, summarize session, register document, record decision

3. Validate by policy
   - is it useful?
   - is it safe?
   - does it conflict?
   - is it a duplicate?

4. Store or update
   - new object
   - update existing
   - supersede old
   - reject

5. Maintain
   - detect stale objects
   - mark invalidated/deprecated
   - propagate confidence decay

6. Serve
   - build task context for agent
   - answer search queries
   - warn about conflicts
```

---

## 5. Artifact Taxonomy

Current types are kept but gain richer semantics:

| Type              | Role                                     | Lifecycle                        |
| ----------------- | ---------------------------------------- | -------------------------------- |
| `document`        | Project artifact registered by reference | updated when source file changes |
| `decision`        | Architectural or process choice          | superseded when reversed         |
| `lesson`          | Learned fact, often from failure         | decays if not reinforced         |
| `observation`     | Stable fact about the project            | invalidated if untrue            |
| `open-question`   | Unresolved issue                         | closed when answered             |
| `session-summary` | Outcome of an agent session              | archived after successor         |
| `context`         | Computed snapshot of project state       | replaced on each scan            |
| `risk`            | Known danger zone in code/process        | verified or downgraded           |
| `command`         | Recurring command with context           | updated on change                |

Future types may include `bug-fix`, `pattern`, `convention`, `dependency`, `metric`.

---

## 6. Policy Engine

The control plane applies policies at three points:

1. **Write policy.** Should this candidate be stored? Examples:
   - body not empty;
   - not a duplicate within similarity threshold;
   - no secrets or PII;
   - matches at least one retention rule.

2. **Lifecycle policy.** When does an object change state? Examples:
   - document is stale if its source file hash changed;
   - decision is superseded if a newer decision contradicts it on the same scope;
   - observation is invalid if the referenced code no longer exists.

3. **Retrieval policy.** What enters agent context? Examples:
   - `accepted` only by default;
   - `proposed` only if user opts in;
   - exclude objects older than N days unless high importance;
   - include conflicts as explicit warnings.

---

## 7. Task Context Builder

Instead of returning raw search results, the control plane assembles a **task context** from:

- repository state (branch, changed files);
- task description;
- active decisions related to touched files;
- open questions in the scope;
- lessons from similar past work;
- risks and deprecated facts;
- registered documents that explain relevant modules.

The output is not a dump. It is ranked, deduplicated, and capped in size so that it fits into the agent's working context without noise.

---

## 8. Integration Surfaces

### 8.1. CLI

The CLI remains the manual surface for inspection and maintenance:

```bash
wolf memory scan
wolf memory status
wolf memory check
wolf memory brief
wolf memory context --for-task "..."
```

### 8.2. MCP Server

MCP tools expose the control plane to OpenCode:

```text
memory.search
memory.get
memory.add
memory.link
memory.context_for_task
memory.mark_stale
memory.supersede
memory.check_conflicts
```

### 8.3. Hooks

Optional hooks react to events without manual invocation:

```text
post-commit → update context and detect stale objects
post-merge → invalidate branch-specific decisions
pre-agent-task → build context
post-agent-task → extract candidate memories
```

Hooks are opt-in and configured in `.wolf/config.yaml`.

---

## 9. Non-Goals

- Replacing OpenCode or becoming an agent runtime.
- Hosting remote services or multi-tenant infrastructure.
- Full natural-language understanding of every file.
- Automated code modification by Mr. Wolf itself.
- Real-time filesystem watching in MVP phases (may be added later as opt-in).

---

## 10. Phased Roadmap

| Phase | Name               | Transition                                                                                                     |
| ----- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| 1     | Documented Memory  | Project documents are registered as first-class memory artifacts, linked to source files, and kept up to date. |
| 2     | Linked Memory      | Memory objects gain explicit links to code, documents, and each other; context can be assembled by scope.      |
| 3     | Governed Memory    | Policy engine validates candidates, detects conflicts, marks stale objects, and enforces retrieval rules.      |
| 4     | Agent Memory Layer | MCP server and hooks integrate Mr. Wolf into OpenCode task flow: context injection and session extraction.     |
| 5     | Learning Memory    | Sessions are automatically summarized; repeated patterns produce reusable lessons and conventions.             |

---

## 11. Status

This spec proposes the architectural direction. Next step is to detail Phase 1 and write its implementation plan.
