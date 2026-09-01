# Work Management

## wolf thread

Manage work threads.

```text
Usage: wolf thread [options] [command]
```

Commands: `create`, `list`, `brief`.

### wolf thread create

Create a work thread.

```text
Usage: wolf thread create [options]
```

Options:

- `--title <title>` — thread title
- `--goal <goal>` — thread goal
- `--current-state <state>` — current state (default: `""`)
- `--next-steps <steps>` — comma-separated next steps
- `--created-by <actor>` — creator actor (default: `user:cli`)

```bash
wolf thread create --title "Docs site" --goal "Ship the VitePress site" --next-steps "write pages,build,deploy"
```

### wolf thread list

List work threads.

```text
Usage: wolf thread list [options]
```

No options beyond `-h, --help`.

### wolf thread brief

Generate a brief for a work thread.

```text
Usage: wolf thread brief [options] <thread-id>
```

Arguments: `thread-id` — thread id.

## wolf decision

Manage decisions.

```text
Usage: wolf decision [options] [command]
```

Commands: `add`, `list`.

### wolf decision add

Add a decision.

```text
Usage: wolf decision add [options]
```

Options:

- `--title <title>` — decision title
- `--body <body>` — decision body
- `--thread <thread-id>` — parent thread id
- `--based-on <ids>` — comma-separated artifact ids this decision is based on
- `--created-by <actor>` — creator actor (default: `user:cli`)

```bash
wolf decision add --title "Use worktrees for docs work" --body "Trunk-based; work in .worktrees/<task>."
```

### wolf decision list

List decisions.

```text
Usage: wolf decision list [options]
```

Options:

- `--thread <thread-id>` — filter by thread

## wolf blocker

Manage blockers.

```text
Usage: wolf blocker [options] [command]
```

Commands: `add`, `list`, `resolve`.

### wolf blocker add

Add a blocker.

```text
Usage: wolf blocker add [options]
```

Options:

- `--title <title>` — blocker title
- `--impact <impact>` — blocker impact
- `--workaround <workaround>` — possible workaround
- `--thread <thread-id>` — parent thread id
- `--created-by <actor>` — creator actor (default: `user:cli`)

```bash
wolf blocker add --title "CI blocked" --impact "No releases" --workaround "Run tests locally"
```

### wolf blocker list

List blockers.

```text
Usage: wolf blocker list [options]
```

Options:

- `--thread <thread-id>` — filter by thread

### wolf blocker resolve

Resolve a blocker.

```text
Usage: wolf blocker resolve [options] <id>
```

Arguments: `id` — blocker id.

Options:

- `--by <artifact-id>` — artifact that resolves the blocker

## wolf info-request

Manage info requests.

```text
Usage: wolf info-request [options] [command]
```

Commands: `create`, `list`.

### wolf info-request create

Create an info request.

```text
Usage: wolf info-request create [options]
```

Options:

- `--title <title>` — request title
- `--thread <thread-id>` — parent thread id
- `--question <question>` — question to answer
- `--detour-reason <reason>` — why this derails the main session
- `--expected-answer <answers>` — comma-separated expected answer items
- `--needed-for <items>` — comma-separated items this answer is needed for
- `--preliminary-answer <answer>` — preliminary answer (default: `""`)
- `--created-by <actor>` — creator actor (default: `user:cli`)

### wolf info-request list

List info requests.

```text
Usage: wolf info-request list [options]
```

Options:

- `--thread <thread-id>` — filter by thread

## wolf article

Manage articles.

```text
Usage: wolf article [options] [command]
```

Commands: `add`, `list`.

### wolf article add

Add an article.

```text
Usage: wolf article add [options]
```

Options:

- `--title <title>` — article title
- `--thread <thread-id>` — parent thread id
- `--summary <summary>` — article summary
- `--body <body>` — article body
- `--answers <ids>` — comma-separated answered info-request ids
- `--supports <items>` — comma-separated items this article supports
- `--evidence <items>` — comma-separated evidence items
- `--created-by <actor>` — creator actor (default: `user:cli`)

### wolf article list

List articles.

```text
Usage: wolf article list [options]
```

Options:

- `--thread <thread-id>` — filter by thread

## wolf rule

Manage rules.

```text
Usage: wolf rule [options] [command]
```

Commands: `add`, `list`.

### wolf rule add

Add a rule (user only).

```text
Usage: wolf rule add [options]
```

Options:

- `--title <title>` — rule title
- `--body <body>` — rule body
- `--scope <scope>` — rule scope (`project|global`)
- `--applies-to <items>` — comma-separated paths/patterns
- `--trigger <trigger>` — when to apply the rule
- `--created-by <actor>` — creator actor (default: `user:cli`)

```bash
wolf rule add --title "Search before writing scripts" --body "Check tool memory first." --scope project
```

### wolf rule list

List rules.

```text
Usage: wolf rule list [options]
```

No options beyond `-h, --help`.

## wolf relation

Manage relations between memory objects.

```text
Usage: wolf relation [options] [command]
```

Commands: `add`.

### wolf relation add

Record a relation between two memory objects.

```text
Usage: wolf relation add [options] <subject> <predicate> <object>
```

Arguments: `subject` — subject memory object id; `predicate` — relation predicate; `object` — object memory object id.

Options:

- `--source <source>` — relation source (default: `agent`)

```bash
wolf relation add mem_001 supports mem_002
```
