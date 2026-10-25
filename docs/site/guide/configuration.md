# Configuration

## Project config: `.wolf/config.yaml`

Each project's configuration lives in `.wolf/config.yaml` (YAML validated by a zod schema). Keys and defaults:

| Key                                 | Type / default                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `schema_version`                    | int; current **2**. Legacy projects without the marker are treated as 1                                                                  |
| `wolf_version`                      | semver stamp of the wolf that wrote the config; taxonomy drift marker — a mismatch with the running binary warns `wolf migrate taxonomy` |
| `artifact_sources`                  | string[]; default `[]`                                                                                                                   |
| `memory_types.project`              | your custom types: `lifecycle`, `subdir_thread`, `subdir_shared`, `fields`; cannot conflict with core types                              |
| `error_class_taxonomy`              | `[{id, match[]}]`; default `[]`                                                                                                          |
| `facets.character`                  | string[] of **7–10** values; closed "record character" dictionary for the `note` type's `--facet`; default — the canonical 7             |
| `learning.pattern_threshold`        | int >= 1; default **3**                                                                                                                  |
| `learning.decay_ttl`                | map of type → number of sessions without a hit                                                                                           |
| `learning.effectiveness_thresholds` | `{noise_ok, noise_warn, silent_ok}` — percentages                                                                                        |
| `pricing`                           | map model → `{input, output, cache_read}` in $/Mtok; without the block `$` fields are hidden (numbers are never invented)                |
| `analytics.thresholds`              | memory lifecycle classification: `{new_days, workhorse_uses}`; default `{14, 3}`                                                         |
| `delivery.context_budget_tokens`    | int > 0; session context budget for the injection warning, tokens; default **200000**                                                    |
| `delivery.context_warning_pct`      | number ≥ 0; warn when session injections exceed this share of the budget, %; default **20**, `0` disables                                |

Example (defaults shape):

```yaml
schema_version: 2
wolf_version: 2.12.0 # stamp of the wolf that wrote the config
artifact_sources: []
memory_types:
  project: {} # your custom types
error_class_taxonomy: []
# Closed "record character" dictionary for notes (validated on `wolf add --facet`);
# 7–10 values; omit the key for the default 7
facets:
  character: [howto, pitfall, context, metric, history, legacy, constraint]
learning:
  pattern_threshold: 3
  decay_ttl: {} # type -> sessions without a hit
  # effectiveness_thresholds: { noise_ok, noise_warn, silent_ok } — percentages
# $ conversion: model -> $/Mtok; without the block, $ fields are hidden
pricing:
  zai-coding-plan/glm-5.2:
    input: 0.6
    output: 2.2
    cache_read: 0.08
analytics:
  thresholds:
    new_days: 14 # NEW until this age
    workhorse_uses: 3 # WORKHORSE from this many uses
# Soft context limit for `wolf call` injections (bytes/4 token approximation):
# one stderr warning above the share, delivery is never cut; 0 disables
delivery:
  context_budget_tokens: 200000
  context_warning_pct: 20
```

`pricing` and `analytics.thresholds` drive the [effectiveness analytics](/guide/cli/analytics#configuration) (`$` fields and lifecycle classes); the same keys are documented there with examples.

A broken YAML is only repaired by `wolf init --recreate`: the corrupted file is backed up to `.wolf/backup/<ts>/` and a default config is rendered.

### Delivery context limit

`delivery.*` is a soft limit on `wolf call` injections — a warning, never a cut:

- `delivery.context_budget_tokens` (default **200000**) — the session context budget the warning is computed against (bytes/4 token approximation);
- `delivery.context_warning_pct` (default **20**) — when a session's injections exceed this share of the budget, `wolf call` prints **one** stderr warning; the delivery itself is never trimmed. `0` disables the warning.

## Custom memory types

`memory_types.project` extends the taxonomy with your own types. Each project type declares:

- `lifecycle` — the statuses the type participates in;
- `subdir_thread` / `subdir_shared` — where objects of the type live (thread-scoped or shared layout);
- `fields` — type-specific fields.

Project types cannot conflict with core types. The core taxonomy lives in the code canon — the config carries no dump of it, only the `wolf_version` stamp; a mismatch with the running binary shows up as a `wolf validate` warning. Two commands manage the taxonomy:

```bash
wolf taxonomy show   # print the effective taxonomy (code canon + project types)
wolf taxonomy sync   # rewrite .wolf/config.yaml: project types and settings preserved, wolf_version stamp refreshed
```

## Facets

`facets.character` overrides the closed "record character" dictionary of the `note` type — the values `--facet` accepts on `wolf add`:

- the list must contain **7–10 non-empty values**; a broken block is a loud config error, never a silent fallback;
- without the key the canonical 7 are used: `howto`, `pitfall`, `context`, `metric`, `history`, `legacy`, `constraint`;
- `wolf add --facet <value>` validates against the effective dictionary — an unknown value is rejected.

What facets mean for notes — see [Memory model](/guide/memory).

## Storage layout

What `wolf init` creates and what appears lazily:

```text
.wolf/
├── config.yaml            # project config
├── memory/
│   ├── threads/<tid>/     # created by init; object layout v2:
│   │   └── <subdir>/<id>.md   # threads/<tid>/<subdir>/<id>.md
│   ├── shared/<subdir>/   # created by init; shared/<subdir>/<id>.md
│   ├── briefs/            # created by init
│   ├── events.jsonl       # lazy
│   ├── relations.jsonl    # lazy
│   └── quarantine/        # lazy; broken objects quarantined by wolf validate --fix
├── cache/
│   ├── index.sqlite       # lazy; SQLite FTS search index
│   └── sessions/          # lazy; per-session delivery registries (dedup), GC after 7 days
├── metrics/               # lazy; session-metrics.jsonl, patterns.jsonl, signal-counts.json (derived counters)
├── thinking/              # lazy; structured thinking sequences
├── tools/                 # lazy; registered tool scripts
├── backup/<ts>/           # lazy; config backups from wolf init --recreate
└── backup/upgrade/<date>/ # lazy; local copy before every upgrade overwrite/removal (no GC)
```

A work thread lives at `memory/threads/<tid>/WORK-THREAD.md`.

## Platform configs and `mcp.wolf`

Platform configs (`opencode.json`, Claude's `.mcp.json`) are written by `wolf init --platform <ids>` — the list replaces the current set — and never by a plain minimal `init`. What a minimal `init` does with them since 2.20.0 is **repair only**:

- platform config file **exists** and the platform is detected → a missing or corrupted `mcp.wolf` entry is restored (alongside `default_agent` / `subagent_depth`), the rest of the JSON is preserved untouched;
- the entry is already canonical → `unchanged` (idempotent; a second `init` writes nothing);
- the config file **does not exist** → nothing is created — a minimal init stays minimal, and `--platform opencode` remains the explicit way to write a platform config;
- the config is broken JSONC → not touched at all: `init` reports `skipped` with the reason and exits `0` (`wolf init --recreate` is the escape hatch for a corrupted `.wolf/config.yaml`, not for platform configs).

This is what makes the `wolf doctor` advice (`run wolf init` when the wolf entry is missing) actionable: after a successful repair the doctor no longer reports `wolf entry missing`. Foreign MCP entries in the same file are never touched.

## Global config

User-level (cross-project) configuration lives under `$XDG_CONFIG_HOME/wolf`, or `~/.config/wolf` when `XDG_CONFIG_HOME` is not set.

## Schema version

The current store schema version is **2**; legacy projects without the `schema_version` marker are version 1. `wolf doctor` checks all registered projects for binary vs schema version mismatches, verifies platform configs and prunes dead entries:

```bash
wolf doctor
```
