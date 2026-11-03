# Contributing to mister-wolf

Mr. Wolf organizes AI assistants around a project's goal, with continuing memory, working processes and governed learning through the Steward. The current full organization is OpenCode-first; the implementation is TypeScript/Node.

## Development setup

Use Node.js 22 or 24 on macOS or Linux with glibc:

```bash
npm ci
npm run check
npm run e2e
npm run docs:check
```

## Git flow

Use one feature branch and an isolated worktree per writer, based on the current `main`. Open a PR to `main`; do not commit directly to it. The active project policy uses `main` and feature branches, without `dev`. Preserve published history and save/push your work before handoff. Checks and authorized acceptance precede integration; a PR is not a release.

Use conventional commit subjects such as `docs: clarify the first Wolf session`. Releases are maintainer-only: do not bump `package.json`, create a release tag or publish the package as part of an ordinary contribution.

## Documentation is part of the change

The [website](https://chekh.github.io/mister-wolf/guide/overview) is the canonical user documentation. Edit its sources in `docs/site/`; do not recreate `docs/guide/`. README is an introduction and pointer, not a second detailed manual. Concept, requirements, design, plans and research remain engineering documents in Git.

When a change affects a user's expectation, action or control:

1. Identify the affected product statements, pages and examples in the task plan.
2. Update EN/RU together, including homepage components, navigation and README where affected.
3. Describe current behavior and limitations accurately; distinguish a working instruction from runtime enforcement and a shipped mechanism from a measured benefit.
4. Validate examples in an isolated project when needed; run `npm run docs:check`. Review desktop/mobile and both languages when layout changes.
5. Record results and remaining limitations in the existing test plan. A documentation reviewer checks the result against the task criteria; no new report per review round is required.

The change owner maintains affected pages; the integrating reviewer checks coverage. Release preparation includes the supplied `wolf-release-docs` workflow. [Maintaining documentation](https://chekh.github.io/mister-wolf/guide/documentation) gives the coverage checklist.

## Languages and generated content

Product-facing files are English with paired Russian README/site pages. Internal engineering documents may be Russian. Generate the CLI reference and changelog mirrors through `npm run docs:build`; do not independently edit generated output. Do not rewrite historical specifications or release notes as if they described the current product.

For substantial work, use the Wolf FULL profile: `docs/dev/<date>-<topic>/requirements.md`, `design.md`, `plan.md`, `test-plan.md`. Intermediate worker reports, logs and scripts belong in working memory or the appropriate code directories, not `docs/dev/`.

## Security

Do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md) and use a private [GitHub Security Advisory](https://github.com/chekh/mister-wolf/security/advisories/new).
