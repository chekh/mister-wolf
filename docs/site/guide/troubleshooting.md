# Troubleshooting

## 1. Installed the wrong npm package

- **Symptom:** `npm install mr-wolf` installed third-party code (a work-queue library) and ran its install scripts.
- **Cause:** the package on npm is named exactly **`mister-wolf`**; `mr-wolf` belongs to someone else.
- **Fix:** check the name letter by letter and install the right one:

```bash
npm install -g mister-wolf
```

## 2. npx try-out did not connect MCP

- **Symptom:** ran `npx mister-wolf init`; project memory was created, but the agent platform has no Wolf MCP server.
- **Cause:** npx try-out mode never writes MCP configs — by design.
- **Fix:** install globally and initialize with an explicit platform, then restart the platform:

```bash
npm install -g mister-wolf
cd my-project && wolf init --platform opencode
```

## 3. Broken `.wolf/config.yaml`

- **Symptom:** the project config is corrupted (invalid YAML) and Wolf commands fail on it.
- **Cause:** manual edits or an interrupted write left invalid YAML.
- **Fix:** recreate from defaults. The corrupted file is backed up to `.wolf/backup/<ts>/` and a default config is rendered:

```bash
wolf init --recreate
```

## 4. Binary vs schema version mismatch

- **Symptom:** after upgrading the `wolf` binary, a project behaves oddly or complains about schema version.
- **Cause:** the installed binary and the project's `schema_version` (current: 2) disagree, or platform configs reference stale entries.
- **Fix:** check all registered projects — binary vs schema version, platform configs, dead entries pruned:

```bash
wolf doctor
```

## 5. Search index problems

- **Symptom:** `wolf search` misses objects that exist on disk, or results look stale.
- **Cause:** the SQLite FTS index is out of sync with the memory files.
- **Fix:** rebuild the index from memory objects:

```bash
wolf rebuild-index
```

## 6. Memory store integrity

- **Symptom:** broken or inconsistent memory objects.
- **Cause:** partially written objects, interrupted migrations or manual file edits.
- **Fix:** validate the store; with `--fix`, broken objects are quarantined to `.wolf/memory/quarantine/`:

```bash
wolf validate
wolf validate --fix
```

## 7. Node version

- **Symptom:** installation or startup fails on an old runtime.
- **Cause:** Mr. Wolf requires **Node >= 22** (Node 22 or 24; macOS and Linux glibc; Alpine/musl not supported in v1, Windows best-effort).
- **Fix:** upgrade Node to 22 or 24 and reinstall:

```bash
node --version   # must be >= 22
npm install -g mister-wolf
```

## 8. `add` fails: reading the error

- **Symptom:** `mr-wolf_add` (or `wolf add`) rejects the arguments — unknown type, unknown field, misnamed key.
- **How it is recorded:** every failed call lands in telemetry as an `mcp_call` event with `outcome "error"`: `detail.error.message` carries the message (truncated to 200 chars), `detail.error_class_id` — the error class. Classification is deterministic — a fixed rule table, same input always yields the same class, no LLM involved (see [Telemetry](/guide/telemetry)). For `add` the most frequent class is `invalid_input`.
- **Typical cases and fixes:**

| The error says      | What to do                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| unknown memory type | the message lists the valid types — pick one of them                                                                                                   |
| unknown field       | the message lists the valid fields for that type; per-type fields are snake_case: `expected_answer`, `detour_reason`, `current_state`, `next_steps`, … |
| unrecognized key    | a camelCase key such as `expectedAnswer` is no longer an error — `add` accepts both spellings; snake_case is canonical                                 |

- **Inspecting your errors:** open `.wolf/metrics/session-metrics.jsonl` and filter `event=mcp_call`, `tool_name=add`, `outcome=error`; or read the aggregated metrics:

```bash
wolf analytics --view acceptance
```

## 9. `add` refuses: id collision guard

- **Symptom:** `wolf add` with the same title twice (within the id millisecond window) exits non-zero instead of writing the object:
  `Memory object "mem_…" already exists (same title produced same id).` followed by `Use: wolf edit <id> (правка) | wolf supersede <id> <new-id> (смена) | другой --title.`
- **Cause:** before 2.14 a same-id `add` silently **overwrote** the existing object — data loss dressed as success. The guard turns that into an explicit refusal.
- **Fix:** pick the lane the hint offers — `wolf edit <id>` to change the existing object, `wolf supersede <old> <new>` to replace it with a successor, or a different `--title` for a genuinely new object.
- **Audit trail:** any save that does overwrite a file (there are legitimate paths) records a `memory.overwritten` event with the previous title — silent overwrites no longer exist; the event log is the proof.

## 10. `upgrade`: CLI updated, projects were not touched

- **Symptom:** `wolf upgrade` updated the CLI (npm phase succeeded) but ended with `CLI updated; projects not touched — run wolf upgrade again for the project pass` and exit code 1.
- **Cause:** the projects pass re-executes the freshly installed `wolf` binary; if that spawn fails (for example the binary moved between npm and the re-exec), wolf refuses to guess and stops without touching any project.
- **Fix:** simply run `wolf upgrade` again — the npm phase is idempotent (up-to-date skips straight to the projects pass) and the pass resumes with the new binary. Check `wolf upgrade --check` afterwards to confirm the park freshness.

## 11. `mutated` on a file you want to keep, release after release

- **Symptom:** a stamped agent/skill/command was edited locally; every `wolf upgrade --check` reports the project as `needs decision`, and you do not want the base version.
- **Cause:** the file is stamped, the witness recorded the render, and the local content differs from it — wolf refuses to choose for you (and never overwrites).
- **Fix:** declare the intent in one command instead of living with the noise:

  ```bash
  wolf upgrade --resolve <file>=protect   # hold forever: protect: true in the frontmatter
  wolf upgrade --resolve <file>=pin       # hold and record the current base: protect: X.Y.Z
  ```

  `keep` is the soft version: it accepts the current content once (`origin: keep`) without protecting it — the next local edit makes it a decision again. A protected file still shows in the `Protections` section of `--check`, but no longer as `needs decision`. Audit the whole machine with `grep -rn '^protect:' ~/dev/*/.opencode/agents`.

## 12. Broken onboarding markers in `AGENTS.md`

- **Symptom:** `AGENTS.md` is no longer updated at all; `wolf upgrade --check` shows the project as `unknown` with the detail `onboarding markers broken`, and the pass reports the file as `foreign`/skipped.
- **Cause:** the block is delimited by `<!-- wolf:onboarding v3 -->` and `<!-- /wolf:onboarding -->`; when the closing line is missing (or the opening one is gone), wolf cannot tell its zone from yours and applies the `wx` policy — hands off.
- **Fix:** restore the closing marker line by hand (at the end of the wolf block), then run `wolf upgrade --here --check` — the file is managed again and the block is updated in place. If you would rather own the file, leave the markers broken: wolf will not touch it, and the report will keep saying so — that state is honest, not an error.

## 13. A hand-edited frontmatter that no longer parses

- **Symptom:** after editing an agent/skill frontmatter by hand, the agent silently disappears from opencode, or `wolf upgrade --resolve <file>=protect` answers `cannot protect <path>: no YAML frontmatter — add one or use keep` / refuses with `frontmatter-unparsable`.
- **Cause:** wolf validates the frontmatter block structurally before writing the `protect` key — the block boundaries, the inserted value and its reversibility. It does not repair YAML it did not write: a file could already have been broken before wolf touched it. (A broken agent frontmatter makes opencode drop the agent without a word — that is the reason for the check, not pedantry.)
- **Fix:** compare with the base and take it, or fix the block by hand:

  ```bash
  wolf upgrade --show <file>            # local vs base, read-only
  wolf upgrade --resolve <file>=take    # base version, local copy saved to .wolf/backup/upgrade/<date>/
  ```

  If the file has no frontmatter at all and you want to keep your version, `keep` is the legal verb — `protect` deliberately refuses to invent a block.

## 14. Restoring a file from the upgrade backup

- **Symptom:** an overwrite took local content you still need (`--yes`, `take`, or a removal).
- **Cause:** that is what the backup is for — every overwrite and every deletion copies the file to `.wolf/backup/upgrade/<YYYY-MM-DD>/<rel-path>` first (`base.ext`, `base-2.ext`, … if the same file was overwritten twice in one day).
- **Fix:** copy it back and decide:

  ```bash
  find .wolf/backup/upgrade -path '*<file-fragment>*'
  cp .wolf/backup/upgrade/2026-10-25/.opencode/skills/foo/SKILL.md .opencode/skills/foo/SKILL.md
  wolf upgrade --here --resolve .opencode/skills/foo/SKILL.md=protect   # freeze it, so it stops being a decision
  ```

  The digest of the run names the copy for every overwrite (`local saved: …`), and `--json` lists them in `projects[].backups[]`. There is no garbage collector: prune old dates yourself. Permissions and timestamps are not preserved.
