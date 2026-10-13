# Сценарий 1 (S-45) — Стюард-мутация лица с G17 → новая версия новому заданию, прежняя — активному

- **Критерий**: test-plan S-45; oracle REQ-06 AC-2.
- **Revision**: `a1c7c859df3f6a0efb3addc0b8d831c5e1dd7eda` (`git rev-parse HEAD`, ветка `feature/2-17-1-t7-req06-e2e`, base = main a1c7c85).
- **Дата**: 2026-10-14 (UTC-выводы команд: 2026-10-13T23:2x).
- **CLI под тестом**: `node <cwd-t7>/dist/bootstrap/cli.js` (сборка `npm run build` от того же revision; package version 2.17.0 — номер подрелиза 2.17.1 присваивается `npm version` при выпуске).
- **Развёртка**: tmp-проект `/private/var/folders/.../T/opencode/wolf-t7-s1-run-h1clYZ` (`mktemp -d` под `$TMPDIR/opencode/`), `git init` + `init --full --platform opencode` — свежая установка; `XDG_CONFIG_HOME` изолирован (паттерн tests/e2e), реестр проектов пользователя не затронут.
- Полный дословный лог всех команд: `scenario-1-raw.log`; лог router-плагина: `scenario-1-router.log`.

## Ограничение R03 §6 (цитата из requirements.md, раздел «6. Ограничения и допущения»)

> **Ограничение R03 (документируется в выпуске)**: лицо Стюарда живёт на процесс (кеш `sessionInject` в wolf-router.ts по ключу `WOLF_SESSION:agentId`), а не на логическое задание — новый чат существующего процесса может получить прежнюю версию лица до TTL. Для 2.17.1 это принимаемый остаточный риск: обновление лица применяется «к следующему запуску процесса/задания», без обещания мгновенного применения активному заданию. Полное решение (устойчивый session/task ID) — 2.18.0.

Граница зафиксирована: **активное задание удерживает прежнюю версию до перезапуска процесса/задания** (шаг 5 ниже демонстрирует именно это — мемо-выдача без ре-резолва, ms=0).

## Как доставляется лицо (механика, проверено трассой)

`wolf call` доставляет только call-injections (pool после init пуст — «No active call injections», шаг 1a); лица доставляет **router-плагин** (`.opencode/plugins/wolf-router.ts`, отрендерен init'ом из templates-канона): `wolf search <agent-id> playbook --hide-superseded` → `wolf get` → гвард owner_skill → инъекция в system-контекст, мемоизация по `WOLF_SESSION:agent-id`. Поэтому доставка лица в сценарии исполняется РЕАЛЬНЫМ плагином (импорт отрендеренного файла, паттерн `tests/e2e/face-router.e2e.ts`), с PATH-shim `wolf` → тестируемый dist CLI, чтобы плагин спавнил именно 2.17.1-сборку. Рамка задания в драйвере: `agent-id: steward` (задание, получающее лицо Стюарда).

## Развёртка (STEP 0)

```sh
$ git init -q && node "<cwd-t7>/dist/bootstrap/cli.js" init --full --platform opencode   # cwd: свежий tmp-проект
# wolf init
- memory skeleton: ensured (…/.wolf)
- base set: .opencode/agents/{executor-lead, mr-wolf, steward, worker-implementer, worker-researcher, worker-reviewer}.md created
[skill] … 19 скиллов → .opencode/skills/… created
- base set: .opencode/command/{analyze-doc, complain, doc-review}.md created
- base set: .opencode/plugins/wolf-router.ts created
- base set: .opencode/plugins/wolf-session-start.js created
- base set: {AGENTS.md, complaint-protocol.md, executor-lead-playbook.md, steward-nastavnik.md, worker-implementer-playbook.md, worker-researcher-playbook.md, worker-reviewer-playbook.md} created
- opencode.json: written (mcp.wolf, default_agent=mr-wolf, subagent_depth=2)
- init-report: created (mem_20261013_init_report_wolf_t7_s1_run_h1clyz_fbf8ae)
exit=0
```

## Шаг 1 — «Активное задание» до мутации (worker, `WOLF_SESSION=ses-worker-1`)

```sh
$ cd <tmp-проект> && WOLF_ACTOR=agent:worker WOLF_SESSION=ses-worker-1 node "<CLI>" call
No active call injections.
pool: 0 active delivery candidate(s)
reason: no active delivery candidates in this project
next: capture a fact — wolf add --type note --facet context --title "..."
exit=0

$ node "<CLI>" face list
executor-lead  v1  mem_…_executor_lead_playbook_v1_…  [active]
mr-wolf        v1  mem_…_zhalobnyy_protokol_v2_…      [active]
steward        v1  mem_20261013_nastavnik_protokol_mutatsii_lits_8aa427  [active]
worker-implementer  v1  …  worker-researcher  v1  …  worker-reviewer  v1  …   # все [active]
exit=0

$ node "<CLI>" face show steward | head -8
steward  v1  mem_20261013_nastavnik_protokol_mutatsii_lits_8aa427  [active]
initiator: seed
reason: base-set seed: steward-nastavnik.md
based_on: —
title: Наставник — протокол мутации лиц
tags: steward:наставник, playbook
created: 2026-10-13T23:25:52.607Z
exit=0
```

Доставка #1 активному заданию (реальный плагин, процесс живёт и держит сессию; полный вывод — `scenario-1-raw.log` STEP 1d):

```sh
$ PATH="<shim>:$PATH" WOLF_ROUTER_LOG="<tmp>/router.log" WOLF_ACTOR=agent:worker WOLF_SESSION=ses-worker-1 \
        node --experimental-strip-types driver-s1.mjs active   # фон; рамка agent-id: steward
--- delivery1.json (до мутации):
{"bytes":2448,"v1":true,"v2":false,"head":"\n\n# Актуальный playbook (источник: память Wolf, доставлен плагином; …)\n\n\n# Наставник — протокол мутации лиц\n\nМутатор контекста агентов "}
--- router.log:
2026-10-13T23:26:10.627Z agent-id=steward playbook=hit name=mem_20261013_nastavnik_protokol_mutatsii_lits_8aa427 variant=canonical injected=yes ms=1373 bytes=3736
```

**Активному заданию доставлена v1** (`mem_…_8aa427`), текст запечатан в кеше сессии `ses-worker-1:steward`.

## Шаг 2 — Стюард выполняет разрешённую мутацию (7 полей G17, exit 0)

env-атрибуция Стюарда; лицо Стюарда (`owner_skill: steward`, точное имя — по `face list`); тело = полное содержимое новой версии (`face-v2.md`: единственное содержательное изменение — шаг 4 протокола + маркер `T7S1-V2-MARKER`):

```sh
$ WOLF_ACTOR=agent:steward WOLF_SESSION=ses-steward-1 node "<CLI>" face new steward \
      --file face-v2.md \
      --title 'Наставник — протокол мутации лиц v2' \
      --tags 'steward:наставник,playbook' \
      --reason 'S-45 (T7): диспетчеру нужен машиночитаемый триаж мутаций — отчёт Стюарда дополняется строкой FACE-OP: <op_id> → v<N>' \
      --minimal-change 'шаг 4 протокола: в отчёт перед диспетчером/владельцем добавлена обязательная строка триажа FACE-OP: <op_id> → v<N>; заголовок тела отмечает v2' \
      --boundaries 'НЕ меняются: мутатор — только Стюард; все 7 полей G17 обязательны; тело = полное содержимое версии; запрет двойного supersede; инварианты и атрибуция WOLF_ACTOR=agent:steward' \
      --example-helps 'диспетчер L1 по строке FACE-OP находит операцию в журнале и связывает жалобу с мутацией' \
      --example-keep 'жалоба без конкретики → вопрос передавшему; одна жалоба — одна мутация' \
      --verification 'wolf face show steward → v2 active с G17-записью мутации; wolf face history steward → v1 superseded; новая сессия получает v2, активная удерживает v1 (R03 §6)' \
      --rollback 'wolf face restore steward --from v1 (восстановление как НОВАЯ версия, история не уничтожается)'
Created face steward v2 mem_20261013_nastavnik_protokol_mutatsii_lits_v2_bec38e (superseded mem_20261013_nastavnik_protokol_mutatsii_lits_8aa427); mutation record mem_20261013_mutation_steward_v2_2d4d03
operation faceop-1791933985203-237c
exit=0
```

G17-запись мутации (полные 7 полей; `wolf get mem_20261013_mutation_steward_v2_2d4d03`, выдержка полей):

```json
{
  "id": "mem_20261013_mutation_steward_v2_2d4d03",
  "type": "note",
  "facet": "history",
  "created_by": "agent:steward",
  "reason": "S-45 (T7): диспетчеру нужен машиночитаемый триаж мутаций — …",
  "minimal_change": "шаг 4 протокола: … строка триажа FACE-OP: <op_id> → v<N>; заголовок тела отмечает v2",
  "boundaries": "НЕ меняются: мутатор — только Стюард; все 7 полей G17 обязательны; …",
  "example_helps": "диспетчер L1 по строке FACE-OP находит операцию в журнале и связывает жалобу с мутацией",
  "example_keep": "жалоба без конкретики → вопрос передавшему; одна жалоба — одна мутация",
  "verification": "wolf face show steward → v2 active с G17-записью мутации; … активная удерживает v1 (R03 §6)",
  "rollback": "wolf face restore steward --from v1 (восстановление как НОВАЯ версия, история не уничтожается)"
}
```

## Шаг 3 — новая версия с G17-записью; прежняя в истории как head-1

```sh
$ node "<CLI>" face show steward | head -12
steward  v2  mem_20261013_nastavnik_protokol_mutatsii_lits_v2_bec38e  [active]
initiator: steward
reason: S-45 (T7): диспетчеру нужен машиночитаемый триаж мутаций — отчёт Стюарда дополняется строкой FACE-OP: <op_id> → v<N>
based_on: mem_20261013_nastavnik_protokol_mutatsii_lits_8aa427
title: Наставник — протокол мутации лиц v2
tags: steward:наставник, playbook
created: 2026-10-13T23:26:25.242Z
exit=0

$ node "<CLI>" face history steward
v2  mem_20261013_nastavnik_protokol_mutatsii_lits_v2_bec38e  [active]     initiator=steward  based_on=mem_…_8aa427  at=2026-10-13T23:26:25.242Z  S-45 (T7): диспетчеру нужен машиночитаемый триаж…
v1  mem_20261013_nastavnik_protokol_mutatsii_lits_8aa427  [superseded]   initiator=seed     at=2026-10-13T23:25:52.607Z  base-set seed: steward-nastavnik.md
exit=0
```

## Шаг 4 — НОВОЕ задание (`WOLF_SESSION=ses-worker-2`, свежий процесс) получает НОВУЮ версию

```sh
$ PATH="<shim>:$PATH" WOLF_ROUTER_LOG="<tmp>/router.log" WOLF_ACTOR=agent:worker WOLF_SESSION=ses-worker-2 \
        node --experimental-strip-types driver-s1.mjs fresh
S1-RESULT {"delivery":{"bytes":2599,"v1":false,"v2":true,"head":"\n\n# Актуальный playbook (источник: память Wolf, доставлен плагином; …)\n\n# Наставник — протокол мутации лиц — v2 (S-45: отчёт с op-id)\n\n"}}
exit=0
--- router.log:
2026-10-13T23:26:52.634Z agent-id=steward playbook=hit name=mem_20261013_nastavnik_protokol_mutatsii_lits_v2_bec38e variant=canonical injected=yes ms=640 bytes=3947
```

Новое задание получило **v2** (`mem_…_v2_bec38e`, маркер `T7S1-V2-MARKER` в доставленном теле).

## Шаг 5 — АКТИВНОЕ задание (тот же процесс, та же `WOLF_SESSION=ses-worker-1`) удерживает прежнюю версию

Драйвер активного задания (живой процесс из шага 1) получил вторую пересборку system ПОСЛЕ мутации (`touch mutate.done`):

```sh
$ touch mutate.done   # разрешить драйверу (живому процессу активного задания) продолжить
--- driver-active.out:
S1-RESULT {"delivery1":{"bytes":2448,"v1":true,"v2":false,"head":"…# Наставник — протокол мутации лиц\n\n…"},
           "delivery2":{"bytes":2448,"v1":true,"v2":false,"head":"…# Наставник — протокол мутации лиц\n\n…"}}
--- router.log (доставка #2 — из кеша сессии, без ре-резолва):
2026-10-13T23:26:37.155Z agent-id=steward playbook=hit name=mem_20261013_nastavnik_protokol_mutatsii_lits_8aa427 variant=canonical injected=yes ms=0 bytes=3736
```

Активное задание удержало **v1**: delivery2 = v1 (`v1:true, v2:false`, те же bytes=2448), router отдал мемо-текст прежнего head `mem_…_8aa427` с `ms=0` (без CLI-спавнов и ре-резолва) — ровно контракт ограничения R03 §6: обновление применяется «к следующему запуску процесса/задания». Примечание: сессионная дедупликация `wolf call` (реестр доставок) здесь ни при чём — `wolf call` лица не доставляет (pool пуст, шаг 1a); удержание версии лица обеспечивает кеш `sessionInject` плагина на процесс.

## Шаг 6 — финальное состояние лица

```sh
$ node "<CLI>" face show steward | head -8
steward  v2  mem_20261013_nastavnik_protokol_mutatsii_lits_v2_bec38e  [active]
initiator: steward
reason: S-45 (T7): диспетчеру нужен машиночитаемый триаж мутаций — отчёт Стюарда дополняется строкой FACE-OP: <op_id> → v<N>
based_on: mem_20261013_nastavnik_protokol_mutatsii_lits_8aa427
title: Наставник — протокол мутации лиц v2
exit=0
```

## Вердикт по S-45

| Пункт S-45                                                                 | Статус | Evidence                                                                                                                                                      |
| -------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. trace содержит `wolf face new` (команда, аргументы, exit 0)             | ✅     | шаг 2: полная команда, exit 0, op-id `faceop-1791933985203-237c`                                                                                              |
| 2. `face show` — новая версия с G17-записью                                | ✅     | шаг 3: v2 `[active]`, initiator=steward, G17-запись `mem_20261013_mutation_steward_v2_2d4d03` со всеми 7 полями; прежняя v1 — head-1 `[superseded]` в history |
| 3. новое задание получает новую версию (tool call + выдача)                | ✅     | шаг 4: ses-worker-2 → v2 (`v2:true`), router.log: `mem_…_v2_bec38e` injected                                                                                  |
| 4. активное задание удерживает прежнюю (граница R03 §6 зафиксирована явно) | ✅     | шаг 5: ses-worker-1, тот же процесс → v1 (`v1:true, v2:false`, ms=0 — мемо без ре-резолва); цитата R03 §6 в начале файла                                      |

## Воспроизведение

```sh
# cwd: worktree T7; сборка
npm run build
D=$(mktemp -d "${TMPDIR}/opencode/wolf-t7-s1-run-XXXXXX") && cd "$D" && git init -q
export XDG_CONFIG_HOME="$D/xdg" && mkdir -p "$XDG_CONFIG_HOME"
node <cwd-t7>/dist/bootstrap/cli.js init --full --platform opencode        # свежая установка
# PATH-shim: printf '#!/bin/sh\nexec node "<cwd-t7>/dist/bootstrap/cli.js" "$@"\n' > bin/wolf && chmod +x bin/wolf
# драйвер: tests/e2e/face-router.e2e.ts паттерн (импорт .opencode/plugins/wolf-router.ts,
#   node --experimental-strip-types; сценарии active/fresh; полный текст — scenario-1-raw.log)
WOLF_ACTOR=agent:worker WOLF_SESSION=ses-worker-1 node <cwd-t7>/dist/bootstrap/cli.js call
node <cwd-t7>/dist/bootstrap/cli.js face list && node <cwd-t7>/dist/bootstrap/cli.js face show steward
# … шаги 1d–6 как в raw log (драйвер active в фоне, ожидание delivery1.json → мутация → mutate.done)
```
