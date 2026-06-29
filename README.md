# Mr. Wolf

> **"I solve problems."**
>
> Local-first Project Semantic Memory layer for AI coding agents.
>
> Not another agent. A memory substrate for agents.
>
> See [docs/concept-v3.md](docs/concept-v3.md) for the full architecture and concept.

## Status

MVP-A (Core Memory + Search) implemented. Next: Project Scan + Agent Brief (MVP-B).

## Quick Start

```bash
npm install
npm run build
node dist/bootstrap/cli.js memory init
node dist/bootstrap/cli.js memory add --type lesson --title "First lesson" --body "What we learned"
node dist/bootstrap/cli.js memory rebuild-index
node dist/bootstrap/cli.js memory search "lesson"
```

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
