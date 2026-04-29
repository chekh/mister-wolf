## graph-demo.yaml

Demonstrates **graph execution mode** with parallel step scheduling.

Key features:
- `fetch_users` and `fetch_orders` run **in parallel** (no dependencies)
- `validate_data` waits for both fetches to complete
- `generate_report` runs after validation
- `max_parallel: 2` limits concurrency

Run:
```bash
wolf run examples/graph-demo.yaml --json
```
