# Design: Phase 6 — Governance

> Date: 2026-07-02
> Topic: phase-6-governance
> Status: approved

## Goal

Introduce governance attributes (`memory_class`, `truth_role`, `lifetime`) into the memory object model, enforce default rules on creation, validate invariants, and guard lifecycle transitions.

## Scope

This is the minimal complete slice of Phase 6:

1. Add `memory_class`, `truth_role`, and `lifetime` to `MemoryObjectSchema`.
2. Apply `governanceDefaults(createdBy)` in every create/add use case.
3. Integrate `validateGovernance` into `validateMemoryObject`.
4. Enforce `ALLOWED_TRANSITIONS` in `transitionMemoryObject`.
5. Add unit/integration tests.

Out of scope: CLI flags for overriding governance, list filters by governance, review workflows for promoting `truth_role`, stale automation based on `lifetime`.

## Schema changes

Extend `MemoryObjectSchema` with:

- `memory_class`: `z.enum(['working', 'canonical'])`
- `truth_role`: `z.enum(['proposed_knowledge', 'accepted_knowledge', 'source_of_truth'])`
- `lifetime`: `z.enum(['long_term', 'short_term', 'session'])`

Existing objects without these fields will fail schema validation on read until migrated. Because the project is pre-1.0 and local-first, migration is out of scope; tests create fresh objects.

## Defaults

All create use cases call:

```ts
const governance = governanceDefaults(input.createdBy);
```

and merge it into the constructed object.

- `memory_class`: always `'working'`
- `lifetime`: always `'long_term'`
- `truth_role`: `'proposed_knowledge'` if `createdBy` starts with `agent:`, otherwise `'accepted_knowledge'`

## Validation

`validateMemoryObject` will call `validateGovernance` and append governance warnings to its existing warnings.

Current governance rule:

- `truth_role === 'source_of_truth'` requires `memory_class === 'canonical'`.

## Lifecycle transitions

`transitionMemoryObject` will call `canTransition(fromStatus, toStatus)` before applying the change. If disallowed, it throws `TransitionNotAllowedError`.

The existing `ALLOWED_TRANSITIONS` map is kept unchanged.

## Files to change

- `src/domain/schemas/memory-object-schema.ts` — add fields.
- `src/domain/governance.ts` — export types `MemoryClass`, `TruthRole`, `Lifetime`.
- `src/domain/policies/write-protocol.ts` — integrate governance validation.
- `src/app/use-cases/add-memory-object.ts` — apply defaults.
- `src/app/use-cases/create-decision.ts` — apply defaults.
- `src/app/use-cases/create-blocker.ts` — apply defaults.
- `src/app/use-cases/create-info-request.ts` — apply defaults.
- `src/app/use-cases/create-work-thread.ts` — apply defaults.
- `src/app/use-cases/create-article.ts` — apply defaults.
- `src/app/use-cases/create-session-checkpoint.ts` — apply defaults.
- `src/app/use-cases/resolve-blocker.ts` — apply defaults on resolved object.
- `src/app/use-cases/supersede-memory-object.ts` — apply defaults on new object.
- `src/app/use-cases/transition-memory-object.ts` — enforce allowed transitions.
- `tests/unit/domain/governance.test.ts` — new tests.
- `tests/integration/governance-workflow.test.ts` — new tests.
- `tests/unit/use-cases/transition-memory-object.test.ts` — add disallowed transition test.

## Success criteria

- `npm run check` passes.
- New governance tests pass.
- Existing tests updated to include new fields where they construct raw `MemoryObject` values.
