# FUP-1 Requirements: Wolf Artifact Convention

**Status:** Final requirements for FUP-1  
**Scope:** Standalone CLI prototype  
**Primary goal:** prove durable artifact handoff through local Markdown artifacts  
**Non-goal:** prove the full Mr. Wolf Concept v2

---

## 1. Core Principle

Wolf FUP-1 does not implement an agent runtime, workflow engine, router, memory graph, or control plane.

FUP-1 proves one narrow idea:

> Agents and LLM steps should pass work through durable artifacts on disk, not only through ephemeral chat context.

This convention is called **Wolf Artifact Convention** or **WAC**.

WAC is not a product by itself in FUP-1.  
WAC is a minimal file convention:

```text
.wolf/artifacts/*.md
YAML frontmatter
parent linkage
explicit CLI commands
```

The purpose of WAC is to make a simple chain traceable:

```text
user intent → spec → tasks → patch-preview
```

---

## 2. Relationship to Git

WAC does not replace Git.

Git tracks mechanical file changes:

```text
which files changed?
which lines changed?
how do I revert?
```

WAC tracks semantic intent:

```text
why was this generated?
what artifact was it based on?
what step produced it?
what should the next step read?
```

In FUP-1, WAC is only a semantic layer of Markdown files. Git remains responsible for repository history and rollback.

---

## 3. Strict FUP-1 Scope

FUP-1 is:

```text
Spec → Tasks → Patch Preview
Read-only
Zero side effects outside .wolf/
Explicit CLI commands only
```

FUP-1 is not:

```text
an autonomous agent
a process router
a workflow engine
a plugin for OpenCode
a general Artifact Control Plane
a memory server
a patch application tool
a test runner
```

---

## 4. Storage Layout

FUP-1 writes only under `.wolf/`.

Required directory:

```text
.wolf/
  artifacts/
```

Artifact files are stored as:

```text
.wolf/artifacts/{id}.md
```

Example:

```text
.wolf/artifacts/add-status-spec-a1b2c3.md
.wolf/artifacts/add-status-tasks-d4e5f6.md
.wolf/artifacts/add-status-patch-a7b8c9.md
```

The artifact `id` must match the filename without `.md`.

---

## 5. Artifact Types

FUP-1 supports exactly three artifact types:

```text
spec
tasks
patch
```

No other artifact types are allowed in FUP-1.

### 5.1 `spec`

A `spec` artifact captures the intended change.

It should contain Markdown generated from:

```text
user prompt + local repository context
```

Expected content is guided by the prompt, not enforced by code.

Recommended sections:

```text
Problem
Scope
Non-goals
Acceptance Criteria
Implementation Notes
Risks
```

The CLI must not fail only because one of these Markdown sections is missing.

---

### 5.2 `tasks`

A `tasks` artifact is derived from a `spec`.

It should contain implementation tasks based on the parent spec.

Expected content is guided by the prompt, not enforced by code.

Recommended sections:

```text
Task List
Implementation Order
Files Likely Affected
Validation Notes
```

---

### 5.3 `patch`

A `patch` artifact is derived from `tasks`.

It contains a patch preview as Markdown, usually with an embedded diff block.

The patch is not applied by Wolf.

Recommended content:

```text
Summary
Files Changed
Patch Preview
Manual Apply Notes
```

---

## 6. Minimal YAML Frontmatter

Every artifact must start with YAML frontmatter.

FUP-1 supports exactly these fields:

```yaml
---
id: add-status-spec-a1b2c3
type: spec
parent: null
state: created
created: 2026-05-05T12:00:00Z
---
```

### 6.1 Required fields

| Field     | Type           | Allowed values           | Required | Notes                             |
| --------- | -------------- | ------------------------ | -------- | --------------------------------- |
| `id`      | string         | unique slug id           | yes      | Must match filename without `.md` |
| `type`    | string         | `spec`, `tasks`, `patch` | yes      | Determines command compatibility  |
| `parent`  | string or null | artifact id or `null`    | yes      | One backward link only            |
| `state`   | string         | `created`, `preview`     | yes      | Minimal enum, not a state machine |
| `created` | ISO timestamp  | UTC timestamp            | yes      | Creation time                     |

### 6.2 State rules

```text
spec  → state: created
tasks → state: created
patch → state: preview
```

There is no `approved`, `rejected`, `applied`, `archived`, `superseded`, or `cancelled` state in FUP-1.

### 6.3 Parent rules

```text
spec.parent  = null
tasks.parent = spec artifact id
patch.parent = tasks artifact id
```

This is a linked list, not a graph.

FUP-1 must not store:

```text
children
depends_on
blocks
related_to
lineage graph
```

---

## 7. Forbidden Frontmatter Fields

Do not add these fields in FUP-1:

```text
schema_version
lifecycle
audit
lineage
children
git_commit
tokens_spent
model_route
confidence
gates_triggered
policy_decisions
artifact_contract
workflow_id
case_id
trace_id
```

FUP-1 frontmatter must stay intentionally small.

---

## 8. CLI Commands

FUP-1 exposes exactly six commands.

```bash
wolf spec "Добавить команду wolf status"
wolf tasks --from add-status-spec-a1b2c3
wolf patch-preview --from add-status-tasks-d4e5f6
wolf list
wolf show <id>
wolf status
```

No other commands are part of FUP-1.

---

## 9. Command Behavior

### 9.1 `wolf spec "<prompt>"`

Creates a `spec` artifact.

Behavior:

1. Ensure current directory is inside a git repository.
2. Ensure `.wolf/artifacts/` exists.
3. Build repository context.
4. Call LLM with prompt asking for a technical specification.
5. Create artifact:

```yaml
type: spec
parent: null
state: created
```

6. Print artifact id and path.

Example output:

```text
Created spec: add-status-spec-a1b2c3
Path: .wolf/artifacts/add-status-spec-a1b2c3.md
```

---

### 9.2 `wolf tasks --from <spec-id>`

Creates a `tasks` artifact from a `spec`.

Behavior:

1. Load artifact by id.
2. Validate `type == spec`.
3. Build repository context.
4. Include parent spec content in LLM input.
5. Call LLM with prompt asking for implementation tasks.
6. Create artifact:

```yaml
type: tasks
parent: <spec-id>
state: created
```

7. Print artifact id and path.

If `--from` points to a non-spec artifact, fail loudly:

```text
Error: expected parent type 'spec', got 'patch'
```

---

### 9.3 `wolf patch-preview --from <tasks-id>`

Creates a `patch` artifact from `tasks`.

Behavior:

1. Load artifact by id.
2. Validate `type == tasks`.
3. Build repository context.
4. Include parent tasks content in LLM input.
5. Call LLM with prompt asking for a patch preview.
6. Create artifact:

```yaml
type: patch
parent: <tasks-id>
state: preview
```

7. Print artifact id and path.

Patch preview must not modify repository files.

The patch may be shown as Markdown with an embedded diff block:

````md
```diff
diff --git a/src/example.ts b/src/example.ts
...
```
````

FUP-1 does not run `git apply`, does not validate patch syntax, and does not apply patches.

---

### 9.4 `wolf list`

Lists artifacts in `.wolf/artifacts/`.

Output columns:

```text
id
type
state
parent
created
path
```

Implementation:

1. Scan `.wolf/artifacts/*.md`.
2. Parse YAML frontmatter.
3. Print a simple table.

No database. No index. No cache.

---

### 9.5 `wolf show <id>`

Shows an artifact.

Behavior:

1. Load artifact by id.
2. Print frontmatter summary.
3. Print Markdown content.

For `patch` artifacts, the CLI may render diff blocks plainly. Syntax highlighting is optional and not required.

---

### 9.6 `wolf status`

Shows local WAC status.

Output:

```text
Git repository: yes/no
Current branch: <branch>
Wolf directory: exists/missing
Artifact count: <n>
Latest artifacts:
  - <id> <type> <state>
```

No health checks. No validation engine.

---

## 10. Context Resolver

FUP-1 context resolver must be simple and deterministic.

Allowed inputs:

```text
git ls-files
git diff HEAD~3
README.md
package.json
pyproject.toml
Cargo.toml
go.mod
tsconfig.json
parent artifact content
```

### 10.1 Required behavior

For every LLM call, build context from:

1. Repository file list via `git ls-files`.
2. Root metadata files if present.
3. Recent diff summary via `git diff HEAD~3`, capped at 50 KB.
4. Parent artifact content, if command uses `--from`.

### 10.2 Context size limit

If assembled context exceeds the configured limit, fail with a useful message.

Default limit:

```text
400,000 characters
```

This approximates a 100k-token upper bound without requiring a tokenizer.

Failure message:

```text
Context is too large. Re-run with a narrower repository scope in a future version.
```

FUP-1 does not implement `--path`. It may mention narrowing as future work, but no flag is required.

### 10.3 Forbidden context mechanisms

Do not implement:

```text
tree-sitter
ctags
AST parsing
semantic search
RAG
embeddings
vector databases
progressive disclosure
context cache
```

---

## 11. LLM Caller

FUP-1 uses one configured LLM.

Configuration:

```text
WOLF_MODEL
WOLF_PROVIDER
WOLF_API_KEY or provider-specific environment variable
```

Implementation may support only one provider initially.

Requirements:

1. If no model/provider/API key is configured, fail with a clear error.
2. Do not implement model routing.
3. Do not implement fallback chains.
4. Do not implement streaming.
5. Do not implement multi-agent calls.
6. Do not implement tool calling.

Mock mode is allowed for local development if it does not expand scope.

---

## 12. Safety Policy

FUP-1 safety policy is implemented by absence of capability.

Wolf must not:

```text
write files outside .wolf/
execute project commands
run tests
run builds
run shell commands except read-only git commands needed for context
call external APIs except the configured LLM provider
apply patches
modify repository files
create commits
push to remote
delete files
```

Allowed filesystem writes:

```text
.wolf/
.wolf/artifacts/
.wolf/artifacts/*.md
```

There is no separate `PolicyCore` in FUP-1.

Simple checks in code are enough.

---

## 13. Implementation Constraints

FUP-1 must be intentionally boring.

Recommended implementation:

```text
Python 3
argparse
standard library where possible
one file: wolf.py
300–500 lines target
```

Allowed dependencies if necessary:

```text
PyYAML
provider SDK, if needed
```

Forbidden implementation patterns in FUP-1:

```text
classes
dataclasses
Pydantic
ABC
Protocol
SQLite
server
sidecar
event bus
workflow engine
router
model router
artifact store abstraction
plugin system
MCP
OpenCode adapter
Claude Code adapter
domain packs
```

Functions are fine.

Keep the code flat and readable.

---

## 14. Anti-Goals

FUP-1 must not include:

| Anti-goal                | Reason                                       |
| ------------------------ | -------------------------------------------- |
| Control Plane            | WAC is a file convention in FUP-1            |
| Artifact Graph           | Parent link is enough                        |
| Lifecycle Engine         | State is an enum only                        |
| Artifact Contract Engine | Markdown structure is prompt-guided          |
| TraceSystem              | Artifacts are the trace                      |
| JSONL Event Log          | Not needed in FUP-1                          |
| SQLite                   | Files are enough                             |
| Server / Sidecar         | CLI only                                     |
| OpenCode Adapter         | Later, not FUP-1                             |
| MCP                      | Later, not FUP-1                             |
| Patch Apply              | Would introduce side effects                 |
| Test Run / Build Run     | Would introduce execution risk               |
| Dynamic Routing          | Command equals routing                       |
| Model Routing            | One model only                               |
| Domain Packs             | Hardcoded software-engineering behavior only |
| RAG / Vector Search      | Context from git/files only                  |
| Conversation Mode        | Not part of artifact chain                   |
| Long-term Memory         | Artifacts are the only memory                |

---

## 15. Success Criteria

FUP-1 is successful if a developer who is not the author can:

1. Install or run `wolf`.
2. Enter a local JS/Python/Go/Rust repository.
3. Run:

```bash
wolf spec "Добавить фичу X"
```

4. Get a Markdown artifact under `.wolf/artifacts/`.
5. Run:

```bash
wolf tasks --from <spec-id>
```

6. Get a tasks artifact linked to the spec.
7. Run:

```bash
wolf patch-preview --from <tasks-id>
```

8. Get a patch artifact linked to the tasks.
9. Run:

```bash
wolf list
wolf show <id>
wolf status
```

10. Understand the chain:

```text
spec → tasks → patch-preview
```

without reading chat history.

If this works, FUP-1 has proven the minimal WAC hypothesis.

---

## 16. What FUP-1 Proves

FUP-1 proves:

```text
durable artifacts can act as handoff between LLM steps
explicit commands are safer than magic routing
read-only generation can still be useful
parent-linked artifacts are enough for first traceability
```

FUP-1 does not prove:

```text
Wolf is a full agentic control plane
Wolf can orchestrate external agents
Wolf can replace OpenCode or Claude Code
Wolf can safely execute code
Wolf can manage long-term project memory
Wolf can run multi-step autonomous workflows
```

---

## 17. Final Implementation Instruction

Build the simplest possible CLI that implements this document.

Do not add abstractions.

Do not prepare for future architecture.

Do not implement Concept v2.

Do not implement ACP.

Implement only FUP-1 WAC:

```text
spec → tasks → patch-preview
Markdown files with YAML frontmatter
explicit commands
zero side effects outside .wolf/
```