# Accumulated tools

A useful script can become a reusable project capability. Wolf keeps a discoverable card for its purpose, source files, inputs, outputs and environment. The next task can start from an existing solution rather than recreating it.

The working process connects the tool to a task and its verification; registration alone does not establish that the script is suitable or safe in every environment.

## Find before writing

```bash
wolf tool list
wolf search "documentation links"
```

Inspect the candidate's contract and source before using it. An obsolete or incompatible tool should not win merely because it already exists. Report missing capability or repeated friction to the responsible executor; methodology changes follow the [Steward loop](/guide/feedback).

## Register a checked project resource

For an existing, tested script at `scripts/check-links.sh`:

```bash
wolf tool register scripts/check-links.sh --name check-links --language bash \
  --contract-in "Project root" \
  --contract-out "Exit 0 for valid links; nonzero with diagnostics" \
  --contract-env "Bash and the script's declared dependencies"
```

The script path must exist in the project. This example defines the intended contract; validate that your actual script meets it before registration. Add significant supporting files with repeated `--resource <path>` flags.

Registration stores a reference; it does not copy source into `.wolf/tools/`. When source changes, update the same card explicitly with `--update <name-or-id>` and the current path/options. Older cards pointing into `.wolf/tools/` remain supported. Source digests check the listed files, not the entire environment or side effects.

## Use, expose and retire

```bash
wolf tool use check-links
```

`tool use` records usage and prints the contract. **It does not execute the script.** Run the actual entrypoint only under the task's permissions and environment.

`wolf tool expose check-links` generates an OpenCode skill from the card. Exposure makes the tool discoverable through another channel; it does not grant execution authority. `tool deprecate` and `tool revive` manage availability as the project changes. Exact flags: [CLI reference](/guide/cli/command-reference).

## Inspect reuse when useful

`wolf tool stats` shows usage counters and, when run records contain the necessary data, a reuse comparison. `usage_count` establishes that use was recorded, not how much time or money it saved.

The token-weight comparison uses `weighted = input + 0.1 × cache_read + 5 × output`. It compares median weighted usage of tool-marked runs with all recorded runs. At least three usable records are required in each group; a nonpositive overall median does not produce a savings percentage. The groups can overlap and contain different tasks, so the percentage is descriptive rather than a causal estimate.

A local observation can help maintain the tool library without becoming a universal productivity claim. More on data quality and interpretation: [Analytics](/guide/analytics).
