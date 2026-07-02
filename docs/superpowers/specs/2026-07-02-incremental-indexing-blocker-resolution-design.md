# Design: Resolve Incremental Indexing Blocker

> Date: 2026-07-02
> Topic: incremental-indexing-blocker-resolution
> Status: approved

## Problem

Active blocker `mem_20260630_need_incremental_indexing_bddb0a` claims that every `memory add` requires a manual `memory rebuild-index` before search sees new objects.

## Current state

The production code already supports incremental indexing:

- `addMemoryObject`, `createDecision`, `createBlocker`, `createInfoRequest`, `createWorkThread`, `createArticle`, `createSessionCheckpoint`, `resolveBlocker`, `supersedeMemoryObject`, and `transitionMemoryObject` all accept an optional `SearchIndex` dependency.
- When provided, they call `index.indexObject(object)` immediately after persisting the object.
- `SQLiteSearchIndex.indexObject` does an upsert: removes the old row, then inserts the new one.

The only gap is **test coverage**: existing integration tests still call `rebuildMemoryIndex` before searching, so the incremental path is not explicitly verified.

## Decision

Keep `memory rebuild-index` as an emergency full-reindex command and close the blocker by adding an integration test that proves incremental indexing works without rebuild.

## Changes

1. Add `tests/integration/incremental-indexing.test.ts` that:
   - Initializes a project.
   - Adds a memory object via `addMemoryObject` with the `index` dependency.
   - Searches immediately without calling `rebuildMemoryIndex`.
   - Asserts the object is found.
2. Transition blocker `mem_20260630_need_incremental_indexing_bddb0a` to status `resolved`.

## Out of scope

- Removing `rebuild-index` command.
- Refactoring existing tests to stop using `rebuildMemoryIndex`.

## Success criteria

- New integration test passes.
- `npm run check` passes.
- Blocker status updated to `resolved`.
