# Contributing to mister-wolf

Thanks for your interest in contributing! mister-wolf is a local-first project
memory harness for AI coding agents (TypeScript/Node).

## Dev setup

- Node >= 22
- Install dependencies and verify everything passes:

```bash
npm install
npm run check   # format + lint + build + tests
```

Your PR must have a green `npm run check`.

## Git flow

All changes land in the `dev` branch — please do not open PRs against `main`
directly.

1. Fork [chekh/mister-wolf](https://github.com/chekh/mister-wolf)
2. Branch from `dev`
3. Open your PR back into `dev`

## Commits

Follow the conventional style used in the repo history:

```
feat: add recall-depth option to solve
fix: handle empty signal log in brief
docs: update README EN/RU pair
test: cover call-injection triggers
```

Short imperative subject line; details in the body if needed.

## Versions & releases

Releases are maintainer-only: `npm version` + a `CHANGELOG.md` entry.
As a contributor, please do not bump versions in your PRs.

## Language policy

- Product-facing docs (README, SECURITY, CONTRIBUTING, issue/PR templates) —
  **English**.
- Internal docs (`docs/superpowers/`) — Russian is fine.
- README EN/RU pair is updated together in one commit.

## Security

Please do not report vulnerabilities in public issues. See
[SECURITY.md](SECURITY.md) and use a private
[GitHub Security Advisory](https://github.com/chekh/mister-wolf/security/advisories/new).
