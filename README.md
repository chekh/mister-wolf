# Mr. Wolf

![Mr. Wolf logo](docs/Mr.%20Wolf.png)

> **"I solve problems."**
>
> Local-first Project Semantic Memory layer for AI coding agents.
>
> Not another agent. A memory substrate for agents.
>
> See [docs/concept-v3.md](docs/concept-v3.md) for the full architecture and concept.

## Status

MVP-A (Core Memory + Search) implemented. MVP-B (Project Scan + Agent Brief) implemented.

## Quick Start

```bash
npm install
npm run build
node dist/bootstrap/cli.js memory init
node dist/bootstrap/cli.js memory add --type lesson --title "First lesson" --body "What we learned"
node dist/bootstrap/cli.js memory rebuild-index
node dist/bootstrap/cli.js memory search "lesson"
```

## Commands

- `wolf memory init` — initialize Mr. Wolf memory in the project.
- `wolf memory add` — add a memory object (lesson, decision, observation, etc.).
- `wolf memory list` — list memory objects, optionally filtered by type or status.
- `wolf memory get <id>` — retrieve a single memory object by ID.
- `wolf memory search <query>` — full-text search over memory objects.
- `wolf memory supersede <old-id> <new-id>` — mark an older memory object as superseded.
- `wolf memory rebuild-index` — rebuild the SQLite FTS5 index from markdown source files.
- `wolf memory scan` — scan the project for external documents and register them by reference.
- `wolf memory brief` — generate an agent brief from active memory objects.
- `wolf memory brief --write` — write the generated brief to `AGENTS.md` and `active-warnings.md`.

### Scan

`wolf memory scan` walks the project for relevant documents (README, specs, ADRs, plans, notes) and registers them as memory objects by reference, without copying files into `.wolf/memory`. It also reports orphan docs that are not referenced by any memory object.

### Brief

`wolf memory brief` reads active memory objects and produces a concise agent brief: project context, key decisions, open questions, warnings, and useful entry points. With `--write`, it exports the brief to `AGENTS.md` and `active-warnings.md` so the next agent can start with full context.

## Documentation

- [Concept v3](docs/concept-v3.md) — architecture and concept
- [Docs index](docs/README.md) — specs, plans, and archived materials

## Development

```bash
npm install
npm run check       # format check + lint + tests + build
npm run format      # format code with Prettier
npm run lint        # type check with TypeScript
npm run test:run    # run tests once
npm run build       # compile TypeScript
```

## License

MIT © 2026 chekh
