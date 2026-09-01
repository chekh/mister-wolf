# Sessions & Context

## wolf scan

Scan the project and save a context snapshot.

```text
Usage: wolf scan [options]
```

No options beyond `-h, --help`.

## wolf brief

Generate the agent brief from the latest scan and memory.

```text
Usage: wolf brief [options]
```

No options beyond `-h, --help`.

## wolf recap

Summarize active project memory: rules, threads, blockers, questions, decisions.

```text
Usage: wolf recap [options]
```

No options beyond `-h, --help`.

## wolf call

Get active call injections — the cold-start delivery of relevant rules, lessons and call-injections. See [Injections](/guide/core-concepts#injections) for the matching and ranking mechanics.

```text
Usage: wolf call [options]
```

Options:

- `--for <topic>` — topic to match injections against
- `--thread <thread-id>` — thread id for thread mode
- `--compact [chars]` — compact budget in chars (default 1200)

```bash
wolf call --for vitest --compact
```

## wolf insights

Heuristic pattern analysis over project memory (Level 1, no LLM).

```text
Usage: wolf insights [options]
```

Options:

- `--topic <topic>` — filter by topic: exact tag match or substring in title/body
- `--type <type>` — analysis lens. Choices: `patterns`, `technical_debt`, `decisions`, `lessons`, `activity` (default: `patterns`)

```bash
wolf insights --type technical_debt
```

## wolf session

Manage sessions and checkpoints.

```text
Usage: wolf session [options] [command]
```

Commands: `checkpoint`, `wrap-up`.

### wolf session checkpoint

Create a checkpoint for a work thread.

```text
Usage: wolf session checkpoint [options]
```

Options:

- `--thread <thread-id>` — thread id
- `--created-by <actor>` — creator actor (default: `user:cli`)

```bash
wolf session checkpoint --thread mem_20260831_docs
```

### wolf session wrap-up

Manually create a session-summary of recent events.

```text
Usage: wolf session wrap-up [options]
```

Options:

- `--title <title>` — summary title
- `--tags <tags>` — comma-separated tags

```bash
wolf session wrap-up --title "Docs pages written" --tags "docs,site"
```

## wolf diff

Show thread changes since a checkpoint.

```text
Usage: wolf diff [options] <thread-id>
```

Arguments: `thread-id` — thread id.

Options:

- `--since <checkpoint-id>` — checkpoint id

```bash
wolf diff mem_20260831_docs --since mem_20260831_cp1
```

## wolf solve

Build a solve pack for a memory problem.

```text
Usage: wolf solve [options] <problem>
```

Arguments: `problem` — problem description.

Options:

- `--save` — save a memory repair request
- `--thread <id>` — thread the repair request

```bash
wolf solve "broken relation links" --save
```
