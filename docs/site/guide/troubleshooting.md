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

## 9. `add` refuses: duplicate record

- **Symptom:** `wolf add` with the same title and type twice exits non-zero instead of writing the object:
  `Memory object "mem_…" already exists (same title produced same id).` followed by `Use: wolf edit <id> (правка) | wolf supersede <id> <new-id> (смена) | другой --title или --slug.`
- **Cause:** before 2.14 a same-id `add` silently **overwrote** the existing object — data loss dressed as success. The guard turns that into an explicit refusal. Since 2.32.0 the id is deterministic (`mem_<date>_<slug>_<hash6>`, hash from slug and date), so the same title and type with the same slug — or both without a slug — on the same day means the same id: the refusal is predictable, not a millisecond race. Content is not compared; a genuinely new record needs another `--slug` or `--title`. Generated flows that legitimately repeat a label (a complaint about the same rule, a session wrap-up, a council record) add their content to the hash, so two different records under one label coexist.
- **Fix:** pick the lane the hint offers — `wolf edit <id>` to change the existing object, `wolf supersede <old> <new>` to replace it with a successor, or a different `--title`/`--slug` for a genuinely new object.
- **Two different records, one slug:** that is a collision, not a duplicate: the second gets a deterministic `-2` suffix (`…_<hash6>-2`, then `-3`). Nothing is overwritten, and both records stay addressable.
- **No words in the id:** `mem_<date>_<hash6>` means no usable slug reached the generator. If you passed a slug that is not English (lowercase `a-z0-9` and dashes), the command warns on stderr; if you passed none, the wordless id itself is the signal. Either way, pass `--slug <english-slug>` to name the next record.
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
- **Cause:** the block is delimited by `<!-- wolf:onboarding v3 -->` and `<!-- /wolf:onboarding -->`. When the closing line is missing, wolf cannot tell its zone from yours and applies the `wx` policy — hands off, and the report says `onboarding markers broken`. When the opening marker is gone too, the file is simply foreign: no detail line, same hands-off outcome.
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
- **Cause:** that is what the backup is for — every overwrite and every deletion copies the file to `.wolf/backup/upgrade/<YYYY-MM-DD>/<rel-path>` first (the same file overwritten twice in one day becomes `<name>-2.<ext>`, then `-3`, … — `SKILL.md` → `SKILL-2.md`).
- **Fix:** copy it back and decide:

  ```bash
  find .wolf/backup/upgrade -path '*<file-fragment>*'
  cp .wolf/backup/upgrade/2026-10-25/.opencode/skills/foo/SKILL.md .opencode/skills/foo/SKILL.md
  wolf upgrade --here --resolve .opencode/skills/foo/SKILL.md=protect   # freeze it, so it stops being a decision
  ```

  The digest of the run names the copy for every overwrite (`local saved: …`), and `--json` lists them in `projects[].backups[]`. There is no garbage collector: prune old dates yourself. Permissions and timestamps are not preserved.

## 15. `doctor`: wolf entry missing

- **Symptom:** `wolf doctor` reports `opencode: wolf entry missing — run wolf init` on a project whose opencode config does have a wolf MCP server — either in `opencode.json` (typically after the config was migrated, by opencode itself or by hand, from the flat `mcp.wolf` to the native `mcp.servers.wolf`) or in `.opencode/opencode.json(c)`, the second place opencode reads a project config from.
- **Cause:** releases before 2.20.1 looked only at the flat `mcp.wolf` key, and releases before 2.21.0 looked only at the config in the project root. The native form, and a config kept in `.opencode`, were invisible to them, so the entry read as missing, `wolf init` would have added a second key, and `wolf uninstall` would have left the server behind.
- **Fix:** on 2.20.1 and newer `wolf doctor` and `wolf uninstall` understand both forms, and on 2.21.0 and newer they read `.opencode/opencode.json(c)` as well (opencode merges it after the root file, so it wins there) — re-run `wolf doctor` and the false positive is gone. If the entry is genuinely absent, restore it — repair only, the rest of the JSON is preserved:

  ```bash
  wolf init               # existing config: restores mcp.servers.wolf / default_agent / experimental.subagent_depth
  wolf doctor --repair    # same canonicalization, plus base-set and index repair
  ```

- **What not to do:** add a second MCP key next to the existing one. Two entries for the same server (one in each form) is a configuration opencode v1 reports as a conflict, and it makes ownership ambiguous — wolf then cannot tell which entry is its own.

## 16. The delivered playbook still shows an outdated sentence

- **Symptom:** the complaint protocol delivered into your project still says something like "the active v2 is updated by the Steward", although the current seed template no longer contains that phrase.
- **Cause:** playbooks are memory, not stamped files, and two different paths touch them. The projects pass (`wolf upgrade`) seeds only **missing** faces and never re-renders an existing one. Re-init (`wolf init --yes`) does re-render a face whose initiator is `seed` or `migration` — it creates a new face version with a `template update` reason and supersedes the old one. A face that was already versioned by the Steward or the owner is `diverged` for both paths: neither re-renders it, because that body is no longer a seed copy.
- **Fix:** first check the face initiator with `wolf face show <owner_skill>`. If it is still `seed`/`migration`, run `wolf init --yes` — the current template text arrives as a new version, journaled as a template update; this is the supported repair for a stale seed text. If the face is already `steward`/`owner`, change it only through the Steward circuit (`wolf face new` with the mandatory mutation record, or a complaint that leads there); do not hand-edit `.wolf/memory`. Editing the delivered phrase by hand makes the project drift from the canon and the next reader will trust a stale claim.
- **If the Steward path is refused:** `wolf face new` answers `Face mutation is steward-only: actor "user:cli" is not agent:steward`. Attribution is env-only (`WOLF_ACTOR`), so the harness must launch the Steward with `agent:steward` — wolf does not accept a substitute and there is no flag to fake it. This is a platform limitation, not a workaround target: keep the old text, note it, and re-run the mutation when the channel provides attribution.
- **What is not affected:** the seed templates in the package are correct, so a project that has not seeded that face yet gets the current text, and `wolf upgrade` never rewrites memory.

## 17. `subagent_depth` ignored by opencode v2

- **Symptom:** subagents cannot launch subagents — `executor-lead` fails with `Subagent depth limit reached (1)` and the three-level scheme (Mr.Wolf → executor-lead → workers) never starts.
- **Cause:** the top-level `subagent_depth` key is marked `deprecated` in the opencode config schema, and opencode v2 drops it — the effective depth stays at the platform default `1`.
- **Fix:** `wolf init` or `wolf doctor --repair` moves wolf's own `subagent_depth: 2` into `experimental.subagent_depth` and removes the deprecated key; other `experimental` fields and the rest of the JSON are preserved. Restart opencode afterwards. A **foreign** top-level value is only reported (`deprecated and ignored by opencode v2`), never overwritten — set `experimental.subagent_depth` yourself (`>= 2`) in that case.
- **How to confirm:** `wolf doctor` names the deprecated top-level key directly, and opencode logs a `configuration normalization diagnostic` warning with `path=$.subagent_depth` on startup.

## 18. False `diverged` for a face that differs only in the frontmatter boundary

- **Symptom:** `wolf upgrade --check --json` (or the pass) prints a face as `diverged` — a `<project> <file> diverged v<version>` line — although the live body matches the template in substance; no phrase or section of the face was edited.
- **Cause:** before 2.32.1 the template body and the live face body were extracted by two different frontmatter-boundary regexes. Seeding and the read-only predicate left a leading newline in the body while the memory store swallowed it, so a face that differed from the base only by that boundary — including faces seeded before 2.32.1 with the old extra newline — landed in the `steward zone (not addressable by --resolve)` section and kept exit `2` without any real drift.
- **Fix:** upgrade to 2.32.1 and re-check:

```bash
npm install -g mister-wolf@2.32.1
wolf upgrade --check --json   # or: wolf upgrade
```

Since 2.32.1 the body boundary is parsed by a single implementation (`src/domain/face-body.ts`) and the comparison of bodies ignores leading blank lines — they are a separator, not content. The false lines simply disappear from the report: there is nothing to mutate and no reason to re-seed, and no extra face version is created. If `diverged` is still reported, the difference is real (a phrase, a section, any internal change) — that is fixed through the Steward circuit, not with `--resolve`.

## 19. `face restore` or `face migrate` is refused inside an agent session

- **Symptom:** `wolf face restore --from v3` or `wolf face migrate` answers with a refusal in an agent session, although the same command works in the owner's terminal.
- **Cause:** the refusal is keyed to the session marker, not to the actor: an agent session carries `WOLF_SESSION=opc-*` and its actor is `user:cli`, not the owner. `restore` replaces the whole body with the base version, so edits accumulated on the live face would be lost — that is why the gate stays closed and the owner-only commands are not weakened. The refusal is logged as `memory.face.denied`.
- **Fix:** run the command in the owner's terminal, where `restore` and `migrate` work as before (and `migrate` is available there since 2.32.1 cut it off from agent sessions too). To change a face's content, use the Steward's regular mutation (`wolf face new` with `WOLF_ACTOR=agent:steward`), not `restore`. There is no bypass to enable from inside the session.

## 20. `scaffold` refuses over an existing face

- **Symptom:** `wolf scaffold <agent|skill|command> <name>` refuses and names an existing face id and version instead of writing files.
- **Cause:** the live face with the same `owner_skill` already exists, and the "Scaffold stub…" body would overwrite it — scaffold no longer does that, and the refusal names the existing face so the collision is visible.
- **Fix:** pick a different name for a genuinely new face, or update the existing one through the Steward as a regular mutation (`wolf face new` with `WOLF_ACTOR=agent:steward`) — a face is memory, not a scaffold target. There is no scaffold flag that forces the overwrite.

## 21. A council expert cannot read the code

- **Symptom:** `worker-expert` answers from the delivered packet only, every read call returns `Permission denied: read`, and the council loses the code-confirmed part of its positions. A list of file paths in the TASK changes nothing.
- **Cause:** read permissions are granted by the **agent profile configuration** (`.opencode/agents/worker-expert.md`), not by the prompt. Before 2.32.2 the profile was deny-all with a single `read packet/*` allow, and no project has a `packet/` directory — so the only read rule never matched. Paths typed into a TASK are text, not a permission grant; the host has no per-spawn allowlist.
- **Fix:** update the base set so the project profile carries the project-wide read rule (`wolf upgrade` in the project, or `wolf upgrade --here`). Verify with `opencode debug agents` — the effective `worker-expert` rules must show `read`/`glob`/`grep` allow, later `*.env` ask rules still intact, and `edit`/`shell`/`subagent`/`webfetch`/`external_directory` deny. Then run the functional channel probe from [Expert Council](/guide/council): read a specific file and return a specific line. A content fact means the channel works; an answer built from the packet means it does not. Fixing permissions in the prompt or repeating the probe does not help.
