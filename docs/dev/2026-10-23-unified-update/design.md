---
slug: unified-update
title: unified-update — дизайн
status: draft
created: 2026-10-23
---

# unified-update — дизайн

Волна 2.19.0. Вход: requirements.md (approved, коммит 1d3c10d, CR-06
faf32a3), 14 REQ / 4 NFR. Исследования: research-artifacts-inventory.md
(классы артефактов), docs/dev/2026-10-23-ts-update-investigation/note.md,
docs/dev/2026-10-23-projects-analytics/note.md. Baseline: main 2.18.5.
Ссылки на код: revision `faf32a3`, формат `path:symbol`.

## Глоссарий

- **Карта (update-map)** — JSON-манифест полного состава релиза в корне
  npm-пакета (см. ADR-1).
- **Проектный шаг** — детерминированная последовательность над одним
  проектом: sync → удаления removed → посев лиц → миграция схемы → сверка.
- **Оркестратор прохода** — фаза реестрового обхода: список → подтверждение
  → проектные шаги → сводный отчёт.
- **Re-exec** — перезапуск новым бинарником после npm-фазы (ADR-2).
- **Статус пункта сверки** — updated / created / removed / seeded /
  skipped-live / deprecated-отмечен / unchanged / «требует решения» / error.
- **State-файл** — временный JSON с контекстом между фазами re-exec.

## Компоненты и ответственность

| Компонент                 | Ответственность                                                                              | Файл (baseline 2.18.5)                                  |
| ------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `upgrade` CLI             | npm-фаза (без изменений сути), re-exec, `--here`, `--check` парком                           | src/adapters/cli/commands/memory-upgrade.ts (расширить) |
| `upgrade-projects` hidden | Транспорт проектной фазы в новом бинарнике: список, подтверждение, обход, отчёт, exit-модель | src/adapters/cli/commands/upgrade-projects.ts (новый)   |
| Оркестратор прохода       | Планы из реестра + карты, статусы worktree/pinned/missing, изоляция сбоев, счётчики          | src/app/use-cases/upgrade-projects.ts (новый)           |
| Проектный шаг             | Композиция sync/посев/миграция/удаления/сверка; пофазная фиксация                            | src/app/use-cases/project-step.ts (новый)               |
| Движок сверки             | Ожидание из карты × факт из outcomes → статусы/расхождения                                   | src/app/use-cases/verify-against-map.ts (новый)         |
| Загрузчик карты           | Чтение/валидация update-map.json из packageRoot()                                            | src/adapters/fs/update-map.ts (новый)                   |
| Реестр                    | Поле `pinned`, уважение самолечением, маркер в списке                                        | src/adapters/fs/projects-registry.ts (расширить)        |
| Sync (deprecated)         | Прежняя семантика + redirect-подсказка; удаление в 2.20.0                                    | src/adapters/cli/commands/memory-sync.ts (расширить)    |
| Генератор карты           | Скелет из git diff base-set prev→cur + verify согласованности                                | scripts/generate-update-map.mjs (новый, репо-only)      |
| Карта данных              | Полный инвентарь состава релиза                                                              | update-map.json (новый, корень пакета, `files`)         |

Существующее без изменений: sync-base-set, seed-base-playbooks,
schema-guard (ленивая миграция), container/selfHealRegistry (P331),
face-механика, npm-фаза memory-upgrade.

## Контракты

### Карта (update-map.json; ADR-1)

```
UpdateMap {
  version: string              // полный X.Y.Z этого релиза
  prev: string                 // предыдущий релиз (база категорий)
  files: FileEntry[]           // ВСЕ файловые цели base-set (полный инвентарь)
  faces: FaceEntry[]           // все playbook-шаблоны базовых лиц
  agents_md: { category: Cat; mode: 'append-block' }
  schema_migrations: { from: int; to: int }[]   // пусто = без миграций
  outside_v1: string[]         // классы вне покрытия, явно
}
FileEntry { path: string; kind: 'agent'|'skill'|'command'|'plugin'; category: Cat }
FaceEntry  { template: string; owner_skill: string; category: Cat; seed: bool }
Cat = 'new' | 'changed' | 'unchanged' | 'deprecated' | 'removed'
```

Инварианты: `files` покрывает все 30 целей синка + AGENTS.md-блок;
`removed`-цель существует в prev и отсутствует в текущем templates/ (это и
проверяет верификатор); `deprecated`-цель остаётся в поставке.

### Фазы `wolf upgrade` (REQ-01/02/04/06)

```
wolf upgrade [--yes] [--check]
  ├─ --check → read-only сводка: npm view + реестр + карта (D-чек) → exit 0
  ├─ npm-фаза (существующий runUpgrade: linked-отказ, up-to-date, install)
  │    неудача → Error + exit 1; проекты не тронуты (REQ-01 AC3)
  └─ re-exec: <npmPrefix>/bin/wolf upgrade-projects --from <v> --to <v'>
       [--yes] --state <tmp.json>          (hidden-команда; ADR-2/5)
```

```mermaid
sequenceDiagram
  participant U as wolf upgrade (v_old)
  participant N as npm
  participant W as wolf upgrade-projects (v_new)
  U->>N: install -g mister-wolf@latest
  N-->>U: ok (или Error → exit 1)
  U->>W: spawn <prefix>/bin/wolf upgrade-projects --state tmp.json
  W->>W: реестр → планы (worktree/pinned/missing статусы)
  W->>U: (TTY) список+категории → подтверждение / --yes
  W->>W: per-project шаг (sync→removed→seed→migrate→verify)
  W->>U: сводный отчёт + счётчики; exit 0|1|2
```

State-файл: `{ from, to, startedAt }` — только контекст отчёта; идемпотентность
обеспечивается проектным шагом, не состоянием (NFR-02). Прерывание: Ctrl-C —
SIGINT в группу процессов (spawn, TTY); зафиксированные фазы остаются
завершёнными, повторный запуск доводит остальные (пофазная атомарность).

### Проектный шаг (REQ-03/07/11; ADR-3/4)

```
runProjectStep(deps, root, map, opts{confirmedRemovals}) → ProjectReport
  1. syncBaseSet(renderer, root)            // существующий: перезапись/
     //   skip-mutated/identical; outcomes — вход сверки. Точки фиксации —
     //   атомарная запись каждого файла (writeFileAtomic).
  2. removals: orphaned-файлы ∩ map.files[removed] → unlink (подтверждение
     //   уже дано на уровне списка REQ-02; AC REQ-11). orphaned ∖ removed
     //   → «требует решения» (дрейф без объявления).
  3. seedBasePlaybooks(root)                // существующий: сеять
     //   недостающие / skip живых / поглотить legacy атомарно; каждый
     //   объект — фиксация.
  4. ensureCurrentSchema(root)              // существующая ленивая миграция
     //   (backup), репорт «migrated/refused».
  5. verifyAgainstMap(map, {syncOutcomes, seedOutcomes, removals})
     //   расхождение → error пункта; mutated → «требует решения».
Память: единственная мутация — шаг 3 (посев), см. REQ-07.
```

### Сверка (verify-against-map)

Ожидание: `new|changed → updated|created`; `unchanged → unchanged|updated`;
`removed → removed`; `deprecated → файл на месте + deprecated-отмечен`;
`faces[seed] → seeded | skipped-live | legacy-absorbed`. Мутант (sync
skipped-mutated) перекрывает ожидание → «требует решения». Факт без
ожидания (файл вне карты) → «требует решения». Отсутствие статуса → error.
Сводка проекта: счётчики категорий + seeded + «требует решения» + errors.

### Exit-модель (REQ-05/06)

`0` — все пункты закрыты, нет error/«требует решения»; `1` — ≥1 error;
`2` — 0 error, ≥1 «требует решения» (различимо для CI). Парковые счётчики:
updated / up-to-date / worktree / pinned / missing / «требует решения» /
error + сумма по категориям карты + досеяно лиц.

### `--here` (REQ-14)

`runProjectStep` напрямую из текущего бинарника: без npm, без re-exec, без
реестра; подтверждение — одно проектный план (правила REQ-02), отчёт —
один проект (REQ-05). Guard: нет `.wolf/memory` в cwd → UserFacingError
«run wolf init first» (exit 1).

### pinned (REQ-13)

`RegisteredProject.pinned?: boolean` (yaml: `pinned: true`). Самолечение
P331 уже уважает: registerIfAbsentSync добавляет запись только при её
отсутствии — существующая pinned-запись не перезаписывается (изменение кода
не требуется, добавить guard-тест). Отображение: статус `pinned` в списке
upgrade + маркер `[pinned]` в `wolf projects`.

### Депрекация sync (REQ-07)

memorySyncCommand сохраняет действие; в вывод добавляется строка
«DEPRECATED: wolf sync is superseded by `wolf upgrade --here`; removed in
2.20.0». Удаление в 2.20.0 — через removed-commands.ts (прецедент 2.13
§10.4: подсказка при unknown command). CHANGELOG-заметки с 2.19.0 указывают
`upgrade`.

## Терминальный вывод (REQ-15, ADR-6)

### Контракт renderer'а

```
renderReport(node: ReportNode, env: TermEnv) → string   // один вход — два режима
ReportNode =
  | { kind: 'banner'; version: string }                 // шапка с логотипом
  | { kind: 'section'; title: string; children: ReportNode[] }
  | { kind: 'line'; marker: Marker; text: string; dim?: bool }
  | { kind: 'summary'; counters: Counter[]; done: bool }
Marker = 'info' | 'ok' | 'warn' | 'error' | 'skip'
TermEnv = { tty: bool; colors: 'truecolor'|'256'|'16'|'mono'; width: int }
```

Renderer — чистая функция над деревом (без I/O): styled-режим строит
рамки/цвет по TermEnv, plain — плоские строки с текстовыми префиксами.
Данные (статусы, счётчики) формируют оркестратор/project-step; renderer
не знает про реестр и карту.

### Палитра (соответствие статусной модели REQ-05/11)

| Статус                              | Маркер | Цвет (truecolor) | plain-префикс     |
| ----------------------------------- | ------ | ---------------- | ----------------- |
| инфо/шаг фазы                       | ●      | cyan             | `-`               |
| updated/created/seeded/removed (ок) | ●      | green            | `✓` → plain `ok:` |
| up-to-date/unchanged                | ●      | dim green        | `ok:`             |
| «требует решения», deprecated       | ▲      | yellow           | `warn:`           |
| error                               | ✖      | red              | `error:`          |
| pinned / worktree / missing         | ●      | dim              | `skip:`           |

Правило различимости: статус несёт и маркер, и цвет, и текст — в моно
(16/mono) различимость сохраняют маркер + слово (REQ-15 AC-3). Spinner —
только TTY (npm-фаза, ожидание реестра); в не-TTY печатается строка
`... npm install -g mister-wolf@latest` без анимации.

### Логотип (эскизы; выбор — владелец в пакете утверждения)

Вариант A — блочный вордмарк (≤ 44 колонок), бренд-палитра Wolf Dossier:

```
 ██╗    ██╗███████╗ ██████╗ ███████╗     ╔═╗╔═╗
 ██║    ██║██╔════╝██╔═══██╗╚══███╔╝    ╔═╝╚╗║
 ██║ █╗ ██║█████╗  ██║   ██║  ███╔╝     ╚╗  ╔╝║
 ██║███╗██║██╔══╝  ██║   ██║ ███╔╝       ║██║
 ╚███╔███╔╝███████╗╚██████╔╝███████╗    ╚═══╝
  ╚══╝╚══╝ ╚══════╝ ╚═════╝ ╚══════╝   upgrade 2.19.0
```

plain-версия: `Mr Wolf upgrade 2.19.0`.

Вариант B — глиф морды + однострочный вордмарк (узкий, ≤ 60):

```
        ,     ,
       (\____/)
        (_.._)  Mr Wolf — upgrade 2.19.0
```

plain: `Mr Wolf — upgrade 2.19.0`.

Вариант C — минимал-банер (рамка секции, без графики):

```
┌ Mr Wolf ─ upgrade 2.19.0 ─────────────┐
```

plain: `Mr Wolf — upgrade 2.19.0`.

Выбор фиксируется владельцем; все три — моно-совместимы, ≤ 72 колонок
(варианты B/C — ≤ 60), plain-фоллбек одинаков.

### Вайрфрейты

(1) `wolf upgrade` — проход по парку (styled; эталон владельца):

```
┌ Mr Wolf — upgrade 2.19.0 ───────────────────────────┐
│ ● wolf 2.18.5 → 2.19.0 … ok                         │
│ ● 4 проекта в реестре (1 pinned, 1 worktree)        │
│ │ plan: trading-signal 2.16.2 → (+2 skills, seed×2) │
│ │ plan: Tender (нет лиц) → seed×6                    │
│ ▶ обновить 2 проекта? [Y/n]                          │
│ ● trading-signal                                     │
│   ● base-set: 30 файлов → updated                    │
│   ● лица: executor-lead seeded, worker-* skip-live   │
│   ● сверка по карте: 33/33 ok                        │
│ ● Tender                                             │
│   ● base-set: 29 updated, ▲ 1 skipped-mutated        │
│   ● сверка: ▲ 1 «требует решения»                    │
└ Итог: обновлено 2 · требует решения 1 · ошибок 0 ·   │
  досеяно лиц 8 — Done                                 │
```

plain-фоллбек: те же строки плоско (`Mr Wolf upgrade 2.19.0`, `- wolf
2.18.5 → 2.19.0`, `ok: trading-signal …`, `warn: 1 skipped-mutated`, …),
без рамок/цвета.

(2) `wolf upgrade --check`:

```
┌ Mr Wolf — check ─────────────────────────────────────┐
│ ● wolf 2.18.5 (latest: 2.19.0)                       │
│ ● trading-signal: состав 2.17.1 (штамп 2.16.2) — отстаёт │
│ ● adminvps: состав 2.17.0 — отстаёт                   │
│ ● Tender: вне покрытия (нет карты < 2.19.0) — по штампу │
└ актуальных 0 · отстающих 3 — Done (read-only)        │
```

(3) `wolf upgrade --here` — один проект, та же структура секций без
парковой сводки.

### Склейка фаз re-exec (ADR-2)

Шапку-логотип печатает ТОЛЬКО фаза 1 (старый бинарник); re-exec вызывает
`upgrade-projects --no-banner`, фаза 2 продолжает уже открытую секцию
(без второй шапки). Провал npm-фазы — фаза 1 закрывает секцию своим
`└ Failed` (exit 1). Состояние «шапка напечатана» передавать не нужно —
управляет им только флаг.

### Матрица деградации

| Среда             | Режим                                                                  | Рамки | Цвет            | Логотип     |
| ----------------- | ---------------------------------------------------------------------- | ----- | --------------- | ----------- |
| TTY truecolor     | styled                                                                 | да    | truecolor       | графический |
| TTY 256           | styled                                                                 | да    | 256-палитра     | графический |
| TTY 16            | styled                                                                 | да    | базовая палитра | графический |
| TTY + NO_COLOR    | plain                                                                  | нет   | нет             | текстовый   |
| пайп/CI           | plain                                                                  | нет   | нет             | текстовый   |
| Windows-терминалы | вне ограничений платформы (macOS-first, §6); отметить при портировании |       |                 |             |

Детект — существующие прецеденты: colorsEnabled (src/domain/facet-colors.ts,
NO_COLOR/pipe), TERM/COLORTERM — стандартные переменные.

### Тест-влияние (для будущего test-plan)

- Snapshot-тесты plain-вывода всех трёх поверхностей (детерминированные
  счётчики/статусы) — основной оракул.
- Styled-ветка: юнит-тесты renderer'а с TermEnv-фейками (truecolor/256/16/
  mono) без эмуляции TTY.
- e2e: plain через пайп (существующий паттерн P212 — решение о цвете один
  раз на вывод).

## ADR-карточки

- **ADR-1: Карта — один JSON полного инвентаря в корне пакета.**
  Контекст: нужен источник истины состава; штампы недостоверны
  (инвентаризация §3.4). Альтернативы: (а) каталог карт всех версий в
  пакете; (б) markdown-карта; (в) деривация из git на лету у клиента.
  Выбор: один `update-map.json` текущей версии (категории относительно
  `prev`), история — в git-тегах репо. Обоснование: сверке нужна только
  карта установленного бинарника (REQ-10: полный инвентарь, не компоновка
  дельт); каталог версий раздувает пакет; деривация требует git у клиента.
  Последствия: генератор берёт prev-карту из git-тега; риск — рассинхрон с
  templates/, закрывается верификатором в CI (guard-тест, прецедент
  cli-reference-guard). REQ-10/11/12.
- **ADR-2: Re-exec нового бинарника для проектной фазы.**
  Контекст: REQ-04 — проход новой версией; upgrade стартует старым кодом.
  Альтернативы: in-process (невозможно: dist старой версии в памяти),
  «перезапусти сам» (ручной шаг против цели волны). Выбор: spawn
  `<npmPrefix>/bin/wolf upgrade-projects` (hidden). Последствия: новый
  бинарник отвечает за список/подтверждение/отчёт; состояние — state-файл;
  linked-установка → npm-фаза уже отказывает (существующий контракт), при
  up-to-date re-exec не нужен (проектная фаза запускается только если была
  установка или явный флаг повторной доводки `--projects`). REQ-01/04/06.
- **ADR-3: Оркестратор поверх существующих use-cases.**
  Контекст: sync/seed/migration уже имеют нужную семантику и тесты.
  Альтернативы: монолитный новый проход; только sync (без посева — не
  закрывает REQ-03). Выбор: новый тонкий project-step, компонующий
  syncBaseSet + seedBasePlaybooks + ensureCurrentSchema + удаления +
  сверку. Последствия: семантика посева не дублируется; риск расхождения
  статусов sync ↔ сверки закрывается контрактом outcomes. REQ-03/07/11.
- **ADR-4: Удаления — в момент прохода, по подтверждённому списку;
  deprecated не удаляет.**
  Альтернативы: отложенная очередь удалений на следующий запуск; отдельный
  интерактив per-файл. Выбор: единственное подтверждение списка (решение
  L0 по G4), removed-файлы удаляются в шаге 2, deprecated остаётся с
  репортом (REQ-11). Последствия: нет очереди состояний; при отклонении
  списка прохода нет вовсе (REQ-02). REQ-02/11.
- **ADR-5: Скрытая команда `upgrade-projects` как транспорт фазы.**
  Альтернативы: флаг `--projects` на upgrade (путает фазы старого/нового
  бинарника); standalone публичная команда (лишняя поверхность CLI).
  Выбор: hidden-команда в COMMANDS (прецедент hidden-команд 2.18.5),
  вызывается только re-exec'ом. Последствия: публичная поверхность CLI не
  растёт; cli.md-референс — только upgrade/sync меняются. REQ-01/04.
- **ADR-6: Renderer-модуль как стандарт вывода; в 2.19.0 — только
  upgrade-поверхности.**
  Контекст: решение владельца о стандарте терминального вывода (opencode
  update-стайл); риск — разнобой стилей по командам и рост scope волны.
  Альтернативы: (а) стилизовать каждую команду точечно; (б) отложить
  стандарт на 2.20.0. Выбор: переиспользуемый чистый renderer
  (ReportNode → styled/plain) + применение в 2.19.0 только к upgrade /
  --check / --here (допущение L0, на подтверждение владельцем в пакете).
  Последствия: презентация отделена от данных (оркестраторы кормят
  деревом); plain-режим = оракул для snapshot-тестов; перевод остальных
  команд — инкрементально после 2.19.0 без новых решений. Риск: владелец
  захочет шире в 2.19.0 — тогда scope-решение через L0 (не молча).
  REQ-15/05/02/08, NFR-04 (не логирование).

## Покрытие REQ/NFR

| REQ                                     | Решение                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| REQ-01 единая команда                   | Фазы upgrade + re-exec (ADR-2); npm-сбой → exit 1 без проектов                     |
| REQ-02 список/подтверждение             | Оркестратор: планы из карты+реестра, статусы worktree/pinned/missing, --yes/не-TTY |
| REQ-03 проектный шаг                    | Композиция sync+seed (ADR-3), точки фиксации                                       |
| REQ-04 новая версия                     | Re-exec (ADR-2)                                                                    |
| REQ-05 сводный отчёт                    | Счётчики оркестратора; формат одного проекта для --here                            |
| REQ-06 изоляция сбоев                   | try/catch на проект, exit 0/1/2                                                    |
| REQ-07 память вне посева                | Инвариант шага 3; sync-алиас до 2.20.0 + redirect                                  |
| REQ-08 --check                          | Read-only сводка: npm view + штампы + карта                                        |
| REQ-09 подсказка о незарегистрированных | Ограниченный скан после отчёта (maxdepth 4, топ-5, ≤5 с)                           |
| REQ-10 карта                            | update-map.json + генератор + верификатор (ADR-1)                                  |
| REQ-11 проход по карте                  | project-step + verify-against-map; removals/deprecated/миграции                    |
| REQ-12 карта в релизе                   | Шаг чек-листа + guard-тест CI (ADR-1)                                              |
| REQ-13 pinned                           | Поле реестра; самолечение уже уважает; guard-тест                                  |
| REQ-14 --here                           | Прямой вызов runProjectStep; guard cwd                                             |
| REQ-15 терминальный вывод               | report-renderer: ReportNode → styled/plain (ADR-6); склейка re-exec --no-banner    |
| NFR-01 сохранность                      | Инварианты шагов + слепки (объекты/SHA мутированных) в приёмке                     |
| NFR-02 идемпотентность                  | Пофазная фиксация; повтор = sync identical + seed skip-live; без дубликатов        |
| NFR-03 время                            | Замер per-project (stdout отчёта приёмки, не лог-канал); ≤7 с/шаг                  |
| NFR-04 observability                    | Существующие events.jsonl посева + stdout; новых каналов нет                       |

## Ссылки на NFR

- NFR-01: механика — шаги 1–4 не удаляют память и не перезаписывают
  мутированное; сверка read-only. Приёмочный протокол: слепок множества id
  - SHA мутированных файлов до/после, включая прерывание на k-м проекте.
- NFR-02: повторный запуск после сбоя — новые планы из той же карты;
  зафиксированные фазы дают identical/skip; дубликаты исключены семантикой
  seed (живое лицо → skip).
- NFR-03: измеримо как wall-time шага (обёртка в runProjectStep, вывод в
  приёмочном отчёте); npm-фаза и скан REQ-09 вне бюджета.
- NFR-04: посев пишет стандартные face-события (существующий журнал);
  отчёт — stdout; изменений форматов нет.

## Trust-границы и безопасность

- npm-фаза — единственная сетевая операция (существующий контракт,
  registry через `npm view/install`); карта читается только из
  packageRoot() установленного пакета (не из сети, не из проекта).
- Re-exec исполняет бинарник из npm-префикса — та же доверенная зона, что
  и текущий wolf; argv валидируется (commander), state-файл — ОС-tmp с
  правами по умолчанию, секретов не содержит.
- Удаления ограничены путями из карты (штампованные цели base-set);
  произвольные пути не принимаются (валидация префиксов .opencode/ и
  AGENTS.md).
- Чужие/локальные артефакты (инвентаризация класс 18–19) вне карты — не
  трогаются; это проверяет сверка (факт без ожидания → «требует решения»,
  не мутация).

## Вне дизайна (не-цели)

Логирование/новый observability (2.20.0), async learning (2.20.0),
сетевые/мультиюзерные среды, обновление docs/reference/cli.md и CHANGELOG
(downstream этапа реализации: cli-reference-guard потребует актуализировать
справочник при изменении описаний upgrade/sync — урок «cli-reference-guard
drift»), таксономия config.yaml в проходе (вне v1 карты).

## Открытые дизайн-вопросы

1. Финальный wire-формат update-map.json (имена полей/enum kind) —
   фиксируется в реализации вместе с zod-схемой и guard-тестом; структура
   и инварианты зафиксированы здесь.
2. Поведение `upgrade-projects` при обнаружении схемы проекта «из
   будущего» (schema_version > текущей): предложение — честный error
   пункта (как schema-guard), продолжение обхода. Принимается в реализации
   с тестом.
3. Нужен ли флаг `--projects` (доводка проектов без npm-фазы, если CLI уже
   свежий) как публичный тонкий флаг вместо повторного re-exec при
   up-to-date — мини-вопрос плану; по умолчанию: при up-to-date проектная
   фаза не запускается (AC REQ-08 покрывает осмотр).
4. Выбор логотипа из трёх эскизов (A блочный / B глиф / C минимал) —
   владелец в пакете утверждения (REQ-15); spinner принят TTY-only.
5. Поведение рамок при терминале уже 60–72 колонок (усечение пути vs
   перенос) — решение в реализации со snapshot-тестами на ширину 60/80/120.
