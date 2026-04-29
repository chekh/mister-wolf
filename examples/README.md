# Mr. Wolf Examples

This directory contains example workflows demonstrating different features of Mr. Wolf.

## hello-world.yaml

Basic workflow introducing echo, shell, and manual_gate runners.

```bash
wolf run examples/hello-world.yaml
```

## gate-workflow.yaml

Approval workflow demonstrating `manual_gate` runner.

```bash
wolf run examples/gate-workflow.yaml
wolf approve <gate_id>
wolf resume <case_id>
```

## retry-and-conditions.yaml

Demonstrates conditions (`when`), retry policy, and artifacts.

```bash
wolf run examples/retry-and-conditions.yaml
```

## shell-error.yaml

Error handling example with shell runner.

```bash
wolf run examples/shell-error.yaml
```

## duplicate-output.yaml

Validation error example (duplicate output variable).

```bash
wolf validate examples/duplicate-output.yaml
```

## graph-demo.yaml

Demonstrates **graph execution mode** with parallel step scheduling.

Key features:
- `fetch_users` and `fetch_orders` run **in parallel** (no dependencies)
- `validate_data` waits for both fetches to complete
- `generate_report` runs after validation
- `max_parallel: 2` limits concurrency

```bash
wolf run examples/graph-demo.yaml --json
```
