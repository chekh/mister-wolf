# Agent Brief: mr-wolf

Mr. Wolf — постоянная проектная организация из временных AI-помощников («I solve problems»): двухуровневая модель — ведущий выполняет работу сам и напрямую нанимает специалистов wolf-*; цели, процессы, память. Текущая полная организация — OpenCode-first. Стек: TypeScript, Node, vitest; валидация — `npm run check`. Управляемое обучение набора (Стюард) — отдельное планируемое направление в roadmap, в действующую модель не входит.

## Протокол холодного старта (без доставленного состояния)

1. **Начинай сессию с состояния проекта:** запусти `wolf call` и `wolf brief`
   (CLI: установленный `wolf`, или `node <путь-к-repo-wolf>/dist/bootstrap/cli.js` в репо Wolf; MCP-инструменты: `mr-wolf_*`).
   Возвращённые injections и brief — активное руководство проекта.
2. **Фиксируй значимое через Wolf:** решения — `wolf add --type decision`,
   уроки — `--type lesson`, блокеры — thread со статусом `blocked`
   (`wolf thread add`, затем `wolf transition <id> blocked`), устаревшее —
   `wolf supersede <old-id> <new-id>`.
3. **Состояние проекта спрашивай у Wolf** (`wolf search`, `wolf get`, `wolf brief`) —
   не читай статические списки из файлов: они устаревают. Память Wolf —
   единственный источник состояния проекта.

## Указатели

- Роадмап: `docs/dev/roadmap/roadmap-v4.md` (активный); история — `docs/dev/roadmap/roadmap-v2.md`, `roadmap-v3.md`
- Живое планирование: `docs/dev/roadmap/` (роадмап, backlog, ideas); история: `docs/plans/` (планы волн), `docs/specs/` (дизайн-спеки)
- Пользовательская документация: https://chekh.github.io/mister-wolf/guide/overview (исходники `docs/site/`); `docs/README.md` — индекс инженерных источников
- Версии: только `npm version X.Y.Z`; тег `v*` = релиз; запись в `CHANGELOG.md` при релизе обязательна

## CodeGraph

ВАЖНО: codegraph не поддерживает MCP-ресурсы — НЕ вызывай `list_mcp_resources`/`read_mcp_resource` с этим сервером; вся информация доступна через `codegraph_*` тулы.

<!-- wolf:onboarding v4 -->

# Mr. Wolf — project process

The mr-wolf agent leads the project: it talks to the user and does its own work;
for specialization and volume, it hires wolf-* executors directly:
wolf-researcher, wolf-architect, wolf-developer, wolf-reviewer, wolf-tester,
wolf-editor, wolf-release-engineer, wolf-expert, wolf-steward. Executors do not delegate
further; there is no intermediate level.

## Session protocol

1. Start from project state: run `wolf call` and `wolf brief`
   (CLI: installed `wolf`, or `node <path-to-wolf-repo>/dist/bootstrap/cli.js`;
   MCP tools: `mr-wolf_*`). What they return is active project guidance.
2. Record what matters in Wolf memory: decisions — `wolf add --type decision`,
   lessons — `--type lesson`, blockers — a thread (`wolf thread add`, then
   `wolf transition <id> blocked`), outdated items — `wolf supersede <old-id> <new-id>`.
3. Ask Wolf for project state (`wolf search`, `wolf get`, `wolf brief`):
   static lists in files go stale. Wolf memory is the only source of project state.

## Addressed inputs

- A lead without delivered state restores the thread, decisions and related rules
  through targeted Wolf memory queries, not by reading everything.
- An executor with a TASK skips general onboarding: it reads the assigned inputs
  and project constraints, and asks the lead for what is missing.
- A new independent part gets a fresh executor; the previous one is reused only
  under continuation conditions; one corrective return means a new instance.
- The lead verifies its own work independently by the same criteria.

## Stage documentation and rules

- FULL keeps docs/dev/<date>-<feat>/: the complete goal package, in the declared
  order (requirements, design, test plan, plan and others per project flow).
  Working reports, drafts, checkpoints and logs stay out of docs/dev; the executor
  returns the result as a message, and the lead saves what must outlive the session.
- Priority ladder: explicit user instructions → Wolf memory
  (`wolf brief`/`wolf search`) → own guesses; if the first two give nothing,
  ask the user.
- The version number is always full X.Y.Z: in plans, threads, waves, tags and
  discussion.

## Session language

At the start of work in a project, detect the user's language from their first
message: if they already write in X, record X without asking; if it is unclear,
ask ONE question. Read the existing state before creating a record
(`wolf search "Session language"`; `wolf brief` also shows active decisions).
If an active language decision already exists, apply it and record nothing: a
new session on the same or a different language, without an explicit switch
instruction, never creates a duplicate. The reply still follows the user's
current message language; the recorded decision changes only on an explicit
switch. If no active decision exists, the record is a mandatory mechanical
step, not a judgment call: run
`wolf add --type decision --title "Session language: <lang>"` (body: the
source of the language and the date) right after the first user message. Host,
platform or global language defaults do not replace this record; when they
conflict with the user's message language, record the user's message language.
Apply the decision in later sessions without asking again. It governs dialogue,
memory records (objects, threads) and executor reasoning; delivery artifacts
(skills, templates) always stay English, whatever the working language. Change it
only on explicit user instruction: record the new decision the same way and
immediately run `wolf supersede <old-id> <new-id>`, so exactly one language
decision stays active.

<!-- /wolf:onboarding -->
