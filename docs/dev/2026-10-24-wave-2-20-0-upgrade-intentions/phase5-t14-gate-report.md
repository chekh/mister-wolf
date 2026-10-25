---
slug: wave-2-20-0-upgrade-intentions
title: wave-2-20-0-upgrade-intentions — отчёт фазы 4 (T14, интеграционный гейт)
status: complete
created: 2026-10-25
task: wave-2-20-0-impl-t14
thread: mem_20261024_upgrade_ux_namereniya_vladeltsa_i_tikhiy_e6daf7
branch: dev/wave-2-20-0-upgrade-intentions
baseline: 1205bae
head: см. `git log` (`c848616`, `d5507e8`, `e889cc2`, `0d06e0d` + отчёт)
mode: FULL (утверждённый plan.md, T14)
---

# Ф4 — интеграция и полный гейт (T14)

RESULT: **DONE** (гейт и E2E зелёные, интеграционный сценарий парка покрывает
все режимы и exit-модель, остатки ревью F1/F2/F3 закрыты, regression guard
спайка R-01 подтверждён живым прогоном; независимое ревью — см. «Ревью»).

## Metadata

- task_id: `wave-2-20-0-impl-t14`; входы: `plan.md` (approved, T14),
  `design.md` (§4.6/§4.7/§4.12/§5), `test-plan.md`, `phase4-review-f1.md`,
  `phase4-rereview-f1.md`, `phase4-rereview-f2-cycle2.txt`,
  `phase4-review-f3.txt`.
- Базовая ревизия `1205bae` (Ф1–Ф3 приняты), ветка
  `dev/wave-2-20-0-upgrade-intentions`.
- Методики: wolf-sdd (исполнение линейное — диспетчеризация воркеров
  недоступна, см. FRICTION), test-driven-development (RED/GREEN там, где
  поведение менялось), verification-before-completion (счётчики и exit-коды
  ниже), using-skills/волновой playbook.
- Инструментальные ограничения: `subagent` недоступен (depth limit 1) —
  остатки ревью и сценарий исполнены lead'ом, независимое ревью — отдельным
  процессом `opencode run --agent worker-reviewer`.

## Summary

| Пункт T14     | Что сделано                                                                                                                                                                                                                                                                                                                                                        | Коммит    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| F1 m-6        | `SyncStateFiles = Record<string, string \| SyncEntry>` как единственный тип сырого среза свидетеля; пять потребителей (`memory-doctor`, `memory-uninstall`, `uninstall`, `platform-mismatch`, `repair-platform`) типизированы им; тесты key-only потребителей переведены на **сырой JSON** state-файла (без `loadSyncState`), легаси-строка + запись в одном файле | `c848616` |
| F2 m-7        | `deprecated`-цель приведена к единой report-only семантике: реестр решений не нумерует её (как `removed`), `verifyAgainstMap` для неё даёт `deprecated-noted` при `mutated`/`conflict`; паритет с `--check`; уточнение контракта в design §4.6/§4.7 + честная строка-ограничение §4.12                                                                             | `d5507e8` |
| F3 m-2        | `snapshotTree` (mtime+sha256) переехал в `tests/helpers/park-snapshot.ts` как `takeTreeSnapshot`; обе копии в интеграционных тестах удалены                                                                                                                                                                                                                        | `e889cc2` |
| Интеграция    | Новый CLI-e2e `tests/e2e/upgrade-park-modes.e2e.ts`: парк из 3 проектов, `--check --json` → `--review` (non-TTY) → `--resolve N=protect` → повторный `--check --json` → `--yes --json` (бэкапы) → восстановление из бэкапа → `--show` → `--resolve <project>/<rel>=keep` → повторный `--yes`; exit-модель 0/1/2, read-only и идемпотентность доказаны снапшотами   | `0d06e0d` |
| Allowlist T14 | Расширение зафиксировано в `plan.md` (F1/F2/F3-файлы, `tests/helpers/**`, `tests/e2e/**`)                                                                                                                                                                                                                                                                          | `0d06e0d` |

## Changes (файлы)

- `src/adapters/render/sync-state.ts` — `SyncStateFiles` (алиас), `SyncState.files`.
- `src/adapters/cli/commands/memory-doctor.ts`, `memory-uninstall.ts`,
  `src/app/use-cases/uninstall.ts`, `platform-mismatch.ts`, `repair-platform.ts` —
  типы потребителей свидетеля (поведение не менялось).
- `src/app/use-cases/decisions.ts` — `deprecated` вне реестра решений;
  `src/app/use-cases/verify-against-map.ts` — `fileVerdict` для `deprecated`.
- `docs/dev/2026-10-24-wave-2-20-0-upgrade-intentions/design.md` — §4.6
  (deprecated → `deprecated-noted`), §4.7 (не нумеруется, адрес по пути),
  §4.12 (`--yes` category-agnostic — явное ограничение).
- Тесты: `tests/unit/adapters/render/sync-state.test.ts` (сырой JSON),
  `tests/unit/use-cases/decisions.test.ts` (m-7 + адаптация R06-1/N06-2/R06-6),
  `tests/unit/use-cases/verify-against-map.test.ts` (deprecated × mutated/conflict),
  `tests/helpers/park-snapshot.ts` (`takeTreeSnapshot`),
  `tests/integration/upgrade-check.test.ts`, `tests/integration/upgrade-here.test.ts`
  (дедуп хелпера), `tests/e2e/upgrade-park-modes.e2e.ts` (новый).

## Task Decomposition (классификация ДО исполнения)

| Работа                                   | Класс (playbook)          | Признаки                                                                  | Исполнитель по плану | Факт                      |
| ---------------------------------------- | ------------------------- | ------------------------------------------------------------------------- | -------------------- | ------------------------- |
| F1 m-6 (типы + сырой JSON-тест)          | SIMPLE                    | 6 файлов, ≤60 строк, без архитектуры                                      | сам (L1)             | lead                      |
| F2 m-7 (deprecated report-only + design) | MEDIUM                    | 2 файла кода + 2 теста + контрактный текст, риск расхождения поверхностей | воркер               | lead (воркеры недоступны) |
| F3 m-2 (дедуп хелпера)                   | TRIVIAL                   | 3 тест-файла, механический перенос                                        | сам (L1)             | lead                      |
| Интеграционный e2e парка (3 проекта)     | MEDIUM/COMPLEX            | новый файл ~370 строк, сквозной сценарий, exit-модель, read-only          | воркер               | lead (воркеры недоступны) |
| Regression guard R-01                    | ручной живой прогон       | capture-proxy + tmp-проект, вне кода                                      | lead                 | lead                      |
| Совместимость 2.19.0 → 2.20.0            | ручной прогон на фикстуре | released-сборка из тега + HEAD-CLI                                        | lead                 | lead                      |
| Независимое ревью                        | —                         | свежий reviewer-процесс                                                   | worker-reviewer      | `opencode run`            |

## Чек-лист гейта

Свежие прогоны на финальном дереве (`HEAD` = `0d06e0d` + этот отчёт):

| Шаг                       | Команда                                                                                  | Exit  | Счётчики                                        |
| ------------------------- | ---------------------------------------------------------------------------------------- | ----- | ----------------------------------------------- |
| english-surface           | `npm run check` (внутри)                                                                 | 0     | —                                               |
| prettier                  | `npm run format:check`                                                                   | 0     | —                                               |
| типы                      | `tsc --noEmit`                                                                           | 0     | —                                               |
| build                     | `tsc`                                                                                    | 0     | —                                               |
| unit+integration (vitest) | `npm run test:run`                                                                       | 0     | **214 файлов / 1886 тестов passed**             |
| **полный гейт**           | `npm run check`                                                                          | **0** | 51.7 s                                          |
| **E2E**                   | `npm run e2e`                                                                            | **0** | **61 файл / 233 теста passed**, 458 s (7.6 мин) |
| новый сценарий T14        | `npx vitest run --config tests/e2e/vitest.config.ts tests/e2e/upgrade-park-modes.e2e.ts` | 0     | 10 тестов / 11.5 s                              |
| точечные остатков ревью   | см. ниже                                                                                 | 0     | 48 + 113 + 14 passed                            |

Точечные прогоны остатков ревью:

```
npx vitest run tests/unit/adapters/render/sync-state.test.ts tests/unit/use-cases/uninstall.test.ts tests/unit/use-cases/platform-mismatch.test.ts tests/unit/use-cases/repair-platform.test.ts tests/unit/use-cases/doctor.test.ts
  → 5 файлов / 48 passed
npx vitest run tests/unit/use-cases/decisions.test.ts tests/unit/use-cases/verify-against-map.test.ts tests/unit/adapters/commands/memory-upgrade.check.test.ts tests/integration/upgrade-park.test.ts tests/integration/project-step.test.ts
  → 5 файлов / 113 passed
npx vitest run tests/integration/upgrade-check.test.ts tests/integration/upgrade-here.test.ts
  → 2 файла / 14 passed
```

## Интеграционный сценарий (3 проекта, все режимы)

Файл: `tests/e2e/upgrade-park-modes.e2e.ts` — реальный `dist`-CLI (`spawn`), не
in-process. Изоляция: tmp-XDG (реестр проектов), tmp-каталог фикстуры, фейковый
`npm` первой записью `PATH` (available = installed, установка не запускается) и
shim «установленного бинаря» через `WOLF_UPGRADE_CHILD_BIN` для re-exec фазы 2.
Live-проекты, live-реестр и live-конфиг не участвуют.

Фикстура: `p-clean` (эталон после `init --full`), `p-decisions` (два `mutated`
файла + защищённый `protect: true` файл), `p-stale` (штамп-дрейф двух целей:
контент = эталон, версия набора в штампе старая).

| #   | Сценарий                                              | Ожидание → факт                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `--check --json`                                      | `schema=wolf.upgrade.check/1`, exit 0; `p-clean`/`p-stale` — `current`, `p-decisions` — `needs-decision` c двумя путями; секция protections = 1 файл (`protect: true`); снапшот mtime+sha256 всех 3 проектов и реестра **не изменён**; `.wolf/backup` не создан (NFR-03) |
| 2   | `--check` (текст) ×2                                  | stdout байт-идентичен (NFR-06), финальная строка `Done (read-only)`                                                                                                                                                                                                      |
| 3   | `--review` (non-TTY)                                  | exit **2**, `2 files need a decision` + имена файлов + готовая команда `--resolve 1=take --resolve 2=take`; снапшот не изменён                                                                                                                                           |
| 4   | `--json` (non-TTY без `--yes`)                        | exit **0** (отменённый проход), `mode=pass`, `decisions[].n` = нумерация текста `--review` (NFR-06/REQ-11 AC2); снапшот не изменён                                                                                                                                       |
| 5   | `--show 1` / `--show 99`                              | exit 0 с diff `local → base`; неизвестный N → exit **1**, записей нет                                                                                                                                                                                                    |
| 6   | `--resolve 99=take`                                   | exit **1**, `unknown target 99`, записей нет (двухфазность AC3)                                                                                                                                                                                                          |
| 7   | `--resolve 1=protect`                                 | exit **2** (остаток решений); `protect: true` в файле, локальная правка цела; повторный `--check --json` показывает 2 защиты и остаток `mutated` только по второму файлу                                                                                                 |
| 8   | `--yes --json`                                        | exit **0**; `take` mutated с бэкапом (`.wolf/backup/upgrade/<date>/<rel>`), файл = эталон, бэкап = локальный контент **байт-в-байт** (NFR-05); штамп-дрейф `p-stale` исцелён (`set` = текущая база, REQ-02); защищённый файл не тронут; `decisions=[]`                   |
| 9   | восстановление из бэкапа → `--show p-decisions/<rel>` | файл снова `mutated` и виден в `--show` (exit 0); адресация в парке — `<project>/<rel>` (голый `<rel>` неоднозначен: файл есть во всех трёх проектах)                                                                                                                    |
| 10  | `--resolve p-decisions/<rel>=keep` → `--check --json` | exit **0**, файл байт-в-байт прежний (ADR-8), проект `current`, `mutated=[]`                                                                                                                                                                                             |
| 11  | повторный `--yes --json`                              | exit **0**, `backups=[]`, контент всех 3 проектов (sha256) не изменился → NFR-02                                                                                                                                                                                         |
| 12  | `--review --json`                                     | exit **1**, `error: --review is interactive; --json is not supported`, записей нет (§4.18)                                                                                                                                                                               |

## Совместимость/миграция 2.19.0 → 2.20.0 (фикстура)

Метод: выпущенная сборка 2.19.0 из тега `v2.19.0` (`git worktree add --detach`,
`npx tsc`, symlink `node_modules`) инициализирует tmp-проект; дальше по нему
работает HEAD-сборка (`dist`), tmp-XDG. Проект 2.19.0: `AGENTS.md` со штампом
`set=2.19.0` + onboarding-блок `v2` + пользовательский текст ниже блока;
`mcp.wolf` из `opencode.json` удалён (симуляция дефекта REQ-04).

```
$ node <rel-2.19.0>/cli.js init --full   → exit 0; AGENTS.md: onboarding v2; opencode.json: mcp.wolf
$ node <HEAD>/cli.js init --yes          → exit 0
  - base set: AGENTS.md updated — onboarding block 2 → 3
  - opencode.json: written (mcp.wolf, default_agent=mr-wolf, subagent_depth=2) — init: repaired missing/corrupted opencode wolf entry
  → блок v3, текст вне блока байт-в-байт, mcp.wolf восстановлен (REQ-03/REQ-04)
$ node <HEAD>/cli.js upgrade --here --check --json → exit 0; снапшот mtime+sha256 всех файлов equal (NFR-03)
  → p: needs-decision, mutated: [AGENTS.md]   (см. «Отклонения» п.3)
$ node <HEAD>/cli.js upgrade --here --resolve AGENTS.md=keep → exit 0
  → свидетель {origin:'keep', base:'2.19.0'}; текст владельца сохранён
$ node <HEAD>/cli.js upgrade --here --check  → current, `1 kept (local): AGENTS.md`, `Protections: none`
$ node <HEAD>/cli.js upgrade --here --yes (×2) → exit 0; sha256 всех файлов проекта не изменился (NFR-02)
  → «вечных differ» нет; второй прогон — no-op
$ `--here --check` ×2 → stdout байт-идентичен (NFR-06)
```

## Regression guard спайка R-01 (живой прогон провайдера, 2026-10-25)

Метод — как §5 design: capture-proxy (`127.0.0.1:8791`) перед настоящим
роутером (`router.ratway.ru:8443`, TLS до провайдера настоящий), tmp-проект с
`opencode.json`, где подменён только `provider.company.options.baseURL`, агент
`.opencode/agent/spike-protect.md` с `protect: true` (+ `mode: primary`,
`model: company/fast`, `tools: {"*": false}`), контроль — тот же файл без ключа.
`opencode v2.1.4`; cwd — tmp-проект; `~/.config/opencode/opencode.json` mtime до
и после совпадает (`1792516214`) — live-конфиг только читался.

```
$ opencode run --standalone --agent spike-protect "Reply with OK"
OK            protect_exit=0

capture-proxy (requests.log), запрос агента с protect:
POST /v1/chat/completions  bytes=6386  upstream=200
body keys: max_completion_tokens, messages, model, stream, stream_options
occurrences of "protect" in body: 0
system[0]: "Reply with OK and nothing else.\n# Your Model\n- Name: fast\n- Provider ID: company…"

контроль без ключа:
OK            control_exit=0
POST /v1/chat/completions  bytes=6386  upstream=200
body keys: max_completion_tokens, messages, model, stream, stream_options
occurrences of "protect" in body: 0
```

Наблюдение по провайдеру: первый POST служебного запроса (генерация заголовка
сессии) отвечает `503` с вложенной ошибкой месячного лимита модели титула,
opencode повторяет запрос и получает `200` — к `protect` отношения не имеет
(совпадает с записью в §5). Тело запроса агента с ключом и без ключа
побайтово одной длины и одного состава полей — ключ не покидает клиент.

Ограничения: skills/commands прямым замером не покрыты (как и в §5);
изолированный `XDG_DATA_HOME` в этой машине ломает разрешение провайдера
(`Free usage limit reached` — нет установленного пакета провайдера в пустом
data-каталоге), поэтому прогон шёл с живым `HOME` (как в исходном спайке), а
изоляция обеспечивалась cwd/tmp-проектом и read-only конфигом.

## Матрица «REQ/NFR → где доказано»

| Требование             | Доказательство (T14-вклад выделен)                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| REQ-01 имена файлов    | `tests/integration/upgrade-park.test.ts`, `upgrade-check.test.ts`; **e2e #3/#5** (имена и `<project>/<rel>`)                                                             |
| REQ-02 штамп-дрейф     | `opencode-renderer.test.ts`, `project-step.test.ts`; **e2e #8** (`p-stale` healed), **compat** (`2.17.1`→текущая)                                                        |
| REQ-03 onboarding      | `b0-init`, `b0-sync`, `opencode-renderer.test.ts`, `upgrade-check.test.ts`; **compat** (v2→v3, текст вне блока байт-в-байт, повторный `init` no-op)                      |
| REQ-04 mcp.wolf        | `init-project.test.ts`, `doctor.test.ts`, T12-коммит `544a419`; **compat** (mcp.wolf восстановлен)                                                                       |
| REQ-05 protect         | `protect-key.test.ts`, `decisions.test.ts`, `opencode-renderer.test.ts`; **e2e #7/#8** (защищённый файл не тронут ни `--yes`, ни `take`)                                 |
| REQ-06 `--resolve`     | `decisions.test.ts`; **e2e #6/#7/#9/#10** (N, `<project>/<rel>`, двухфазность, exit 1/2/0)                                                                               |
| REQ-07 `--review`      | `decisions.test.ts`, `upgrade-park.test.ts`; **e2e #3/#12** (non-TTY рецепт, exit 2, `--review --json` = exit 1)                                                         |
| REQ-08 `--show`        | `decisions.test.ts`; **e2e #5/#9** (N, путь, mutated после restore, exit 1)                                                                                              |
| REQ-09 Protections     | `memory-upgrade.check.test.ts`, `upgrade-here.test.ts`; **e2e #1/#7** (секция и `--json.protections`)                                                                    |
| REQ-10 `--yes`/бэкапы  | `decisions.test.ts`, `opencode-renderer.test.ts`, `project-step.test.ts`; **e2e #8/#9/#11** (бэкап байт-в-байт, восстановление, повтор)                                  |
| REQ-11 `--json`        | `memory-upgrade.check.test.ts`, `upgrade-projects.test.ts`; **e2e #1/#4/#8/#11** (schema/mode/exit, паритет нумерации)                                                   |
| NFR-01 exit-модель     | `upgrade-park.test.ts`; **e2e**: 0 (`--check`, `--json`, `--yes`, повтор), 1 (`--show`/`--resolve`/`--review --json`), 2 (`--review`, `--resolve` с остатком)            |
| NFR-02 идемпотентность | `upgrade-park.test.ts`; **e2e #11**, **compat** (двойной `--here --yes`, sha256 не меняется)                                                                             |
| NFR-03 read-only       | `upgrade-check.test.ts`, `upgrade-here.test.ts`, `memory-upgrade.check.test.ts`; **e2e #1/#2/#3/#4/#5/#6/#12** (mtime+sha256 всех файлов), **compat** (`--here --check`) |
| NFR-04 атомарность     | `sync-state.test.ts`, `decisions.test.ts` (tmp+rename, бэкапы) — без изменений T14                                                                                       |
| NFR-05 бэкап           | `decisions.test.ts`, `opencode-renderer.test.ts`; **e2e #8/#9** (содержимое бэкапа = локальный контент)                                                                  |
| NFR-06 детерминизм     | `upgrade-park.test.ts`, `upgrade-check.test.ts`, `decisions.test.ts`; **e2e #2/#4** (текст ×2 идентичен, паритет text↔json), **compat** (`--here --check` ×2)            |

## Отклонения

1. **Диспетчеризация воркеров недоступна** (`subagent`: depth limit 1) — все
   подзадачи исполнены lead'ом линейно (как в Ф1–Ф3). Независимое ревью
   выполнено отдельным процессом `opencode run --agent worker-reviewer`.
2. **NFR-02 доказан по контенту, не по mtime.** Проход пишет
   `wolf-sync-state.json` атомарно при каждом запуске (T2/NFR-04), поэтому после
   идемпотентного повтора mtime свидетеля меняется при идентичном содержимом.
   E2E сравнивает sha256 всех файлов проекта (включая свидетеля), mtime+sha256
   используется там, где запись запрещена вообще (NFR-03). Это поведение
   унаследовано от 2.19.0 и T14 его не менял; строгий mtime-вариант NFR-02
   потребовал бы «dirty»-гейта внутри `saveSyncState` (вне allowlist T14).
3. **Совместимость: `AGENTS.md` с текстом владельца вне блока после миграции
   остаётся `mutated`.** Это ровно предписанное design §4.5 поведение (свидетель
   не переписывается, чтобы правило 7 не затёрло текст); закрывается одной
   командой `--resolve AGENTS.md=keep`, после чего `--check` — `current`, а
   строка `1 kept (local)` видна. Класс «ложных needs-decision» из метрики §1
   requirements (штамп-дрейф, onboarding-блок, differ-счётчики, mcp.wolf) этим
   не затронут.
4. **Проект, инициализированный с `--model`, выглядит `behind` в `--check`.**
   `--check`/проход рендерят эталон с `models:'omit'`, а `init --model` пишет
   model-строки в файлы → штатное расхождение контента (baseline 2.19.0, не
   тема волны). В фикстуре T14 поэтому `init --full` без `--model`; наблюдение
   вынесено как риск, а не как дефект T14.
5. **Контракт deprecated уточнён** (дефект найден при закрытии m-7): реестр
   решений не нумерует `deprecated`-цели, сверка даёт `deprecated-noted` —
   записано в design §4.6/§4.7, ограничение `--yes` (category-agnostic) — в §4.12.

## Остаточные риски

- `--yes` не различает категории карты: локально изменённая `deprecated`-цель
  тоже берётся с бэкапом (design §4.12, в карте 2.20.0 таких целей 0/0).
- `--show`/`--resolve` по голому `<rel>` в парке неоднозначны, если файл есть в
  нескольких проектах — нужен `<project>/<rel>` (поведение по design §4.8/§4.10,
  e2e это фиксирует).
- R-01: риск остаётся только на смену поведения будущей версии opencode;
  структурная проверка frontmatter перед записью (§4.1/§4.8) сохранена.
- Модель-пиннинг (`init --model`) и `--check` расходятся по построению (п.4
  отклонений) — кандидат в следующую волну.
- Один живой прогон провайдера — точечная проверка, не регрессионный тест в CI
  (сеть/лимиты); в CI остаётся только структурная проверка frontmatter.

## Ревью

Мандат: `opencode run --standalone --agent worker-reviewer` (свежий процесс,
`--standalone`) по диффу T14 (`1205bae..a7f70aa`) и по интеграционному сценарию —
полнота покрытия REQ/NFR, отсутствие скрытых записей, качество фикстур.
Полный текст — `/private/tmp/t14-review.txt` (переменный tmp, вне репозитория).

Вердикт дословно:

```
SUMMARY: 0 critical / 0 major / 1 minor
VERDICT: APPROVED
```

Фактическое из ревью (не по отчёту): `npx tsc --noEmit` — 0; новый сценарий —
1 файл / 10 passed (12.9 s); точечные наборы остатков ревью — 5 файлов /
93 passed; в `src/`-диффе нет новых пишущих вызовов; XDG-изоляция e2e
подтверждена кодом.

Находка **MINOR-1** (deprecated + `created`: сверка держит exit 2, а `--check`
показывает пометку; реестр цель не нумерует) — принята как ограничение,
поведение не менялось: нумерация вернула бы «вечное решение» за файл, который
wolf не обновляет. Асимметрия названа в design §4.7 (коммит отчёта/уточнения);
в карте 2.20.0 deprecated-целей 0 файлов / 0 лиц. Цикл правок не потребовался
(0 critical/major).

## FRICTION

- `subagent` (worker-implementer) недоступен в этой сессии: `Subagent depth limit
reached (1)`. Второй раз подряд (Ф1–Ф3 — то же) → системная проблема
  платформы: L1 не может делегировать L2, весь объём волны ложится на контекст
  lead'а. Решение — увеличить `experimental.subagent_depth` либо явно
  зафиксировать линейный режим для волн.
- Изолированный `XDG_DATA_HOME` ломает провайдера opencode в живом прогоне
  («Free usage limit reached»: в пустом data-каталоге нет пакета провайдера) —
  для regression guard пришлось использовать живой `HOME` (как в исходном
  спайке). Ловушка задокументирована здесь, чтобы следующий прогон не тратил
  попытку.

## COMPLAINT

Нет: правила playbook (декомпозиция, промпт воркера, контракт ответа) не
противоречили брифу и не давали неверного результата; недоступность
`subagent` — сбой платформы (FRICTION), а не дефект правила.
