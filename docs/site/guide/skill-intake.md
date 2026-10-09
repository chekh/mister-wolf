# Skill Intake

External skill catalogs are untrusted code for your agents: instructions that will steer every future session the moment they are installed. Skill intake is the protocol for connecting such a skill anyway — deliberately, with quality screening and an explicit owner gate. Skills found this way are **not** part of the default set ([Artifact Pipeline — skill axes](/guide/artifact-pipeline)); they enter the project only through this loop.

## The intake loop

### 1. Search

Find candidates with `npx skills find` or the [skills.sh](https://skills.sh) catalog. The quality bar: at least 1K installs and a reputation worth trusting.

### 2. Lens the candidate

A lens review of the skill checks three things:

- dangerous instructions — anything that exfiltrates, destroys or misleads;
- conflicts with the project's rules and memory;
- prompt quality — is the skill actually good at what it claims.

The verdict goes to the owner.

### 3. Owner gate

No explicit "yes" from the owner — no installation. This is the hard gate of the whole loop; a lens verdict recommends, only the owner decides.

### 4. Install

```bash
npx skills add <name>
```

### 5. Register in memory

An unregistered skill is a ghost: present in the set, invisible to Wolf. Registration makes it memory — queryable, observable and mutable:

```bash
wolf add --type tool --title "skill: <name>" \
  --set name=<name> \
  --set script_path=<path/to/SKILL.md> \
  --set language=markdown \
  --set owner_skill=<name> \
  --set version=<version> \
  --set source_url=<url>
```

### 6. Observe

Every skill invocation is written to `.wolf/metrics/skill-invocations.jsonl`, so usage is measurable (see [Analytics — delivery panel](/guide/cli/analytics#delivery-panel)). Complaints against a skill go through the complaint loop with `about: skill:<name>` ([Learning Loop](/guide/feedback)), and `wolf doctor` lints for ghost skills — in the set but not in memory.

### 7. Roll back

A skill that misbehaves is removed and unregistered:

```bash
npx skills remove <name>
```

plus a `wolf supersede` or archive of its memory record, so history stays reachable ([Memory Model](/guide/memory)).

## Example: `commit-messages`

1. **Search:** `npx skills find commit-messages` — a candidate with 4.2K installs on skills.sh.
2. **Lens:** no dangerous instructions, no conflicts with project rules, prompt is focused and concrete → verdict "safe, worth it" goes to the owner.
3. **Owner gate:** owner says yes.
4. **Install:** `npx skills add commit-messages`.
5. **Register:**

```bash
wolf add --type tool --title "skill: commit-messages" \
  --set name=commit-messages \
  --set script_path=.opencode/skills/commit-messages/SKILL.md \
  --set language=markdown \
  --set owner_skill=commit-messages \
  --set version=1.0.2 \
  --set source_url=https://skills.sh/someone/commit-messages
```

6. **Observe:** invocations land in `.wolf/metrics/skill-invocations.jsonl`; a suggestion that breaks the convention → `wolf complain` with `about: skill:commit-messages`.
7. **Roll back** (if needed): `npx skills remove commit-messages`, then supersede the memory record.
