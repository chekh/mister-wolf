# Сценарий 2 (S-46) — доставка памяти между рабочими копиями (своё / чужое / promote)

- **Критерий**: test-plan S-46; oracle REQ-06 AC-3.
- **Revision**: `a1c7c859df3f6a0efb3addc0b8d831c5e1dd7eda` (`git rev-parse HEAD`, ветка `feature/2-17-1-t7-req06-e2e`).
- **Дата**: 2026-10-14 (UTC-выводы команд: 2026-10-13T23:28).
- **CLI под тестом**: `node <cwd-t7>/dist/bootstrap/cli.js` (сборка того же revision).
- **Развёртка**: tmp git-репо `/private/var/folders/…/T/opencode/wolf-t7-s2-0NQrSB/` — main-чекоут `main/` + два linked worktree `w1/` (ветка wt-w1), `w2/` (ветка wt-w2); `wolf init` в main (общий `.wolf/` резолвится worktree'ами через git common-dir); `XDG_CONFIG_HOME` изолирован.
- **Доставляемый тип**: `lesson` (доставляется `wolf call --for <topic>` при пересечении `trigger_keywords` с топиком — единственный из add-типов с delivery-механикой в call; выбран keyword `wtdelivery`).
- Полный дословный лог: `scenario-2-raw.log`.

## STEP 0 — развёртка

```sh
$ git init -q '<tmp>/main' && git -C '<tmp>/main' commit -qm init
$ git -C '<tmp>/main' worktree add '<tmp>/w1' -b wt-w1 && git -C '<tmp>/main' worktree add '<tmp>/w2' -b wt-w2
exit=0 (w1)
exit=0 (w2)
$ git -C '<tmp>/main' worktree list
<tmp>/main  e0a4dd0 [main]
<tmp>/w1    e0a4dd0 [wt-w1]
<tmp>/w2    e0a4dd0 [wt-w2]

$ cd '<tmp>/main' && node "<CLI>" init
# wolf init
- memory skeleton: ensured (<tmp>/main/.wolf)
- base set: AGENTS.md created
- init-report: created (mem_20261013_init_report_main_106b30)
exit=0
```

## Шаг 1 — запись из W1 с worktree-scope (WT-ID)

```sh
$ cd '<tmp>/w1' && WOLF_ACTOR=agent:worker WOLF_SESSION=ses-w1-add node "<CLI>" add --type lesson \
        --title "worktree delivery probe" --body "<текст урока об изоляции памяти в worktree>" --set trigger_keywords=[wtdelivery]
Created memory object: mem_20261013_worktree_delivery_probe_549609
exit=0

$ cd '<tmp>/w1' && node "<CLI>" get mem_20261013_worktree_delivery_probe_549609 | grep -E '"id"|"scope"|"title"|"type"|"status"|"created_by"'
  "id": "mem_20261013_worktree_delivery_probe_549609",
  "type": "lesson",
  "title": "worktree delivery probe",
  "status": "active",
  "created_by": "agent:worker",
  "scope": "worktree:w-a089d905af7c"      # WT-ID = w-<12 hex sha1(realpath(w1))>, design §3.1/ADR-1
exit=0
```

## Шаг 2 — доставка в свою копию (W1, сессия ses-a)

```sh
$ cd '<tmp>/w1' && WOLF_ACTOR=agent:worker WOLF_SESSION=ses-a node "<CLI>" call --for wtdelivery
- [mem_20261013_worktree_delivery_probe_549609] worktree delivery probe (medium, 2026-10-13T23:28:45.937Z)
  source: mem_20261013_worktree_delivery_probe_549609
exit=0
```

## Шаг 3 — чужие копии: НЕ доставляется

```sh
$ cd '<tmp>/w2' && WOLF_ACTOR=agent:worker WOLF_SESSION=ses-b node "<CLI>" call --for wtdelivery
No active call injections.
pool: 0 active delivery candidate(s)
reason: no active delivery candidates in this project
exit=0

$ cd '<tmp>/main' && WOLF_ACTOR=agent:worker WOLF_SESSION=ses-m node "<CLI>" call --for wtdelivery
No active call injections.
pool: 0 active delivery candidate(s)
reason: no active delivery candidates in this project
exit=0
```

(Каждый вызов — уникальная `WOLF_SESSION`, чтобы сессионная дедупликация не склеила шаги.)

## Шаг 4 — promote из W1

```sh
$ cd '<tmp>/w1' && WOLF_ACTOR=agent:worker WOLF_SESSION=ses-w1-promote node "<CLI>" promote w1
Promoted 1 object(s) from worktree:w-a089d905af7c, worktree:w1 to main
exit=0
```

Отклонение от буквы брифа (не кода): бриф писал `CLI promote <id>` — фактическая сигнатура команды `wolf promote <worktree>` (имя worktree для валидации/отчёта; владелец определяется идентичностью ТЕКУЩЕЙ копии по cwd, design §3.5). Использовано имя `w1`. Вывод показывает оба токена владельца (WT-ID `w-a089d905af7c` + legacy-имя `w1`) — как в ADR-2 (два семейства scope после обновления).

## Шаг 5 — после promote доставляется обоим (свежие сессии)

```sh
$ cd '<tmp>/w2' && WOLF_ACTOR=agent:worker WOLF_SESSION=ses-b2 node "<CLI>" call --for wtdelivery
- [mem_20261013_worktree_delivery_probe_549609] worktree delivery probe (medium, 2026-10-13T23:28:47.145Z)
  source: mem_20261013_worktree_delivery_probe_549609
exit=0

$ cd '<tmp>/main' && WOLF_ACTOR=agent:worker WOLF_SESSION=ses-m2 node "<CLI>" call --for wtdelivery
- [mem_20261013_worktree_delivery_probe_549609] worktree delivery probe (medium, 2026-10-13T23:28:47.145Z)
  source: mem_20261013_worktree_delivery_probe_549609
exit=0
```

## Вердикт по S-46

| Пункт S-46                                                    | Статус | Evidence                                                                                |
| ------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| запись создана из worktree (tool call + worktree-scope WT-ID) | ✅     | шаг 1: `scope: "worktree:w-a089d905af7c"`                                               |
| доставка в свою копию (W1, ses-a)                             | ✅     | шаг 2: блок `mem_…_549609` доставлен                                                    |
| отсутствие доставки в чужую копию (W2, ses-b) и main (ses-m)  | ✅     | шаг 3: оба «No active call injections», pool 0                                          |
| promote из W1 (tool call + вывод)                             | ✅     | шаг 4: `Promoted 1 object(s) from worktree:w-a089d905af7c, worktree:w1 to main`, exit 0 |
| после promote — доставка W2 (ses-b2) и main (ses-m2)          | ✅     | шаг 5: блок доставлен в обоих                                                           |

## Воспроизведение

```sh
# cwd: worktree T7 (сборка npm run build уже выполнена)
R=$(mktemp -d "${TMPDIR}/opencode/wolf-t7-s2-XXXXXX"); M=$R/main
git init -q "$M" && git -C "$M" commit --allow-empty -qm init
git -C "$M" worktree add "$R/w1" -b wt-w1 && git -C "$M" worktree add "$R/w2" -b wt-w2
export XDG_CONFIG_HOME=$R/xdg && mkdir -p "$XDG_CONFIG_HOME"
(cd "$M" && node <cwd-t7>/dist/bootstrap/cli.js init)
(cd "$R/w1" && WOLF_SESSION=ses-add node <cwd-t7>/dist/bootstrap/cli.js add --type lesson \
   --title "worktree delivery probe" --body "…" --set trigger_keywords=[wtdelivery])
(cd "$R/w1" && WOLF_SESSION=ses-a node <cwd-t7>/dist/bootstrap/cli.js call --for wtdelivery)   # доставлено
(cd "$R/w2" && WOLF_SESSION=ses-b node <cwd-t7>/dist/bootstrap/cli.js call --for wtdelivery)   # пусто
(cd "$M"   && WOLF_SESSION=ses-m node <cwd-t7>/dist/bootstrap/cli.js call --for wtdelivery)    # пусто
(cd "$R/w1" && WOLF_SESSION=ses-p node <cwd-t7>/dist/bootstrap/cli.js promote w1)
(cd "$R/w2" && WOLF_SESSION=ses-b2 node <cwd-t7>/dist/bootstrap/cli.js call --for wtdelivery)  # доставлено
(cd "$M"   && WOLF_SESSION=ses-m2 node <cwd-t7>/dist/bootstrap/cli.js call --for wtdelivery)   # доставлено
```
