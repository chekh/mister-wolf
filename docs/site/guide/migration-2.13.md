# Migration to 2.13

This page is for owners of a live installation updating to 2.13. The package arrives the usual way (`wolf upgrade` + `wolf sync`); what needs your attention is memory: the taxonomy changes, and existing objects are moved by the one-time `wolf migrate taxonomy`.

## What changes

- The canon is now **7 memory types**: `rule`, `lesson`, `decision`, `thread`, `complaint`, `tool`, `note` (see [Memory Model](/guide/memory)).
- **19 old types collapse into `note` + facet** — the full map is below.
- **`blocker` / `info-request` / `open-question` become thread statuses**: `blocked` / `waiting_answer` / `open`.
- **Create commands are removed** (CLI and MCP): `wolf create`, `wolf thread create`, the `create_*` MCP tools. Use `wolf add --type <type>` and `transition` instead — the removal error already contains the hint.
- **`effectiveness` / `dashboard` / `insights`** are now hidden synonyms of `wolf analytics --view <view>` (removed in 2.15).

Background: [Memory Model](/guide/memory), [CLI Overview](/guide/cli/overview).

## Old type → where it goes

Full migration map (spec 2.13 §5.4):

| Old type                                                | → New        | Facet / note                                                                              |
| ------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| `rule`                                                  | `rule`       | —                                                                                         |
| `lesson`                                                | `lesson`     | —                                                                                         |
| `decision`                                              | `decision`   | —                                                                                         |
| `complaint`                                             | `complaint`  | —                                                                                         |
| `tool`                                                  | `tool`       | —                                                                                         |
| `work-thread`                                           | `thread`     | type rename; files do not move                                                            |
| `blocker`                                               | `note`       | facet `pitfall`; if a thread is set and its status was active → the thread gets `blocked` |
| `info-request`                                          | `note`       | facet `context`; if a thread is set and open → the thread gets `waiting_answer`           |
| `open-question`                                         | `note`       | facet `context`; if a thread is set and open → the thread gets `open`                     |
| `observation`                                           | `note`       | facet `legacy`                                                                            |
| `context`                                               | `note`       | facet `context`                                                                           |
| `article`                                               | `note`       | facet `context`                                                                           |
| `session-summary`                                       | `note`       | facet `history`                                                                           |
| `session-checkpoint`                                    | `note`       | facet `history`                                                                           |
| `report`                                                | `note`       | facet `history`                                                                           |
| `council-question`                                      | `note`       | facet `context`                                                                           |
| `council-opinion`                                       | `note`       | facet `context`                                                                           |
| `synthesis`                                             | `note`       | facet `context`                                                                           |
| `document` (alias) / `document-ref` / `document-native` | `note`       | facet `legacy`; `source.path` is preserved                                                |
| `escalation`                                            | `note`       | facet `legacy`                                                                            |
| `decision-request`                                      | `note`       | facet `legacy`                                                                            |
| `playbook`                                              | `note`       | facet `howto`                                                                             |
| `call-injection`                                        | `note`       | facet `howto`; active ones stop being delivered by the `call` pool — see the report below |
| `task-brief`                                            | project type | not touched                                                                               |

## wolf migrate taxonomy

- Dry-run **by default**: prints the plan, changes nothing.
- `--apply` performs the migration.
- `--force` — apply even when `.wolf/memory` is not in a clean git state (no git at all — only with `--force`, plus a warning).

Requirement: **a clean git status of `.wolf/memory` before `--apply`** — memory is versioned with git, and no automatic backup is built. The recommended owner flow:

```bash
git add .wolf && git commit -m "memory: pre-2.13 snapshot"
wolf migrate taxonomy            # dry-run: read the report
wolf migrate taxonomy --apply
```

## The dry-run report

The format (verified on live data):

- the plan table: `id | old type | new (facet/status) | from | to`;
- `summary by type: …` — counts per old type;
- a WARNING block for **active call-injections**: after the migration they stop being delivered by the `call` pool — move their `trigger_keywords` into a lesson/rule or archive them;
- a conflicts block (left untouched — see below);
- the final counters line: `migrated: N | thread status changes: N | conflicts: N | unparsable: N` (`migrated` stays 0 in dry-run — nothing is written yet).

Conflicts (a non-active thread with an active absorbable status, or several different absorbable statuses on one thread) and unparsable files are **not touched** — resolve them manually and re-run. Exit code is `2` when there are conflicts, even with `--apply` (the rest of the plan still executes).

Example (synthetic ids):

```
# wolf migrate taxonomy (mode: dry-run)

| id | old type | new (facet/status) | from | to |
|----|----------|--------------------|------|----|
| mem_20260101_legacy_blocker_abcd12 | blocker | note / facet: pitfall / thread -> blocked | threads/thr_20260101_payments_refactor/blockers/mem_20260101_legacy_blocker_abcd12.md | threads/thr_20260101_payments_refactor/notes/mem_20260101_legacy_blocker_abcd12.md |
| mem_20260102_old_context_efgh34 | context | note / facet: context | shared/notes/mem_20260102_old_context_efgh34.md | shared/notes/mem_20260102_old_context_efgh34.md |
| mem_20260103_call_inject_ijkl56 | call-injection | note / facet: howto | shared/calls/mem_20260103_call_inject_ijkl56.md | shared/notes/mem_20260103_call_inject_ijkl56.md |
| thr_20260101_payments_refactor | work-thread | thread / thread -> blocked | threads/thr_20260101_payments_refactor/WORK-THREAD.md | threads/thr_20260101_payments_refactor/WORK-THREAD.md |

summary by type: blocker: 1, context: 1, call-injection: 1, work-thread: 1

thread status changes:
  thr_20260101_payments_refactor: active -> blocked (cause: blocker mem_20260101_legacy_blocker_abcd12)

active call-injections (WARNING):
  mem_20260103_call_inject_ijkl56: shared/calls/mem_20260103_call_inject_ijkl56.md -> shared/notes/mem_20260103_call_inject_ijkl56.md
  after migration these stop being delivered by the call pool (spec 2.13 §5.4);
  move trigger_keywords to a lesson/rule or archive them

migrated: 0 (dry-run) | thread status changes: 1 | conflicts: 0 | unparsable: 0
rollback: git checkout .wolf/memory && wolf rebuild-index
```

## Idempotency and rollback

- A repeated `--apply` is a no-op: the plan has 0 rows. The "already migrated" sign is the `type` field — objects with one of the 7 new types are skipped.
- Rollback: `git checkout .wolf/memory && wolf rebuild-index`.
- After a successful `--apply`, the empty old directories are removed.

## Scripts and prompts on create

`wolf create`, `wolf thread create` and the `create_*` MCP tools are gone. Replace them with `wolf add --type <type>` (creation) and `transition` (status changes); the removal error contains the exact hint. Restart live agent sessions after the update — old prompts may still reference the removed commands.

## Works without migration too

Alias reading keeps an unmigrated installation working:

- old types in frontmatter are read as their new targets (`list` / `get` / `search`);
- the old directories remain read roots;
- the first `update` of an object rewrites it to the canonical type and path.

The migration is needed to **write** the new way and to get filters and colors consistently — alias reading is a compatibility layer, not the destination state.
