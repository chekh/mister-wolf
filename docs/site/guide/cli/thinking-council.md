# Thinking & Council

## wolf think

Structured thinking sequences (goal → thoughts → conclusion).

```text
Usage: wolf think [options] [command]
```

Commands: `start`, `add`, `conclude`, `abandon`.

### wolf think start

Start a thinking sequence.

```text
Usage: wolf think start [options]
```

Options:

- `--goal <goal>` — goal of the thinking sequence
- `--thread <thread-id>` — parent thread id
- `--created-by <actor>` — creator actor (accepted for surface parity; not persisted on scratch; default: `user:cli`)

```bash
wolf think start --goal "Pick a docs-site generator"
```

### wolf think add

Add a thought to a thinking sequence.

```text
Usage: wolf think add [options]
```

Options:

- `--sequence <id>` — thinking sequence id
- `--type <type>` — thought type. Choices: `hypothesis`, `reasoning`, `evidence`, `concern`
- `--text <text>` — thought text

### wolf think conclude

Conclude a thinking sequence into a decision with an embedded thinking trace.

```text
Usage: wolf think conclude [options]
```

Options:

- `--sequence <id>` — thinking sequence id
- `--title <title>` — decision title
- `--body <body>` — decision body
- `--created-by <actor>` — creator actor (default: `user:cli`)

### wolf think abandon

Abandon a thinking sequence without creating a decision.

```text
Usage: wolf think abandon [options]
```

Options:

- `--sequence <id>` — thinking sequence id

## wolf council

Council operations.

```text
Usage: wolf council [options] [command]
```

Commands: `tally`, `synthesize`.

### wolf council tally

Tally council votes.

```text
Usage: wolf council tally [options]
```

Options:

- `--question-id <id>` — question ID
- `--quorum <n>` — minimum votes required
- `--threshold <x>` — consensus threshold (0-1; default: 0.5)

### wolf council synthesize

Create synthesis from council opinions.

```text
Usage: wolf council synthesize [options]
```

Options:

- `--question-id <id>` — question ID
- `--recommendation <text>` — recommendation text
- `--created-by <actor>` — creator actor (default: `user:cli`)
