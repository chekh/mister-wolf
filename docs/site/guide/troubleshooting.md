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
- **Fix:** install globally and initialize again, then restart the platform:

```bash
npm install -g mister-wolf
cd my-project && wolf init
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
