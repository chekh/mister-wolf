# WEV-001 / r1 — журнал повтора 1 и стоп-решение (WC1, частичный)

- Дата: 2026-09-05/06, worktree `.worktrees/wolfeval-phase-c1` (база main 82497ac).
- Порядок r1: BASE → WOLF (run-configs). Исполнено: **только BASE-рука (8/16
  запусков)**, WOLF-рука НЕ запускалась — стоп по приборному дефекту (ниже).
- Timeout 1800s (amendment v1.1); E5 planned_kill на фиксированной точке 300s
  (обе руки, зафиксировано до старта в load-log.txt).

## Сборка и идентичность (до прогона)

- F12-контроль: `readlink -f "$(which wolf)"` =
  `/usr/local/lib/node_modules/mister-wolf/dist/bootstrap/cli.js` (= lock),
  wolf 2.5.0, opencode 1.18.27 — пины соблюдены.
- build-instance: `/tmp/wolfeval-v1/r1/{base,wolf}` — gate verify-fixtures
  **6/6 RED** в обеих сборках (FIXTURE ALIVE, F24-контроль пройден).
- Идентичность до прогона: tree-хэш initial commit
  `1bcb3cc27b8e96372b56ce3be15e1616e4c2d39c` в ОБОИХ инстансах (= A/A-сборкам);
  `diff -r --exclude=.git --exclude=node_modules` — пусто.
- XDG-песочницы `/tmp/wolfeval-v1/r1/xdg-{base,wolf}` байт-идентичны
  (`permission.external_directory` `/tmp/**`,`/private/tmp/**` = allow;
  `autoupdate: false` — amendment v1.1 п.2, паттерн Фазы B).
- WOLF-рука: `wolf init --model zai-coding-plan/glm-5.2 --platform opencode`
  под песочницей — opencode.json (mcp.wolf, subagent_depth=2), .opencode/,
  AGENTS.md, .wolf (seeded); глобальный реестр wolf не мутирован (регистрация
  ушла в песочницу). BASE: F20-пост-проверка — волчьих следов нет.
- Pre-flight `opencode debug config` под песочницами: WOLF — mcp=['wolf'],
  плагины инстанса, агент worker-implementer доступен; BASE — mcp=[], плагины
  нет, autoupdate=false.
- Промпты r1/prompts/e\*.md: композиция start_instruction + дословный текст
  эпизода, байт-идентична паттерну A/A (e1 diff = пусто). Хэши артефактов не
  менялись: task_set `bb3a09ba…`, scorer `05d56fac…` (пересчитаны).

## Прогоны BASE-руки (8 launcher-строк, все опубликованы)

| # | эпизод | exit | secs | weight | вердикт / причина |
| - | ------ | ---- | ---- | ------ | ----------------- |
| 1 | e1     | 0    | 1423 | 461729.0   | valid; oracle E1 FAIL (только маркер (a): skipped-ветка осталась; (б)поведение и (в)тест PASS) |
| 2 | e2     | 2    | 39   | 25187.8    | **invalid F25**: auto-reject `external_directory (/Users/chekh/*)` на `cat ~/.opencode.json` → headless-процесс умер без финального text |
| 3 | e3     | 0    | 1629 | 545598.4   | valid; oracle E3 FAIL (0/3 — поведение агента, данные) |
| 4 | e4     | 0    | 1250 | 535538.0   | valid; oracle E4 FAIL (3/4; доки не почищены — данные) |
| 5 | e5 kill (300s) | 124 | 302 | 77584.8 | valid (planned_kill, штатный обрыв) |
| 6 | e5 recovery | 124 | 1802 | 119906.6 | invalid F21-кандидат: не завершился за 1800s (лаунчер штатен; агент работал — поведенческое) |
| 7 | e6a    | 2    | 158  | 54516.6    | **invalid F25**: auto-reject `/Users/chekh/.config/wolf/*` → смерть без финального text |
| 8 | e6b    | 2    | 53   | 31497.2    | **invalid F25**: тот же путь `/Users/chekh/.config/wolf/*`, 53s |

Oracle-вердикты всех 8 эпизодов — `r1/audit-verdicts.jsonl` (+ полные выводы
`r1/oracle-base-e*.txt`); costs.csv — `r1/costs.csv` (CPSC n/a: кампания не
завершена, assume_all_success).

## Стоп-решение (по стоп-правилу брифа WC1)

Два подряд эпизода (e6a → e6b) упали по приборной причине одного класса:
**headless-сессия умирает без финального ассистентского text сразу после
permission auto-reject** (F25-класс, тот же механизм, что A/A-прогон №2, но
новый класс пути). Три подтверждения за повтор: e2 (`/Users/chekh/*`),
e6a и e6b (`/Users/chekh/.config/wolf/*`).

Отягчающее: задачи E6a/E6b по СЮЖЕТУ требуют инспекции глобального волчьего
реестра (симптом F14/F16 — «записи в глобальный реестр»), т.е. дефект
систематически бьёт по этим эпизодам в ЛЮБОЙ руке и в любом повторе.
Запуск WOLF-руки в тех же условиях — предсказуемая трата 8 строк бюджета
(потолок 40, израсходовано 3 A/A + 8 r1 = 11, резерва ретраев нет) на
частично-невалидные прогоны → СТОП до решения координатора (прецедент:
A/A-стоп на приборном дефекте, бюджет A/B не тратился).

Гипотеза дефекта: `opencode` headless при auto-reject завершает процесс
RC=0 без завершающего step-finish(stop) — лаунчер-валидатор корректно
маркирует exit 2; защита конфига Фазы B покрывала только /tmp-пути.

## Варианты для координатора (не моя компетенция)

1. Расширить permission песочницы на чтение `$HOME`-конфигов
   (`/Users/chekh/.config/wolf/**`, `~/.opencode.json` и т.п.) ревизией
   amendment → перезапуск r1 с fresh-инстансами (бюджет: 11 + 16 + 16 = 43 >
   40 — потолок требует пересмотра, либо r1-BASE зачесть как состоявшийся
   при идентичном конфиге остатка, что нарушает гомогенность повтора).
2. Чинить сам дефект в opencode 1.18.27 (не завершаться после auto-reject) —
   но пин лаунчера/окружения в lock, это мутация прибора.
3. Принять r1 как BASE-only частичный и переигрывать в r2 — конфаунд
   конфигураций между руками.

## Клоны после эксперимента

`/tmp/wolfeval-v1/r1/base` — финальное состояние после e6b (продольные правки
e1–e5 сохранены, ничего не откатывалось); `/tmp/wolfeval-v1/r1/wolf` —
пост-init состояние, НЕ запускался; песочницы — на месте. Расходники; удалить
после приёмки координатором.
