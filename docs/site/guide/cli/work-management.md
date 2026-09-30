# Work Management

Work management in 2.13 is threads, decisions and rules — all through the five verbs and the generated type namespaces (see [Memory](/guide/cli/memory)).

## Where blocker / info-request / article went

The dedicated types are gone; their jobs moved to notes and thread statuses:

| Pre-2.13       | Now                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| `blocker`      | `wolf note add --facet pitfall` for the knowledge, or thread status `blocked` while work waits on external resolution |
| `info-request` | `wolf note add --facet context`, or thread status `waiting_answer` when the question was asked upwards                |
| `article`      | `wolf note add --facet context`                                                                                       |

## wolf thread

A work thread carries the running context of one piece of work. Create it with `wolf add --type thread` or the generated namespace `wolf thread add`:

```text
Usage: wolf thread add [options]
```

Options beyond the common `add` flags (`--title`, `--body`, `--tags`, `--confidence`, `--importance`, `--set`, `--created-by`):

- `--goal <goal>` — thread goal (required)
- `--current-state <state>` — current state
- `--next-steps <steps>` — comma-separated next steps

```bash
wolf thread add --title "Docs site" --goal "Ship the VitePress site" \
  --current-state "pages drafted" --next-steps "write pages,build,deploy"
```

A thread lives on disk as `threads/<thread-id>/WORK-THREAD.md`. List threads with `wolf thread list [--status <status>] [--stale]` (generated namespace).

### Thread statuses

`active`, `paused`, `blocked`, `waiting_answer`, `open`, `completed`, `archived`. The three "waiting" statuses absorbed the former dedicated types:

- `blocked` — the thread waits on external resolution (formerly `blocker`);
- `waiting_answer` — a question was asked upwards (formerly `info-request`);
- `open` — an open question with no addressee.

When the situation resolves, move the thread back to `active` or straight to `archived`:

```bash
wolf transition mem_thread_01 blocked # hit an external blocker
wolf transition mem_thread_01 active  # resolved — continue the work
```

### From `thread brief` to `recap`

`wolf thread brief <id>` is gone. The window over active work is now a single command — `wolf recap` — summarizing rules, threads, blockers, questions and decisions.

## wolf decision

Generated namespace. `wolf decision add` takes the common `add` flags plus `--thread <thread-id>` (parent thread); `wolf decision list [--status <status>] [--stale]` lists decisions.

```bash
wolf decision add --title "Use worktrees for docs work" \
  --body "Trunk-based; work in .worktrees/<task>." --thread mem_thread_01
```

## wolf rule

Rules are added only by user request — agents must not seed rules. Generated namespace: `wolf rule add` adds `--scope <project|global>`, `--applies-to <items>`, `--trigger <trigger>` and `--trigger-keywords <items>` to the common flags; `wolf rule list` lists rules.

```bash
wolf rule add --title "Search before writing scripts" \
  --body "Check tool memory first." --scope project
```

## wolf relation

Typed edges tie work artifacts together — decisions to threads, notes to decisions:

```bash
wolf relation add mem_002 supports mem_thread_01
```

- `wolf relation list [--of <id>] [--json]` — both directions of an object, output as `subject -predicate-> object`;
- `wolf relation remove <id>` — appends a compensating record (`removed: true`) to `relations.jsonl`; the log is append-only, edges marked `removed` are not read, and rolling back a removal means removing the record.

Full reference: [Memory](/guide/cli/memory).

## wolf complain

File a complaint about a rule/playbook/agent as a memory object (type `complaint`, status `open`) — the hot signal for the Steward.

```text
Usage: wolf complain [options]
```

Options:

- `--about <about>` — complaint target: agent id, `skill:<name>` or an existing mem-id
- `--rule <rule>` — which rule is bad (pointer + what it requires)
- `--evidence <evidence>` — proof: a verbatim quote + what happened (file/test/numbers); `--text` is a deprecated alias
- `--proposal <proposal>` — the proposed change to the rule
- `--created-by <actor>` — creator actor (default: env `WOLF_ACTOR`, else `user:cli`)

The complaint lands in the store as a first-class object with required `about`/`rule`/`evidence`/`proposal` fields and triage fields for the Steward (`wolf update --set triage|resolution`); its lifecycle is `open → resolved | rejected | archived`.

```bash
wolf complain --about skill:apprentice --rule "step 2 requires a plan review" \
  --evidence "Run of 2026-09-04 skipped the plan review step (diff has no review notes)" \
  --proposal "Make the gate blocking in CI, not advisory"
```
