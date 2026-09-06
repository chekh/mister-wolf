# WEV-001 / r1 (перезапуск) — журнал кампании

- Дата: 2026-09-06, worktree `.worktrees/wolfeval-phase-c1r` (ветка
  `feature/wolfeval-phase-c1r`, база 3eb00eb = C1-tip; main на 82497ac —
  C1 не был влит, работа продолжена с его головы).
- Порядок r1: BASE → WOLF. Timeout 1800 (amendment v1.1), E5-пара
  kill@300s + recovery. Прибор: v1.2 (e1–e6a BASE), v1.3 (с e6b-retry
  BASE и вся рука WOLF) — см. amendment log в карте.
- Инструмент: раннер /tmp-расходник run-episode.sh + oracle.sh (python3-
  извлечение JSON — фикс sed-бага раннера C1); префлайт эффективного
  конфига перед каждым запуском с v1.3 (все OK, см. load-log.txt).

## Сборка и идентичность (до прогона)

- F12: `readlink -f "$(which wolf)"` = lock-путь; wolf 2.5.0,
  opencode 1.18.27.
- Свежие инстансы /tmp/wolfeval-v1/r1/{base,wolf} из одного среза
  (9637506): verify-fixtures **6/6 RED** обе сборки; tree-хэш initial
  commit `1bcb3cc27b8e96372b56ce3be15e1616e4c2d39c` в обеих (= A/A и
  отравленной попытке); `diff -r --exclude=.git --exclude=node_modules`
  — пусто. BASE F20-чист; WOLF init под песочницей (регистрация в
  /tmp/wolfeval-v1/r1/xdg-wolf/wolf/projects.yaml; реальный реестр
  не мутирован, sha 7050ca07 до/после).
- Промпты r1/prompts/e\*.md — байт-копии прежней композиции (cmp OK);
  task_set `bb3a09ba…`, scorer `05d56fac…` — пересчитаны до и после
  кампании, совпадают.

## Инцидент e6b-BASE №1 (invalid, ретрай)

Сессия умерла за 31s (exit 2): агент e6a по сюжету (очистка временных
XDG-каталогов) выполнил `rm -rf /tmp/wolfeval-v1/r1/xdg-base` — песочница
была внутри allow-поддерева руки; e6b стартовал с пересозданным дефолтным
`opencode.jsonc` без permission-профиля → смерть на первом $HOME-тыке.
НЕ повтор исходного дефекта: e6a при живом конфиге пережил 2 ask-auto-reject
+ 1 deny-rule (доказательство работы continue_loop_on_deny в 1.18.27).
Амendment v1.3: OPENCODE_CONFIG=/tmp/wolfeval-v1/r1-instr/<arm>-opencode.json
(вне поддерева агента) + префлайт в раннере. Ретрай e6b из резерва — valid.

## Прогоны (17 запусков: 15 valid, 1 invalid + 1 ретрай)

| # | рука | эпизод | exit | сек | weight | oracle | valid |
| - | ---- | ------ | ---- | ---- | ------ | ------ | ----- |
| 1 | BASE | e1 | 0 | 900 | 614095.4 | FAIL (a; б/в PASS) | ✓ |
| 2 | BASE | e2 | 0 | 580 | 148375.0 | **PASS** | ✓ |
| 3 | BASE | e3 | 0 | 1425 | 419471.4 | FAIL (0/3) | ✓ |
| 4 | BASE | e4 | 0 | 1079 | 463123.2 | FAIL (3/4) | ✓ |
| 5 | BASE | e5 kill | 124 | 302 | 104530.2 | (пара) | ✓ planned_kill |
| 6 | BASE | e5 recovery | 0 | 1644 | 103094.4 | FAIL (0/2) | ✓ |
| 7 | BASE | e6a | 0 | 1280 | 454870.0 | **PASS** | ✓ |
| 8 | BASE | e6b №1 | 2 | 31 | 8413.4 | FAIL (0/3) | ✗ F25 (см. инцидент) |
| 9 | BASE | e6b retry | 0 | 633 | 204849.8 | FAIL (0/3) | ✓ |
| 10 | WOLF | e1 | 0 | 1441 | 456385.2 | FAIL (a) | ✓ |
| 11 | WOLF | e2 | 0 | 933 | 209452.6 | **PASS** | ✓ |
| 12 | WOLF | e3 | 0 | 1094 | 350528.0 | FAIL (0/3) | ✓ |
| 13 | WOLF | e4 | 0 | 860 | 436029.2 | FAIL (3/4) | ✓ |
| 14 | WOLF | e5 kill | 124 | 303 | 96648.2 | (пара) | ✓ planned_kill |
| 15 | WOLF | e5 recovery | 0 | 874 | 85702.2 | FAIL (0/2) | ✓ |
| 16 | WOLF | e6a | 0 | 1010 | 387496.6 | **PASS** | ✓ |
| 17 | WOLF | e6b | 0 | 527 | 219775.6 | FAIL (0/3) | ✓ |

Campaign-audit: BASE **FAIL** (оракулы + scope-кандидаты CHANGELOG/README/
README.ru/vitest.config.ts), protected suite PASS; WOLF **FAIL** (оракулы +
те же scope-кандидаты), инварианты памяти E4 PASS, protected PASS.
Вердиктов о «Wolf лучше/хуже» нет — скоринг WC3.

## costs.csv

14 эпизодных строк (E5-пары агрегированы, e6b BASE = invalid+retry
агрегированы с exit `2;0` — триаж WC3); CPSC n/a (0 успешных кампаний,
обе FAIL). audit-verdicts-campaign.jsonl — кампания-уровневые вердикты
для скореров.

## Наблюдения прибора

- Все префлайты v1.3 OK; повторов смерти после deny не зафиксировано
  (e2/e6a перенесли ask/deny-события штатно).
- WOLF-сессии: mcp wolf стартует под песочницей, память руки пишется в
  инстанс (.wolf), реальный реестр не тронут (7050ca07 после кампании).
