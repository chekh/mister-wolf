# Transfer & Multi-Project

Mr. Wolf is local-first: a project's memory is a directory inside the project, and the machine's project list is a local index. The transfer formula follows directly:

**Memory is committed → cloning carries it.**

`.wolf/memory/` (markdown objects, `events.jsonl`, relations) belongs in git. Clone the repository on another machine — run any wolf command — and the full memory is already there: decisions, lessons, rules, playbooks. No export, no import, no cloud.

## The registry is a phone book

The per-machine registry (`~/.config/wolf/projects.yaml`) only maps project names to paths. It is **not** memory and never needs transferring: on the new machine any wolf command run inside a project with an existing `.wolf/memory/` re-registers it automatically (self-healing). The registry stays a local index — and since it holds the paths of all your projects, keep it out of commits and bug reports.

One command shows everything the phone book knows:

```bash
wolf projects
```

```text
имя          путь                          версия схемы  последняя активность  размер памяти
mister-wolf  /Users/…/mister-wolf          v2            2026-09-30            2.6 MB
Tender       /Users/…/Tender               v2            2026-09-30            2.3 MB
old-box      /mnt/archive/old-box          missing

проектов 3 | активны за 7д: 2 | суммарный размер памяти: 4.9 MB
```

Every field is computed on the fly (activity = mtime of `events.jsonl`, size = recursive `.wolf/memory/` size) — the registry schema stays minimal, and `missing` marks dead paths.

## Hygiene

`wolf doctor` keeps the registry and the harness honest:

- **Sandboxes** — entries under the OS tmpdir are test/sandbox leftovers; doctor prunes them automatically (reported as `sandbox — pruned`; sandbox data is temporary by definition).
- **Dead entries** — paths that no longer exist are pruned with a report.
- **Ghost detect** — for the current directory and every registered project, doctor compares the onboarding marker in `AGENTS.md`/`CLAUDE.md` with the presence of `.wolf/memory/`:
  - the marker exists, memory doesn't — "instructs wolf, no memory": run `wolf init`;
  - memory exists, no marker — "memory present, agent not wired": run `wolf sync`.
- **Self-healing** — any wolf command in a project with memory but no registry entry quietly re-registers it (no-op when the entry is identical).

## What to commit

`.wolf/memory/` is the durable core — commit it. Runtime artifacts (metrics, caches, backups) are regenerated locally; a finer durability split (what to commit vs ignore inside `.wolf/`) is on the roadmap. Archive export/import is deliberately not built — git already is the transfer format.
