# Design: Session Wrap-Up Habit

> Date: 2026-07-02
> Topic: session-wrap-up-habit
> Status: approved

## Goal

Make Mr. Wolf automatically remember the outcomes of a coding session by creating `session-summary` memory objects on lifecycle events, with a fallback manual `wrap-up` command.

## Approach

Hybrid with an automatic bias:

1. **Auto-triggers** — create a `session-summary` after significant lifecycle events.
2. **Manual wrap-up** — explicit `wolf memory session wrap-up` command when auto-triggers miss context.
3. **Deduplication** — do not create more than one summary within a 5-minute window.

## Auto-triggers

The following use cases will call the wrap-up hook after success:

- `resolveBlocker` — blocker resolved.
- `transitionMemoryObject` — new status is one of `archived`, `completed`, `accepted`, `resolved`, `obsolete`.
- `supersedeMemoryObject` — old object superseded by new one.
- `createDecision` — decision created (captures outcome).
- `createArticle` — article created (captures thread outcome).

## Manual command

```bash
wolf memory session wrap-up [options]
  --title  Title for the summary
  --tags   Comma-separated tags
```

If `--title` is omitted, use `Session wrap-up YYYY-MM-DD HH:MM`.

## Summary content

A `session-summary` object with:

- `title`
- `body` containing:
  - What was done (events since the last `session-summary` or last 24h).
  - Decisions made.
  - Blockers resolved.
  - Objects created or transitioned.
  - Next steps if inferable.
- `tags`: `session-summary`, plus `auto` or `wrap-up`, plus event-derived tags.
- `source.kind`: `session`.

## Deduplication

Before creating an auto-summary, check if any `session-summary` object already exists with `created_at` within the last 5 minutes. If yes, skip.

## Components

- `src/app/use-cases/summarize-session.ts` — reads event log, generates summary object, saves it.
- `src/app/use-cases/should-summarize.ts` — deduplication guard.
- `src/adapters/cli/commands/memory-session-wrap-up.ts` — manual CLI command.
- Updates to `src/adapters/cli/cli-entry.ts` to register the command.
- Hook calls in `resolveBlocker`, `transitionMemoryObject`, `supersedeMemoryObject`, `createDecision`, `createArticle`.

## Out of scope

- NLP summarization of bodies.
- Periodic time-based checkpoints.
- Auto-summarization on every `addMemoryObject`.

## Success criteria

- `npm run check` passes.
- Resolving a blocker creates a `session-summary`.
- Manual `wrap-up` creates a `session-summary`.
- No duplicate summaries within 5 minutes.
