# Changelog

All notable changes to this project are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org/).

## [3.0.0] - 2026-11-09

### Breaking — the two-level organization: mr-wolf executes work itself and hires the specialists directly, and the intermediate level, the old agent names and the mandatory plugins are gone

The three-level route (lead → executor-lead → workers) put a coordination layer between the lead and the agents doing the work, and delivering the roles depended on two mandatory OpenCode plugins. The two-level pilot showed that mr-wolf organizes the same work without that layer. This release makes the two-level model the standard one. It replaces the active agent set of an installed project, and a repeated upgrade does not bring the old hierarchy back — hence the major version.

- **Two-level model.** mr-wolf is the lead: it executes work itself and hires eight `wolf-` specialists directly — `wolf-architect`, `wolf-developer`, `wolf-editor`, `wolf-expert`, `wolf-release-engineer`, `wolf-researcher`, `wolf-reviewer`, `wolf-tester` (base set: 9 agents). Executors do not delegate further; there is no intermediate level. A new independent piece of work gets a fresh executor, reuse is bounded to defined continuation cases, and the lead's own work passes the same independent review. The document process, evidence-based review, expert councils, gitflow and the existing memory are preserved.
- **Persistent agent names.** Every shipped agent except `mr-wolf` carries the `wolf-` prefix — the former `worker-*` roles continue under the new names — and the prefix is not forced onto user-defined agents. `executor-lead`, `steward` and the `worker-*` names leave the active set: after an upgrade they are removed (with backups) and do not remain as active duplicate routes.
- **Delivery without mandatory plugins.** The standard process needs only the agent definitions, a short `AGENTS.md` starter block, skill loading and addressed handoff. `wolf-router` and `wolf-session-start` are no longer required: an upgrade removes the two old Wolf plugins from autoload and reserves them; third-party plugins are untouched.
- **The skill set is 35**, including 8 short compatibility entries carried from the pilot (marked «Совместимый вход», redirecting to the current skill — an explicit transition measure, to be removed in the next release). The three commands (`analyze-doc`, `complain`, `doc-review`) stay.
- **Migration of an ordinary project: `wolf upgrade`.** The pass delivers the new set and reserves user edits (`take` changes are backed up under `.wolf/backup/upgrade/<date>/`); memory, documents, face history and third-party files stay untouched. A repeated upgrade reports the project up to date — it does not restore the old hierarchy, face delivery, the old plugins or automatic Steward calls. Verified on a live 2.33.0 → 3.0.0 transition: one consistent set (9 agents, set 3.0.0), `verify` passing 83/83, zero old agent names, backups created; a clean `wolf init` delivers the same 9-agent, 35-skill set directly.
- **Migration from the pilot: a separate instruction.** init → bootstrap → upgrade; do not run the pilot switch script blindly on top of a standard installation. Do not mix the two instruction sets in one session: stop the executors, hand off unfinished work through memory, and let new sessions start on the new set.
- **`wolf init` requires the project marker in the directory.** An empty directory without the marker is refused instead of being initialized silently.
- **Complaints accept the actual agent composition.** The hard-coded list of base agent ids is gone: a complaint target is resolved against the current agent set of the integration, including user-added project agents with or without the `wolf-` prefix. `skill:` and memory targets still work, and historic complaints about renamed or removed agents stay valid; a genuinely unknown target returns a clear error, and an unavailable discovery source is reported as such instead of being read as proof of absence.
- **Agent scaffold is self-sufficient.** A scaffolded user agent no longer depends on a face, the router plugin or a default model.
- **The Steward is temporarily out of the standard routing.** Nothing invokes it after acceptance, on complaints/proposals or on mature lessons — and no hidden automatically-invoked replacement ships under another name. Its mechanisms, history, face versions and the intake of complaints and proposals are preserved: signals are accepted and are not silently closed. The steward's return and its new mandate are the next release's work.
- **The concept document describes the shipped two-level model.** `docs/concept/concept.md` (v3.4.0) and `docs/concept/coverage.md` are updated from the three-level topology to the shipped organization: L0 leads — it executes work itself, hires `wolf-*` specialists directly, integrates and accepts the result, and its own work passes independent review; specialists do not delegate further; the council is the lead's tool; the Steward is temporarily out of the standard routing with its mechanisms preserved; faces are not delivered and their history is kept. This is a trace of the approved release composition (R-01/R-08/R-11/R-14), not a new product decision; historical three-level wording survives only as marked history.

### What this release does not do

- **No measured speed or cost effect is claimed.** Faster appearance of answers is the owner's observation, not a measurement; no cache-share or session-count improvements are stated — those are hypotheses. Cost is measured from raw OpenCode usage and sessions (`opencode.db`): the skill counters left with `wolf-router`, and their absence does not mean the calls did not happen. The "after" window of the measurement protocol is collected later; comparisons are published only after both windows exist.
- **No faces as behavior delivery and no new Steward features.** Face objects and their history are preserved in memory, but faces do not come back as the delivery mechanism, and the steward's powers over skill sources are not redesigned here.
- **No new harness support.** The method core is freed of unnecessary OpenCode-specific wording as portability preparation; integrations with other harnesses are not part of this release.

### Upgrade notes

- **Ordinary project:** `npm install -g mister-wolf@3.0.0` (or `wolf upgrade`). The pass replaces the active set: after it a project has exactly the 9 agents and 35 skills of 3.0.0. Nothing in memory, documents or third-party files is deleted; the removed Wolf plugins and the reserved user edits are backed up under `.wolf/backup/upgrade/<date>/`.
- **From the pilot:** follow the pilot transition instruction (init → bootstrap → upgrade); the pilot switch script is not for standard installations.
- **Finish in-flight work first.** Migrate after the executors are stopped; new sessions use the new set, and unfinished work is handed off through memory as usual.
- **The old names stop resolving as active agents.** References to `executor-lead`, `worker-*` or the Steward as an active routing target need updating to the `wolf-*` names; user agents keep their names.

## [2.33.0] - 2026-11-07

### Changed — scaffolded documents come out in readable block form, and a readability pass gets a dedicated skill and a route before content review

Generated artifacts carried the content but no guaranteed readable form, and making a finished document readable had no owner: the work either did not happen or was mixed into content review, where reshaping competes with checking the substance. The scaffold now writes readable block-form documents, and a dedicated skill gives readability a bounded pass with a defined place in the authoring route.

- **`wolf-document-readability` — the 30th skill of the base set (30 skills, 50 stamped files).** The skill performs one readability pass over a finished document or the changed sections assigned to it — requirements, change requests, design/ADR, plan, test plan, instruction, report; the usual executor is an assigned L2 technical writer. It preserves content and accuracy — claims, numbers, dates, ids, links, conditions, statuses, checkboxes, append-only text — and does not research code, judge technical decisions, create documentation from scratch or replace content review. It is not applied automatically to dialogue or service TASK/RESULT messages, runs one pass on a first release or a substantial rework, and returns a short question to L1 on ambiguity.
- **The author's route includes the readability pass.** The rules on readable form for authors live in `using-skills/references/project-rules.md`; the route "author → technical writer L2 → content review" and the order of review and editing are defined in `routes-communication.md`. The boundary with `wolf-user-report` (a standalone document for a human versus readability of working artifacts) and with `wolf-review` is stated in their SKILL.md files.
- **`wolf scaffold artifact` writes readable block-form documents.** A change request is written in blocks with an ID heading, an ADR gets a subtitle and blank lines, acceptance criteria are written as separate scenarios, and the plan carries navigation points; the checkbox contract is unchanged (`src/app/use-cases/scaffold-artifact.ts`).
- **`wolf doctor` accepts both change-request forms.** Lint recognizes the new block form and the legacy single-line form; existing legacy documents keep passing unchanged.

### Upgrade notes

- **`npm install -g mister-wolf@2.33.0`** (or `wolf upgrade`) is enough. Nothing to migrate.
- **Existing projects receive the new skill and the updated `using-skills` files.** `update-map.json` is re-stamped to 2.33.0 against 2.32.2; the pass delivers `wolf-document-readability` and the changed rules and routes.
- **Single-line change requests stay valid.** Documents generated by older versions keep linting — `wolf doctor` accepts the legacy form alongside the block form.

## [2.32.2] - 2026-11-07

### Changed — the council expert's read channel is real, bounded, and no longer opens secret files

The expert profile promised reading inside the project, but shipped a deny-all frontmatter with a single `read packet/*` allow — and no project has a `packet/` directory, so every read was rejected and the council lost the code-confirmed part of its positions. The default profile now grants reading inside the project, and the gap that broad reading opened for secret files is closed.

- **Read channel inside the project boundary.** `worker-expert` allows `read`, `glob` and `grep` on any project path, so code and documents are read normally and the expert can find the file it needs. Writes, shell, subagents, web fetch, web search, the browser, skills and `external_directory` stay denied.
- **Env and secret guard stays `ask`, after the broad allow.** The `ask` rules for `*.env`/`*.env.*` keep `.env` and `.env.local` behind confirmation while `*.env.example` stays readable; the same guard now covers typical secret files — `.npmrc`, `.netrc`, `.git-credentials`, `*.pem`, `*.key`, `id_rsa`/`id_ed25519`. The rules sit after `read *` because OpenCode resolves permissions last-match-wins, so the order is the protection. The secret rules add no `allow`: the allow set stays `read *`, `glob *`, `grep *` and `read *.env.example`, and the deny set is unchanged.
- **The RESULT names the actual channel.** The expert's first RESULT line is `channel:` (`tool-enabled` | `packet-only` | `denied`), and `isolation_limits` is mandatory whenever the channel is not `tool-enabled`. A content fact proves the channel works, not the fact that a tool call was made.
- **The channel is verified, not assumed.** The council procedure requires a functional probe of the channel — read a specific file and return a specific line — separately from the link audit; one does not replace the other.
- **Honest boundary.** The host compares the path it is given and does not resolve symlinks, so a link inside the project that points outside is read as an internal path and `external_directory` does not fire. The link audit (`find` + `realpath`) is therefore procedural, performed by L1 before the run; a leaking link makes the channel unusable or the work packet-only. The docs state this limit instead of promising an airtight boundary.

### Upgrade notes

- **`npm install -g mister-wolf@2.32.2`** (or `wolf upgrade`) is enough. Nothing to migrate.
- **`update-map.json` is re-stamped to 2.32.2 against 2.32.1**; the pass delivers the changed expert profile, its playbook and the documentation.
- **The new `ask` rules only narrow access.** A project that already asks for env files keeps working, and a non-interactive run treats `ask` as a refusal, exactly as `*.env` did before.

## [2.32.1] - 2026-11-06

### Fixed — `diverged` decisions caused by the frontmatter boundary alone, and the face version the report names

Two places where a technically valid result misled the owner: a face that matched its template in content was still reported as diverged when the two sides disagreed only about the newline after the frontmatter, and the upgrade report could name a face version that no longer exists. Both are fixed at the source; substantive differences still produce `diverged`.

- **False `diverged` decisions.** The template body and the live face body were extracted by two different frontmatter-boundary regexes: seeding and the read-only `diverged` predicate kept one leading newline after the closing `---`, while the memory store dropped it. A face that differed from its template only at that boundary landed in the Steward's decision zone. The boundary is now a single implementation (`src/domain/face-body.ts`), and body comparison ignores leading blank lines — separator noise, including the extra newline left in place by the older seeding. Internal and substantive differences still produce `diverged`.
- **The face version in the report.** The decision registry took the first record per `owner_skill` — usually the oldest version, and often `superseded` — so the report could name a version that does not exist (`v1` while `v3` was active). The active version is now selected (highest number among `status === 'active'`), and the version status is a required part of the input instead of an optional detail.

### Changed — the live faces of the complaint protocol and the Steward follow the current templates

The two faces re-rendered in 2.32.0 were brought forward in this project by the Steward's regular mutation path with G17, not by a hand edit: `mr-wolf` v4 (the complaint-protocol v3 text) and `steward` v3 (the side-effects check section). Version history is preserved — the earlier versions stay readable and superseded.

### Fixed — three ways around the steward-only face gate are closed

The gate held for `face new` but not for every path that changes a face: an agent session could still restore an old version (dropping the accumulated edits of the live face), run the legacy migration without any check, and scaffold a stub over a face that already existed. The gate now covers these paths; its own rule is unchanged.

- **`face restore` is refused from an agent session** (`WOLF_SESSION=opc-*`), by the same check that already covered `breakglass`; the owner in a terminal (`cli-*` or no session) keeps it, and the refusal is journaled as `memory.face.denied`.
- **`face migrate` is refused from an agent session.** The legacy migration rewrites the face canon, so it now requires the owner's terminal; the internal seeding path (`seed`) and the Steward's regular mutation (`wolf face new` with `WOLF_ACTOR=agent:steward`) keep working.
- **`wolf scaffold skill|command|agent` refuses to overwrite a live face.** When an active face with the same `owner_skill` already exists, scaffold reports its id and version and stops instead of replacing it with a "Scaffold stub" body; a new name is scaffolded as before, and the existing frame-file check is still the first idempotency guard. `--from-playbook` still reuses an existing face by design.
- **CLI help states the limits** for `face restore`, `face migrate` and `scaffold`; the generated CLI reference is synchronized.

### Upgrade notes

- **`npm install -g mister-wolf@2.32.1`** (or `wolf upgrade`) is enough. Nothing to migrate.
- **`update-map.json` is re-stamped to 2.32.1 against 2.32.0**; the pass delivers the changed decision logic and nothing else.
- **Faces marked `diverged` only because of the boundary will stop appearing in the report** — `wolf upgrade` may exit `0` where it used to exit `2`. A face with a real content difference is still reported.

## [2.32.0] - 2026-11-06

### Changed — an upgrade report that reads without noise, English ids for new records, and a first-class package of target documents

Three things that were technically correct but hard to use: the upgrade report painted every line with the same marker, a new memory record got a transliterated Russian title as its id, and the document package a feature lives in had no place for the intent agreed before requirements or for change requests. This release fixes the reading of the report, makes ids carry English words supplied by the creating agent, and gives the package two first-class documents with a defined order and a defined change flow.

- **`wolf upgrade` report: three distinct markers, no status marker on details, decisions by code.** `info` (●), `ok` (✓) and `skip` (·) no longer share one glyph, so the report stays readable in a mono terminal and in a pipe. Project details — `base-set`, `faces`, `verify`, named decisions, backups, the confirmation hint — are printed without a status marker and align under the text of status lines: a detail no longer impersonates a status. Unresolved decisions are grouped one line per code in a fixed order — `needs decision (conflict): <path>`, `needs decision (skipped-mutated): <path>`, `needs decision (diverged): <path>`; a diverged face is now named instead of silently counted. The park pass and `wolf upgrade --here` share one implementation of the detail lines. The machine contract is untouched: `wolf.upgrade/1` output is byte-identical to 2.31.0 for the same project.
- **Record ids from an English slug (`mem_<YYYYMMDD>_<english-slug>_<hash6>`).** The creating agent supplies the slug — `wolf add --slug release-plan`, the `slug` field of the MCP `add` tool, or the corresponding use-case input; the CLI validates the format (lowercase `a-z0-9` and dashes), normalizes case and separators, and never transliterates a title. Without a valid slug the id is built as `mem_<YYYYMMDD>_<hash6>` — without words; a slug that is present but invalid warns on stderr, and an omitted one is visible by the wordless id itself. The hash is deterministic (slug and date), so the same input on the same day produces the same id; a genuine collision of two different records gets a deterministic `-2`, `-3` suffix, while repeating the same title and type with the same slug (or with none) produces the same id and is refused as a duplicate; content is not compared, so a new record needs another `--slug` or `--title`. Flows that legitimately repeat a label (complaints about the same rule, session wrap-ups, council records) hash their content, so each record keeps its own id. Existing ids are never renamed: older transliterated ids stay readable, searchable and linkable. Face versions take their slug from the version (`<owner>-v<N>`), so versions keep sharing a title without colliding.
- **The document package gains `pre-requirements.md` and `change-request.md`.** `wolf scaffold artifact <slug>` now writes six documents in a declared order: `pre-requirements.md` → `requirements.md` → `change-request.md` → `design.md` → `test-plan.md` → `plan.md`. `pre-requirements.md` records the intent, framing, decisions and open questions agreed before formal requirements (it does not approve them); `change-request.md` is an append-only list of change requests with a package-local number `CR-<YYYY-MM-DD>-NN`, the affected REQ/NFR, the approver and the downstream artifacts to regenerate. The "Change log (CR)" section inside `requirements.md` keeps its own meaning — changes to the requirements themselves. The flow is explicit: remark → change request → pre-requirements/requirements → design → test-plan → plan.
- **`scaffold artifact` tops up an existing folder instead of refusing it.** A folder that already exists (for example, a brainstorm already wrote `pre-requirements.md`) receives only the missing documents; an existing file is never overwritten, and a complete package answers that there is nothing to add. The `--fix` profile keeps its reduced set (`requirements.md` + `plan.md`).
- **Lint and rules know the new documents.** `wolf doctor` reports a `change-request.md` without frontmatter, a CR number that is not `CR-<YYYY-MM-DD>-NN`, a missing `downstream:` or approver, and a CR that references a REQ which does not exist. The package rules (`using-skills` project rules, `wolf-brainstorm`, `wolf-plan`) describe the order and the change flow; the artifact-pipeline page carries the same explanation for users.

### Fixed

- **The delivered method no longer opens with a line that reads like an error.** The session injection used to start with "using-skills: the full text is already loaded" before the full text; it now says that the method is delivered below and does not need to be loaded again, while the degraded branch keeps its explicit `FALLBACK` wording.
- **The complaint canon no longer carries a face version in its title.** The reference title said "(v2)" while the delivered face was v3; the version now lives in the face only, where the Steward owns it.

### What this release does not do

- **No automatic translation.** Wolf is local-first: the CLI does not call a translator or a model provider to name a record. A record created without a slug gets an id without words — that is the documented degradation, not a hidden fallback to transliteration.
- **No renaming of existing memory.** Historic transliterated ids are left as they are; a memory with mixed-looking ids is the expected state.
- **Who re-renders a seed face.** The projects pass (`wolf upgrade`) never rewrites existing memory: it only seeds a missing face. `wolf init --yes` re-renders a face that is still `seed`/`migration`-initiated (a journaled template update to a new version); a face already versioned by the Steward or the owner is left alone. Where the platform does not provide Steward attribution (`WOLF_ACTOR=agent:steward`), the Steward mutation is refused — the limitation is documented in troubleshooting rather than worked around.
- **No measured effect on reading speed or authoring quality.** The markup and id changes were verified by tests and by live runs on fixtures; no productivity claim is made.

### Upgrade notes

- **`npm install -g mister-wolf@2.32.0`** (or `wolf upgrade`) is enough. Nothing to migrate: ids, faces and documents that exist stay valid and addressable.
- **`update-map.json` is re-stamped to 2.32.0 against 2.31.0**; the pass re-renders the changed skill texts and the session-start plugin, and delivers nothing else.
- **`wolf add` accepts `--slug`**; MCP `add` accepts the `slug` field. Existing commands and scripts keep working unchanged.
- **`wolf scaffold artifact` on an existing folder now tops it up** instead of failing with "Artifact folder already exists".

## [2.31.0] - 2026-11-06

### Added — the expert council: a restricted expert role, the wolf-council method and a durable record path

Some calls do not yield to the normal process: justified variants conflict, a cause stays unclear after reasonable diagnosis, an architectural choice is expensive to reverse, or a worker and a reviewer hold a substantive dispute. This release ships the expert council as a method with real boundaries: a new worker role whose access is actually restricted, the council procedure for L1, a durable write path for the record, and analytics that reads the whole history. Convocation remains a decision of the responsible level — the method advises, it does not decide.

- **`worker-expert` — a new L2 role with a bounded professional position (base set: 6 → 7 agents).** The expert holds a narrow professional position on one question and returns it as claims, evidence, assumptions, confidence and risks, with `LIMITS` where nothing reliable can be said. It does not accept results, does not write memory and does not delegate. By default the expert is packet-only: it answers from the delivered packet without tools. An optional tool-enabled profile grants exactly one read allowlist (`packet/*`) and denies everything else — writes, shell, subagents, web fetch, reads outside the packet; an out-of-scope `external_directory` is rejected outright. Before a tool-enabled run the packet passes a symlink audit, so the allowlist cannot be escaped through a link. The role arrives with `wolf init`/`wolf upgrade`, together with the seed face `worker-expert-playbook`.
- **`wolf-council` — the council method for L1.** Two or more experts answer the same question independently (the first round runs without other experts' opinions); the lead synthesizes accepted claims, rejected alternatives, unresolved dissent and the validation still required; the decision stays with the responsible level — a recommendation is not a decision. One first round, at most one clarifying round; `insufficient_evidence` is an allowed outcome, not a failure.
- **A durable record path: `wolf council record --input <file>` (CLI) and `council_record` (MCP) — one operation.** The write path validates the strict v2 envelope schema (question / opinions / synthesis), stores canonical JSON, is idempotent by `request_key` (a retry does not duplicate the record) and restores the relations between the question, the opinions and the synthesis. The MCP tool catalog is now 8 tools (plus the `ping` health check).
- **Mixed council analytics.** The analytics reader accepts legacy councils, alias and v2 envelope formats as one stream; a missing vote is no longer reported as a timeout, and `envelope_participation` shows how much of a recorded council actually participated.
- **Honest degradation.** When the platform cannot guarantee the tool-enabled restrictions, the expert works packet-only and the degradation is stated explicitly; a tool-enabled acceptance is never claimed without evidence.
- **EN/RU documentation.** The site gains an Expert Council guide page (EN and RU), a `wolf council` section in the CLI guide, the updated base-set page (7 agents) and a synchronized README pair.

### Fixed

- **Doctor no longer reports a false `mixes v2 and v1` for an agent with `mode` plus a v2 `permissions` array** — `mode` is a valid v2 agent field.

### What this release does not do

- **Convocation is manual.** Nothing convenes a council automatically: the responsible level decides, and the method does not replace tests, git gates, independent acceptance or the acting authority chain.
- **No measured effect.** Whether councils improve decision quality is at the observation stage and was not measured; nothing here claims such a benefit.
- **Tool-enabled isolation is platform-provided.** The restricted profile relies on the harness permission mechanism (proven on OpenCode); on platforms that cannot guarantee it the expert stays packet-only by design.

### Upgrade notes

- **`npm install -g mister-wolf@2.31.0`** (or `wolf upgrade`) is enough. The role, the method and the seed playbook arrive through the regular projects pass of the update; nothing to migrate, nothing to reconfigure.
- **`update-map.json` is re-stamped to 2.31.0 against 2.30.0**: new file targets for the `worker-expert` agent, the `wolf-council` skill and its seed playbook, and worker agent frames moved to the canonical v2 permissions array.

## [2.30.0] - 2026-11-05

### Added — bounded assignments: one division-of-labor canon and bounded L1 lifetimes

One L1 could keep receiving new self-contained commissions for the whole user session: the goal and the thread continued, so the executor's context kept growing after each accepted delivery. This release draws the boundary: the unit of an executor's lifetime is a bounded, independently acceptable delivery. Fresh executors for new results, `continue` for the same unaccepted result, `replace` through handoff — on both hiring boundaries, L0→L1 and L1→L2. Planning, evidence, independent review, joint-state checks and DONE ≠ ACCEPTED all stay in force; the internal language stays unchanged.

- **`using-skills/references/division-of-labor.md` — the single shared canon of hiring and lifetimes** (delivered inside the existing `using-skills` skill). It defines the bounded assignment as the unit of work; the `fresh`/`continue`/`replace` decision table for both boundaries; multi-L1 planning (L0 commissions an L1 to prepare the assignment plan — the planner returns ready briefs, dependencies and an integration owner, and hires no peers); sequential and parallel launches with one writer per shared resource; addressed context transfer with revision and applicable evidence instead of a parent's chat history; budget that belongs to the assignment, not to the session (a `replace` does not reset it); and honest limits when the host cannot isolate history or close an instance.
- **Hiring rules updated in the frames (`mr-wolf.md`, `executor-lead.md`).** L0 commissions the distribution plan to an L1 instead of decomposing multi-L1 work itself; the executor lead stops being a long-lived session owner: after a delivery is accepted, the next independently acceptable result goes to a new L1 even in the same thread and topic; small related work stays in one finite mandate and is not split per stage; the L2-tool-call budget belongs to the assignment. Frontmatter, permissions, mode and model are unchanged; L1 still cannot spawn L1 and L2 still cannot spawn.
- **`wolf-plan` scale clarified** — a plan of L1 assignments (briefs, dependencies, integration owner) differs from the internal L2 task breakdown inside one assignment; the planner does not detail every executor's inner steps.
- **`wolf-handoff` explicitly covers L1 replacement through L0**: task identity, open findings, permissions and spent budget survive the handoff.
- **`context-and-memory.md`** now separates goal/thread, assignment and session, and requires addressed transfer of selected sources, constraints and decisions to a fresh executor.
- **`using-skills` root and the execution route** require hiring participants to load the canon before assigning or continuing work; the reference is delivered with the regular base set, not as a side file.
- **The documentation site (EN/RU organization guide)** explains the temporary L1, sequential executor change and the assignment plan in the user-facing guide.
- **Base set composition: 47 → 48 delivered skill files** — one reference file inside the existing `using-skills` skill; the skill count stays 28; no new agents, commands or plugins.

### What this release does not do

- **No runtime change.** `src/**` is untouched: no commands, flags, memory schema or migrations. The value — less context accumulation, fewer wasted checks — is at the observation stage and was not measured; nothing here claims a token saving or speedup.
- **No behavioral pilot.** The scenario probes from the test plan (sequential L1s, no over-splitting, no false success) were checked by document review and structural delivery tests; live harness probes were not run and are honestly left open at the observation stage, as in 2.29.0.
- **The language stays at 2.29.0.** `agent-language.md` is byte-identical; no new terms, slots, enums or profiles. The canon uses plain explanatory prose ("hiring participant", "bounded delivery"), not new language constructs.
- **Installed faces are not overwritten silently.** The frames change in the templates; a protected or locally mutated installed face keeps its version until the regular upgrade resolution — a conflict means the rollout is not finished, not a success.

### Upgrade notes

- **`npm install -g mister-wolf@2.30.0`** (or `wolf upgrade`) is enough. The reference and the frame updates arrive through the regular projects pass of the update; nothing to migrate, nothing to reconfigure.
- **`update-map.json` is re-stamped to 2.30.0 against 2.29.0**: 1 new file target (`division-of-labor.md`), 7 changed (`executor-lead.md`, `mr-wolf.md`, `using-skills/SKILL.md`, `context-and-memory.md`, `routes-execution.md`, `wolf-handoff/SKILL.md`, `wolf-plan/SKILL.md`), 51 unchanged. The six versioned agent playbooks ("faces") are unchanged.

## [2.29.0] - 2026-11-05

### Added — a written specification of the internal agent language, and a LANGUAGE subject for complaints

The internal agent language — TASK, RESULT, EVIDENCE, verdicts and the rules for using these terms — runs every handoff between agents, but its terms lived scattered across contract texts, so retellings could drift and force re-asks. This release gives that language one static reference and a way to complain when a term or a form itself is the problem. No runtime change: the reference only writes down the constructs already in force.

- **`using-skills/references/agent-language.md` — one specification of the internal language.** It defines the shared terms (TASK, RESULT, DONE ≠ ACCEPTED, EVIDENCE, VERDICT, COMPLAINT and the rest) and the usage rules R1–R6: one concept — one name; no anaphora — links by identifier with version; full delivery with the skills; plain language for humans with terms spelled out at first use; and an escape statement for situations a form does not cover. Message slots stay normative in `contracts.md` — the reference links to it and duplicates nothing, and it introduces no new mandatory fields.
- **Humans keep ordinary language.** The specification governs only statements that change work state — assignments, reports, verdicts, handoffs, complaints, proposals, status transitions. Discussions and explanations remain plain text.
- **Complaints gain a LANGUAGE subject (`wolf-feedback/complaints.md`).** When the defect is in a term or a form itself — an ambiguous definition, a needed message the existing slots cannot express, or a form demanding surplus for a simple situation — the complaint's `rule` field carries the marker `LANGUAGE/ambiguous-definition`, `LANGUAGE/insufficient-form` or `LANGUAGE/excessive-requirement`. LANGUAGE is a subject, not a new kind and not a new route: kind, submission, triage and the Steward mutation work exactly as for the existing rule complaints, and a filing needs a concrete work impediment (a re-ask, a wrong action, a wasted step), not every formal deviation from a form.
- **`contracts.md` gains a cross-link** to the new reference, so the normative slots and the language specification point at each other.
- **Base set composition: 46 → 47 delivered skill files** — one reference file inside the existing `using-skills` skill; no new skills, agents, commands or plugins.

### What this release does not do

- **No runtime change, no measured effect.** `src/**` is untouched: no commands, flags, schema or migrations. The value of the written specification — fewer re-asks, less meaning drift between agents — is at the observation stage and was not measured, so nothing here claims that benefit.
- **The language is fixed during observation; mandatory slots do not grow.** Until the observation stage concludes, the terms and rules are not extended, and a LANGUAGE complaint is evidence for the owner's decision, not a self-service language change.

### Upgrade notes

- **`npm install -g mister-wolf@2.29.0`** (or `wolf upgrade`) is enough. The reference arrives in the project through the regular projects pass of the update; nothing to migrate, nothing to reconfigure.
- **`update-map.json` is re-stamped to 2.29.0 against 2.28.0**: 1 new file target, 2 changed, 55 unchanged. Delivered skill files: 46 → 47 (the new `agent-language.md` reference inside `using-skills`); the changed targets are the cross-linked `contracts.md` and the LANGUAGE section of `complaints.md`. The six versioned agent playbooks ("faces") are unchanged.

## [2.28.0] - 2026-11-04

### Added — three engineering skills for the delivery route

The set gains three methods for the engineering part of a task. They are delivered as part of the regular base set and plugged into the existing route; the runtime does not change.

- **`wolf-software-design` — the engineering method inside `wolf-design`.** It chooses the boundaries, contracts, dependencies and state ownership of a software solution with the least total complexity for implementation, consumers, checking and operation. It is connected to `wolf-design` and to the intent branch of `using-skills`, where the open question is which module boundaries or contracts to take. It does not approve an architecture, does not replace `wolf-design` and does not start a redesign during an ordinary implementation: an assigned researcher compares variants and returns a recommendation, the decision stays with the responsible level.
- **`wolf-code-craft` — implement the assigned behavior completely and readably.** It is delivered to the implementer when code is written or changed, and is used by the reviewer as evaluation criteria within the mandate — a preference for another form of code is not a defect by itself. It is connected to `wolf-sdd`/`wolf-execute` and to the execution branch of `using-skills`. It adds no rights to the role, no new stage and no new rule: the existing test method and the project gates stay in force.
- **`wolf-code-simplify` — remove a named piece of complexity without changing the contract.** It applies to an assigned simplification task or to a concrete piece of needless complexity that needs its own analysis; behavior, guarantees and consumers stay intact. It is connected to the quality branch of `using-skills` and to `requesting-code-review`, where the reviewer only assesses. It is not an obligatory stage after every edit — the implementer removes the surplus complexity found in the current mandate.
- **Base set composition: 25 → 28 skills, 43 → 46 delivered skill files** — the files of the delivered skills (`SKILL.md` plus attached `references/` and `scripts/`), not separate skills. The three new skills arrive in a project through the regular projects pass of the update.
- **`worker-researcher` clarified.** Comparing architectural variants and returning a recommendation is now possible only for an explicitly assigned architectural question. The `worker-researcher` role still writes no files, does not approve an architecture and does not implement; a `design.md` is written by the already authorized author.
- **Routing branches of `using-skills` touched.** The intent branch gained the software-design route, the execution branch the code-craft route, the quality branch the code-simplify route and the engineering criteria for review. The core of `using-skills` is unchanged.

### What this release does not do

- **No behavioral pilot, no measured effect.** The three skills were not compared in a run with models, so nothing here claims fewer rework rounds, lower cost or shorter time. The intention behind the release is to choose a sufficient architecture, to write understandable necessary code and to remove a named piece of complexity; the effect of that intention was not measured.
- **No runtime change.** `src/**` is untouched: no new commands, no CLI flags, no memory schema and no data migrations. Five of the six agent templates are unchanged; `worker-researcher` changes only in its role text — its frontmatter, permissions and model stay as they are — and the rights of the roles are not extended. The six versioned agent playbooks ("faces") are unchanged. The three skills are methods: they create no agent, no new face, no runtime API, no TASK schema and no stage of the artifact pipeline.

### Upgrade notes

- **`npm install -g mister-wolf@2.28.0`** (or `wolf upgrade`) is enough. The new skills arrive in the project through the regular projects pass of the update; nothing to migrate, nothing to reconfigure.
- **`update-map.json` is re-stamped to 2.28.0 against 2.27.1**: 3 new file targets, 8 changed, 46 unchanged. Five of the six agent templates are unchanged and `worker-researcher` changes only in its role text; the six versioned agent playbooks ("faces") are unchanged.

## [2.27.1] - 2026-11-03

### Changed — README on npm refreshed (docs-only patch, no runtime changes)

- **The npm package page now shows the rewritten README (PR #16).** Mr. Wolf is presented as a permanent project organization built from temporary AI assistants ("I solve problems"), with the documentation site as the canonical user guide (https://chekh.github.io/mister-wolf/guide/overview). npm displays the README of the last published version, so the new text only becomes visible through this release. Both README.md and README.ru.md ship in sync (npm displays the Russian copy for this package); code, tests and delivered templates are unchanged.
- **The header logo now renders on npm.** The logo link in both README files changed from the relative `docs/Mr.%20Wolf.png` — broken on npmjs.com, which does not rewrite relative image paths (and the file is not part of the npm tarball) — to the absolute `https://raw.githubusercontent.com/chekh/mister-wolf/main/docs/Mr.%20Wolf.png`, which renders on both GitHub and npm.

### Upgrade notes

- **`npm install -g mister-wolf@2.27.1`** (or `wolf upgrade`). Documentation-only: nothing to reconfigure, no migrations; `update-map.json` is re-stamped to 2.27.1 with zero changed file targets against 2.27.0.

## [2.27.0] - 2026-11-03

### Added — `wolf git-inspect`: a structured read-only git state with an honest verdict

Roadmap v4 (edition 9, §11) slice B0.5: agents interpreted git state from the prose output of `git status`/`git log` and could report "all clean" while the remote was unreachable or an operation was unfinished. One deterministic read-only command now returns the fact instead of the interpretation.

- **`wolf git-inspect [--baseline <sha>] [--target <ref>] [--owner <id>]`** prints a single JSON report (`schema_version: 1`): repository, worktree, branch, head, baseline, target, dirty, unfinished_git_operation, local_vs_remote, branch_owner, freshness_of_remote_observation — plus a `verdict` of `PASS | VIOLATION | UNKNOWN`, per-check `reasons` and derived `allowed_next_actions`. Exit codes: 0 PASS, 1 VIOLATION, 2 UNKNOWN — "could not check" is never returned as success.
- **Honest remote observation.** With an upstream/remote configured, the comparison uses a live `git ls-remote` with a 10 s timeout; an unreachable remote yields `UNKNOWN` (no false `PASS`), a repo without remote is reported as not applicable, and a remote ahead without local objects is reported as `remote-ahead-unfetched` with null counts instead of invented numbers. Refs are never changed: only read-only git commands run, no fetch/push/commit.
- **Agent-facing plumbing, single collector.** The command is hidden from `wolf --help` (the P224 help budget is kept) and documented in the CLI reference; the `wolf-git` skill (B0) now points to it at G0 as the source of the structured git fact. No second git-state collector is introduced: `branch_owner` comes only from `--owner`, and the command never reads Wolf memory, so it stays portable.

### What this release does not do

- **No write operations.** commit/push/cleanup/MR remain out of scope (B1); the command does not decide whether writing is allowed — that authority belongs to the task and B1.
- **No arbitrary comparison target.** The remote comparison uses the branch upstream; `--target` records the task target and requires remote observation (comparing against an arbitrary ref is B1).

### Upgrade notes

- **`npm install -g mister-wolf@2.27.0`** (or `wolf upgrade`) is enough. No schema migrations; `update-map.json` records 1 changed file target against 2.26.0 (the `wolf-git` skill), the other 53 file targets and the 6 versioned playbooks are unchanged.

## [2.26.0] - 2026-11-03

### Added — the task contract now carries active constraints and accepted decisions across sessions

Roadmap v4 (edition 9, §8) slice E1-1: the most expensive loss on a session or executor change was not the files but the "why it was decided exactly this way". A fresh worker reopened settled questions and re-asked standing constraints. The task contract (the core the `using-skills` canon defines) now names both explicitly — instruction-level only, no new runtime.

- **`ACTIVE_CONSTRAINTS` — standing constraints as short lines.** Each line is "what is in effect → source/basis" (a memory rule with its id, a decision, a document with a revision). An absent block means "no constraints beyond the common norms"; a retelling of every project rule is explicitly not wanted. It is a core TASK element with conditional applicability: passed when it applies, and its absence is a statement, not an omission.
- **`DECISIONS[]` — one line per decision that still influences the work.** `D-id`, what was decided (one line), why/what was rejected, the basis/source. This is not a discussion history and not a new decision store: the recovery package answers "why so and what was rejected" without replaying the reasoning.
- **Continuation and replacement deliver both blocks.** The `wolf-handoff` snapshot lists `ACTIVE_CONSTRAINTS` and `DECISIONS[]` as explicit items; the `executor-lead` replace order passes them through the handoff together with the known result and open findings; `wolf-sdd` requires them in the next call on the same task. On the worker side, `wolf-execute` instructs: honor the constraints and do not reopen a closed decision without new grounds — a counterexample or a changed basis goes back to L1 instead of silently switching direction.
- **Docs:** the task-brief description in the guide (`organization`, EN/RU) now counts the core as ten elements and names both blocks. The contract wording itself lives in `using-skills` references of the delivered set.

### What this release does not do

- **No new CLI surface, schema or migration.** `schema_migrations` stays empty; `src/**` is untouched — the slice is instruction-level payload plus documentation. `update-map.json` records 5 changed file targets against 2.25.1 (the canon `contracts.md`, `wolf-handoff`, `wolf-execute`, `wolf-sdd`, the `executor-lead` frame); the other 49 file targets, the 6 versioned agent playbooks ("faces") and `agents_md` are unchanged. The installed copies of the delivered files (e.g. `.opencode/` in a live project) are re-stamped to the new version by the upgrade pass.
- **Plan tree, budget accounting, dependency invalidation and evidence applicability are not in this slice** — they are the next E1 slices by roadmap v4 §8, deliberately not promised here. The installed `.opencode/` copy of a live project picks the new texts up via the regular upgrade pass (re-stamped set).

### Upgrade notes

- **`npm install -g mister-wolf@2.26.0` (or `wolf upgrade`) is enough.** Projects receive the updated skill texts and frame through the regular upgrade pass; `protect:` files and local mutations keep their existing rules. Nothing to migrate, nothing to reconfigure.

## [2.25.1] - 2026-11-02

### Fixed — exposed tool skills cannot go stale after `--update`, and verification timeouts stop the whole process tree

Two defects found by an external review of 2.25.0, each reproduced before its fix and covered by red→green regression tests; nothing beyond them and one template-seed cosmetic changes.

- **`wolf tool register --update` now refreshes the published `SKILL.md`.** Previously the card could point to the new source while an exposed `.opencode/skills/<name>/SKILL.md` still referenced the old one, and `tool use` afterwards counted a run against a card whose exposed instruction pointed elsewhere. Now a marker-owned `SKILL.md` is regenerated from the updated card (a file without the generation marker is never touched; the CLI prints `Exposed skill refreshed: …`), and the generated instruction verifies the source **before** running: `wolf tool expose <name>` (idempotent; fails with "Tool source changed" on drift) → run the script → `wolf tool use <name>` afterwards. `usage_count` still increments only after the card's own source digest verifies.
- **`workflow-helper check` terminates the whole process group on timeout.** The helper ran the command via `subprocess.run`, so a timeout killed only the direct child while descendants kept writing to the verification log after `log_sha256` had been fixed — an unreproducible record. Now the command starts in its own session, a timeout kills the entire group (`SIGKILL`), and the digest is computed only after the group is confirmed stopped — on the timeout path and the normal-exit path alike, so a late survivor of a passing command no longer corrupts the hash either. The record carries explicit limit lines ("verification process group terminated after timeout", "process group not confirmed empty within 5s; log digest may be unstable").
- **Template cosmetic: the `complaint-protocol` seed no longer hardcodes a face version.** The phrase "Активную v2 обновляет Стюард" had drifted from the fact (live faces are on newer revisions); the seed now says "Активную редакцию лица обновляет Стюард". Live faces are untouched — they change only through the authorized Steward circuit.

### What this release does not do

- **No new CLI surface, schema or migration.** `schema_migrations` stays empty; existing tool cards and configs are unaffected. `update-map.json` records 2 changed targets against 2.25.0 (`wolf-execute/scripts/workflow-helper.py`, the `complaint-protocol` seed); the other 53 file targets, 5 faces and `agents_md` are unchanged.
- **A descendant that starts its own session (`setsid`) is still unreachable by the group kill — and the helper cannot even see it** (such a descendant has left the group, so no limit line fires). This POSIX edge is documented here rather than handled.

### Upgrade notes

- **`npm install -g mister-wolf@2.25.1` (or `wolf upgrade`) is enough.** Projects pick up the fixed helper and the seed text via the regular upgrade pass; `protect:` files and local mutations keep their existing rules.

## [2.25.0] - 2026-11-02

### Changed — the skill router became a small core with topical routes, feedback got its own skill, and tool cards reference project sources instead of copying them

This release integrates the external skills-expand package (34 requirements, 32 acceptance scenarios; review package in `docs/external/reviews/2026-11-02-skills-expand/`). The base set grows from 23 to 25 skills; `src/**` runtime changes are limited to the tool library and the render stamp.

- **`using-skills` is now a compact core plus topical references.** The core shrank from ~40 KB to ~8 KB and routes by topic: intent, execution, quality, state, capabilities, communication. Each `references/*.md` file carries the applicable forks, links and the conditions for loading a full skill; an explicitly assigned skill is loaded directly without walking the tree, and L2 never browses the catalog. Project rules, project tools, contracts and context/memory rules live in their own references. The whole delivered path — core, branch, skill, references and re-loads — is what counts, not the size of the root file.
- **`wolf-feedback` (new) unifies the feedback canon extracted from the complaint protocol.** Its stable core: observation → sufficient grounds → the responsible participant → the right route. It distinguishes a missing-context question, tool friction (FRICTION), a one-off execution deviation, a proven W1–W4 rule defect (a real complaint through the existing triage) and an unknown cause (bounded session diagnosis). The former `complaint-protocol` playbook becomes a pointer to the canon; triggers W1–W4, powers and the triage statuses are unchanged. `scripts/session-reader.py` reads a local OpenCode SQLite database strictly read-only (`mode=ro`) by explicit `--db`/`--session`, with record/size limits, pagination and locators; it was verified on a `session_v2` fixture, not on a live history.
- **`wolf-visual-dialogue` (new) structures visual discussion.** Question → a fitting representation → distinguishable feedback → update or a recorded choice. It composes with `wolf-explain` and `wolf-user-report` instead of adding mandatory stages; a standalone HTML document is still created only on an explicit request or agreement. Without an interactive environment a suitable static representation plus chat feedback is the honest path and is not presented as interactive.
- **Tool cards reference project sources — registration no longer copies scripts into `.wolf/tools/`.** `wolf tool register` stores a project-relative reference, a multi-file `source_digest` (sha256 over the entrypoint and `--resource` files) and keeps the source in the project; there is no second executable copy. `--update <name>` updates the existing card without changing its identity, repeated `--resource` entries redefine the significant file set, `--clear-resources` drops it explicitly. Paths are resolved per working copy, checked against symlink escapes, and `tool use`/`tool expose` verify the source and its digest — a stale or missing source fails honestly without counting a successful use. `tool use` still records usage; it does not execute anything. Existing `.wolf/tools` cards remain valid without migration.
- **Applied techniques and execution helpers landed as references and portable scripts.** Root-cause and boundary tracing, polluter-test isolation, waiting for a condition instead of a fixed delay, and test-quality guidance moved into `references/` of `wolf-debug`, `test-driven-development` and `wolf-execute`. `wolf-execute/scripts/workflow-helper.py` (Python 3.9+, stdlib only) provides three mechanical operations — TASK packing with explicit missing-input reporting, check execution with honest failure/timeout/unknown outcomes and an atomically published log, and a review package over a verified commit range — none of which dispatches, accepts or replaces an agent's judgement. Python skills are stamped with a `#` comment line while the shebang stays first.

### What this release does not do

- **The 32 behavioural acceptance scenarios of the package are not closed by unit tests.** Structural delivery, render/protect behaviour, tool cards and the reader on a fixture are covered by the test suite; live scenarios — real delivery of an external/project skill, a real OpenCode history instead of a `session_v2` fixture, the end-to-end visual path — remain open and are honestly listed in the implementation notes. A full gate on the final source was re-run for this release.
- **No measured savings are claimed.** The core shrinking ~5× is bytes of one file, not tokens of the whole route and not a measured cost reduction; no measurement campaign was run, and future density comparisons use 2.25.0 as their base.
- **Live faces of an existing installation are not migrated by this release.** Seeded templates carry the new canon; the active `complaint-protocol` and executor/worker playbooks of an already initialized project change only through the authorized Steward circuit, preserving history and local `protect:` decisions.
- **`REQ-08/AC-24` of the package covers part of the roadmap E1 slice-1 instructively** (recovery-after-compaction/handoff rules in the delivered texts); the E1 queue keeps its remainder — live confirmation of recovery, plan/unknowns/budget.

### Upgrade notes

- **`npm install -g mister-wolf@2.25.0` (or `wolf upgrade`) is enough.** No schema migration is required: `source_digest` is an optional card field, existing tool cards keep working, and `schema_migrations` stays empty. The memory store and config are untouched.
- **`update-map.json` is regenerated against 2.24.0.** New files (two skills, references, Python scripts) are `new` targets; rewritten templates are `changed`; `wolf upgrade --here` re-stamps the delivered set to `set=2.25.0`, honouring `protect:` and local mutations as usual.
- **If you scripted `wolf tool register`, note the semantics change.** Registration stores a reference, not a copy: the source must stay inside the project (symlinks that escape it are rejected), and `tool use`/`tool expose` now fail on a moved or modified source until the card is updated explicitly.

## [2.24.0] - 2026-11-02

### Changed — dispatched tasks carry a density axis: `density standard|draft` (A1.2 economical behavior)

The base set ships the roadmap A1.2 carrier: the TASK execution contract gains an explicit density axis, `density standard|draft`. The owner level (L0/L1) writes the density when composing the TASK; a missing field means `standard`. In `draft` the executor shortens the visible service record — repeated retellings, narration of the obvious, ritual summaries — while mandatory checks, rights, evidence and independent acceptance stay untouched; substantial uncertainty widens the targeted verification instead of shrinking the answer; the RESULT records the actual density, and acceptance verifies observed actions, evidence and the result — not a draft label. This is the behavioral counterpart of A1.1 (2.23.0 `wolf usage import`), which supplies the measurement data.

- **The axis lives in the existing execution block, not in runtime.** Nine instruction surfaces agree on one formulation: the `using-skills` TASK contract, the `executor-lead` frame and playbook (choice at dispatch, acceptance not by label, unsupported density is diagnosed), and the three worker frames and playbooks (execute the assigned density, never pick or raise it yourself; an unsupported density is returned to L1). The draft report keeps every mandatory field: implementer self-checks, researcher sources/CONFIDENCE/GAPS, reviewer verdict/evidence/SCOPE.
- **A renderer test locks the carrier in the delivered set** (`density-mode-delivery`, 5 tests over a real base-set render: TASK contract, lead frame+playbook, implementer, researcher+reviewer, fixtures/baseline agreement). The RED run on the pre-slice base `ebe1d54` failed 5/5; the slice makes it green.
- **Scenario fixtures ship with the slice** (`tests/fixtures/a1-2-density/scenarios.json`): small unambiguous task in draft, substantial unknown in draft, FULL/LITE independence — the observation protocol for permitted work, baseline 2.23.3, instrumented by `wolf usage import`.
- **Site guides describe the contract.** The EN/RU base-set pages state the density axis and its honest limits.

### What this release does not do

- **The economy is not measured.** The carrier, the behavior contract, the scenarios and the comparison protocol are delivered; the effect is honestly "not estimated" (roadmap NFR-06/AC-08): a few routine tasks give pilot observation, not a causal claim, and no numeric savings threshold is stated. REQ-23A stays open.
- **These are instructions, not mechanisms.** No runtime API, schema, permission, model or dependency change; `schema_migrations` is empty and `CURRENT_SCHEMA_VERSION` is untouched. An agent that ignores the density field is not blocked by code — acceptance and independent review compensate.
- **Existing active faces are not migrated by the release.** An upgrade pass delivers the updated templates; reconciling live playbook faces with the new seeds stays the existing authorized Steward workflow.
- **The known unstamped `wolf-release-docs` delivery in this repository is untouched.** It predates this release (2.23.1 finding) and keeps its needs-decision state on the next pass; this release neither resolves nor hides it.

### Upgrade notes

- **Nothing migrates.** `npm install -g mister-wolf@2.24.0` (or `wolf upgrade`) is enough; the memory store, its schema, the config and the public CLI surface are unchanged.
- **`update-map.json` records 35 file targets — 5 `changed` (the density contract across the TASK/agent surfaces), 30 `unchanged` — with 6 faces and an empty `schema_migrations`.** An existing project receives the updated templates re-stamped `set=2.24.0`.
- **`protect:` and local mutations stay in the owner's hands.** Same rules as 2.23.3: a protected file is never overwritten; a locally edited file is a `needs decision` resolved by `wolf upgrade --resolve <file>=keep|take`.

## [2.23.3] - 2026-11-02

### Changed — the base set gains `wolf-user-report`: user-facing reports and documents with adequate depth

The base set ships a new workflow skill, `wolf-user-report`, and routes it from `using-skills` (23 skills instead of 22). A user-facing report is a substantive answer first: depth, structure and presentation are sized to the reader's question instead of mandatory sections, fixed length or decoration. The review, its patch and the verification notes live in `docs/external/reviews/2026-11-02-report-skill/`.

- **New `wolf-user-report` skill (23 skills instead of 22).** Understand the reader's question and authority boundaries first, then choose depth and format (summary, work report, research, comparison, instruction); build the content route before styling; add visuals only when they help the reader (tables, charts from real data, schemas — color is never the only carrier of meaning); write clean self-contained HTML/CSS when HTML is requested (CSS variables, contrast, keyboard focus, print view, no CDN dependence, untrusted data escaped); save genuinely reusable project templates instead of building a mandatory library. Ships in the full set (`wolf init --full` and full-set delivery); minimal init keeps its onboarding-only semantics. No new agent, mandatory CSS profile set, dependency or runtime mechanism.
- **`using-skills` routes it by task, not by reflex.** The mandatory-skills table gained one row: a requested or updated user-facing report or document → `wolf-user-report` (L2 — only the assigned document). The skill loads on applicability, not for every answer, RESULT or EVIDENCE; format follows the task and user preferences — Markdown stays Markdown, HTML is not imposed. A user document complements but never replaces TASK/RESULT/EVIDENCE/ACCEPTANCE.
- **Catalogs and counts agree.** The EN/RU site guides (base set, artifact pipeline) describe the new skill and state 23 skills; README, docs/README and getting-started (EN and RU) numbers updated.

### What this release does not do

- **The improvement is not measured.** The patch author's comparison ran eight report scenarios on clean executors and confirmed applicability and no obvious regression; no quality, speed or token-cost measurements exist, and none are claimed.
- **These are instructions, not mechanisms.** No runtime API, schema, permission or dependency change; `schema_migrations` is empty and `CURRENT_SCHEMA_VERSION` is untouched. Nothing enforces the routing at runtime: an agent that skips the check is not blocked by the code.
- **Existing active faces are not migrated by the release.** An upgrade pass delivers the new skill file and the updated `using-skills`; `protect:` files and local mutations stay owner-controlled.

### Upgrade notes

- **Nothing migrates.** `npm install -g mister-wolf@2.23.3` (or `wolf upgrade`) is enough; the memory store, its schema, the config and the public CLI surface are unchanged.
- **`update-map.json` records 35 file targets — 1 `new` (`wolf-user-report`), 1 `changed` (`using-skills`), 33 `unchanged` — with 6 faces and an empty `schema_migrations`.** An existing project receives the new skill file plus the updated `using-skills` routing and gets the rest re-stamped `set=2.23.3`.
- **`protect:` and local mutations stay in the owner's hands.** Same rules as 2.23.2: a protected file is reported `behind (base 2.23.3)` and is never overwritten; a locally edited file is a `needs decision` resolved by `wolf upgrade --resolve <file>=keep|take`.

## [2.23.2] - 2026-11-02

### Changed — agents choose a proportionate way of working and ask before expensive investigations

The base set ships a new workflow skill, `wolf-work-strategy`, and aligns the agent frames, methodologies and commands around one principle: reach the assigned result by a proportionate route — use what is already delivered, read the nearest reliable source, apply a proven means, ask the context holder when one answer beats a long investigation, run a distinguishing check when a decision depends on it, hand the question to the responsible level when the unknown needs new scope or authority, and stop when the result is sufficiently grounded. Asking is a working action, not a failure: it needs no prior attempts and no quota, and a lead answers with the known answer, a means or an escalation instead of an unchanged "figure it out". The skill changes no roles, rights, approved goals or mandatory project gates.

- **New `wolf-work-strategy` skill (22 skills instead of 21).** A route table for choosing the next useful move (delivered answer / nearest source / proven means / addressed question / distinguishing check / hand-off / sufficient stop), rules for asking as a working action, and depth-and-sufficiency limits: a mandatory check is always run, a conditional one only with its ground, and a neighbouring interesting finding does not create a new assignment. A dedicated renderer test verifies the skill is delivered whole, including to projects where it does not exist yet.
- **Frames and methodologies agree with the principle.** `mr-wolf`, `executor-lead`, the three workers, `steward`, `using-skills`, `wolf-plan`, `wolf-design`, `wolf-execute`, `wolf-sdd`, `wolf-debug`, `wolf-review`, `wolf-testplan`, test-driven development, verification-before-completion and `writing-skills` are re-aligned: conditional techniques no longer read as mandatory audits, "read whole sections / cite every finding" prescriptions are removed (notably from the researcher playbook), and finishing at a sufficiently grounded result is spelled out. The seeds of the four numbered roles and the mentor carry v4.
- **`analyze-doc` states its route.** L0 aligns the goal → L1 organizes a bounded analysis → worker-researcher executes one question — instead of the earlier "analyze a document by the methodology stored in memory" without routing.
- **Catalogs and counts agree.** The EN/RU site guides (base set, artifact pipeline) describe the new skill and state 22 skills; README, docs/README and getting-started (EN and RU) numbers updated — they still said 20.

### What this release does not do

- **The economy is not measured.** On the paired pilot (clean executors, baseline templates vs candidate) both sides returned correct results, and two additional candidate probes passed; no runtime metrics, holdout or false-trigger measurements exist, and none are claimed.
- **These are instructions, not mechanisms.** No runtime API, schema, permission, model, dependency or Git-policy change; `schema_migrations` is empty and `CURRENT_SCHEMA_VERSION` is untouched.
- **Existing active faces are not migrated by the release.** The seed playbooks carry v4, but an upgrade pass does not rewrite live playbook faces; `protect:` files and local mutations stay owner-controlled. Reconciling old active faces with the new seeds is the existing authorized Steward workflow, and a staging copy with a diff/backup comes first.
- **The known unstamped `wolf-release-docs` delivery in this repository is untouched.** It predates this release (2.23.1 finding) and keeps its needs-decision state on the next pass; this release neither resolves nor hides it.

### Upgrade notes

- **Nothing migrates.** `npm install -g mister-wolf@2.23.2` (or `wolf upgrade`) is enough; the memory store, its schema, the config and the public CLI surface are unchanged.
- **update-map.json records 34 file targets — 1 `new` (`wolf-work-strategy`), 19 `changed`, 14 `unchanged` — with 6 faces and an empty `schema_migrations`.** An existing project receives the new skill file plus the re-aligned targets and gets the rest re-stamped `set=2.23.2`.
- **`protect:` and local mutations stay in the owner's hands.** Same rules as 2.23.1: a protected file is reported `behind (base 2.23.2)` and is never overwritten; a locally edited file is a `needs decision` resolved by `wolf upgrade --resolve <file>=keep|take`.

## [2.23.1] - 2026-11-02

### Changed — the agent set checks that it understood the goal before working, and explains in human language

Four base templates are rewritten: `agents/mr-wolf.md`, `skills/using-skills/SKILL.md`, `skills/wolf-brainstorm/SKILL.md` and `skills/wolf-explain/SKILL.md`. They are instructions to agents, not runtime behaviour — no code in `src/**` changed.

- **`wolf-brainstorm` became an intent dialogue.** The skill no longer runs a questionnaire: no mandatory two, three or five questions, no filled-in fields as proof of understanding. Readiness is decided by whether the goal, the result and the boundaries can be stated in your own words, and a visible recap of the understood task comes before research, dispatch, `scaffold` and requirements so that it can be corrected. A direct assignment shortens that dialogue but does not remove the check; work already agreed and unchanged is continued without a second discovery; an explicit "continue without questions" is honoured within its limits, with the assumptions named. Research still needs its own mandate — question, sources and stop condition — and a council is reserved for a choice where independent opinions can change the decision. The outcome of a discussion about future development can now be saved as an optional `pre-requirements.md` next to the future documents of the same goal: it does not run `scaffold` and does not mean the requirements are approved.
- **`wolf-explain` explains through actions, reasons and consequences.** The answer is built from the link the person is missing — a term, a cause-and-effect relation, the state of the work or the consequences of a choice — rather than from the structure of the internal report. One main thought per dialogue reply; a final answer or a handed-over document is self-sufficient (main point, grounds, material limitations, next step). A person who lost the thread gets the missing connection restored, not shorter synonyms. Facts, assumptions, recommendations and the unknown stay distinguishable, and an illustration that is not backed by a source is marked as conditional.
- **`mr-wolf` and `using-skills` route the same way.** A new idea, a substantial change or a new substantive assignment (study, compare, write a document) passes the intent check before the subject is studied and before dispatch, while a ready answer from delivered context is given without a new round of questions. Both templates now state that studying the task's materials — documentation, code and repository included — is execution through L1 even when it is read-only, Markdown or a small informational question; the format of the material is not an exception from the role. The mandatory-skills table gained a row for "study, compare or prepare a document", and the stage-documentation section now names `pre-requirements.md` as an optional brainstorm outcome that is not one of the four documents, does not run `scaffold` and does not mean the requirements are approved.

### What this release does not do

- **The economy and the quality of a long dialogue are not measured.** No token, latency or cost comparison is made, and no long-running conversation was evaluated. The author's probes of first replies on three further topics (employee onboarding, household chores, a supplier order status) are limited behaviour checks: they show that a reply can start the dialogue without a questionnaire, not that the dialogue is better over a session.
- **These are instructions, not mechanisms.** Nothing enforces the gate at runtime: there is no new agent, command, memory type, status or `permission:` boundary, `schema_migrations` is empty and `CURRENT_SCHEMA_VERSION` is untouched. An agent that skips the check is not blocked by the code.
- **The new text does not reach every existing installation unchanged.** A file under `protect:` keeps its last render and is reported `behind (base 2.23.1)`; a file edited locally is a `needs decision` — `wolf upgrade --resolve <file>=keep` keeps your version and the next pass delivers the rest, while an unattended `--yes` pass takes the base first and prints where the local copy was saved under `.wolf/backup/upgrade/<date>/`. Nothing is lost silently, but an unattended pass does not ask.
- **A1.2 measurement is not done here.** The "before/after" baseline for measurement work is now 2.23.1 with a larger skill set, not 2.23.0.

### Upgrade notes

- **Nothing migrates.** `npm install -g mister-wolf@2.23.1` (or `wolf upgrade`) is enough; the memory store, its schema, the config and the public CLI surface are unchanged.
- **Four targets are `changed` on the next pass.** `update-map.json` records 33 file targets — 4 `changed` (the four templates above), 29 `unchanged` — with 6 faces and an empty `schema_migrations`. An existing project gets the four files rewritten and the rest re-stamped `set=2.23.1`; no file is `new` or `removed`.
- **`protect:` and local mutations stay in the owner's hands.** A protected file keeps the `set=` of its last render, is listed under `Protections` as `behind (base 2.23.1)` and is never overwritten — not by the pass, not by `--yes`. A locally edited file is a decision: `wolf upgrade --resolve <file>=keep` accepts your version (the file then reports as `kept (local)`) and the next `--yes` pass applies the remaining targets; `take` drops the local version to `.wolf/backup/upgrade/<date>/` first.

## [2.23.0] - 2026-11-01

### Added — a read-only usage importer for local OpenCode sessions, and the Git-collaboration skill in the base set

- **`wolf usage import` reads a local OpenCode database and writes `run` events.** The new command opens the platform's SQLite database (`~/.local/share/opencode/opencode.db`, OpenCode 2.2.5) **read-only** and transfers completed assistant turns into the signal log as `run` events through the existing `appendSignal` writer — there is no second writer. The event id is stable, `sha256("opencode-usage:v1|" + message_id)`, so importing an unchanged source again adds no rows, while two runs of one task stay two records.
- **The window and the task mapping are explicit options.** `--db` points at a database, `--since` and `--until` bound the window (the default starts at the beginning of yesterday), `--task-map` takes a JSON `{session_id: task_id}` map, `--dry-run` reports without writing and `--json` prints the machine-readable form. The selection is served by the `time_created` index; there is no full scan.
- **The report answers "what was imported" before "what it cost".** Totals by `run_id` — appended, duplicate, skipped as incomplete — then one line per run with agent, model, tokens, `generation_ms`, task and attempt, and a block of source limitations. `generation_ms` is the sum of turn durations (generation time), not wall-clock; `busy_ms` appears only in `--json`.
- **Docs and tests ship with it**: `docs/reference/cli.md` and `docs/guide/signal-log.md` describe the command, and the import is covered by three new unit-test files and two fixtures.
- **`wolf-git` ships in the base set** (21 skills instead of 20). It delivers the Git-collaboration policy v1.1 — `templates/base/skills/wolf-git/SKILL.md` with `reference/git-collaboration-policy-v1.1.md` (553 lines, also kept in this repository as `docs/reference/git-collaboration-policy-v1.1.md`) — and routes the Git stages: G0 entry and resume (§6), G1 branch or worktree (§7, §4.1), saving a checkpoint (§8), handoff G2 (§9), finishing and cleanup G9 (§15). §22 fixes merge `--no-ff` as the standard with squash only as an explicit exception; §16 covers the gates; §10 covers acceptance, integration and release.

### Changed — four existing skills point at the new one

- `using-skills`, `wolf-handoff`, `using-git-worktrees` and `finishing-a-development-branch` each gained one or two lines of cross-reference to `wolf-git`, so the Git stages are reachable from the skills a session already loads. Nothing else in those skills changed.

### Fixed — the generated CLI reference is machine-independent

- **`wolf usage import --db` no longer bakes the generating machine's home path into the reference.** The default is stated in the option's description as `~/.local/share/opencode/opencode.db` and resolved by the use case, so `docs/reference/cli.md` is identical on every machine. A guard now fails when an absolute home path leaks back into the reference, which turns the reference-drift failure from "CI only" into "fails where the file is generated".

### What this release does not do

- **The skill automates nothing.** There is no merge-request status and no hosting adapter, no CI check, no integration queue, no tag, registry or release step, no structural read-only `git inspect` and no JSON verdict — those are later slices (B0.5, B1). Gates G3–G8 are not automated and are performed by people.
- **The importer states its own limits.** It does not carry the model `variant` (the signal schema has no field for it) and does not compute `cost` (there is no price table); `task_id` appears only from an explicit `--task-map`; `reasoning` and `cache.write` are not added to `output` or `cache_read` and do not enter `weighted`. An empty event set means unknown coverage, not zero spend.
- No public memory schema, status set or `permission:` boundary changed: `schema_migrations` is empty and `CURRENT_SCHEMA_VERSION` is untouched.
- No token or cost saving is claimed. This release makes local usage visible; the measurement is the next slice (A1.2).

### Upgrade notes

- **Nothing migrates.** `npm install -g mister-wolf@2.23.0` (or `wolf upgrade`) is enough; the memory store, its schema, the config and the public CLI surface are unchanged.
- **One new skill arrives on the next pass.** An existing project gets `.opencode/skills/wolf-git/SKILL.md` and its reference file as `created`. `update-map.json` records 33 file targets — 2 `new` (the skill and its reference), 4 `changed` (the cross-references) and 27 `unchanged` — with 6 faces and an empty `schema_migrations`.
- **The installed set re-stamps on the next project pass** — the `set=` value follows the running package version. Files under `protect:` keep the `set=` of their last render, by design.

## [2.22.1] - 2026-10-31

### Added — a generated CLI command reference on the site, and the release-documentation skill in the base set

- **The site's full command list is generated from the registry.** `docs/site/guide/cli/command-reference.md` and its Russian mirror are built by `scripts/generate-cli-site-page.mjs` from the same `COMMANDS` registry that already produces `docs/reference/cli.md`, so a command cannot be added to the CLI and silently missing from the site. `npm run docs:build` runs the new generator; a guard test compares both pages byte-for-byte with a fresh generation and checks that every full path in the reference appears on the page (97 of 97 covered, up from 55). The hand-maintained section pages — memory, sessions, analytics and the rest — keep their prose and examples; this page is the complete index next to them.
- **`wolf-release-docs` now ships in the base set** (`templates/base/skills/`, 20 skills instead of 19). It was previously a project-local intake in this repository only, so the release-documentation pass — coverage map, EN/RU agreement, generated pages, independent review — was not delivered to your project at all. It now arrives with `wolf init --full` and on the next `wolf upgrade` pass.

### Changed — repository hygiene accepted earlier lands in a release

The hygiene work merged before this tag had no version of its own; 2.22.1 is its first published release. It is documentation and repository structure, not runtime behaviour:

- **External evidence has one home.** `.external-research/` and `.external_experts_review/` moved under `docs/external/` (`program/` and `reviews/`), 36 files relocated without content change. `docs/README.md` names the new section, and the concept and evidence files point at the new paths. Text of the evidence is not edited — it is a quote, not documentation.
- **`docs/dev/` holds only current packages.** 63 stale per-wave reports, review journals and one-off audit files were removed from the tree — recoverable at `5830279` (the `main` state immediately before the hygiene pass): `git show 5830279:<path>` prints one file, and `git diff --diff-filter=D --name-only 5830279 HEAD -- docs/dev` lists all 63 removed paths. The recovery pointer is documented in `docs/external/README.md`, next to the evidence it points at. Remaining packages are the ones still describing work in flight.
- **The repository stopped shipping its own debris.** `templates/.wolf/router.log` no longer ends up in the npm tarball (`package.json` `files` does not apply `.gitignore`), the build starts from a clean `dist/` (`rm -rf dist && tsc`), two unused site logos were deleted, and a redundant project-local `.opencode.json` was dropped.
- **`wolf init` describes the ignore block honestly.** The generated `.gitignore` comment no longer claims the memory directory is portable; see the limitation below.

### What this release does not do

- No runtime source, public schema, status set or `permission:` boundary changed. Against 2.22.0 the only `src/**` change is comment text in `src/app/use-cases/gitignore-block.ts` — the JSDoc and the comment line the generated `.gitignore` block carries; `buildGitignoreBlock()` behaviour is identical. Against the branch base `ae3a10e`, `src/**` is untouched entirely.
- No behavioural change is claimed for the hygiene part: it moves and deletes documentation, prunes repository artifacts and renames a section. Nothing about how Wolf stores, searches or delivers memory is different.
- **A documented contradiction is not resolved here.** `docs/site/guide/transfer.md` (EN and RU) still states that `.wolf/memory/` "is the durable core — commit it", while the `.gitignore` block this release ships says the memory is not committed and is not restored on another machine. Both shipped in this line; the code behaviour is that a plain `wolf init` does **not** ignore `.wolf/memory/` (so committing it does work today), and the new comment describes a different policy. Choosing the direction — make the memory portable and commit it, or finish making it machine-local — is an owner decision, and the contradictory wording stays visible rather than being quietly patched to match one side.
- The worker-fallback path in `wolf-router` (P-02) is still not fixed, and `.wolf/` retention is still not implemented. Neither is part of this release.
- No token or cost saving is claimed.

### Upgrade notes

- **Nothing migrates.** `npm install -g mister-wolf@2.22.1` (or `wolf upgrade`) is enough; the memory store, its schema, the config and the public CLI surface are unchanged.
- **One new skill arrives on the next pass.** An existing project gets `.opencode/skills/wolf-release-docs/SKILL.md` as `created`; `protect:` files stay put and local edits to stamped files keep their documented handling. If a project already carries its own `wolf-release-docs` from an earlier intake, that file is reported as a conflict and left for the owner to resolve — rename, delete or accept it. This repository is exactly that case, and the conflict is expected, not a regression.
- **The installed set re-stamps on the next project pass** — the `set=` value follows the running package version. `update-map.json` records 31 file targets (the new skill is `new`, the rest `unchanged`), so `wolf upgrade --check` reports no content drift; only the stamp line differs.

## [2.22.0] - 2026-10-31

### Changed — one canonical worker brief, three profiles and a session rule (instructions only; no runtime source, schemas or new commands)

- **One TASK core lives in `using-skills`**: a brief is assembled from eight elements — `task_id`, the expected result, the acceptance criteria, scope and authority, the required inputs with the assigned methodology, the verification, a finite budget with a stop condition, and the expected RESULT. Each element is a checkable instruction, not one comma-separated list, and a required element is never dropped: an unknown required input is requested back rather than filled with a placeholder.
- **Three brief profiles**: `implement` adds repo/workspace, `base_sha`, the write allowlist, the read scope, dependencies and design/test-plan references; `review` and `research` add an artifact revision, the assigned lens (review) or the question and stop condition (research) and no longer require Git fields. Role-specific reports are unchanged: `DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED`, `SUMMARY/VERDICT/FINDINGS/SCOPE/LIMITS/EVIDENCE` with `APPROVED | CHANGES_REQUIRED | INCONCLUSIVE`, `FINDINGS/CONFIDENCE/GAPS`.
- **A static glossary of six existing terms** — TASK, RESULT, EVIDENCE, ACCEPTANCE, SCOPE, LIMITS/GAPS — sits next to the core. It fixes wording that already exists; it introduces no live dictionary and no generation mechanism.
- **One canonical session rule in the `executor-lead` frame**: after the decision to delegate, `fresh` starts a new worker for a new independently acceptable result, `continue` keeps the same worker for the same not-yet-accepted result, and `replace` starts a new worker for the same task through a handoff. The rule states that `task_id` is not a session id, that `continue` does not widen scope, and that an accepted task does not free the previous worker for the next one. The four replace steps are distinct — stop writing, preserve the result, hand ownership over, close the old session — and a timeout is not proof that writing stopped.
- **Dependent methodologies point at the canon instead of restating it**: `wolf-plan`, `wolf-sdd`, `wolf-review` and `wolf-handoff` now reference the core or the session rule; `wolf-execute` already pointed at `using-skills` and needed no change. The injection body a worker receives now says that the methodology and the brief's core arrive with the assignment by reference, so a worker does not copy a catalog.
- **The delivered set was re-stamped during this release**: running the pass over this repository re-rendered the installed `.opencode/**` files to `set=2.22.0`. No file was held back by `protect:`, and a second run changes nothing. That is the dogfood run on this repo, not a behaviour change for your project.

### What this release does not do

- No runtime source, public schema, status set or `permission:` boundary changed: the release is instructional and the schema diff is empty.
- No TASK parser, scheduler, model default or hidden reasoning control was introduced. The session rule is guidance for L1, not machine enforcement.
- The worker-fallback path in `wolf-router` (P-02) is not fixed here, so any delivery scenario that depends on that fallback is not claimed as covered.
- No token or cost saving is claimed. Fresh workers and shorter briefs are not measured in this release; an effect figure belongs to the analytics work, not to these notes.

### Upgrade notes

- **Nothing migrates.** `npm install -g mister-wolf@2.22.0` (or `wolf upgrade`) is enough; the memory store, its schema, the config and the public CLI surface are unchanged.
- **The installed set re-stamps on the next project pass.** The `set=` value in a `wolf:rendered` stamp is the version of the running package, not a value the update map carries. So a project keeps the old stamp until the pass runs over it. `wolf upgrade` then counts those files as `updated` — their content differed only in the stamp line, so nothing of yours is overwritten — while `wolf sync`, the deprecated per-file alias, still prints the reason next to each path (`stamp drift healed (base 2.22.0)`). That is not a local edit and needs no decision.
- **`protect:` files stay where they are** — a held file keeps the `set=` of its last render by design, so one project can carry several stamps: `wolf upgrade --check` prints the newest one and appends `(stamps from <oldest>)`. The `protect:` value records the release only in its `X.Y.Z` form; `protect: true` carries no version.
- **Read the new wording before the next delegation.** The session rule in the `executor-lead` frame applies to the lead's next decision to delegate — there is nothing to enable; the frame and the methodologies arrive with the set.

## [2.21.2] - 2026-10-30

### Fixed — the multi-project memory schema isolation is actually delivered

- **Each project validates memory objects against its own type schema**: the fix announced in the 2.21.1 notes was not in that release — the published `v2.21.1` tag still carried a single process-wide `typeSchemaCache` in the markdown memory store, so the taxonomy of the first project read in a process was reused for every project afterwards. The cache is now keyed by the project root (`Map` keyed by `baseDir`, the same pattern the project config cache already used), so one project no longer decides what another project accepts. `wolf upgrade`, which opens stores for foreign project roots inside one process, is the visible path this replaces.
- **Regression test that fails without the fix**: `tests/unit/adapters/markdown-memory-store-schema-isolation.test.ts` drives four project roots with different `memory_types` and `facets` in one process and pins that each is validated by its own schema; on the pre-fix source all three cases fail.

### Limitations — unchanged by this patch

- The schema cache is not invalidated inside a process: editing `.wolf/config.yaml` after the first read is picked up by the next process only. Behavior of 2.21.0/2.21.1, kept as is (minimal patch).
- The process-wide `configLoadWarned` flag still means only the first project with a broken config reports it; later projects silently fall back to the core schema.
- The cache key is the raw `baseDir` string, so reaching the same project through a different path form (trailing slash, symlink) builds a second schema entry — duplicated work, not a correctness issue.

## [2.21.1] - 2026-10-29

### Changed — Wolf efficiency update (instructions-only; no runtime source, scripts, dependencies or schemas)

- **Short bounded L2 mandates with early return**: worker frames and the executor-lead playbook define one finite result per L2 call — ready inputs, a check, a budget and stop rules; unexpected complexity or a missing required input returns to L1 immediately instead of open-ended digging; a COMPLEX parent task is no longer a valid whole L2 mandate; independent ready tasks run in parallel with isolated write sets while dependent tasks block locally, not the whole wave.
- **Tool reuse and bounded consultation**: L1 first resolves missing inputs and reuses a proven library tool or an active `wolf tool list` contract — a reusable new script is a separate authorized task; one precise expertise gap may justify one expert, and a council is an expensive reserve for a materially blocking decision: BLOCKED, a tool failure or risk alone no longer triggers it; advice stays advisory and goal changes go to L0/owner.
- **Clean `docs/dev` composition**: FULL keeps its core requirements/design/plan/test-plan documents and only individually justified additions; private reports, drafts, checkpoints, raw logs and scripts stay out of `docs/dev` (including subdirectories); Wolf memory is the first cross-session exchange route, files are the fallback.
- **Addressed working memory — `note/context`, `note/history`, `note/metric`**: intermediate results live as working notes with explicit `memory_class=working`, `truth_role=proposed_knowledge`, `lifetime`/`review_state` metadata (supported fields, not a new schema); working notes are neither lessons nor rule proposals, are excluded from the Steward's aggregation and complaint-triage pools, and a filesystem report is a fallback rather than a mandatory new file per subtask; L2 returns a message.
- **Autonomous, bounded Steward lesson aggregation** (owner-authorized): the Steward prepares **and applies** suitable aggregates without asking the user again; the technical proposed → apply sequence stays, one invocation handles one small cluster, mandatory preflight (aggregate/source type, distinct IDs, freshness, no self-link, no competing aggregate) runs immediately before `wolf aggregate apply <id> --created-by agent:steward`, an interrupted apply is resumed on the same ID, and an unsafe cluster is skipped with a reason instead of requesting approval for a known-unsafe action.
- **Delivery contour tightened**: L2 receives the assigned face/method and relevant policies from L1 and no longer re-runs general onboarding or `wolf search` lookups for already-delivered instructions (the steward keeps its full plugin-inject + fallback contour); the coordinator triggers the nested Steward call and the Steward applies the aggregate itself.
- **Live faces move through the authorized Steward route with full G17**: template seeds do not silently replace active faces; the next real face version is created via `wolf face new` with reason/minimal-change/boundaries/example-helps/example-keep/verification/rollback.

### Fixed

- **Each project validates memory objects against its own type schema**: the schema cache of the markdown memory store was one module-level value for the whole process, so the taxonomy of the first project read in that process was reused for every project afterwards — a memory object could be accepted (or rejected) by the rules of another project. `wolf upgrade`, which creates a store for foreign project roots within one process, was the visible path to this. The cache is now keyed by the project root, the same way the project config cache already was. Reading and validating memory objects inside a single project behaves exactly as before.
- **docs-audit S-10 unblocked** (owner decision 2026-10-27): the 2026-10-27 roadmap-v4 review package is excluded from the removed-commands audit as a current-phase document; frame/skill guard tests updated to pin the new wording (nested Steward call, autonomous aggregation, `SUMMARY/VERDICT/FINDINGS/SCOPE/LIMITS/EVIDENCE` contract, reviewer complaint-by-frame W1–W4, verdict vocabulary pinned in the `worker-reviewer` frame).
- **`worker-reviewer` keeps the explicit destructive-command ban**: the compressed frame preserves "no sudo, no `rm -rf` outside the system tmp, no destructive git, no `curl | sh`, no secrets" alongside its read-only role contract (restored while applying the update).

## [2.21.0] - 2026-10-26

### Changed

- **Wolf reads the opencode config from both places opencode reads it from**: the project root `opencode.json(c)` and `.opencode/opencode.json(c)`. opencode merges the root file first and the `.opencode` file afterwards, so a key declared in `.opencode` overrides the same key in the root file — Wolf now follows that order and works with the same effective config the platform sees. Why it matters: a project that keeps its opencode config inside `.opencode/` (the directory opencode itself documents for project-level setup) looked to Wolf like a project with no config at all, and every wolf key in it was invisible.
- **`doctor`, `init` and `uninstall` know both locations**: a wolf server declared only in `.opencode/opencode.json(c)` is recognised as declared — no false `wolf entry missing`, no false "`default_agent` is not set" or "`experimental.subagent_depth` is not set"; `wolf init` does not add a second `mcp.servers.wolf` next to a server that is already declared there; `wolf uninstall` removes the server from the file where it is really declared — the root one, the `.opencode` one, or both. Wolf still _writes_ its own keys to the root config: the write target did not move, only the read surface grew, and a minimal `wolf init` still repairs an existing platform config without ever creating one — a project whose config lives only in `.opencode/opencode.json(c)` keeps a single config file, and `wolf init --platform opencode` remains the explicit way to add the root one. A deprecated flat `mcp.wolf` kept in `.opencode` is reported with the file name and needs a manual migration, because wolf does not write into that directory. Note that `wolf uninstall` rewrites the config files it touches as plain JSON, so comments inside a `.jsonc` config are lost — the shortcut that already applied to the root config.

### Fixed

- **A broken config file is named instead of being taken for a missing config, and it no longer hides the other location**: `wolf doctor` says which file it cannot read (`opencode: <file> is not valid JSONC — …`) instead of reporting the project as having no platform config, and a broken or unreadable file in one location does not disable the other: `wolf uninstall` still removes the wolf keys from the healthy config, and a broken root config is still never overwritten. With two config locations in play, one unreadable file must not make the whole platform look unconfigured.

Supported OpenCode range: v1 ≥ 1.18.29 and v2 (native `mcp.servers` is accepted from 1.18.29).

## [2.20.1] - 2026-10-25

### Changed

- **opencode config: the wolf MCP entry is written natively as `mcp.servers.wolf`**: `{ "type": "local", "command": ["wolf", "mcp"], "disabled": false }`, without `codemode` (opencode v1 answers `unsupported` for it). The flat `mcp.wolf` map is `deprecated` in the config schema; opencode v1 ≥ 1.18.29 hoists `mcp.servers` itself and v2 reads it natively, so one written shape serves the whole supported range. Wolf's own legacy `mcp.wolf` (`enabled: true`, the same command) is migrated on `wolf init` / `wolf doctor --repair` — the native entry is written and the deprecated key removed; a foreign `mcp.wolf` (different command) is reported and left alone. On write the wolf slot itself is canonicalized: a hand-written `mcp.servers.wolf` with a different command (a dev entry) is replaced by the canonical one with a `replaced` reason, as `init` always did for the flat form. `doctor`, `init` and `uninstall` understand both forms, so a config migrated by opencode or by hand is no longer reported as `wolf entry missing` and `uninstall` removes the server in either form; a second run reports `unchanged`.
- **One registry of the platform keys wolf writes**: every key now carries its write path, its canonical opencode v2 path, its legacy paths and the forms wolf reads (`src/adapters/platforms/opencode-config-keys.ts`); the adapter, `doctor` and the platform-repair use case take paths from there instead of string literals. A test pins each registry write path to the canonical path of the config schema, so the next key that moves in opencode cannot slip through unnoticed — the 2.20.0 `subagent_depth` class of bug becomes a red test instead of a live run.
- **`wolf tool expose` puts the generated marker after the frontmatter**: `<!-- generated from tool:… -->` used to be the first line of `SKILL.md`; a skill file must start with its `---` frontmatter block, so the marker now follows it. The rewrite stays idempotent.

### Fixed

- **`wolf doctor` validates every key the adapter writes**: `default_agent === 'mr-wolf'`, `experimental.subagent_depth >= 2`, a deprecated top-level `subagent_depth` (`ignored by opencode v2 — migrate`), a legacy flat `mcp.wolf` entry (ours is reported as `migrate`, a foreign one as `foreign and deprecated`), and a managed agent file with a mixed frontmatter. Mixed means a v2 key (`permissions`, `request`, `system`, `disabled`) next to v1 keys (`permission`, `temperature`, `mode`): opencode then reads the file as V2 and ignores the v1 fields, so `permission.task: deny` silently disappears. Why it matters: the 2.20.0 incident (depth written to a path opencode v2 ignores) was invisible until a live run — `doctor` is the only channel that sees such a divergence on a user's machine.
- **opencode v2: `subagent_depth` is written under `experimental`**: the config schema marks a top-level `subagent_depth` as `deprecated`, and opencode v2 ignores it — the effective depth stayed at the platform default `1`, so `executor-lead` could not launch `worker-*` (`Subagent depth limit reached (1)`). `wolf init` / `wolf doctor --repair` now merge `experimental.subagent_depth: 2` (other `experimental` fields and the rest of the JSON are preserved), never create the deprecated top-level key, and leave a foreign `experimental.subagent_depth` untouched (`<2` or a non-number is reported as a conflict). The old top-level value is migrated automatically: a top-level `subagent_depth: 2` (wolf's own value) is moved into `experimental` and removed; any other top-level value is reported as deprecated-and-ignored and never overwritten. `wolf uninstall` removes only wolf's exact values under the new path (and the legacy one), dropping an `experimental` object it emptied.

Supported OpenCode range: v1 ≥ 1.18.29 and v2 (native `mcp.servers` is accepted from 1.18.29).

## [2.20.0] - 2026-10-25

### Added — Upgrade UX: owner intentions, named decisions, silent pass

- **File names in the pass and in `--check` (REQ-01)**: every `mutated` / `conflict` outcome that needs a decision and every `differ` is now printed with the file path relative to the project root, not just as a counter — e.g. `mutated: .opencode/agents/worker-reviewer.md · 1 protected (intentional)`. Diverged faces are not decisions and are named in their own stewarded section (see below). Counters are preserved; names are added next to them. Long lists are wrapped by the terminal renderer, not truncated.
- **`wolf upgrade --resolve` (REQ-06)**: owner decisions without a pass — `--resolve <file|N>=take|keep|protect|pin`, repeatable, comma-separated lists allowed. Targets: `<rel-path>` (unique in the park or in `--here`), `<project>/<rel-path>`, or the decision number `N` from `--review`/`--check` (a path that starts with a digit is written as `./3=…`). All parse and scope errors are collected and printed before anything is written; decisions are applied in registry order, each one idempotent (`backup → file → witness`). A protected file, an out-of-map `orphan`, and a non-mutated target are all addressable by path; `take` is the only verb stronger than `protect` (it drops the key, takes the base and saves the local content to a backup). `keep` on a `conflict` is refused with a hint (`use protect (hold) or take (base)`), `protect` on a file without YAML frontmatter is refused (`cannot protect <path>: no YAML frontmatter — add one or use keep`). `--resolve` never runs the npm phase or the pass.
- **`wolf upgrade --review` (REQ-07)**: walks the decisions one by one with a real diff (`t` take / `k` keep / `p` protect / `v` pin / `s` skip, plus `a` — apply to all similar targets of the same kind+code, `q` — quit; accepted decisions stay applied). Without a TTY it writes nothing and prints the numbered recipe plus the exact commands, exit `2`. The same review engine drives `--resolve`.
- **`wolf upgrade --show` (REQ-08)**: read-only view of one target — current `protect` value, base, file stamp, witness, drift and the `local → base` diff (what `take` would give you), plus the ready-to-run `release:` command. Works for protected files and for files outside the update map (there: `base: n/a (file outside the update map)`, no diff, no `take` hint).
- **`protect` frontmatter key (REQ-05)**: `protect: true` (hold the local content forever) or `protect: X.Y.Z` (hold and pin the base version) in the YAML frontmatter of any wolf-managed agent/skill/command. The key is inserted as the last line of the frontmatter block (line-wise edit — no YAML re-dump, comments and key order survive) and validated structurally before the file is written. Empty, `~`, `null` or any other value is treated as **held + warning** (fail-safe, never "silently unprotected"); `protect: false` equals no key. Normalization — the file content with every `protect:` line removed — is the single comparison base for both the base set and the witness, so adding, changing or removing the key never produces a false `mutated`. Duplicate keys: the first one wins, the rest are ignored — no warning is printed, and the next write strips every `protect:` line. A protected file is never overwritten (not by a pass, not by `--yes`, not by stamp healing) and never deleted: a `removed` target that is protected stays on disk with code `protected` and a hint. A stamped orphan file with `protect` is a sanctioned local variation — not a conflict, not a warning.
- **`protect` never reaches the model (spike R-01, design §5)**: the key is read by wolf itself and stays in the file. Verified live on opencode `v2.1.4` against a real provider: the request returns `200`, and `protect` does not appear in the model request body at all — for a primary agent and for a subagent called through `task` (capture-proxy evidence in the wave design). Residual risk: a future opencode release could start forwarding unknown agent keys; the structural frontmatter check before every write stays for that reason, and one live run is kept as a regression guard.
- **Protections section in `wolf upgrade --check` (REQ-09)**: printed always — park and `--here`, empty park included (`Protections: none`); lists each protected file with its value and `behind (base X.Y.Z)` / `ok` / `drift: n/a`, then a `release:` hint. `kept` files (accepted local content) are reported separately as `kept (local)` and do not make the project look behind. Value outside the grammar is shown as `(unrecognized — treated as protected)`.
- **Backups before every overwrite (REQ-10)**: `--yes` and `take` copy the local file to `.wolf/backup/upgrade/<YYYY-MM-DD>/<rel-path>` (on a second overwrite of the same file on the same day the copy becomes `<name>-2.<ext>`, then `-3`, … — the first free name, nothing is ever overwritten inside the backup tree), then write the base, then the witness. Deleting a `removed` target copies it first for the same reason. The digest names both the file and the copy: `took base for .opencode/agents/foo.md (local saved: .wolf/backup/upgrade/2026-10-25/.opencode/agents/foo.md)`. Restoring is a plain copy back; the file then is a normal `mutated` and can be frozen legally with `--resolve <file>=protect`. Backup tree growth has no garbage collector (see Upgrade notes).
- **`--json` (REQ-11)**: one machine-readable document on stdout, nothing else — `wolf.upgrade/1` for modes `pass|here|resolve|show` (fields: `schema`, `exit`, `mode`, `cli`, `plan`, `projects[]` with `files[]`/`protected[]`/`backups[]`, `decisions[]`, `diverged[]`, `protections[]`) and `wolf.upgrade.check/1` for `--check`. `decisions[].n` is the same numbering as the text renderer. Stability: additive fields in minors, renames/removals only with a new major (`/2`).
- **`wolf init` repairs `mcp.wolf` (REQ-04)**: a minimal `init` on a project whose platform config already exists restores a missing or corrupted `mcp.wolf` entry (alongside `default_agent` / `subagent_depth`) and keeps the rest of the JSON — the `run wolf init` advice from `wolf doctor` is now actionable. The config is never created if it was absent (minimal init stays minimal), foreign MCP entries are untouched, `--platform` keeps its replace semantics, and a second run reports `unchanged` (idempotent).
- **Onboarding block v3 (REQ-03)**: the `AGENTS.md` block gains the owner-intention line (`protect` / `wolf upgrade --review` / `--resolve`) and ships as `<!-- wolf:onboarding v3 -->`. Block detection is version-agnostic, so a `v2` block is recognized and updated in place instead of appending a second one; only the text between the markers is rewritten — everything above and below stays byte-for-byte (a CRLF file keeps its EOL). User text _inside_ the block is not preserved: the block is wolf's zone. Broken markers (`open` without `close`) are treated as foreign under the `wx` policy — reported as `onboarding markers broken` in the pass details and in `--check`, never turned into a decision. `init` on a stamped 2.19.0 file also aligns the stamp in place; `upgrade` does not append a block to an unstamped `AGENTS.md` without markers (only `init` does).
- **`diverged` faces are visible and honest**: memory faces whose content drifted from the template are printed as their own section by `--review` and `--resolve` (`steward zone (not addressable by --resolve): <N>`, then one `<project> <file> diverged v<version>` line each) and named in the pass's `faces:` line (`<face> diverged`). They keep exit `2` while they exist, and are **not** addressable — a face is memory, so the mutation goes through the complaint loop and the Steward, not through `--resolve`.

### Changed

- **Witness format** (`.opencode/wolf-sync-state.json`): a bare hash string becomes `{ hash, origin: 'render' | 'keep', base: 'X.Y.Z' }`. `origin: 'keep'` records accepted local content, so the next pass does not silently revert it; a file accepted at an older base stays `kept` and does not make the project look behind (the accepted base is recorded in the witness). Legacy string records are normalized on read (`origin: 'render'`, `base` from the file stamp) — no migration step, the new shape is written on the next saving operation.
- **`--check` is strictly read-only** in both modes and always exits `0`. `--here --check` is dispatched before the project pass, so it can no longer fall through into a writing run. A missing or unreliable update map degrades the summary to stamps only and says so.
- **`deprecated` targets are report-only**: they are no longer a decision (and get no decision number) — the file stays in the release, is not updated, and is shown as a note. A deprecated target deleted by hand and re-created still reports `conflict`; it is resolved by path. No deprecated targets exist in the 2.20.0 map.
- **Inspection vocabulary**: `identical` in `--check` now means "nothing to decide on this pass", not "byte-equal" (a healed stamp drift is `identical` too, and does not show as `behind`).
- **`kept` files**: a locally accepted file is not a decision and does not make a project `behind`; it is listed as `kept (local)`, and the base it was accepted at stays recorded in the witness.
- **`wolf upgrade --check --json`** (park mode; `--here --check` reports one project and no faces) gains `protections[]` and `diverged[]`, and each project gains `differ[]` / `missing[]` / `mutated[]` / `foreign[]` / `details[]` / `protected[]` — no more counter-only reporting for machines.

### Fixed

- **False `mutated` from stamp drift (REQ-02)**: a stamped file whose content is byte-identical to the fresh base except for the `wolf:rendered …` line is silently re-rendered, the stamp is updated and the witness refreshed — outcome `updated` with reason `stamp drift healed (base <v>)`, not a needs-decision, and not `behind` in `--check`. The stamp strip regex lives in one place (`stamp.ts`), so healing and stamp insertion cannot diverge.
- **The eternal `behind · 1 differ` on `AGENTS.md` (REQ-03)**: the onboarding block is no longer compared as "the whole file differs"; a `v2` block on a 2.19.0 project becomes `v3` in place, the pass is idempotent, and `--check` shows `current` afterwards.
- **`wolf doctor` advice that could not be followed (REQ-04)**: `init` now restores `mcp.wolf` in an existing platform config instead of leaving it missing.
- **`differ` files visible only as a counter in `--check` (REQ-01)**: all paths are printed.
- **`protect` and the pass disagreement**: adding/removing the `protect` key is no longer treated as a local edit; mutating a protected file was never a decision before and still is not.

### Upgrade notes

- **Install and look first**: `npm i -g mister-wolf@2.20.0`, then `wolf upgrade --check` — read-only, exit `0`, per-project class plus a `Protections` section with every protected file. Nothing is written by `--check`, in the park or with `--here`.
- **State migration is automatic but one-way**: `.opencode/wolf-sync-state.json` keeps legacy string hashes readable (`origin: 'render'`, base from the stamp) and rewrites them as `{hash, origin, base}` on the next saving operation. A rollback is the expensive direction: **2.19.0 and older read the new object records as `mutated` for every file in the witness** (it compares `sha256(current)` to a recorded string). No content is lost — mutated files are never overwritten — and the heal is either a re-upgrade to 2.20.0 or restoring/removing the witness file (a full re-render then rebuilds it). **Update the whole park, not half of it**: a project left on an old CLI, run against a project already upgraded by 2.20.0, reports `mutated` noise it cannot resolve.
- **`protect` is a 2.20.0 convention**: 2.19.0 does not know the key. A protected file will look like a locally edited stamped file there (`protect: true` is a content change for the old witness, and the extra line differs from the base), so the old CLI reports `mutated` and refuses to overwrite — safe, but noisy. Files pinned with `protect: X.Y.Z` keep that intent only after the park is on 2.20.0.
- **`diverged` faces are not addressable**: they stay visible, keep exit `2`, and are resolved by the Steward through the complaint loop, not by `--resolve`. Expect exit `2` while a face is legitimately ahead of its template.
- **Backups accumulate**: `.wolf/backup/upgrade/<date>/` has no garbage collector in this release — the tree is yours to prune (`rm -rf .wolf/backup/upgrade/<old-date>`), nothing else reads it. Restore = copy the file back, then decide (`--resolve <file>=protect` to freeze, `=take` to accept the base).
- **Orphans and out-of-map files**: a stamped file whose target disappeared from the package is reported by name; it is resolved with `--resolve <path>=protect` (sanctioned variation) or deleted by hand. `take` on it is refused (`no base for a file outside the update map`) — there is nothing to take. `wolf sync` remains a deprecated alias in 2.20.0; `wolf upgrade --here` is the supported path.
- **Silent pass**: `--yes` resolves `mutated` with backup-then-base, but never resolves a `conflict` (an unstamped file in wolf's place stays your decision) and never resolves `diverged`. Exit `2` in those cases is the contract, not a failure.
- **If a future opencode starts rejecting agent frontmatter**: the regression guard (one live `opencode run` against a `protect` file, expected `200` and zero `protect` occurrences in the request body) is the tripwire. If it fires, remove the key with `wolf upgrade --resolve <file>=keep` (a one-line frontmatter edit) — the file keeps its content, only the hold signal goes away.

## [2.19.0] - 2026-10-24

### Added — Unified update: one command updates the CLI and the whole project park

- **Unified update (REQ-01)**: `wolf upgrade` now does everything in one command — the npm phase (`npm install -g mister-wolf@latest`) is followed by an update pass over every project registered in the wolf registry. Between the phases the CLI re-executes the freshly installed binary (spawn with inherited stdio/env, no shell), so the projects pass always runs the new code and both phases stream into the same terminal. The pass re-renders stamped base-set files, updates seeded faces and strictly verifies each project against the release update map; errors of one project never stop the rest (isolation, REQ-06). Interactive confirmation renders the per-project plan before the question (REQ-02); `--yes` skips it. Exit codes: `0` done / nothing to do, `1` failed (npm error, project step error), `2` done with attention — at least one project needs a decision (e.g. a locally edited stamped file; mutated files are never overwritten). In a non-TTY run without `--yes` the pass prints the plan and stops with `Cancelled: --yes is required` (exit `0`, no changes). If the re-exec spawn fails after a successful npm phase, wolf reports `CLI updated; projects not touched — run wolf upgrade again for the project pass` (exit `1`) — the npm phase is idempotent, re-running resumes at the projects pass.
- **`wolf upgrade --check` (REQ-08)**: read-only freshness summary of the CLI and the whole park — CLI installed/available, then per-project classification `current` / `behind` (stamps differ from the update map of the available release) / `needs decision` (mutated stamped files) / `unknown` (project not covered by the release map — out of coverage does **not** mean up to date). No writes at all; a missing update map degrades the summary to stamps-only (marked unreliable). Exit is always `0`.
- **`wolf upgrade --here` (REQ-14)**: the full project update step in the current directory only — no npm self-update, no re-exec, no registry. The escape hatch for unregistered projects and targeted refreshes; refuses honestly when `.wolf/memory` is missing ("run wolf init first").
- **Update map (REQ-03/04/11)**: each release ships `update-map.json` (package `files`) — per-file categories (`new`/`changed`/`deprecated`/`removed`/`unchanged`), faces to seed and AGENTS.md policy; generated by `scripts/generate-update-map.mjs` from the actual release diff and verified by a zod schema. The project pass consumes the map of the release being installed; deletions (`removed`) execute only under the confirmed plan (ADR-4). The 2.19.0 map is deliberately all-`unchanged` (30 files, 6 faces): this wave changed the CLI machinery, not the templates — the map infrastructure ships ready for future releases.
- **Unregistered-park scan (REQ-09)**: after a completed pass, a read-only scan reports how many projects with wolf memory live outside the registry (top-5 paths by recency) with the self-healing hint — never writes, never auto-registers.
- **Pass guards**: registry entries that are worktree copies, `pinned`, or missing paths are shown in the plan and skipped by the pass; duplicate realpaths are deduplicated. A lock (`UpgradeLock`) prevents two concurrent upgrade passes over the same park.
- **`wolf sync` deprecated (REQ-07)**: superseded by `wolf upgrade --here`; the alias prints a DEPRECATED notice, will be removed in 2.20.0, and remains the regenerator of `docs/dev/INDEX.md` artifact-pipeline indexes for now.
- **Terminal output standard**: a shared report renderer (sections, `●/▲/✖` markers, summary counters, graceful plain-text degradation for non-TTY and narrow widths) now drives `wolf upgrade` in all modes — and the phase-1 banner ships the block MR. WOLF wordmark.

### Upgrade notes

- Install/refresh as usual: `npm i -g mister-wolf@2.19.0`, then `wolf upgrade` (or let the next `wolf upgrade` do both phases). No data migrations; memory (`.wolf/`) is never touched by any pass.
- The first `wolf upgrade --check` on a live park is the quickest way to see where you stand (`behind`/`needs decision`/`unknown` per project).
- If you scripted `wolf sync`, switch to `wolf upgrade --here` (the alias still works through 2.19.x and keeps `docs/dev/INDEX.md` regeneration).

## [2.18.5] - 2026-10-16

### Fixed — Router conflict bypass, session-checked claim heartbeat, delivery observability

- **Router: conflict bypass closed (2.18.5, AC1)**: the wolf-router plugin previously treated `none`, `multiple` and CLI-error results of the canonical face resolver identically, silently falling back to the legacy text search where only `owner_skill` was checked — a detected face conflict could be bypassed by picking a `proposed` face and injecting its body (confirmed by independent review of 2.18.4 on a controlled plugin fixture). Delivery is now split by resolver outcome: `unique` → the face is delivered; `none` → only a restricted legacy search over `note`/`howto`/`playbook` records with type (faces are resolver-only) and status (`active`) guards in addition to the owner guard; `multiple` → the conflict is recorded, no candidate is chosen and no methodology is injected (only the universal fallback); resolver/CLI error → a diagnosable failure (`resolution=error`), never a silent fallback. `runWolf` now resolves stdout even on non-zero exit, because the CLI contract prints machine-readable JSON (`{ok:false,error:{kind}}`) with exit 1 — `promisify(execFile)` used to lose it, turning real misses into unexplained errors.
- **Claim heartbeat: session checked by default (2.18.5, AC2)**: the standard `wolf claim heartbeat <artifact>` call now verifies the session from `WOLF_SESSION` automatically (previously only the agent name was checked, so an old session of the same agent could refresh a claim handed to a new session). Name-only compatibility remains available as an explicit legacy mode (`WOLF_CLAIM_HEARTBEAT_LEGACY=1`). Transferred ownership (`release --transfer-to`, `session_id=null`) is accepted by the first heartbeat of a new session of the same owner; a second session is refused with an explicit message. Background jobs must pass `--claim-token` from the acquired claim (documented in the command description).
- **Delivery observability (2.18.5, AC3)**: every router.log line now records `source=face|legacy|default`, `resolution=unique|none|conflict|error`, `face_id`, `version`, `hash` and the session id. Legacy deliveries are no longer logged as `variant=canonical` — the journal shows exactly how a methodology was delivered.

## [2.18.4] - 2026-10-16

### Fixed — Full heartbeat identity and canonical face resolver

- **Full heartbeat identity (2.18.4)**: `writeHeartbeat` now accepts an optional full `HeartbeatIdentity` (`owner`, `sessionId`, `pid`, `claimToken`). When provided, ownership is verified strictly: `owner` must match, `sessionId` must equal the claim's session (both `null` allowed for transferred ownership), and `claimToken` must equal the current claim's token — refusing heartbeats from a previous holder's session after re-acquisition, with the owner's name in every refusal. `HeartbeatRecord` persists `session_id` and `pid` of the writer. `wolf claim heartbeat` gains optional `--session`, `--pid` and `--claim-token` flags; without them the legacy writer-only behavior is preserved.
- **Canonical face resolver (2.18.4)**: new `resolveFace` use-case (`src/app/use-cases/resolve-face.ts`) performs a strict memory query — `type=face`, `status=active`, `owner_skill === agentId` (legacy `skill:` prefix accepted) — and returns body, version and content hash of the face. Zero or multiple active faces yield a deterministic refusal (`none` / `multiple` with a sorted candidate diagnostics), never a "first match" pick. New `wolf face resolve <owner_skill>` command exposes it as a machine channel (JSON, exit 1 on miss/conflict).
- **wolf-router plugin**: playbook delivery now tries the canonical face resolver first (`wolf face resolve`); on miss/conflict it falls back to the legacy text search with the `owner_skill` guard, preserving 2.13 howto-playbook delivery. Duplicate active faces stay visible to `wolf doctor`.

## [2.18.3] - 2026-10-15

### Fixed — Per-token claim heartbeat isolation, council analytics naming, docs & demo sync

- **Per-token claim heartbeat isolation**: `ClaimRecord` now issues a unique `claim_token` on acquisition (`${epoch}.${randomTag}`) with fallback to `acquired_at` for legacy records. Heartbeats are saved as `<slug>.<claim_token>.heartbeat`, eliminating race conditions where delayed writes from a previous holder could overwrite the heartbeat of a new claim holder. `releaseClaim` and takeover clean up their per-token files alongside legacy paths.
- **Council analytics naming**: `CouncilsView` introduces `opinions_with_claims_count` to unambiguously represent opinions with non-empty claims. `audited_count` is preserved as a deprecated alias pointing to `opinions_with_claims_count` for backwards compatibility.
- **Documentation & demo scenarios sync**: `docs/guide/user-guide.md` updates the 8 core memory types to the canonical list (`rule`, `lesson`, `decision`, `thread`, `complaint`, `tool`, `note`, `face`). `docs/guide/architecture.md` synchronizes active use cases in `src/app/use-cases/`, removing obsolete draft/learn files. `README.md` and `README.ru.md` update demo scenario 8 description to reflect routing model and session wrap-up. `scripts/demo/lib.sh` ensures non-zero exit code (`exit 1`) in `summary()` upon scenario failures.

## [2.18.2] - 2026-10-15

### Fixed — Claim heartbeat lifecycle, evidence validation, docs hygiene & coordinator face

- **Claim heartbeat lifecycle binding (F-01)**: `HeartbeatRecord` now records `claim_acquired_at` tying the heartbeat to the specific ownership session. `isStale` ignores orphaned heartbeats whose `claim_acquired_at` does not match the active claim, preventing subsequent claim holders from being spuriously flagged as stale after 10 minutes. `readHeartbeat` returns `{ corrupt: true }` on damaged JSON files so that corruption triggers fail-closed staleness. `writeHeartbeat` validates that the claim exists, is active, and is owned by `writer`. `releaseClaim` and `acquireClaim` takeover now cleanly remove stale `.heartbeat` files alongside the claim JSON.
- **EvidenceRef schema validation & council metrics (F-02)**: `EvidenceRef` now enforces that at least one of `memory_id` or `path` is present and non-empty via Zod refinement. Analytics exposes `structured_claims_count` alongside `audited_count` and filters whitespace-only claim entries.
- **Documentation & demo scripts hygiene (F-04)**: Demo scenarios `scenario-6.sh`, `scenario-7.sh`, `scenario-8.sh` and `scenario-4.sh` in `scripts/demo/` no longer invoke removed `wolf run` or `wolf learn` commands, switching to canonical `wolf propose`, `wolf doctor`, `wolf validate` and `wolf session wrap-up`. `scripts/bench/` comments cleaned of `wolf run`. Stale references to "25 активных типов" in `docs/guide/architecture.md` and `docs/guide/user-guide.md` updated to "8 core-типов + расширения". Stale `wolf thread create` invocations updated to `wolf thread add`. E2E audit `tests/e2e/docs-audit.test.ts` now enforces token cleanliness across `scripts/` as well.
- **Coordinator L0 role contract (F-03)**: In `templates/base/agents/mr-wolf.md` and `.opencode/agents/mr-wolf.md`, replaced "безликий: отсутствие playbook — данные" with the coordinator face contract (procedural coordination & complaint loop protocol).

## [2.18.1] - 2026-10-15

### Fixed — Mobile scroll horizontal overflow on docs site (390px)

- **Docs site HomeModes horizontal overflow fixed**: `.wolf-mode` cards now declare `min-width: 0`, matching the `.wolf-install-step` pattern. Previously, the lack of `min-width: 0` on the CSS Grid item caused a grid blowout on mobile viewports (e.g. 390px screen width), resulting in horizontal overflow and failing mobile layout acceptance. Tested and verified on headless Chrome at 390px viewport (`scrollWidth === 390`). Resolves blocker `mem_20260901_sayt_gorizontalnyy_overflow_390px_ot_sek_e443fd`.
- **Roadmap files synchronized**: `docs/dev/roadmap/wave-2.18.md` is updated to reflect the completed 2.18.0 wave (Council opinions v2, Claim heartbeats, Base sets polish, Docs audit); `docs/dev/roadmap/wave-2.19.md` is updated to capture Wave 2.19.0 (Async learning); `docs/dev/roadmap/wave-2.20.md` tracks the candidate Wave 2.20.0 (Archival brief).

## [2.18.0] - 2026-10-14

### Added — Council opinions v2, claim heartbeats, base-set finalization, public docs audit

- **Council opinions and syntheses get a v2 schema** (REQ-01, A9): `council-opinion` and `synthesis` carry a richer structure with auditable claims, evidence, assumptions, risks, failure conditions, counterexamples and a `confidence` level (`low` | `medium` | `high`). Legacy notes read as `claims: []` and `confidence: 'medium'` so nothing old breaks. Analytics surfaces `audited_count` and `unresolved_dissent_total`. A new procedural rule — “isolation of opinion formation” — lands in `.wolf/SKILL.md` §7 and the `wolf-brainstorm` template: each council member states their view before any reveal, so the set of opinions is itself a first-class object.
- **Single-writer claims gain a heartbeat** (REQ-03, A11): a `<slug>.heartbeat` file next to the claim keeps long-running operations alive past the PID/TTL check. Default heartbeat window is 10 minutes; the absolute TTL stays at 24h; `isStale` is `PID dead OR (now - written_at > 10 min) OR (now - acquired_at > 24h)`. The writer is the owner from `WOLF_ACTOR` (debug, not auth). A new `wolf claim heartbeat <artifact>` command drives the refresh; legacy 2.17.1 claim files (no `.heartbeat`) keep the 2.17.1 rules — `readHeartbeat` returns `null` and the heartbeat branch is skipped. Atomic replace uses a unique tmp (`hrtime.bigint()` + `Math.random()` — pid-sharing between `worker_threads` on macOS is handled) plus `rename`, so parallel writers never corrupt the JSON.
- **Base sets polished for publication** (REQ-04, B0): `templates/base/agents/*.md` stay in lock-step with the shipped `.opencode/agent/*.md`; `init-project` and `scaffold-agent` enforce `face_owner_skill === agent_id`; `sync-base-set` no longer overwrites a local mutation, divergence is reported. Re-`wolf init` on a 2.17.x project preserves steward-touched faces; nothing in the base set is overwritten.
- **Public docs audited for removed commands** (REQ-02, A10): `tests/e2e/docs-audit.test.ts` greps `docs/`, `README.md` and `README.ru.md` for `wolf learn`, `wolf run`, `Sandbox Replay`, `STOP-гейт`, `sandbox-replay` and `learn --from-session` and fails CI if any non-historical file references them. Specs that describe the removed learn/run surfaces are kept readable but marked `historical: true` in the frontmatter. The same files now state “8 core memory types + extensions” instead of a stale “7 types” count.

### Fixed

- `docs/reference/cli.md` is regenerated by `npm run docs:build`; the new `wolf claim heartbeat` subcommand is in the registry from this release.
- The English-surface gate now runs first in `npm run check` and surfaces leftover placeholders before any test.

### Upgrade notes

- For users on 2.17.x: `npm i -g mister-wolf@2.18.0` (or local `npm i`). No forced migration. Run `wolf sync` after upgrading to align templates.
- Claim files written by 2.17.1 keep working; 2.18.0 readers see them without heartbeats. The first heartbeat write creates the new file atomically; no re-acquire needed.
- Council opinions and syntheses written before 2.18.0 are still readable; v2 fields default to empty arrays and `confidence: 'medium'`. The persist-path for v2 opinions is a follow-up (T-A9 outstanding); read and analytics work today, write requires a separate 2.19.x task.
- The `STOP-гейт` / `Sandbox Replay` / `wolf learn` surfaces are removed commands and historical text. If your hooks or scripts still call them, they will simply 404 — replace with `wolf add --type lesson`, `wolf task-eval --campaign <id>` and the active claim workflow.
- A `F-03 waiver` for REQ-02 AC-2 (“Действующий контракт версии” section in every ≥5KB public doc) is in effect for 2.18.0: the docs-audit gate plus `historical: true` markings carry the load. A future release can reintroduce the per-doc section if a reader-facing gap is found.

## [2.17.1] - 2026-10-14

### Added — Memory safety: worktree identity, atomic face mutations, artifact claims

- Worktree memory identity (WT-ID): writes made from a linked worktree are scoped to `worktree:w-<12hex>` — a hash of the worktree's real path, computed fail-closed (two copies with the same directory name get different identities). Delivery filters on exactly one path — `wolf call`, in all modes and selection branches; conflicting scope records surface as stderr warnings instead of silent drops. The rest of the read surface (`wolf brief`, `search`, `get`, `doctor`, faces — everything except `wolf call`) sees the whole project memory; that composition is now a documented frozen contract guarded by a doc-test. Legacy `worktree:<name>` objects stay readable; promoting a legacy scope that matches several worktrees reports an honest conflict instead of a silent guess.
- Atomic face mutations: every face change (create version, G17 record, relation, activate, supersede, announce, legacy migration) runs as one journaled operation (`op_started → … → op_committed`). A crash mid-mutation leaves a readable candidate plus an operation record — never a half-written canon. `wolf face recover <opId>` resumes (idempotently — it adds exactly the missing steps) or aborts cleanly; `wolf doctor` lists incomplete operations with recover hints; a later command auto-resumes an interrupted operation with the same input. Seeding and `wolf face migrate` run on the same mechanism, so an interrupted upgrade is finished, not restarted. A nine-case fault matrix (F1–F9) covers the failure points.
- Single-writer claims on shared artifacts: `wolf claim acquire` / `release` / `list` (and `--transfer-to` on release) gives an agent session exclusive ownership of a shared artifact id — `dev:<date>-<slug>` or a worktree identity `worktree:w-<12hex>`; the second concurrent writer is rejected with the holder named. `wolf scaffold artifact` now requires the claim for the artifact it is about to write; the refusal names the exact `claim acquire` command.

### Fixed

- Face recovery paths no longer resume a healing/migration operation into a broken state: such operations are rejected by resume-with-input paths (`wolf face recover`, auto-resume, `wolf face new`) and are completed only by `wolf face migrate`. Previously, creating a face version while a migration was interrupted could activate a face with an empty body and retire the real canon.
- `wolf doctor` no longer reports every live WT-ID-scoped object as an orphaned worktree: identity tokens are checked against the live worktree registry (realpath gitdir records); legacy name-based checks are unchanged.

### Upgrade notes

- Migrations: none forced. Run `wolf sync` after upgrading. Memory written from worktrees by 2.16.x keeps the name-based scope and stays deliverable; new writes get the WT-ID scope. If `wolf promote` reports a conflict for a legacy scope, two linked copies share the same name — resolve the stale copy and re-run. Renaming or moving a linked worktree directory changes its identity: the copy's older scoped records stop being delivered and surface in `wolf doctor` as orphaned scopes (promote them before renaming).
- Known limitations: a claim has no heartbeat — it lives up to 24h (TTL) and ends with `wolf claim release` or expiry; `wolf claim list` does not mark stale entries yet.

## [2.17.0] - 2026-10-13

### Added — Faces: versioned agent playbooks (wave 2.17)

- `face` is a core type — the canonical playbook of an agent as a first-class memory object (the taxonomy grows 7 → 8 types). Required fields: `owner_skill`, `version`, `reason`; optional `based_on` (the previous version id); `initiator` records who created the version (`steward` | `owner` | `breakglass` | `migration` | `seed`). Versions live in `shared/faces/` and chain through the existing supersede mechanism; direct `wolf add --type face` is refused with a pointer to `wolf face` (the versioning path is the only door, for CLI and MCP alike).
- `wolf face` command group: `new` (Steward only — requires the G17 mutation fields), `restore`/`breakglass` (owner only; breakglass refuses to run inside a live agent session), `migrate` (legacy playbook notes → face v1, idempotent, per-owner report, exit 1 on partial failure), `list`/`history`/`show` (read views resolve duplicates by highest version).
- G17 mutation records: every Steward face version leaves a `note` (facet `history`, title `mutation: <owner_skill> v<N>`) with the seven design fields — `reason`, `minimal_change`, `boundaries`, `example_helps`, `example_keep`, `verification`, `rollback` — linked to the version by a `mutates` relation. The template is mandatory: a version without the record is refused before anything is written.
- `wolf propose` (`add`/`deliver`/`list`) and the `proposal` signal facet: a structured proposal on any core type carries a 5-field contract (`addressee`, `basis`, `proposed_change`, `expected_benefit`, `applicability_bounds`); `deliver` stamps `delivered_at`; `wolf face new --from-proposal <id>` links the new version to its proposal (`proposes` relation). The `--facet` help in `add`/`list`/`search` mentions `proposal`.
- `wolf doctor` gains a `## Faces` section: duplicate canon per `owner_skill`, a `based_on` that points nowhere, legacy note + live face for the same owner (hint: `wolf face migrate`), and faces outside the contract (files silently dropped by the store).
- Router variant B (`.opencode/plugins/wolf-router.ts`): delivery is memoized per session — the injected playbook text is sealed for the whole session, so a mid-chat mutation cannot change what the session already reads — while the TTL cache is now version-guarded: a cached entry is served only when its id still matches the current head, so a stale version is never delivered; every new session runs one fresh search as the freshness barrier.

### Changed

- Seeding and scaffolding go through the face contract: `wolf init` seeds base-set playbooks as faces (skipped when a live face or a legacy note exists for the owner), and `wolf scaffold agent` creates the face instead of a playbook note (`--from-playbook` accepts face ids).
- `wolf sync` Steward-zone hint now points face maintenance at `wolf face *` instead of generic supersede.
- README and site guides updated for the 8-type taxonomy, the face model of delivery, `wolf propose`, and the `proposal` facet; CLI reference regenerated (`wolf face`, `wolf propose`).

### Upgrade notes

- Migrations: none forced. Legacy playbook notes (`note` + `facet: howto` + `owner_skill`) remain readable through the alias path; run `wolf face migrate` to convert them into versioned faces — idempotent, safe to re-run, `wolf doctor` flags owners where both forms coexist. Run `wolf sync` after upgrading to receive the updated wolf-router plugin (variant B).

## [2.16.3] - 2026-10-13

### Fixed — Agent spawn regression on OpenCode v2 (default mode: primary)

- Base-set agent templates `executor-lead`, `worker-implementer`, `worker-researcher`, and `worker-reviewer` now declare `mode: all` explicitly. The templates never carried a `mode` field; OpenCode v1 compensated with its `all` default, while v2 defaults agent frontmatter to `primary` and gates the subagent tool ("Agent X cannot run as a subagent") — silently killing the whole Wolf Task-chain (L0 → L1 → L2). `all` keeps both live scenarios: Task-spawn by coordinators and direct `opencode run --agent …` CLI invocations (the current pipeline workaround).
- New unit guard `agents-mode-guard`: `npm run check` fails when any `templates/base/agents/*.md` lacks a valid `mode` (`primary | all | subagent`) or when a Task-chain agent (`executor-lead`, `worker-*`) is `primary` — protection against the next platform default change.
- `steward` template: the hardcoded `model: zai-coding-plan/glm-5.3` literal is replaced with `{{model.primary}}` (projects without model context omit the line → platform default model). In the wolf repo itself the stale 2.16.1 render — locally mutated to comment the literal out, which had permanently triggered the sync mutated-skip (T010) — was consciously superseded and re-created by `wolf sync`; the stamp now tracks the current set.

### Upgrade notes

- Migrations: none. Run `wolf sync` after upgrading to receive the fixed agent templates. Affected: every project where wolf rendered agents — until then, Task-spawn of `executor-lead`/`worker-*` keeps failing there with "cannot run as a subagent"; the direct `opencode run --agent …` path is unaffected. Caveat: if `wolf sync` reports an agent file as "mutated after render" (local edits on top of the render, like the steward case fixed here), it deliberately skips that file — resolve the local delta and re-sync, otherwise the fix silently does not reach that agent.

## [2.16.2] - 2026-10-12

### Added — Platform lifecycle: v1→v2 repair & uninstall

- `wolf doctor` detects the "installed under OpenCode v1, runtime v2" mismatch: the minimal plugin stamp recorded in `wolf-sync-state.json` below 2.14.1 (the v1-only plugin era) against a v2 runtime; the issue names `wolf doctor --repair`. The check runs for registry projects and for the current directory; without sync-state evidence it stays silent (no disk guessing). The reverse direction (v2-only render on v1) is covered by the same comparison and activates once a v2-only release exists.
- `wolf doctor --repair` now covers the platform zone before the storage zone: it re-renders stamped files under the current templates (local edits stay protected by mutated-skip), canonicalizes `opencode.json` (`mcp.wolf`, `default_agent`, `subagent_depth`), reports orphaned stamped files with a recommendation (repair never deletes them), and honors `--dry-run` (plan only, zero writes). A project without an OpenCode install gets an honest skip line.
- `wolf uninstall` removes wolf-managed content from a project: plan first (default run writes nothing), `--yes` executes, `--purge` additionally erases `.wolf/`. Ownership is identified by `wolf-sync-state` records cross-checked against stamps; projects installed before sync-state existed (pre-2.11.0) fall back to stamp scanning. Foreign files, foreign MCP servers, and user-configured `default_agent`/`subagent_depth` (exact-value criterion) are never touched; `AGENTS.md`/`CLAUDE.md` wolf blocks are kept by design and reported as manual cleanup; empty wolf-owned directories are pruned; the final hint points to `npm uninstall -g mister-wolf`. Idempotent: a second run reports "nothing to remove".

### Changed

- `AGENTS.md` base template now carries the versioning discipline rule: version numbers are always full X.Y.Z (plans, threads, waves, tags, conversation); a bare minor ("2.16") is not a release name. Initialized projects receive it through the regular sync delivery.
- `--help` output budget raised 33 → 34 lines to accommodate the new `uninstall` command (C-06).

### Upgrade notes

- Migrations: none. Run `wolf doctor --repair` once after upgrading OpenCode v1 → v2; run `wolf sync` to receive the AGENTS.md versioning rule.

## [2.16.1] - 2026-10-11

### Changed — 19-skill base set: skills-superpowers integration

- Base set grows 18 → 19 skills per the 2026-10-11 external expert package (owner-approved verdicts): new `using-skills` process router; the session-start plugin now delivers the full `using-skills` canon into L0/L1 sessions (deduplicated per transcript, honest static fallback when the installed skill file is missing); frames updated (`mr-wolf`: explaining from verified materials is allowed, execution stays forbidden; `executor-lead`: scaffold-artifact organization added to FULL duties); delivery and base-set tests cover the verbatim canon body, a mutated local copy, and the missing-skill fallback (test hunk merged semantically: `--full` flag kept, 19-skill counters).
- `using-git-worktrees` / `wolf-sdd` skill texts updated to the actual 2.16.0 worktree memory model — a linked worktree resolves the shared `.wolf/` of the main checkout (git common-dir), worktree writes default to `scope: worktree:<name>`, `wolf promote` moves them to shared memory; the stale task-local wording (including the "worktree does not see shared .wolf" claim) is removed.
- `using-skills` priority ladder aligned with the onboarding canon (user → Wolf memory → guesses): the user is explicitly above Wolf memory, and Wolf memory is named as the policy carrier; wording only, no new rule (owner decision).
- `writing-skills` names the base-template editor: L1 — directly or via an assigned L2; live faces stay with the Steward complaint loop (owner decision).
- `docs/README.md` base-set count corrected 18 → 19; the site changelog page is regenerated by `docs:build` (no release actions in this wave — tag/publish/deploy follow owner acceptance).

### Fixed

- Unaggregated-lessons detector: subjects of live `aggregates` edges are no longer reported as unaggregated (the aggregate object itself has type `lesson`, so the "call the Steward" banner never cleared); both ends of a live edge are excluded. Proven by new unit tests (an aggregate with a live edge drops out of the list, a plain lesson stays listed) and an actual project-memory run: 29 → 0.

### Upgrade notes

- Migrations: none. Initialized projects pick up the 19-skill set via `wolf sync`.

## [2.16.0] - 2026-10-10

### Added — Init 2.0, worktree memory & delivery hygiene (wave 2.16)

- Init 2.0: `wolf init` creates the agreed minimum by default (`.wolf/` skeleton + config + AGENTS.md onboarding marker); the full base set is opt-in via `--full`; platform MCP configs are written only with `--platform`. The default TTY interview is a single purpose question; the answer is seeded into memory as a note (`project-purpose`), not into governing instructions.
- Careful re-init: a repeated init on a live project prints a per-component plan (`planInit`) and requires confirmation (`--yes` for non-interactive runs); refusal changes nothing; blind base-set reseed is forbidden — stamped profiles and foreign AGENTS.md survive re-init untouched.
- Unpin: init no longer asks for a model and omits model lines from generated profiles by default; `--model` is opt-in; non-interactive init completes without `--model`. Supersedes the previous Q11/Q7 decisions (recorded in Wolf memory: init model question is gone, worker=primary pinning is gone).
- Worktree memory (git common-dir): a linked worktree resolves `.wolf/` into the main checkout (fs-parse of `.git` metadata, no subprocesses; any anomaly falls back to the local `.wolf/`). Rendered `.opencode/` surfaces stay local to the worktree.
- Scope gating + `wolf promote <worktree>`: objects written from a worktree default to `scope: worktree:<name>`; delivery hides other worktrees' scoped objects and says so (empty-call diagnostics name the active scope). `wolf promote` moves a worktree's scoped objects to `main` (idempotent, `memory.scope_promoted` events); doctor reports orphaned worktree scopes — cleanup stays manual (no auto-delete).
- Related-path normalization: `related.files/docs` are stored project-relative on write; a path escaping the project root refuses the write. `decisions` stay ids.
- Durability: `wolf doctor --repair [--dry-run]` repairs the storage split — index is rebuilt from markdown, missing `memory.added` events are backfilled from markdown (markdown = object truth, events.jsonl = journal truth, index = derived); idempotent; damaged journal lines tolerated; dangling events are counted, never deleted.
- `.gitignore` template at init (`# wolf-gitignore:v1`): machine-local state (`.wolf/cache`, lock, backup) ignored, `.wolf/memory` committed — cloning carries the memory.
- Secret masking: doctor output masks known token patterns (sk-, ghp*/gho*, xox-, AKIA, JWT) and named assignments (`api_key=`, `token:`) as `[redacted]`.
- Empty `wolf call` explains itself: pool size, why it is empty (scope filter with the active scope named, empty pool with a capture hint, or topic miss with a retry hint) and the next step.
- T4: `canTransition` tolerates unknown stored statuses (`UserFacingError` instead of `TypeError` on corrupted data). T6: supersede refuses cycles on write; write-integrity e2e trio (id collision does not overwrite, proposed stays out of call, supersede cycle rejected).
- `wolf --help` budget extended for the new `promote` command; CLI reference regenerated.

### Upgrade notes

- Migrations: none. Existing user-pinned model lines are untouched; `wolf sync` keeps omitting model lines for fresh content. A local `.wolf/` created inside a linked worktree before 2.16 stays in place but is no longer read (memory now resolves to the main checkout) — move data manually if needed. `--scope` no longer validates against a fixed enum: values are stored as written (`main`, `worktree:<name>` are the machine-written ones).

## [2.15.2] - 2026-10-09

### Changed — expert revision of the skill set + governance consistency

- All 18 base skills rewritten per the 2026-10-09 external expert review, integrated with the owner-approved point-by-point verdicts: process routing map; FULL/LITE/FIX process scaling with a misclassification escalation protocol (the mode is changed only by L1; "approved scope" does not block escalation); deterministic triggers for mandatory process skills (wolf-brainstorm on new needs, wolf-debug on unexpected behavior, verification-before-completion on completion claims) plus a break-glass rule: "if in doubt whether a skill applies — load and check; you are not obliged to use an unfitting skill."
- Review contracts: verdicts bound to artifact revision; review-budget exhaustion yields UNRESOLVED (never approval); INCONCLUSIVE where inputs are missing; conditional security/trust lens whose start/skip decision is recorded in review.md.
- Execution discipline: TDD keeps RED-before-GREEN for new behavior and bugfixes, allows characterization tests for existing behavior, and treats code-first for new behavior as a documented deviation routed through test-quality review (DONE_WITH_CONCERNS minimum); verification switches to freshness-based evidence (revision + dirty-state digest), the receiver cross-checks evidence revision before the verdict, and "an executor's report is not proof" is restored as a red flag; git operations consolidated at L1 (workers never commit).
- Governance consistency: worker-reviewer playbook v2 (narrow lens mandates instead of forced six zones, unified Critical/Major/Minor scale, APPROVED/CHANGES_REQUIRED/INCONCLUSIVE, "mark out-of-mandate findings, don't stay silent"); worker-implementer playbook (task_id, RESULT statuses DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED, EVIDENCE contract, commits stay at L1); L0 frame acceptance tied to ACCEPTANCE criteria and fresh evidence; L2 reviewer frame aligned (INCONCLUSIVE + mark-don't-silence); common contracts and the assigned methodology delivered in lead briefs.
- Delivery truth: "highest version" resolution wording replaced everywhere with the actual mechanism (current non-superseded playbook via `--hide-superseded`, owner_skill guard, universal plugin fallback — router tests green); the session-start plugin injection synced with the new using-skills (the old 1%-rule body removed); worktree memory documented as task-local (`.wolf/` resolves from cwd; state moves via wolf-handoff, not shared directories); AGENTS.md taxonomy fixed (`--type blocker` → thread with a blocked status per the actual CLI) and CLI paths corrected.
- Tests: guard/render tests re-anchored to new-edition invariants (conveyor-skills-guard, intake-skill-guard, base-set-init, plugin-injection); full `npm run check` green; E2E suite green (46 files / 182 tests).

### Upgrade notes

- Migrations: none. Frames, playbooks and skills in initialized projects update via `wolf sync` with this release. Seeded playbook copies inside Wolf memory (for example, the lens playbook v1) are superseded by the shipped files; re-sync them through the Steward on the next mutation cycle.

## [2.15.1] - 2026-10-09

### Changed — positioning: a permanent project organization, not a memory utility

- Site and README reframed around the organization concept (concept v3.3.1): agents are temporary, the project's organization (roles, processes, memory, learning loop) is permanent. Hero copy replaced with the approved messaging; the slogan "But first, I remember" removed everywhere; statement is now the clean quote "I'm Mr. Wolf. I solve problems."
- New guide page `Organization & Council` (EN+RU): L0/L1/L2 roles and prohibitions, the working cycle (goal → brief → plan → execute → report → accept → checkpoint), acceptance by verifiable artifacts, Council honestly stamped DESIGNED (runtime on the roadmap), status-stamp legend linking to maturity.md.
- Site structure: `router.md` renamed to `delivery.md` ("Delivery: Frames, Faces & Trust" — frame/face/mutator model, three delivery channels, router mechanics preserved, trust invariant as design intent); `feedback.md` retitled "Learning Loop" and absorbs the Steward aggregation page as a section (mutation proven in PoC #3, effect target/validating E1d); `core-concepts.md` removed as a page — lifecycle matrix, governance axes and injections moved into appendices of `memory.md`, which is now the single source of the taxonomy.
- Fact hygiene: "25 object types / 16 statuses" claims replaced with the code truth (7 core types + facets; 18 lifecycle statuses in the union, `blocked`/`waiting_answer` thread-specific); README Problems table extended with P7–P9 (self-checking agent, repeated mistakes, quality decay) and the Organization subsection added to Features; the router `--type playbook` contradiction resolved against the actual plugin code (playbooks are notes with `facet: howto` + `owner_skill`).
- Site meta (title/description/og/twitter) switched to the organization positioning, EN with RU-locale mirror.
- maturity.md factual sync: `tool` type exists since 2.13 (Tool registry I1→I2, Pillar 3 profile updated); Council memory schema row corrected — council-\* are deprecated aliases (note + facet: context) since the 7-type taxonomy.

### Upgrade notes

- Migrations: none. Removed site pages (`core-concepts`, `steward`, `router`) redirect by structure: memory appendices, Learning Loop (feedback) and Delivery pages; sidebar updated in both locales.

## [2.15.0] - 2026-10-08

### Added — artifact pipeline & skill intake (wave 2.15)

- `wolf scaffold artifact <slug>`: creates a feature folder `docs/dev/<date>-<slug>/` with requirements/design/plan/test-plan templates; profiles `full` and `--fix`.
- `wolf sync` generates `docs/dev/INDEX.md` (feature table with a "Waves" column) and per-part `_index.md` files; idempotent.
- `wolf doctor` gains a `## Artifacts (docs/dev)` section — pipeline lint: duplicate REQ/NFR ids, broken links, REQ without AC/Source, `[НЕОПРЕДЕЛЕНО]` in approved docs, CR without downstream, downstream status resets, requirement/roadmap duplicates, readiness, ghost skills.
- Pipeline skills: `wolf-design` and `wolf-testplan` (new); `wolf-brainstorm`/`wolf-plan`/`wolf-review` v2 with artifact inputs/outputs; `wolf-sdd`/`wolf-execute` gain checkboxes + test-plan validation; disciplinary axis: `receiving-code-review`, `writing-skills` (seed) plus a revision of TDD/verification/worktrees/finishing skills.
- Skill intake: `wolf-skill-intake` skill + tool fields `owner_skill`/`version`/`source_url` for registering external skills in the tool registry.
- Docs (EN+RU): artifact-pipeline and skill-intake guides, roadmap migrated to `docs/dev/roadmap/`, legacy wave folders frozen.

### Upgrade notes

- Migrations: none.

## [2.14.1] - 2026-10-07

### Fixed — OpenCode v2 compatibility

- Plugin templates (`wolf-router.ts`, `wolf-session-start.js`) now support both OpenCode v1 and v2 from one file: v1 hook registrations are preserved unchanged; v2-native hooks (`ctx.session.hook("context")`, `ctx.tool.hook("execute.before")`, dual entry shape `{id, setup, server}`) are added, because v1 implementations do not run in v2.
- `wolf init` detects the installed OpenCode version (`opencode --version`, 5s timeout, read-only): `< 1.18.29` → warning with v1 fallback (config still written); unparseable output → warning, init continues; absent CLI → legacy v1 behavior unchanged. Only the OpenCode branch is affected — other platforms and npx are untouched.
- Container smoke harness `tests/container/opencode-v2/` (Docker Node 22; pinned `opencode-ai@1.18.35` / `@opencode/cli@2.0.24`; isolated HOME; read-only repo mount; host-config hash checked before/after): hooks verified to fire in both v1 and v2.

Supported OpenCode range: v1 ≥ 1.18.29 and v2 (tested against 2.0.24).

## [2.14.0] - 2026-09-30

### Fixed — data integrity (first complaint in the new loop)

- `add` no longer silently overwrites a memory on id collision: a deterministic id that already exists fails with an actionable hint (`edit` / `supersede` / different title). Every overwriting save now writes a `memory.overwritten` audit event **before** the write (store-level safety net; fixes the same-title silent-loss defect reported through the new complaint loop).

### Added — steward loop (owner-approved design)

- Complaint classification `kind` (technical / behavioral, heuristic by `about`); recap shows "complaints without outcome"; behavioral complaints escalate to Steward for playbook mutation from the executor-lead frame.
- `outcome` / `outcome_of` relation predicates: every resolved complaint links to what it produced (rule / lesson / rejection / deferral).
- Steward-aggregator: detector of mature unaggregated lessons (3 lessons / 7 days per class), recap and call banners, `wolf aggregate apply` (hidden; transactional with completion-on-retry, idempotent): archives source lessons, creates the generalized one, links `aggregates`, emits `memory.aggregated`. "Redistribution, not layering" — the aggregate replaces sources in delivery; two-step confirmation through memory.
- Class decay metric in `analytics --view steward`: new lessons/complaints of a class before vs after aggregation.
- Coordinator and Steward frames carry the loop protocol (cycle-end trigger → call Steward; aggregation recipe with was/became/why).

### Added — projects & hygiene

- `wolf projects`: registry list with computed stats (version, activity, memory size) — the registry as a phone book for finding projects and statistics.
- Doctor hygiene: automatic sandbox pruning, ghost detection (wolf markers without memory — and vice versa), registry self-healing.

### Upgrade notes

- One behavior change: `add` with a colliding deterministic id now fails (previously: silent overwrite). No migration needed; everything is additive.

### Removed — the big diet

- `wolf coord`, the whole `run`/model-routing/RCT experiment family, `memory-stage` (manual producer of an automatic event), council CLI, session-checkpoint, and the learn conveyor (digest/propose/validate/activate/decay/pattern-detection/evolve) — zero confirmed usage across all observed projects (owner decision 2026-09-29; lessons are written by executor-leads, aggregation moves to Steward in 2.14). ~5,600 lines removed.
- Manual type namespaces (`decision add`, `thread create`, …) — replaced by generated commands; `create` is removed immediately (decision: no alias period): every `create_*` path answers with an actionable hint to use `add`.
- Dead code: `prune()`, `artifact_sources`, run-log, orphaned stop-gate; playbook `wolf-review-lenses` (unreachable by router construction).
- Config noise: the 570-line `memory_types.core` dump is gone — replaced by a `wolf_version` stamp; legacy configs with the dump still validate (drift check intact), and the config round-trip no longer silently drops pricing/learning/analytics sections.

### Changed — taxonomy: 7 types + facets (owner-approved)

- Data model: `rule`, `lesson`, `decision`, `thread`, `complaint`, `tool`, `note` (new universal type). 19 types collapsed into `note` + facet; `blocker`/`info_request`/`question` become `thread` statuses (`blocked`/`waiting_answer`/`open`).
- Facets: closed vocabularies (first: character — howto/pitfall/context/metric/history/legacy/constraint), picked from a list on `add` — free-form input is rejected with a hint; ANSI facet colors in list/search/call (auto-off for non-TTY/agents, `WOLF_NO_COLOR`).
- Alias reading: old frontmatter types and old directories read as their new equivalents (layout v2 type-prefiltering preserved).

### Added

- `wolf migrate taxonomy`: dry-run report (old type → type+facet map, counts, conflicts untouched, active call-injections listed) → confirm → `--apply` with git-clean guard and rollback (`git checkout .wolf/memory && wolf rebuild-index`); idempotent; id-set comparison before/after — zero losses on staging (dogfood 864 objects, Tender 509).
- Honest CRUD: `wolf edit` (title/body with two-line diff audit), `wolf archive`, `wolf relation list --of / remove`.
- State windows merged: `recap` / `brief` / `analytics --view` (effectiveness, dashboard, delivery as views); old names work as hidden synonyms with deprecation warnings.
- CLI surface: help 81 → 30 visible commands (plumbing hidden); CLI reference generated from the registry (1,406 hand-written lines → 0); type command namespaces generated from the taxonomy (guard: all 7 types have add/list).
- MCP diet: catalog reduced to 7 tools + ping; removed tools answer with migration hints.
- `WOLF_SESSION` is inherited across spawns (session delivery dedup now works between spawns of one session — 2.12 tail).
- Docs (EN+RU): new memory model page and "Upgrading to 2.13" migration guide; getting-started/cli/configuration/analytics/base-set updated; site gains a Changelog page synced from CHANGELOG.md at build time.

### Upgrade notes

- Run `wolf migrate taxonomy` after updating (dry-run first — it is safe and idempotent). Scripts calling `create_*` must switch to `add` (the error message tells you how).

## [2.12.0] - 2026-09-29

### Changed

- Performance: CLI cold boot (lazy command imports + lazy SQLite open) — `wolf --version` ≈ 0.13 s (was ~1 s); `wolf brief` p90 ≈ 1.4 s (was ~7 s) via persistent scan snapshot with diff-before-save (stops ~120 event-log lines per call); delivery telemetry switched to incremental sidecar counters (no full log re-reads per delivery — linear degradation removed); `wolf call` uses a single store pass instead of five; search pushes LIMIT and file_path down to SQL.
- Router plugin: playbook cache TTL 5 minutes + early-stop on miss (warm chat-turns: zero CLI spawns, was 5–7 s); `router.log` gains `ms=`/`bytes=` fields; `WOLF_SESSION` producer; skill-invocation hook — skills are now measurable.

### Added

- Session-scoped delivery deduplication: a memory is injected once per session, re-delivered only when its text checksum changes; deduplicated empty output explains itself.
- Soft injection-size warning (`delivery.*` config, default 20% of session context, stderr, non-blocking).
- Delivery observability: recap line (deliveries / misses / top-missed agents), `wolf analytics --view delivery` (top delivered, miss-rate by agent, avg injection bytes, router p50/p90, skill counters), applied-rate join for delivered memories (CLI channel).
- Docs updated (EN+RU): mcp (dedup/limit/recap line), configuration (delivery.\*), router (TTL/early-stop/ms=), cli/analytics (`--view delivery`), base-set (skill telemetry).

## [2.11.0] - 2026-09-29

### Added

- Router fallback playbook: any agent-id without a canonical playbook now receives a generic fallback injection (router.log marks canonical/fallback); `executor-lead` gets a dedicated playbook in the default base set and its agent frame no longer declines injections (T012).
- `wolf sync` mutated-skip: stamped files modified locally (differing from both the installed and the fresh render) are skipped with a warning instead of silent overwrite — local mutations of AGENTS.md/agents/plugins are safe (T010).
- Base set documentation page (site, EN+RU): full composition (6 agents, 13 skills, 3 commands, 2 plugins, 6 playbooks) and the wx/sync stamping policy (C3).
- Router/playbook injections guide page (site, EN+RU).

### Changed

- `add` validation errors fixed at the root: camelCase/`.strict()` mismatches now report the expected snake_case field, unknown-field errors list valid fields and available types, plain Errors carry type hints; schema-level errors are now visible in telemetry (previously a blind spot) (T011).
- `brief` is fast: incremental scan cache (tree signature + store parse cache) and a single bounded `store.list()` — p90 ≈ 19 ms on 260 objects (was full FS scan + full list per call) (T013).
- Docs: `migrate doc-ids [--apply]` documented on the site (C4); `update --actor` documented (C5); troubleshooting page gains add error classes (`error_class_id`).

- `wolf analytics --view acceptance`: machine-readable acceptance metrics — router miss-rate per agent-id, delivery burst stats (gap >60s per session), per-tool error-rate/p50/p90, malformed lines, search→get follow-rate, 72h vitality, error-class breakdown (JSON + human summary).
- Telemetry: `mcp_call.detail` gains `error.message`/`error.code`/`error_class_id`, `args_summary` (add), `memory_id`/`memory_ids` (get/search), CLI command name for `user:cli`; `delivery.detail` gains `injection_bytes`; `router.log` logs playbook name with canonical/fallback variant on hit.
- CLI sessions emit per-invocation `WOLF_SESSION` (session key, CLI channel only; MCP is intentionally excluded); stamped templates pass the session id on agent spawn.

### Changed

- `wolf call` telemetry: `target` truncated to 200 chars (prompt content no longer leaks into metrics).

## [2.10.0] — 2026-09-28

### Security

- F26: sandbox escape via child processes closed. Global user-config resolution (`wolfUserConfigDir`, `src/adapters/fs/user-config.ts`) is now env-only: `WOLF_SANDBOX` (sandbox root; overrides `XDG_CONFIG_HOME`/`HOME`, makes isolation transitive for child processes; a non-existent root is an explicit refusal) → `XDG_CONFIG_HOME` → `HOME` → explicit `UserFacingError`. The silent fallback to `os.homedir()` — a `getpwuid`-backed, environment-independent escape channel — is removed. `wolf-session.sh --no-global` exports the `WOLF_SANDBOX` marker (ae7f500).

### Added

- WolfEval v1 evaluation harness and the WEV-001 core-value campaign under `playground-lab/`: environment lock (wolf/model/tool pins), hidden TF-1 oracles, BASE/WOLF arms — 28 valid episodes across two rounds, campaign audits, cost/CSR/CFR scorers with bootstrap CIs, and a findings registry extended with F21–F27. Internal research infrastructure — not shipped in the npm package (`files: dist, templates`); no user-facing surface changed.

## [2.9.0] — 2026-09-05

### Changed

- docs: comprehensive revision after P0–P3 — analytics guide rebuilt as a coherent narrative, site EN/RU brought to parity, coverage gaps closed.

### Fixed

- MCP server reported hardcoded 0.1.0 version; now reads package.json via getWolfVersion().

## [2.8.0] — 2026-09-05

### Added

- Campaigns, cohorts and per-memory ROI analytics (P3, spec `docs/specs/2026-09-04-p3-campaigns-roi-design.md`):
  - `wolf run --campaign <id>` writes a top-level `campaign_id` into the run signal; `wolf task-eval --campaign <id>` propagates it into `task_evaluated` (`detail.campaign_id`); without the flag nothing is written (backward-compatible optional schema field, `task_id` pattern from P1).
  - `wolf analytics --view campaign` (CLI and MCP): runs grouped by `campaign_id`, split into `with_memory`/`no_memory` cohorts by injected-memory presence in the run session (`session_id` join over `memory_stage injected`, attribution pattern from P2); per cohort — n, median weighted, accepted-verdict share, process-failure rate; cohorts below 3 runs report honest `n/a` with reason, campaigns without verdicts report `n/a` verdict columns.
  - `wolf analytics --view memory`: per-memory ROI section — `associatedAccepted` / `associatedApplied` / `injectedTotal` / last activity per memory id, sorted by `associatedAccepted` desc, under a "correlational, not causal" disclaimer.
  - Docs: analytics guide + site (EN/RU) cover the new view and ROI section with live examples; signal-log guide documents `campaign_id`; harness-integration guide adds the "with/without memory" campaign scenario.

## [2.7.0] — 2026-09-05

### Added

- Memory lifecycle, attribution and coordination events (P2, spec `docs/specs/2026-09-04-p2-lifecycle-attribution-design.md`):
  - `memory_stage` signal event (`detail.stage`: `retrieved`|`injected`|`cited`|`applied`, `detail.memory_ids: string[]` non-empty): auto-writers in `wolf search`/`get` (retrieved, ids from the result set) and `wolf brief`/`call` (injected, ids of delivered injections; no event when empty); new CLI `wolf memory-stage --stage <s> --ids <id,...> [--actor <a>] [--session <id>]` for external actors (cited/applied — harness responsibility). Telemetry failures never break the wrapped command; `WOLF_SESSION` env links auto-writers to the agent session (attribution key, symmetry with `WOLF_ACTOR`).
  - `coord_event` signal event (`detail.kind`: `handoff`|`review`|`acceptance`|`blocker`|`escalation`, `actor_from`, optional `actor_to`, `refs`, `note`): new CLI `wolf coord --kind <k> [--from a] [--to b] [--ref id,...] [--note s]` for all orchestration levels.
  - `mcp_call` signals now carry `detail.wolf_version` (runtime version from package.json, single cached read).
  - `wolf analytics --view memory`: memory lifecycle funnel added→retrieved→injected→cited→applied (events + unique ids per stage, `appliedUniqueIds`) and attribution — `attributionCoveragePct` = share of accepted `task_evaluated` verdicts preceded by an injection in the same `session_id` (honest `null` + reason when data is missing).
  - `wolf analytics --view coordination` (CLI and MCP): counts kind × actor, 20 most recent events, blocker open/resolve pairs by refs; payload of `--view memory` extended additively with funnel + attribution.
  - Docs: signal-log guide (event schemas, live examples), analytics guide + site (EN/RU) cover the two new views, new `docs/guide/harness-integration.md` — how harness actors record cited/applied and coordination events.

### Changed

- `wolf brief` use-case now returns `injectedIds` (ids of all sections rendered into the brief) alongside the content.

## [2.6.1] — 2026-09-04

### Added

- End-to-end telemetry identity (P1, spec `docs/specs/2026-09-04-p1-telemetry-identity-design.md`):
  - `SignalEventSchema` v2: optional identity fields on every signal — `event_id` (uuid), `schema_version: 2`, `run_id`, `trace_id`, `parent_span_id`, `role_level` (L0/L1/L2), `attempt`, `task_id`, `config_hash`, `prompt_hash`, `tools: string[]`. Records without `schema_version` read as v1 (upcast on read, history is never rewritten); unknown fields are stripped by Zod.
  - `wolf run` writes v2 fields into the run signal: generates `event_id`/`run_id` (uuid), `trace_id` (uuid or new `--trace-id`), `attempt` (new `--attempt`), `config_hash` = sha256(`.wolf/config.yaml`).slice(0,12), `prompt_hash` = sha256(prompt).slice(0,12), `tools` from `--tool`; `--task-id` is promoted from experiment-only to a general flag (always written when passed).
  - `mcp_call` signal event (P1 D5): the `registerMemoryTools` wrapper logs every `mr-wolf_*` tool call with `tool_name`, `duration_ms`, `outcome: 'ok'|'error'`, `detail.method`; telemetry failures never break the wrapped call.
  - `dataQuality` v2 in the analytics report: `duplicateEventRatePct` (duplicates by `event_id`; the second copy never reaches analytics), `unknownModelRatePct` (runs with modelID null/'unknown'), `pricingCoveragePct` (runs with tokens priced / all runs with tokens; null without pricing), `completeTraceRatePct: null` with `completeTraceRateReason` (span model planned P2). `wolf analytics`/`wolf dashboard` print the new lines.
  - Docs: signal-log guide covers schema v2 and `mcp_call`; new "Harness integration" section in the analytics guide and on the site (EN/RU) — how wrapper/plugin authors write v2 events.
- New `wolf migrate run-log`: archives the legacy `.wolf/run-log.jsonl` to `.wolf/metrics/archive/run-log-<date>-legacy.jsonl` (local date, collision → next free `-2`/`-3` suffix, pure rename with a streamed line count in the report) so analytics stops double-counting old runs; idempotent — no legacy file → `nothing to migrate`, exit 0.

### Changed

- Tool economy and routing (`tool stats` economy, `analyzeEconomy`, effectiveness routing block, analytics outliers and model-native tool ledger) now run on the signal log as the canonical source; the legacy `.wolf/run-log.jsonl` is still read and merged (simple concatenation, no dedup) during the transition window — medians are invariant to the symmetric duplication, run counters may overcount until the window closes.

### Breaking

- `wolf run` no longer writes `.wolf/run-log.jsonl` (P1 D4: single canonical signal log; `verdict_pending` is not carried over — use `wolf task-eval`). Existing run-log history remains readable for analytics; run `wolf migrate run-log` after upgrade to archive the legacy file and stop the double count.

### Fixed

- e2e telemetry tests updated for signal-only source (v2.6.0 publish blocker): `analytics.e2e` asserted against `.wolf/run-log.jsonl`, which `wolf run` no longer writes — run assertions now target the canonical signal log (`session_id`/`arm`/`task_id` coverage preserved); `migrate doc-ids` e2e fixture made deterministic (live playground memory is copied only when it still contains `doc_*` ids, otherwise the synthetic seed is used — local/CI parity).

## [2.5.0] — 2026-09-04

### Added

- Task verdicts (P0 analytics honesty, spec `docs/specs/2026-09-04-p0-analytics-honesty-design.md`):
  - New signal event `task_evaluated` (`detail.verdict accepted|rejected|partial|inconclusive`, `detail.scorer human|deterministic|llm_judge|hidden_tests`, optional `criteria_passed`/`criteria_total`/`critical_failure`/`note`, linked by `session_id` and/or `detail.task_id`).
  - New CLI command `wolf task-eval --verdict <v> [--scorer <s>] [--session <id>] [--task-id <id>] [--criteria-passed N --criteria-total M] [--critical-failure] [--note <text>]` — human/L0 verdict writer.
  - `acceptance` block in the analytics report: `accepted` (strict session-link: only accepted verdicts with ≥1 run signal sharing the `session_id`) and `costPerAcceptedTask` (`sumWeighted` of linked runs ÷ accepted; `null` without data).
  - `coverage` block: `scoredTaskRatePct` = `task_evaluated` / `run` signals; `wolf analytics`/`wolf dashboard` print `coverage: partial — scored X/Y (Z%)` when coverage is below 100% (interim denominator, honest one lands in P1).
  - `dataQuality` block: `validEventRatePct` / `malformedLines` from the signal log; malformed lines are counted, never silently dropped, and never crash analytics.
  - Signal log is now validated by a Zod schema (`SignalEventSchema`): unknown fields are stripped, invalid lines increment `malformedLines`. New API `readSignalLog()` returns events + counters; `readSignals()` is unchanged for existing callers.

### Changed

- **BREAKING** (semantics-honest metric names, release v2.5.0): analytics JSON and text renames — `successes` → `completedRuns`, `failures` → `processFailures`, `failureRatePct` → `processFailureRatePct`, `costPerSuccess` → `costPerCompletedRun`; report section/field `funnel` → `weeklyActivity` (CLI `--view weeklyActivity`, MCP enum, header `== Weekly activity ==` without W->D/D->T columns). Existing snapshots with old field names still parse (lenient reader) but produce one-time delta noise.
- Docs: analytics/effectiveness guides and site analytics pages (EN/RU) updated to the v2.5.0 metric names; new sections for `wolf task-eval` and coverage/acceptance/data quality (examples from live runs).

## [2.4.0] — 2026-09-04

### Added

- Council analytics: `wolf analytics --view councils` (also included in `--view all`, `--json`, and the MCP `analytics` tool) — council questions (total / in-window / open), opinions per question, participation by author, vote distribution, synthesis rate with median question→synthesis time, and weekly activity. Zero new signal collectors: pure aggregation over the memory store and relation log.
- `wolf dashboard`: open council questions table in Ledgers and council activity sparklines in Trends.
- Docs: Councils section in the analytics guide (manual + site EN/RU).

## [2.3.2] — 2026-09-04

### Fixed

- Publish workflow E2E no longer times out: the REAL `npx -y <tarball> init` test hung >240s on CI (twice, run 33847380163) because npm 10 blocks on the security-audit request (`POST /-/npm/v1/security/advisories/bulk`) during install — tarball fetches take 2–3s each, the audit POST stalls for minutes (57s measured on npm 11, >330s on npm 10.9/linux; killed with empty stderr → `status: null`). The test's isolated env now disables npm audit/fund requests (`npm_config_audit=false`, `npm_config_fund=false`): behaviour-irrelevant network variance removed instead of raising the timeout. Regression guard of 1.0.1 fully preserved (real npx still installs and runs the tarball; MCP config NOT written, `.wolf/` created, npx try-out warning shown). Cold-cache e2e: 39s for the whole distribution file (was: unbounded hang).

## [2.3.1] — 2026-09-04

### Fixed

- Text render of `wolf analytics` now applies `--class/--type/--origin/--agent/--silent` (previously only `--json`/MCP did); the `all` view filters each section too.
- `wolf dashboard` / `wolf analytics` table borders now align with columns: one shared table generator computes column widths once (visual width aware: `…`/`✓` narrow, CJK wide; cells >40 chars clipped) and builds rows and borders from the same widths — no more cumulative 1–2 char drift per column.
- Dashboard trends show `n/a (need ≥2 snapshots)` instead of blank sparkline values.
- Funnel ratios above 100% render as `×N.N` multipliers (delivery events are per-session, not unique objects); columns relabeled `W->D`/`D->T`.
- `wolf analytics --weeks/--top` values parse base-10: commander passed the numeric default as `parseInt` radix, so `--weeks 8` became `NaN` (empty funnel) and `--weeks 10` silently meant 8.

## [2.3.0] — 2026-09-03

### Added

- Effectiveness analytics system (spec `docs/specs/2026-09-03-analytics-metrics-dashboard-design.md`):
  - `wolf run` now records a raw token breakdown (`input`/`output`/`cache_read`), wall-clock `duration_ms`, and optional experiment primitives (`--experiment`, `--arm wolf|baseline`, `--task-id`) into both the run log and the signal log; existing records stay compatible.
  - `wolf effectiveness --snapshot` — append-only report snapshots (`.wolf/metrics/effectiveness-snapshots.jsonl`); regular runs print a numeric delta against the last snapshot.
  - Absolute totals block in `wolf effectiveness`: runs/failures, weighted and raw token sums, cache-hit ratio, average duration, per-model cost-per-success, and optional `$` conversion via `pricing` in `.wolf/config.yaml` (hidden when no pricing is configured).
  - Weekly memory-mutation dynamics in `wolf insights` (activity view).
  - `wolf analytics` — entity ledgers and funnel: memory ledger with lifecycle classes (NEW/SLEEPER/WORKHORSE/DEAD) and an age-aware garbage ratio; tool ledger splitting `script` vs `model-native` origin with expose/register promotion candidates; rule ranking by holdout-prevented with silent rules; weekly write→deliver→trigger funnel; agent ledger (volume, failures, tool errors, complaints, holdout-prevented by author); steward view (mutations by actor, complaint funnel with SLA breaches, recidivism, churn); top-N costly runs; experiment readiness. Filters: `--view`, `--class`, `--type`, `--origin`, `--agent`, `--top`, `--weeks`, `--json`.
  - MCP tool `analytics` returning the same JSON as `wolf analytics --json`.
  - `wolf dashboard` — console dashboard (Unicode tables, text sparklines, ✓/!/✗/· statuses): Health / Ledgers / Trends sections with `--tab`, machine-readable `--json`; no files written.
  - Docs: new `docs/guide/analytics.md`; `docs/guide/signal-log.md` documents the new run-event fields.

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

[Unreleased]: https://github.com/chekh/mister-wolf/compare/v2.9.0...HEAD
[2.17.0]: https://github.com/chekh/mister-wolf/compare/v2.16.3...v2.17.0
[2.0.0]: https://github.com/chekh/mister-wolf/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/chekh/mister-wolf/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/chekh/mister-wolf/compare/v1.0.2...v1.0.3
[1.0.1]: https://github.com/chekh/mister-wolf/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/chekh/mister-wolf/commits/v1.0.0
