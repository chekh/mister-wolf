# Release 3.4.0 — Requirements: contradiction/delivery contour integrity

Date: 2026-11-19
Source: owner's CHANGES*REQUIRED verdict on 3.3.2 (7 findings: 4×P1 integrity, 3×P2 behavior)
Base: v3.3.2 (`7c3674ba`), all 7 defects reproduced on the published artifact
(stand `/private/var/folders/p*/p7msymwd55vbzp44kkmnbc3w0000gn/T/opencode/repro-333`,
evidence `r1..r7-summary.txt`)
Release: **3.4.0** (SemVer minor: new optional CLI/MCP parameter, REQ-333-5)

## Goal

All seven findings are closed on ONE candidate. On the same candidate the three
scenarios of the 3.3.1 review re-pass: a long-lived MCP process sees a CLI record;
new records are shared between the main checkout and linked worktrees; a single
write interrupted mid-append restores the journal. Migration and concurrent-write
checks run through real processes.

## REQ-333-1 (P1) — Upgrade must not lose active suppressions from linked worktrees

A record created by 3.3.1 stays in the worktree-local journal. After upgrading to
3.3.2 nothing sees it and the note is delivered again (repro `r1`).

- AC-1.1: an active suppression created before the upgrade in a linked worktree
  (and in the main checkout) remains effective after the upgrade: `brief` hides
  the note, `list` shows the record, `resolve` addresses it.
- AC-1.2: import preserves open and resolved records, both evidences and the
  resolution history.
- AC-1.3: upgrade paths verified: with a shared journal present and without it,
  with several worktrees, and a repeated import run — a repeated import does not
  duplicate records.
- AC-1.4: a `suppression_id` collision does not overwrite history: the incoming
  record is preserved under a deterministic new id together with its resolution
  chain.

## REQ-333-2 (P1) — Parallel operations keep the journal consistent

Synchronization must cover state check, import, repair and write. Repro `r2a`
(repair erases a confirmed report), `r2b` (late import replaces a journal with a
confirmed report), `r2c` (two resolves of one id both succeed).

- AC-2.1: two real CLI processes with a managed pause in the repair window — both
  confirmed `report` records survive.
- AC-2.2: a late first import from SQLite does not replace a journal that already
  contains a confirmed `report`.
- AC-2.3: two parallel `resolve` of one id apply only one decision: the second
  gets an explicit refusal or a no-op acknowledgement; the journal does not end
  with two conflicting decision snapshots.
- AC-2.4: CLI and MCP obey one contract (same port/adapter path); checks run
  through real processes.

## REQ-333-3 (P1) — One validator for type and required fields

A line with valid JSON but an incomplete record silently removed an active
suppression (repro `r3`).

- AC-3.1: a full line with an invalid structure is never applied silently: an
  explicit diagnostic names the line; an active suppression does not disappear
  (`list`/`brief` keep the state).
- AC-3.2: the validator is single and used by journal reading, tail repair and
  import (including pre-upgrade worktree journals).
- AC-3.3: a truncated tail (invalid JSON — crash residue) keeps the existing
  repair semantics (finalize or truncate, REQ-332-3).

## REQ-333-4 (P1) — Journal loss must not silently resurrect the SQLite snapshot

After migration, losing the JSONL silently restored the frozen SQLite copy and
lost newer suppressions (repro `r4`).

- AC-4.1: first import and loss of an already-migrated journal are distinguished
  (persistent migration marker): on loss the state is unknown — micro-note
  delivery is suspended (fail-closed), `list`/`report`/`resolve` give an explicit
  diagnostic and never silently resurrect the snapshot.
- AC-4.2: an explicit restore action brings the journal back from the sources
  that exist (frozen SQLite, pre-upgrade journals) with a report of sources and
  losses; the design documents what data is available on restore and rollback.
- AC-4.3: removing BOTH the marker and the journal is the documented reset path
  (treated as a fresh first import).

## REQ-333-5 (P2) — Stale report must not block a fixed revision

A report carrying evidence about an old revision silently bound to the current
(new) revision and hid the fixed text (repro `r5`).

- AC-5.1: CLI `report --revision <value>` and MCP `note_contradiction`
  `observed_revision` are optional; absent — current behavior (bind to current
  revision).
- AC-5.2: when the observed revision differs from the current one, the command
  reports the change and does not suppress the new revision on the strength of
  the old evidence.

## REQ-333-6 (P2) — Block status must not mislead

`resolve --help` promised delivery resumption with a second open contradiction;
after removing the micro-note tag `list` kept showing `block: actual` (repro `r6`).

- AC-6.1: the help and resolve output distinguish closing ONE record from lifting
  the note's block: resolve states whether the note is still blocked by other
  open contradictions on the current revision.
- AC-6.2: `list` shows whether the record refers to a currently deliverable
  micro-note and does not promise delivery that depends on context.

## REQ-333-7 (P2) — Delivery cost must not grow with journal history

`brief` re-read the whole journal per note row: median ×4.18 vs 3.3.1 on a
100k-line journal (repro `r7`).

- AC-7.1: one `brief` or `call` works with one current snapshot of suppressions
  and writes deliveries as one batch; journal reads per invocation do not
  multiply by the number of notes.
- AC-7.2: the same measurement repeated on the candidate (synthetic journal,
  100 000 lines, 8 micro-notes): median ≤ 3.3.1 median × 1.10.

## Constraints (REQ-03 and carrier invariants preserved)

- "unknown stays unknown" (REQ-03) everywhere: unknown state is reported, not
  guessed.
- Journal line format `{kind, record}` and `cnr_` id semantics do not change;
  the carrier stays append-only JSONL at the shared memory root.
- CLI `wolf contradict` subcommands stay; additions only (new flags/commands,
  new MCP input fields) — no breaking changes.
- No new runtime dependencies unless justified in the design.
- Migration and concurrency acceptance criteria are verified through real
  processes (integration/e2e spawning node processes), not in-process mocks.

## Out of scope

- Store/search index performance beyond the journal path (REQ-333-7 covers
  journal reads/writes per brief/call invocation).
- Race windows smaller than a managed pause can hit (the synchronization
  primitive covers them by construction; acceptance is via the scripted pause
  scenarios).
- Redesign of the 3.3.1 review scenarios (they must keep passing unchanged).
