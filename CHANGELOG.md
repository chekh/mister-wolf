# Changelog

All notable changes to this project are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org/).

## [Unreleased]

## [2.2.1] — 2026-09-03

### Changed

- All wolf user-facing output is now English (CLI, MCP tool text, help); Russian remains in code comments/internal dev docs (bilingual policy: EN primary).

### Added

- english-surface gate in `npm run check`.

## [2.2.0] — 2026-09-02

### Added

- `wolf upgrade` — self-update of the global install: compares the installed version against the npm registry, installs the update via npm, and refuses dev/linked copies with a one-line remediation hint; `--check` only reports the latest available version without installing.

## [2.1.0] — 2026-09-02

### Changed

- Document-ref ids follow the memory canon `mem_<YYYYMMDD>_doc_<slug>_<hash8>` (was `doc_<path-tokens>`): no path pseudo-tokens in ids, no residual FTS noise; existing `doc_*` objects keep working and can be migrated explicitly.
- New `wolf migrate doc-ids` (dry-run by default, `--apply`): renames off-canon document-refs, rewrites every reference to the old id across memory (frontmatter, bodies, relations, supersede chains, thread pointers) and rebuilds the search index; `wolf scan` prints a reminder when off-canon ids are detected.

### Fixed

- F5: init log lists skills as `[skill] <name> → <path>` instead of N faceless `SKILL.md created` lines.
- F6: init platform lines name the actual config file and keys (`opencode.json: written (mcp.wolf, default_agent=mr-wolf, subagent_depth=2)`); every `skipped` carries a reason.
- F16: vitest runs are isolated from the global registry (`XDG_CONFIG_HOME` per-run tmp via `tests/setup.ts`) — `npm run check` no longer leaves dead entries in `~/.config/wolf/projects.yaml`.
- `wolf list --type document` resolves the deprecated alias to `document-ref` with a stderr warning (exit 0); unknown types exit 1 with the closest match and the list of valid types.
- Recreate-guard: `init --recreate` in a removed working directory exits with a one-line `Error: ...` (code 1) instead of a raw `uv_cwd` stack.

## [2.0.1] — 2026-09-01

### Fixed

- F13: removed working directory (`uv_cwd` ENOENT) now exits with a one-line `Error: ...` and code 1 instead of a Node stack trace.
- F14: bench runs are isolated from the global registry (`XDG_CONFIG_HOME` on a tmp dir) and clean up their `wolf-bench.*` leftovers on exit (`trap`).
- F15: `wolf init` writes `subagent_depth: 2` into `opencode.json` — the three-level scheme (Mr.Wolf → executor-lead → workers) works out of the box.
- Micronits: port comment clarified; onboarding-signal spec now keys on the bootstrap fact, not thread closure.

## [2.0.0] — 2026-09-01

### Breaking Changes

- Non-interactive `wolf init` (no TTY) now fails without an explicit `--model` — pass `--model` and `--platform` in scripts and CI.
- Model pins removed from rendered agents: models are set at `init` time (routing object, referenced as `{{model.*}}` in templates).
- `wolf init` no longer runs a full project scan — scanning moved to `wolf bootstrap`.

### Added

- Onboarding pipeline v2: first-session dialog policy in `AGENTS.md`, init report, explicit platform/model selection (flag > TTY prompt > documented default).
- Complaint loop v2: `complaint` memory type, triage, SLA, `wolf update` whitelist, anti-spam guard.
- FTS search (variant D): tokenized queries, `field:` allowlist, AND/OR operators, no silent zero-result fallbacks.
- `scripts/playground-reset.sh [--ref]` — snapshot an arbitrary git ref into the playground.

### Fixed

- F4: `opencode.json` with `mcp.wolf` and `default_agent` is written by the first init run (explicit platform choice instead of silent detection).
- F5/F6/F7: init output lists relative file paths, honest `skipped` reasons, and a next-steps block naming `opencode.json`/MCP and bootstrap.
- F8: init no longer scans the project ("foreign memory" issue) — the full scan lives in `wolf bootstrap`.
- F11: recap includes `accepted` rules alongside `active` ones.

## [1.1.0] — 2026-09-01

### Added

- Base sets: `wolf init` renders starter agents (6), skills (13), commands (3) and plugins (2) from templates bundled inside the npm package, and seeds 6 base playbooks.
- `wolf sync` — stamp-based re-rendering of base-set files with conflict/orphaned detection.

### Fixed

- Rendered plugin single-export contract, procedural complaint trigger, and `--title` flag in the complaint command (dogfood phase C fixes).

## [1.0.3] — 2026-08-31 (1.0.2 пропущен — тег создан до фикса e2e-allowlist, не публиковался)

### Changed (Docs)

- English product surface — README, CHANGELOG, SECURITY, package description (Russian stays internal).
- Community standards files: Code of Conduct, CONTRIBUTING, issue/PR templates.

## [1.0.1] — 2026-08-31

### Fixed

- `isNpxRun` accepts `npm_command='exec'` (real npx) instead of only `'npx'` — `npx mister-wolf init` no longer writes MCP configs against the try-out spec (4ac8168).

## [1.0.0] — 2026-08-31

First public release on npm.

### Added

- The `mister-wolf` npm package with the `wolf` binary (`npm install -g mister-wolf`).
- `wolf init` — idempotent non-interactive project initialization: `.wolf/` skeleton without overwriting existing files, platform auto-detection, MCP configs via opencode and Claude Code adapters, `--platform` flag.
- `npx mister-wolf init` — installation-free try-out: creates project memory, never writes MCP configs.
- Lazy schema migration: a `schema_version` marker in `.wolf/config.yaml`, a guard on entry (CLI/MCP), migration with a backup under a lock file.
- `wolf doctor` — health of registered projects: schema versions, config validity, dead registry entry cleanup.
- Publish pipeline: trusted publishing (OIDC) + provenance, `check`+`e2e` before publishing, tag↔version sanity check.
- README (agent-first: three-command install, typosquat warning) and SECURITY.md.

### Fixed

- Normalized the bin path in `package.json` — `npm publish` stripped the binary from the package (2cb1d05).

[Unreleased]: https://github.com/chekh/mister-wolf/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/chekh/mister-wolf/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/chekh/mister-wolf/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/chekh/mister-wolf/compare/v1.0.2...v1.0.3
[1.0.1]: https://github.com/chekh/mister-wolf/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/chekh/mister-wolf/commits/v1.0.0
