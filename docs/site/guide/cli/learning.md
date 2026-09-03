# Learning

## wolf learn

Self-learning loop: pattern digest, signal-log health, draft propose/validate/activate.

```text
Usage: wolf learn [options] [command]
```

Commands: `digest`, `status`, `propose`, `validate`, `activate`, `gate`, `decay`, `evolve`, `route`.

### wolf learn digest

Active patterns with live counts, recent examples, evidence refs and post-audit drafts.

```text
Usage: wolf learn digest [options]
```

No options beyond `-h, --help`.

### wolf learn status

Signal-log health: volumes, threshold, Layer 1-2 meta-metrics, decay drift, last events.

```text
Usage: wolf learn status [options]
```

No options beyond `-h, --help`.

### wolf learn propose

Create a draft lesson/rule from an active pattern (mechanical generator, no LLM).

```text
Usage: wolf learn propose [options] <pattern-key>
```

Arguments: `pattern-key` — the pattern to propose a draft from.

Options:

- `--negative` — negative constraint: anti-rule banning the tool entirely
- `--created-by <actor>` — creator actor (default: env `WOLF_ACTOR`, else `steward:archivist`)

### wolf learn validate

Sandbox Replay Holdout: replay the draft on `tool_error` events after its creation.

```text
Usage: wolf learn validate [options] <draft-id>
```

Arguments: `draft-id` — the draft to validate.

### wolf learn activate

Activate a validated draft (gate: holdout pass, or `--human-approved`).

```text
Usage: wolf learn activate [options] <draft-id>
```

Arguments: `draft-id` — the draft to activate.

Options:

- `--human-approved` — human review override for text drafts (`needs_human_review`)
- `--created-by <actor>` — actor (default: env `WOLF_ACTOR`, else `steward:archivist`)

### wolf learn gate

STOP-gate (phase 23): delivery pressure scenarios + read-only zone probe (run separately, outside `check`).

```text
Usage: wolf learn gate [options]
```

No options beyond `-h, --help`.

### wolf learn decay

Phase 26: mileage-based decay run (sessions) — `review_required` queue, reactivation, drift.

```text
Usage: wolf learn decay [options]
```

Options:

- `--dry-run` — compute without writing changes to objects

```bash
wolf learn decay --dry-run
```

### wolf learn evolve

Phase 24 GEPA: candidate vs current template (`.wolf/templates/<id>.md`) by a deterministic metric; activation is human-only.

```text
Usage: wolf learn evolve [options] <template-id>
```

Arguments: `template-id` — the template to evolve.

Options:

- `--write` — write the candidate file `<id>.candidate.md` (NOT activation; activation is a human gate)

### wolf learn route

Phase 25: review-depth heuristic from task features (a recommendation; the decision stays with the human).

```text
Usage: wolf learn route [options]
```

Options:

- `--type <t>` — task type: `feature|bugfix|refactor|docs|experiment`
- `--files <n>` — number of files in the change
- `--lines <n>` — number of lines in the change
- `--blast-radius <x>` — blast radius 0..1
- `--touches-read-only` — the change touches a read-only zone (gates/logs/skeleton)
- `--security` — security: trust boundaries, secrets
- `--metricless` — no deterministic quality metric

## wolf effectiveness

Memory effectiveness panel: rules holdout, tool economy, delivery, noise, routing (aggregation only, no LLM).

```text
Usage: wolf effectiveness [options]
```

- `--snapshot` — append the full report to `.wolf/metrics/effectiveness-snapshots.jsonl` (append-only history for trends). See [Analytics](/guide/cli/analytics#wolf-effectiveness) for deltas and the absolutes block.

## wolf complain

Record a complaint about agent/methodology behavior (hot-signal for the Steward).

```text
Usage: wolf complain [options]
```

Options:

- `--about <about>` — complaint target: playbook id, agent id or skill name (e.g. `skill:apprentice`)
- `--text <text>` — complaint text
- `--created-by <actor>` — creator actor (default: env `WOLF_ACTOR`, else `user:cli`)

```bash
wolf complain --about skill:apprentice --text "Skipped the plan review step"
```
