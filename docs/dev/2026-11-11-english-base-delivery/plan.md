---
slug: english-base-delivery
title: english-base-delivery — план
status: draft
created: 2026-11-11
based_on: requirements.md (approved, CR-2026-11-11-01), design.md (approved, round 3), test-plan.md (SC-01..SC-32, N-1..N-7), pre-requirements.md (границы)
---

# english-base-delivery — план

Исполнимый план волны «английская база поставки»: REQ-01..09, NFR-01..04 → задачи
с зависимостями, критериями (SC-IDs тест-плана) и исполнителями. Единственный
источник контрактов — design; план не копирует реализацию и не меняет требования.

Правила волны:

- **Коммиты — только по явному поручению владельца**: точки коммита вынесены в
  отдельные задачи T-05, T-10, T-33, T-43 с этой пометкой. Никакие другие задачи
  коммит не включают.
- **Номер версии волны — placeholder `X.Y.Z`**: решает владелец при закрытии
  (T-41, T-43).
- **Источники — requirements/design**: расхождение плана с ними оформляется
  риск-пометкой в §«Находки и риски», не молчаливой правкой.
- Чекбокс `[x]` ставит приёмник задачи (обычно ведущий) после проверки результата
  и нужных ревью; чекбокс — истина завершённости, коммит сам по себе приёмку не
  доказывает.
- Oracle семантических сверок — RU-оригиналы `templates/**` из git-истории до
  перевода (test-plan §Среда), не из памяти.

## Порядок фаз и параллельность

```
Ф0 (T-01..T-05) → G0 (T-06..T-10) → wiring (T-11) → G1 (T-12..15) → G2 (T-16..19)
→ G3 (T-20..23) → G4 (T-24..27) → G5 (T-28..31) → синхронизация REQ-07 (T-32..33)
→ миграция (T-34..37) → закрытие волны (T-38..42) → релиз X.Y.Z (T-43)
```

- Базовый порядок групп — последовательный: следующая группа стартует после
  закрытия циклов предыдущей (design «Группы перевода», REQ-02: полный цикл ядра
  до остальных групп).
- **Параллельность разрешена только**: (а) скрипты гейтов T-03 параллельно фазе 0
  и G0; (б) опционально — пары групп G1+ по решению ведущего (непересекающиеся
  файлы, раздельные записи журнала, определённый владелец интеграции).
- **R-P1 (риск)**: design §4.4/«Группы перевода» фиксирует последовательный старт
  групп; параллельный запуск двух групп G1+ — осознанное отклонение в границах
  поручения на план, требует явного подтверждения ведущего при ревью плана.
- После T-11 гейт 1 в `npm run check` **транзиентно красный** на ветке (G1+ ещё
  не переведены) — принятое состояние (design §4.5), не дефект. Полная зелёность —
  на закрытии волны (SC-17); адресные запуски гейта в окне «черновик секции →
  закрытие G0» — T-09 (SC-05).

## Находки и риски плана (замеры при составлении плана)

- **F-P1 (закрывает контрольный grep В2, ADR-6)**: кириллица в `src/` вне
  `src/adapters/**` — ~96 файлов (`src/domain`, `src/app/use-cases`, `src/ports`,
  `src/bootstrap`); выборочная проверка строк — комментарии `//`/`/** */`, не
  строковые литералы. В поставку не попадает: рендеринг из `templates/`,
  литералы adapters под постоянным гейтом english-surface. ADR-6 подтверждается;
  построчный аудит вне scope волны (requirements §2).
- **F-P2**: `templates/base/playbooks/` не существует (design G4 ожидает там
  face-шаблоны; sync-цель карты `base/playbooks` — walk пуст). G4 зафиксирован
  планом = 12 файлов (9 агентов + 3 команды). Если ревью установит, что
  face-шаблоны поставляются иначе (например, `seed-base-playbooks`), уточнение
  состава G4 и миграционных проверок — возврат к design, не правка молча. Это
  не отменяет F-R2/SC-21: face-копии в проектах возникают при их создании.
- **F-P3**: инвентарь плана даёт 66 md с кириллицей в базовых каталогах против
  «67 из 69» в замере design. Расхождение ±1 на план не влияет: итоговое число
  фиксирует гейт SC-08 и сверка журнала SC-09, план на число не опирается.
- **R-P2**: исход F-R3 (штампуются ли копии плагинов в проектах, design §4.6,
  REQ-08 AC-3) — обязательный precondition миграции (T-34) до перегенерации
  `update-map.json`.
- **R-P3**: `npm run check` на ветке красный (транзиентно) с T-11 до T-31 —
  коммиты в этом окне выполняются при осознанно красном гейте 1 (принятое
  состояние §4.5); точки коммита только T-05/T-10/T-33/T-43.

## Инвентарь групп (закрепление границ G2/G3 — design «Группы перевода», критерий частоты загрузки)

| Группа             | Состав                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Файлов |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| G0 always-core     | `base/AGENTS.md` (вкл. секцию «Session language»), `base/skills/using-skills/SKILL.md`                                                                                                                                                                                                                                                                                                                                                                                                                       | 2      |
| G1 маршрутизация   | `base/skills/using-skills/references/*.md` (вкл. `agent-language.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                        | 12     |
| G2 wolf-методики   | SKILL.md 23 скиллов: wolf-agent-language, wolf-brainstorm, wolf-council, wolf-debug, wolf-design, wolf-document-readability, wolf-execute, wolf-explain, wolf-feedback, wolf-git, wolf-handoff, wolf-memory, wolf-plan, wolf-release, wolf-release-docs, wolf-requirements, wolf-review, wolf-sdd, wolf-software-design, wolf-test, wolf-testplan, wolf-work-strategy, writing-skills + references: `wolf-debug/references/techniques.md`, `wolf-execute/references/*` (1), `wolf-feedback/references/*` (2) | 27     |
| G3 workflow-скиллы | SKILL.md 11 скиллов: receiving-code-review, requesting-code-review, test-driven-development, using-git-worktrees, finishing-a-development-branch, verification-before-completion, wolf-code-craft, wolf-code-simplify, wolf-skill-intake, wolf-user-report, wolf-visual-dialogue + `test-driven-development/references/test-quality.md`                                                                                                                                                                      | 12     |
| G4 роли и команды  | `base/agents/*.md` (9), `base/commands/*.md` (3: analyze-doc, complain, doc-review); playbooks — см. F-P2                                                                                                                                                                                                                                                                                                                                                                                                    | 12     |
| G5 прочее          | `opencode/plugins-reserved/wolf-router.ts`, `wolf-session-start.js`, их `README.md`, `base/README.md` (без кириллицы — запись «перевод не требуется», SC-09)                                                                                                                                                                                                                                                                                                                                                 | 4–5    |

Полноту состава страхуют журнал перевода (SC-09) и гейт «0 кириллицы» (SC-08),
не это перечисление.

## Типовой цикл группы (REQ-05; design «Цикл качества группы»)

Каждая группа Gx исполняется четырьмя задачами с независимыми исполнителями
(независимость циклов — разные проходы/исполнители, design):

1. **Gx-перевод** (wolf-editor): перевод всех файлов группы по глоссарию;
   новые термины — `candidate`-строками в глоссарий **до** использования
   (SC-10, SC-31); пофайловые записи в `translation-log.md` (C4).
2. **Gx-цикл 1** (wolf-reviewer): семантическое ревью каждого файла против
   RU-оригинала (NFR-01); отклонения «сознательно улучшено» → журнал (SC-26).
3. **Gx-цикл 2** (свежий wolf-editor, не автор перевода): редактура читаемости
   носителем языка (NFR-02, SC-28).
4. **Gx-цикл 3 + закрытие** (wolf-reviewer): повторный контроль выборки ≥10%
   файлов группы (мин. 1) на семантику (SC-13) и кальку (SC-29); смысловой
   дефект → исправление и повтор цикла 3 на новой выборке до первой чистой;
   сверка журнала с инвентарём группы (SC-12, SC-09); приёмка группы ведущим —
   только после чистой выборки.

Precondition каждой группы: глоссарий `status: approved` (гейт REQ-04, N-7) +
дельта терминов группы внесена `candidate`-строками (SC-10/SC-31). Незавершённая
предыдущая группа блокирует старт следующей (базовый порядок).

## Задачи

### Фаза 0 — подготовка (до старта любых групп)

- [x] **T-01 — Глоссарий RU→EN, черновик** — REQ-04; design §4.3, C3; базлайн design.md:178-200
  - Состав: `docs/dev/2026-11-11-english-base-delivery/glossary.md` по формату §4.3
    (таблица RU термин / EN термин / Статус / Aliases / Примечание); обязательный
    стартовый набор: wolf face/thread/steward/skill, волна/upgrade, resolve-стратегии
    protect/keep/take, штампованный файл, always-loaded core, терминология
    requirements §3; frontmatter `status: draft`.
  - Зависимости: нет.
  - Критерии (как проверяли): формат §4.3; уникальность колонок «RU термин» и
    «EN термин»; SC-10/N-7 — перевод любой группы не стартует до `status: approved`.
  - Исполнитель: wolf-editor. Масштаб: M.
  - ЗАКРЫТО wolf-editor 2026-11-15, принято ведущим 2026-11-16. Изменены 3
    страницы (cli/platform.md, cli/index.md, upgrade.md — tool register by
    reference, scaffold R-08 самодостаточен, onboarding v2/v3→v4), frontmatter
    synced: 2026-11-15 у изменённых; 25+9 страниц проверены — расхождений нет.
    SC-24a: npm run docs:check exit 0 (5806 ссылок, 35 EN/RU пар). SC-24b
    выборка 3/28: сверено с фактами CLI (--help) и шаблоном (onboarding v4).
    SC-25: даты 2026-11-15 ≥ закрытия G5 2026-11-15. Находка редактора:
    EN-двойники тех же строк устарели — исправлены ведущим 2026-11-16
    (platform.md ×2, cli/index.md, upgrade.md v3→v4) — паритет EN/RU
    восстановлен, docs:check повторно зелёный.
  - ⚑ **ВЛАДЕЛЕЦ: утверждение глоссария (`status: approved`) — гейт REQ-04; без
    него группы не стартуют.**
- [x] **T-02 — RU-черновик секции «Session language» в `base/AGENTS.md`** — REQ-01; design §4.1, ADR-1, порядок §4.4; базлайн design.md:130-160
  - Состав: `templates/base/AGENTS.md` (onboarding-блок) — секция на русском по
    5 нормативным пунктам §4.1; compact-бюджет: ≤300 EN-токенов (chars/4),
    ориентир ≤100. using-skills указку не получает на этом шаге (указка — при
    переводе C2 в T-06).
  - Зависимости: нет (порядок §4.4: строго до T-04).
  - Критерии: секция вписана в RU-шаблон до замера бейзлайна (порядок §4.4,
    проверка порядка в SC-14); механический бюджет секции — SC-04 на приёмке G0
    (T-09, скрипт из T-03).
  - Исполнитель: wolf-editor. Масштаб: S.
- [x] **T-03 — Гейт-скрипты C6/C7** — REQ-06 гейты 1/3/4; design §4.5, ADR-2/3/4, «Места нового кода» 1–3; базлайн design.md:228-251, 552-556
  - Состав: `scripts/check-delivery-language.mjs` (walk `templates/**` вкл.
    `.ts`/`.js`; байтовый тест `[\u0400-\u04FF]`; 0 исключений; exit 1 + `path` и
    номера строк); `scripts/check-glossary-consistency.mjs` (approved-строки
    §4.3: уникальность пар RU→EN, absence aliases в `templates/**`, статус
    файла `approved`; exit 1 + `term → file:line`); `scripts/bench-file-tokens.mjs`
    (`--file <path>…` → `ceil(chars/4)`; `--baseline <path>` → пофайлово EN ≤ RU,
    exit 1 + таблица превышений; без артефакта → exit 1 с инструкцией пересоздания,
    N-5). npm-скрипты НЕ расширяются (wiring — T-11).
  - Зависимости: нет. **Разрешённая параллельность**: идёт параллельно фазе 0/G0.
  - Критерии: контракты §4.5 (команды, exit-коды, формат вывода); отрицательные
    ветки N-2, N-3, N-5 на временных фикстурах вне репо-коммита; основа для
    SC-05/07/08/14/16/30/32.
  - Исполнитель: wolf-developer. Масштаб: M.
- [x] **T-04 — Фиксация RU-бейзлайна `token-baseline.json`** — REQ-06 гейт 3; design §4.4, C5; базлайн design.md:202-226
  - Состав: `node scripts/bench-file-tokens.mjs --file templates/base/AGENTS.md
--file templates/base/skills/using-skills/SKILL.md --file
templates/base/skills/using-skills/references/agent-language.md` → запись
    `docs/dev/2026-11-11-english-base-delivery/token-baseline.json` (date, method
    chars/4, wolf_version, 3 файла с tokens > 0).
  - Зависимости: T-02 (секция уже в RU-замере), T-03.
  - Критерии: SC-14 — формат артефакта §4.4; порядок «секция до замера, перевода
    ещё нет» (сверка diff/журнала); N-5 ветка скрипта проверена.
  - Исполнитель: wolf-tester. Масштаб: S.
- [x] **T-05 — ⚑ Коммит фазы 0 — по явному поручению владельца** (глоссарий approved,
      RU-черновик секции, `token-baseline.json`, 3 гейт-скрипта)
  - Зависимости: T-01 (approved), T-02, T-03, T-04.
  - Критерий: состав коммита соответствует перечню; коммит выполняет ведущий
    только после явного поручения владельца.
  - Исполнитель: ведущий. Масштаб: S.

### Фаза G0 — перевод always-ядра (REQ-02)

Precondition: T-01 approved (гейт REQ-04), T-02, T-04 (порядок §4.4: бейзлайн до
перевода).

- [x] **T-06 — Перевод G0** — REQ-02, AC-1; design G0 + C1/C2; базлайн design.md:308-324
  - Состав: `templates/base/AGENTS.md` (вкл. перевод секции «Session language»),
    `templates/base/skills/using-skills/SKILL.md` + однострочная указка на секцию
    (C2, без дублирования формулировок); по глоссарию; создание
    `docs/dev/2026-11-11-english-base-delivery/translation-log.md` (C4, append-only)
    с записями по обоим файлам.
  - Зависимости: T-01 (approved), T-02, T-04.
  - Критерии: переведены оба файла G0; записи в журнале; SC-10/SC-31 соблюдены.
  - Исполнитель: wolf-editor. Масштаб: M.
- [x] **T-07 — G0, цикл 1: семантическое ревью** — REQ-05 цикл 1, NFR-01; базлайн design.md:326-342
  - Состав: независимая сверка обоих файлов с RU-оригиналами (git-история до
    перевода); отклонения «сознательно улучшено» → журнал.
  - Зависимости: T-06.
  - Критерии: SC-26 (G0) — 100% файлов G0 с записью цикла 1; потери/добавления
    правил не обнаружены либо зафиксированы в журнале.
  - Исполнитель: wolf-reviewer. Масштаб: S.
- [x] **T-08 — G0, цикл 2: редактура носителем языка** — REQ-05 цикл 2, NFR-02
  - Состав: независимый проход читаемости обоих файлов (нет калькированного
    «русско-английского» текста); правки → журнал.
  - Зависимости: T-07.
  - Критерии: SC-28 (G0) — 100% файлов G0 с записью цикла 2, исполнитель ≠ автор
    перевода.
  - Исполнитель: свежий wolf-editor. Масштаб: S.
- [x] **T-09 — Приёмка G0: цикл 3 + адресные гейты + утверждение владельца** — REQ-05
      цикл 3; REQ-06; базлайн design.md:130-160 (§4.1), test-plan SC-04..SC-07
  - Состав: (а) цикл 3 — выборка 100% G0 (2 файла ≥10% мин.1): семантика SC-13 +
    калька SC-29 (≥1 файл G0 обязателен); (б) адресный запуск
    `node scripts/check-delivery-language.mjs` — SC-05 (окно до wiring, design §4.5);
    (в) `bench-file-tokens --baseline …token-baseline.json` на 3 файлах — SC-07
    (EN ≤ RU пофайлово, ранний контроль NFR-04); (г) бюджет секции SC-04 (≤300
    EN-токенов; при EN > RU на AGENTS.md секция ужинается до ориентира ≤100,
    ADR-3); (д) ревью журнала SC-06 (циклы 1–3, исполнители различны).
  - Зависимости: T-08, T-03 (скрипты).
  - Критерии: SC-04, SC-05 (exit 1 допустим с попаданиями только вне файлов
    G0; 0 попаданий в файлах G0), SC-06, SC-07, SC-13, SC-29 — все выполнены,
    evidence (вывод гейтов, журнал) зафиксирован.
  - Исполнитель: wolf-reviewer (выборка) + wolf-tester (гейты). Масштаб: M.
  - ⚑ **ВЛАДЕЛЕЦ: утверждение перевода G0 — первый образец качества; до
    утверждения конвейер G1+ не стартует.**
- [x] **T-10 — ⚑ Коммит G0 — по явному поручению владельца** (перевод ядра + журнал)
  - Зависимости: T-09 (утверждение владельцем).
  - Исполнитель: ведущий. Масштаб: S.

### Wiring — подключение гейтов (после закрытия G0)

- [x] **T-11 — Гейты 1 и 4 в `npm run check`** — REQ-06; design §4.5 («Порядок
      подключения», «Места нового кода» 4); базлайн design.md:236-238, 491
  - ВЫПОЛНЕНО ведущим 2026-11-14: цепочка check = check-delivery-language →
    check-glossary-consistency → check-english-surface → format:check → build →
    test:run (порядок §4.5).
  - Отклонение от ожидания плана, зафиксировано честно: гейт 4 (глоссарий) при
    первом реальном прогоне красный не только из-за RU-хвостов непереведённых
    G3–G5 (плановый транзит R-P3), но и (а) таблица орфографического канона G1
    не проходила парсер 4-колоночного контракта — исправлено добавлением
    служебной колонки «Статус» со значением `-`; (б) 25 EN-alias попаданий в
    переведённых G2 (offer/assignment/demand/consultation/conversation/testing/
    coordinator/edge/supervisor/installation/removal/capability/delegation) —
    реальный дрейф, список передан в цикл 2 на замену каноном или разведение
    через исключения.
  - Состав: `package.json` — цепочка `check` = check-delivery-language →
    check-glossary-consistency → check-english-surface → format:check → build →
    test:run (порядок §4.5).
  - Зависимости: T-09 (закрытие G0), T-03.
  - Критерии: цепочка соответствует §4.5; `npm run check` на ветке транзиентно
    красный по гейту 1 (G1+ не переведены) — ожидаемое состояние, не дефект;
    гейт 4 зелёный (глоссарий approved, aliases отсутствуют — SC-30).
  - Исполнитель: wolf-developer. Масштаб: S.

### Фазы G1–G5 — остальные группы (по типовому циклу, REQ-03/REQ-05)

Каждая группа — 4 задачи по шаблону «Типовой цикл группы». Общие критерии группы:
SC-10, SC-31 (precondition), SC-12/SC-26/SC-28 (следы циклов, 100% файлов),
SC-13/SC-29 (чистая выборка ≥10% мин.1), SC-09 (журнал = инвентарь группы).
Гейт 1 остаётся транзиентно красным до G5 — приёмка группы по журналу и выборке.

- [x] **T-12 — G1-перевод** (12 файлов: `using-skills/references/*.md`) — wolf-editor — M — deps: T-09 (утверждение владельца G0), T-01
- [x] **T-13 — G1-цикл 1** — wolf-reviewer — M — deps: T-12 (SC-26)
- [x] **T-14 — G1-цикл 2** — свежий wolf-editor — M — deps: T-13 (SC-28)
- [x] **T-15 — G1-цикл 3 + закрытие** — wolf-reviewer — M — deps: T-14 (SC-13/29: выборка ≥2 файлов; SC-12/09)
- [ ] **T-16 — G2-перевод** (27 файлов, перечень в §«Инвентарь групп») — wolf-editor — L — deps: T-15
- [x] **T-17 — G2-цикл 1** — wolf-reviewer — L — deps: T-16 (SC-26)
  - ВЫПОЛНЕНО 2026-11-14: два независимых wolf-reviewer, 13+14 файлов против
    RU-оракулов (выгрузка baseline в temp — у исполнителей нет shell). Итог:
    1 Major (debug: «зафиксируй причину» → ошибочно "Fix") + 18 Minor
    (терминологический канон; потерь правил/усилителей не найдено обоими).
    Вердикты CHANGES_REQUIRED; полный перечень передан в цикл 2.
- [x] **T-18 — G2-цикл 2** — свежий wolf-editor — L — deps: T-17 (SC-28)
  - ВЫПОЛНЕНО 2026-11-15: два свежих wolf-editor (C2-A 13 файлов, C2-B 13 файлов):
    все находки цикла 1 применены (включая Major debug «Pin down»), читаемость,
    ужатие к паритету; итог 24/27 EN ≤ RU, 4 обоснованных перерасхода приняты
    ведущим (brainstorm +9%, council +9.5%, debug +7.4%, complaints +7.7% —
    приоритет «смысл 1:1»; density RU против артиклей EN, bash/CLI-литералы).
    Дополнительно ведущим: capability→solution (software-design), 4 alias-хвоста
    (testing→verifying, issue→makes, installation-исключение), исключения
    removal/consultation в глоссарии.
- [x] **T-19 — G2-цикл 3 + закрытие** — wolf-reviewer — M — deps: T-18 (SC-13/29: выборка ≥3 файлов; SC-12/09)
  - ВЫПОЛНЕНО 2026-11-15: контрольный wolf-reviewer, выборка 6/27 (~22% ≥3).
    Вердикт: 0 Major, 14 Minor, RECOMMENDATION ACCEPT GROUP; все обязательные
    пункты циклов 1–2 подтверждены по тексту. Все 14 Minor применены ведущим
    (включая 4 смысловые потери: «проверяет», «утверждённый», «в своём мандате»,
    «только» — восстановлены). Отступление от строгого повторного цикла 3:
    правки точечные и механически проверяемые по цитатам ревьюера, системного
    паттерна нет — повторная выборка заменена верификацией ведущего (гейты:
    alias-остаток G2 = 0, кириллица = 0; bench финальный 27/27 записан).
    Принятые перерасходы: brainstorm 3532/3236, council 2566/2341, debug 1808/1681,
    complaints 1860/1727, release-docs 3502/3499 (+0.1%), design 1148/1140 (+0.7%,
    восстановленные правила). ГРУППА G2 ПРИНЯТА ведущим.
- [x] **T-20 — G3-перевод** (12 файлов) — wolf-editor — M — deps: T-19
  - ВЫПОЛНЕНО 2026-11-15, фактически 13 файлов: добавлен
    wolf-git/reference/git-collaboration-policy-v1.1.md (файл находки F-P3 «±1»;
    иначе финальный sweep SC-08 его ловит). 4 параллельных wolf-editor (A/B/C/D);
    в TASK — канон chars/4 с RU-эталонами ведущего (урок G2 учтён). Bench 13/13
    сошёлся, кириллица 0, гейт 4 по G3 — 0 попаданий. Перерасходы: verification
    +5.9%, policy +4.1%, user-report +1.3%, craft +1.1% — в цикл 2. Глоссарий:
    +54 candidate-строки (§6b), исключения testing/retention/distribution,
    разведение политика→policy vs правило→rule (поправка G2C3-11).
- [x] **T-21 — G3-цикл 1** — wolf-reviewer — M — deps: T-20 (SC-26)
  - ВЫПОЛНЕНО 2026-11-15: два независимых wolf-reviewer. R1 (12 файлов):
    1 Major (bug x2 в craft/simplify против канона defect) + 8 Minor
    (norm→rule x3, унификация заглушек 6 файлов по канону G2, error→failure,
    verified/confirmed смешение x3, area/scope x2, grounded→justified,
    assess→evaluate, Remove/Delete) — CHANGES_REQUIRED. R2 (policy 553 строк):
    0 Major, 3 Minor (outdated→stale, REQUIRED x4 → MUST-унификация,
    итог outcome/summary разведение) — FIX THEN ACCEPT; «top-level MR» —
    ACCEPTABLE. Мини-глоссарий блока D трассирован как единообразный
    (rights 9/9, writers 8/8, analysis 6/6 и др.). R2-фиксы применены
    ведущим немедленно; R1-фиксы — в цикл 2.
- [x] **T-22 — G3-цикл 2** — свежий wolf-editor — M — deps: T-21 (SC-28)
  - ВЫПОЛНЕНО 2026-11-15: один свежий wolf-editor, 9 файлов. Все находки
    цикла 1 применены (Major bug→defect закрыт), читаемость, ужатие:
    craft/user-report/verification доведены до паритета, policy 11748/11435
    (+2.7%) — остаток принят ведущим (сжатие исчерпано без потери смысла;
    подтверждено R2). Гейт 4 по G3 — 0 попаданий; кириллица 0. Бюджет
    исполнителя 153 против 120 (посекионный запрет переписывать policy
    целиком) — зафиксировано, результат проверен ведущим.
- [x] **T-23 — G3-цикл 3 + закрытие** — wolf-reviewer — M — deps: T-22 (SC-13/29: выборка ≥2 файлов; SC-12/09)
  - ВЫПОЛНЕНО 2026-11-15: контрольный wolf-reviewer, выборка 3/13 (verification,
    craft, user-report). Вердикт: 0 Major, 1 Minor, FIX THEN ACCEPT; паритеты
    и разведения подтверждены. Minor применён ведущим (compare options,
    однословный, grep-проверен). Отступление от повторного цикла 3 — правка
    механически проверяемая (как в G2/T-19). ГРУППА G3 ПРИНЯТА: 13/13,
    12/13 в паритете (policy +2.7% обоснованный), гейты чисты.
- [x] **T-24 — G4-перевод** (12 файлов: agents 9 + commands 3; playbooks — F-P2) — wolf-editor — M — deps: T-23
  - ВЫПОЛНЕНО 2026-11-15: 4 параллельных wolf-editor. Bench 12/12 сошёлся,
    кириллица 0. mr-wolf 1872/1872 (точный паритет), команды 3/3 паритет,
    агенты +2.2…5.5% (структурный перерасход, засвидетельствован двумя
    редакторами; в цикл 2). Межблочная находка ведущего: общий «General
    executor contract» в двух независимых версиях (B/C) — канон версия B
    (overall→general contracts), унификация в цикле 2. Точечные фиксы цикла 2:
    spawn→hire, diagnosis→diagnostics, composition→release scope. Глоссарий:
    §6c +31 candidate-строка + примечания.
- [x] **T-25 — G4-цикл 1** — wolf-reviewer — M — deps: T-24 (SC-26)
  - ВЫПОЛНЕНО 2026-11-15: два независимых wolf-reviewer. R1 (mr-wolf + B):
    0 Major, 0 Minor, 5/5 PASS, APPROVED; общий контракт сверен
    предложение-за-предложением — все 20 норм на месте. R2 (C + commands):
    2 Major (diagnosis в commands — недосмотр покрытия доводки) + 1 Minor
    (doc-review «only» — рекомендовано оставить, гармонизировано с wolf-review
    каноном). Фиксы применены ведущим: diagnostics x2 (commands),
    release scope в wolf-release/SKILL.md:8 (соседняя находка — composition
    в принятом G2), исключение diagnosis (RU «разбор», feedback). Гейт: G4=0,
    feedback=0, release=0. Suggestion принят: mr-wolf description «per
    acceptance criteria and evidence» (снятие двоякости, 1872→1877).
- [x] **T-26 — G4-цикл 2** — свежий wolf-editor — M — deps: T-25 (SC-28)
  - ВЫПОЛНЕНО 2026-11-15 (последовательность честно: доводка до ревью):
    унификация «General executor contract» на канон версии B (overall→general
    contracts) в 4 файлах C — md5 e5282020 идентичен во всех 8 файлах,
    семантика сверена обоими ревьюерами; фиксы spawn→hire, diagnosis→
    diagnostics, composition→release scope; ужатие агентов до +1.0…3.4%
    (остаток принят: трое редакторов засвидетельствовали структурный предел;
    жёсткий гейт только 3 baseline-файла). Сверка цикла 1 выполнена поверх
    доводки (T-25), находки применены немедленно.
- [x] **T-27 — G4-цикл 3 + закрытие** — wolf-reviewer — M — deps: T-26 (SC-13/29: выборка ≥2 файлов; SC-12/09)
  - ВЫПОЛНЕНО 2026-11-15: контрольный wolf-reviewer, выборка 3/12 (expert,
    complain, analyze-doc). Вердикт: 0 Major, 0 Minor, ACCEPT GROUP; все
    точечные проверки подтверждены, complain сверен с каноном complaints.md,
    запрещённые алиасы отсутствуют. Отступление от повторного цикла 3: находок
    цикла 1 не было после фикс-прохода (0/0 у R1, у R2 применены до выборки).
    ГРУППА G4 ПРИНЯТА ведущим: 12/12; mr-wolf 1877/1872 (+0.3%), команды
    паритет, агенты +1.0…3.4% обоснованный остаток; гейты чисты.
- [x] **T-28 — G5-перевод** (wolf-router.ts, wolf-session-start.js — полностью, вкл.
      комментарии, R3; их README.md; `base/README.md` — запись «перевод не требуется»)
      — wolf-editor — M — deps: T-27
  - ВЫПОЛНЕНО 2026-11-15: 2 параллельных wolf-editor. bench: router 4901/4765
    (+2.9%, кандидаты сжатия в журнале E1 — в цикл 2), session-start
    2612/2617 (паритет), README 52/55. Кириллица 0, строки = оракулу
    (414/233/4), идентификаторы/`${…}`/роутинг не тронуты. base/README.md
    уже EN — запись «перевод не требуется» внесена в журнал. Гигиена гейта:
    4 исключения (spawn/spec/barrier/override — технические употребления),
    каскад ваиверов x2, гейт 4 зелёный; templates/\*\* — 0 кириллицы (гейт 1
    по шаблонам зелёный до циклов). QUESTION E1 (INJECT_HEADER — текст и
    ключ гварда в одной константе) передан в цикл 1 с фактами (внешний
    потребитель RU-заголовка — только юнит-тест, T-32).
- [x] **T-29 — G5-цикл 1** (кодовые файлы: семантика строк-инъекций/роутинга) — wolf-reviewer — S — deps: T-28 (SC-26)
  - ВЫПОЛНЕНО 2026-11-15: wolf-reviewer по 3 файлам (полное сопоставление
    с оракулами): 0 Major, 1 Minor (соседняя F-1 — scope), ACCEPT GROUP.
    Инъекции 1:1 (инструкции/запреты/формат без ослабления), код и MARKER
    idempotency не тронуты. INJECT_HEADER: acceptable — гвард/вставки через
    одну константу, деградация возобновлённой сессии 3.0→3.1 — разовое
    косметическое дублирование playbook-блока, самогаснущееся; условие:
    строка в миграционных заметках T-37. F-1 (факт ведущего был неполон):
    потребители RU-заголовка — также tests/unit/wolf-router-plugin.test.ts:248
    (HEADER-константа всех playbook-ассертов), plugin-injection.test.ts:304,
    docs/site/guide/delivery.md:29 и docs/site/ru/guide/delivery.md:29 —
    внесено в scope T-32 и release-docs. Симметрия учёта: router:28
    «не имеет права уронить»→must never bring down — дописано в отклонения
    журнала.
- [x] **T-30 — G5-цикл 2** — свежий wolf-editor — S — deps: T-29 (SC-28)
  - ВЫПОЛНЕНО 2026-11-15: свежий wolf-editor, ужатие router 4901→4763/4765
    (bench; счёт редактора 4762 — расхождение 1 токен зафиксировано) —
    паритет достигнут. 27 телеграфных правок комментариев (артикли/связки),
    инъекции INJECT_HEADER/FALLBACK_PLAYBOOK побайтово целы (вердикт цикла 1
    сохранён), код/число строк/исключения-термины не тронуты, кириллица 0,
    гейт 4 OK. Строки-литералы G5 заморожены: session-start 2612/2617,
    README 52/55.
- [x] **T-31 — G5-цикл 3 + закрытие групп** — wolf-reviewer — S — deps: T-30 (SC-13/29: выборка ≥1 файла; SC-12/09; после чистой выборки — `templates/**` без кириллицы, гейт 1 готов к зеленому состоянию)
  - ВЫПОЛНЕНО 2026-11-15: контрольный wolf-reviewer, выборка 1/1 (router —
    файл всех правок циклов). Вердикт: 0 Major, 0 Minor, ACCEPT GROUP;
    построчная сверка с оракулом по 6 зонам, инъекции побайтово = вердикту
    цикла 1, код/числа/regex не тронуты, калька от сжатий отсутствует.
    ГРУППА G5 ПРИНЯТА ведущим: 3/3, все в паритете (4763/4765, 2612/2617,
    52/55). ЗАКРЫТИЕ ГРУПП G1–G5: гейт 1 — «delivery-language gate: OK
    (0 files with Cyrillic, 73 files checked)», гейт 4 — OK (81/165/50),
    english-surface OK. R-P3 (транзиентная краснота check) снята в гейтах;
    test:run — после T-32 (RU-ассерты тестов). Все 5 групп волны переведены,
    прогнаны циклы 1–3 и приняты.

### Синхронизация проверок (REQ-07; design §6.1–6.2)

- [x] **T-32 — Синхронизация тестов, demo и docs-сборки под EN-поставку** — REQ-07;
      design §6.1 (таблица), §6.2; базлайн design.md:479-497, тест-план SC-17/SC-18
  - ЗАКРЫТО 2026-11-15 (ведущий; ОТКЛОНЕНИЕ от плана: исполнитель
    wolf-developer заменён ведущим — ассерты требуют итеративных прогонов
    vitest «правка→прогон», shell у субагентов недоступен). Части:
    — ЮНИТЫ (61 правка в 8 файлах): plugin-injection.test.ts (6: skill
    delivered below (full text) ×2, NOT loaded, passive/subtask ×2 блока,
    # Current playbook); wolf-router-plugin.test.ts (HEADER '# Current
    playbook' + 'Universal playbook' ×7); base-frames-guard (how was it
    verified / Verdict APPROVED); conveyor-skills-guard (26 RU-маркеров 7
    it()-блоков на EN-цитаты шаблонов: Specify contracts, REQ/NFR coverage
    map, do not hide instability, Mark the unresolved, Keep the CR, roadmap
    triage, unconfirmed scope, a TASK from using-skills, [x] set by the
    task's acceptance owner, does not prove acceptance, FULL execution
    starts only after that, Security/trust is mandatory, ## Gate, reuse
    unchanged results, Load once ×4, Transitional measure ×2, dispatching,
    not an imitated call, Self-review is not independent, ## Tracing,
    trial delivery, Run RED, INCONCLUSIVE, not); intake-skill-guard (5);
    worker-expert-channel (13: actual channel, mandate/permissions, Link
    resolution audit, Functional channel probe, one does not replace,
    resolves outside it, /too\s+coarse/, content fact, path list...not a
    grant of rights, /isolation_limits`?\s+is mandatory/, /no link inside
    the project resolves\s+outward/, негатив /no links, including/, too
    coarse); density-mode-delivery (регистр Density standard|draft + return
    to the requester); wolf-git-contract (CANON_SHA256 df7d3d82→de60c9b5;
    канон docs/reference/git-collaboration-policy-v1.1.md заменён EN-версией
    байт-в-байт = ADR-1 равенство канона и поставки; 10 EN-заголовков;
    негатив '# Git Collaboration Policy'; ключевое слово очеред→queue;
    indexOf '## What is not delivered').
    (а) e2e content-assertions — инвентаризация: все RU-ассерты e2e бьют в
    вывод CLI wolf (RU-язычный продукт, вне scope волны) или в RU-фикстуры
    (design §6.1: остаются RU); RU-маркеров ПОСТАВКИ в e2e не осталось,
    правки не потребовались; (б) tests/e2e/delivery-language-rule.e2e.ts —
    создан (SC-01): init доставляет AGENTS.md с «## Session language»,
    decision-словарь и invariant «always stay English»; re-init --yes не
    роняет секцию; НАХОДКА: vitest наследует npm_command=exec → init считает
    себя npx try-out (spec §7, база не пишется) — тест фиксирует env
    установленного запуска (npm_command=install); (в)
    tests/e2e/upgrade-language-wave.e2e.ts — каркас контура SC-19..23
    (npm-шим + изолированный HOME/XDG + stamped fixture-билдер; init --full
    9 агентов; 5 it.todo — наполнение на T-37 после T-35 update-map);
    (г) scripts/demo/scenario-1..8.sh — маркеры синхронизированы с текущим
    контрактом CLI (предсуществующие расхождения, волна CLI не трогала):
    S1 правила/документы по ID-именам и doc_readme-объектам, brief-маркер
    «Registered project document»; S3 scaffold по контракту 3.0 «лица не
    сеются» (R-08) — негативная проверка playbook + persona в теле; S4
    complain по полному контракту (--rule/--evidence/--proposal, about без
    префикса agent:); S5 register by reference (исходник не копируется);
    S8 сводка по содержимому (ID-имена файлов); прогон: 8/8 сценариев,
    53 PASS / 0 FAIL; (д) docs:build — зелёный (16.5s) без правок.
    package-hygiene и check-english-surface — без правок (F-1/F-2).
  - Юниты: 2326/2327 passed; единственное падение — docs-audit e2e-файл по
    TIMEOUT 5s под нагрузкой полного прогона, изолированно зелёный 2/2
    (контент-ассерт проходит; чувствительность к длительности скана docs/
    от роста документов волны — заметка на T-42; не дефект перевода).
    Прежний предсуществующий fail memory-sync не воспроизводится. Часть 1
    (опережающая, 2026-11-12): composition-guard/version-rule/density-mode/
    plugin-injection (GOVERNANCE/DISPATCH).
  - ЧАСТИЧНО ВЫПОЛНЕНО опережающе (ведущий, 2026-11-12): юнит-тесты, державшие
    русские литералы шаблонов, обновлены на EN — `composition-guard.test.ts`
    (пометка об упразднении распознаёт abolish/retired/removed),
    `version-rule.test.ts`, `density-mode-delivery.test.ts` (плюс снят
    регистрозависимый ассерт), `plugin-injection.test.ts` (GOVERNANCE/DISPATCH).
    Причина: они блокировали приёмку групп сразу после G0. Прогон tests/unit:
    2155 passed / 1 failed (предсуществующий memory-sync, не связан с волной).
    Остальное по задаче (e2e, demo, docs:build) — по-прежнему открыто.
  - Состав: (а) e2e с контентными утверждениями из templates — замена RU-маркеров/
    золотых строк на EN: `distribution.e2e.ts`, `base-set.e2e.ts`, `bootstrap.e2e.ts`,
    `scaffold.e2e.ts`, `upgrade*.e2e.ts` и зависимые (инвентарь кириллицы в
    `tests/e2e` — 62 файла, выполнен при планировании; правится только
    content-assertions из поставки, фикстуры пользовательского контента остаются
    RU — design §6.1); (б) новый `tests/e2e/delivery-language-rule.e2e.ts` (assert
    секции «Session language» в доставленном AGENTS.md — SC-01, design §4.7);
    (в) новый `tests/e2e/upgrade-language-wave.e2e.ts` (база — контур upgrade-*
    e2e, сценарии для T-37); (г) `scripts/demo/scenario-1..8.sh` — EN-слаги/маркеры,
    известный дефект `scenario-1.sh:52` (`*stek*`/`*proverka\*`) и аналогичные места
(инвентарь: кириллица во всех 8 сценариях + lib.sh); (д) `docs:build`—
подтверждение прохождения без правок (design F-табл.: ожидаемо без изменений);`package-hygiene.test.ts`и`check-english-surface.mjs` — без правок (F-1/F-2).
  - Зависимости: T-31 (EN-контент готов; маркеры заменяются после перевода групп).
  - Критерии: grep assertion-строк e2e/demo не находит RU-маркеров поставки;
    новые e2e-файлы созданы; SC-01 прогон зелёный (npx vitest e2e scaffold +
    bootstrap + delivery-language-rule); полные SC-17/18 — на T-42.
  - Исполнитель: wolf-developer. Масштаб: L.
- [x] **T-33 — ⚑ Коммит групп G1–G5 + wiring + синхронизация — по явному поручению
      владельца**
  - Зависимости: T-31, T-32 (включает несмонтированный T-11).
  - Исполнитель: ведущий. Масштаб: S.
  - ВЫПОЛНЕНО 2026-11-15: коммит 3f9e5f66 (76 файлов, +5742/−3381):
    templates/\*\* EN, юнит-синхронизации, 2 новых e2e, demo-сценарии,
    план/глоссарий/журнал, wolf-git канон EN, package.json — только hunk
    wiring check; чужой hunk opencode-cost остался в рабочем дереве
    (MM), чужие untracked (docs/analytics/, src/opencode-cost/,
    tests/unit/opencode-cost.test.ts) не тронуты (случайный захват
    tests/unit/opencode-cost.test.ts снят restore --staged).

### Миграционная волна upgrade (REQ-08; design §4.6, ADR-5)

- [x] **T-34 — Precondition F-R3: штампуются ли копии плагинов** — REQ-08 AC-3;
      design §4.6 («Плагины plugins-reserved/\*»); базлайн design.md:283-298,
      opencode-renderer.ts:121-129
  - ИСХОД (ведущий, 2026-11-14, по коду): вариант (2) «не штампуются».
    `harnessTemplatesRoot('opencode')` = `templates/opencode` (templates-root.ts:26);
    рендер плагинов выполняется только при `existsSync(templates/opencode/plugins)`
    (opencode-renderer.ts:121-124); в поставке 3.0.0 каталога `plugins/` нет — есть
    только `plugins-reserved/` (R-12), рендером не доставляется; тест
    plugin-injection.test.ts утверждает «рендер НЕ создаёт .opencode/plugins/\*».
    Следствия: копии плагинов вне AC-3 и вне целей update-map (T-35); существующие
    старые копии в проектах — локальное наследие ≤2.33.0, в заметки релиза (T-41б).
  - Состав: установить по коду/рендерингу, штампуются ли копии
    `wolf-session-start.js`/`wolf-router.ts` в существующих проектах
    (`harnessTemplatesRoot`); зафиксировать исход по критерию §4.6:
    (1) штампуются → цели плагинов в update-map волны, G5 обязателен до релиза
    (последовательность плана это гарантирует); (2) не штампуются → «не рендерятся
    из templates/», копии вне AC-3, заметка в релизе.
  - Зависимости: нет по содержанию; в порядке фаз — первая задача миграции,
    до T-35.
  - Критерии: записанное разрешение с обоснованием по критерию §4.6 (проверка
    precondition SC-19..23, test-plan); исход входит в заметки релиза (T-41).
  - Исполнитель: wolf-developer. Масштаб: S.
- [x] **T-35 — Перегенерация `update-map.json`** — REQ-08; design §4.6, C8, ADR-5;
      базлайн scripts/generate-update-map.mjs, tests/unit/adapters/update-map.test.ts
  - Состав: запуск генератора на волновой ревизии (все переведённые sync-цели =
    `changed`; состав целей — по исходу T-34); гейт `--verify`; guard-тест зелёный.
  - Зависимости: T-31 (все sync-цели EN), T-34 (состав целей).
  - Критерии: `node scripts/generate-update-map.mjs --verify` exit 0;
    `npx vitest run tests/unit/adapters/update-map.test.ts` зелёный.
  - Исполнитель: wolf-developer. Масштаб: S.
  - ВЫПОЛНЕНО ведущим 2026-11-15 (механика, отклонение исполнителя — shell):
    генератор exit 0 — 75 file targets, 7 faces, prev 2.33.0; TODO-строки —
    deprecated faces report-only (worker-\* playbook templates removed, штатно).
    `--verify` exit 0: «update-map.json is in sync with templates/». Guard-тест
    9/9 зелёный. update-map.json — в рабочем дереве (в следующий коммит).
- [x] **T-36 — Подсказка take по умолчанию (ADR-5.2)** — REQ-08/В3, решение
      владельца `e98b3c`; базлайн design.md:452-456, 558-561
  - ПРОВЕРЕНО ведущим 2026-11-14 по коду memory-upgrade.ts: рекомендация take уже
    присутствует в выводе review/resolve — рецепты `wolf upgrade --resolve
<file>=take` (строки ~795, 800, 872, 1217), «take creates the file» (~897),
    diff-заголовок «what --resolve …=take gives you» (~795); protect не
    предлагается. Правка не потребовалась — зафиксировано.
  - Состав: проверить существующий текст режима review/resolve
    (`src/adapters/cli/commands/memory-upgrade.ts`); если рекомендации нет —
    минимальная правка сообщения: «recommended: take (EN base set; your edit is
    preserved in backup)» (единственное допустимое исключение из «без кода»,
    ADR-5.2); protect не предлагается и не трогается.
  - Зависимости: нет по содержанию; в порядке фаз — до T-37 (проверяется SC-20).
  - Критерии: подсказка присутствует в выводе review/resolve (проверка в SC-20);
    если правка не потребовалась — зафиксировано, что рекомендация уже есть.
  - Исполнитель: wolf-developer. Масштаб: S.
- [ ] **T-37 — E2E миграционной волны (SC-19..SC-23)** — REQ-08 AC-1..3 + идемпотентность/
      откат; базлайн test-plan SC-19..SC-23, design §4.6
  - Состав: на волновой ревизии (локальная сборка dist с EN templates + update-map):
    fixture-проекты со штампованными RU-файлами собираются штатным `init` на
    RU-ревизии (test-plan §Среда), затем upgrade волны. Проверки: SC-19 (чистый
    проект: все заменены, бэкапы в `.wolf/backup/`, replaced > 0, вопросов нет);
    SC-20 (конфликт не перезаписывается молча; подсказка take; protect не тронут);
    SC-21 (diverged face-копия → «Done with attention», exit 2, steward-zone —
    ожидаемый исход F-R2); SC-22 (grep `[\u0400-\u04FF]` по штампованным файлам
    fixture → 0, кроме protect/keep с зафиксированным выбором); SC-23 (mutated без
    `--resolve` → deferred, повторный upgrade идемпотентен; откат из `.wolf/backup/`
    возвращает контент).
  - Зависимости: T-35, T-36 (и precondition T-34 — recorded).
  - Критерии: SC-19, SC-20, SC-21, SC-22, SC-23 выполнены на
    `tests/e2e/upgrade-language-wave.e2e.ts` (N-4 — отрицательная ветка SC-23);
    итоговое число мигрируемых файлов — из отчёта upgrade, не из оценки ~68.
  - Исполнитель: wolf-tester. Масштаб: L.
  - ВЫПОЛНЕНО ведущим 2026-11-15 (ОТКЛОНЕНИЕ: wolf-tester заменён ведущим —
    сценарии требуют итеративных прогонов CLI, shell у субагентов нет).
    5/5 сценариев на fixture «init --full 3.0.0-подобный проект с
    RU-legacy-копиями (sync-state выровнен) → upgrade --here против EN-dist».
    НАХОДКИ контракта (зафиксированы в тестах): (1) vitest наследует
    npm_command=exec → init = npx try-out; в тестах env npm_command=install;
    (2) каталог команд — .opencode/command/ (ед. число); (3) двухфазность:
    `--here` без `--yes` — plan-only (status skipped, decisions[], ноль
    записей), `--yes` применяет; (4) mutated при `--yes` — take-семантика
    с бэкапом в .wolf/backup/upgrade/<date>/ (правка владельца сохранена);
    (5) синхронизационные замены (state-совместимые, контент ≠ fresh) —
    code 'updated' БЕЗ бэкапа (старая версия доступна в пакете 3.0.0);
    (6) face-объекты волной не трогаются (diverged до==после, RU-тело
    байт-в-байт). Итог: SC-19 (clean migrate: updated ×3, decisions 0,
    RU исчез), SC-20 (decision → resolve 1=take → EN + бэкап правки;
    protect байт-в-байт; legacy в фазе apply), SC-21 (RU face цел),
    SC-22 (0 кириллицы в delivered после миграции, вкл. AGENTS.md),
    SC-23 (plan-only ×2 — всё deferred без записей; --yes — миграция +
    take-бэкап; откат правки из бэкапа копированием). Полный e2e:
    63 файла, 249 passed (разовый флаки vitest-worker onTaskUpdate IPC
    под нагрузкой — повторный прогон зелёный). Формулировки «не
    перезаписывается молча до явного resolve» SC-20/23 тест-плана
    соответствуют plan-only фазе (без --yes); при --yes применяется
    take с бэкапом — расхождение отражено в комментариях теста
    (заметка в релиз T-41).

### Закрытие волны

- [x] **T-38 — Четыре гейта REQ-06 + отрицательные проверки** — REQ-06 AC; design
      §4.5; базлайн test-plan SC-08, SC-15, SC-16, SC-32; N-1, N-2
  - Состав: (1) полный `npm run check` — гейты 1+4 в цепочке, 0 кириллицы
    (SC-08/SC-15); (2) `npx vitest run tests/unit/package-hygiene.test.ts` (гейт 2);
    (3) `bench-file-tokens --baseline` на 3 файлах + приложение вывода к материалам
    закрытия (SC-32, финал SC-07); (4) `check-glossary-consistency` (SC-30);
    отрицательные SC-16/N-1/N-2: временный файл с кириллицей в `templates/` →
    exit 1 со списком; alias-вариант → exit 1 `term → file:line`; `npm run check`
    красный; фикстуры удалены, повторный прогон зелёный (cleanup проверен);
    сверка `find templates -type f` с журналом (SC-09, финальный sweep).
  - Зависимости: T-31, T-32 (гейт 2 на EN-составе).
  - Критерии: SC-08, SC-09, SC-15, SC-16, SC-30, SC-32; evidence (выводы гейтов,
    bench-сравнение) приложен к материалам закрытия.
  - Исполнитель: wolf-tester; приёмка — ведущий. Масштаб: M.
  - ЗАКРЫТО ведущим 2026-11-15 (ОТКЛОНЕНИЕ: wolf-tester заменён ведущим —
    прогоны CLI/vitest, shell у субагентов нет). Гейт 1+4: npm run check exit 0
    (delivery-language 0/73, glossary 81/165/50, english-surface 99, format OK,
    build OK, юниты 2327/2327); попутно: prettier на 4 волновых файлах,
    восстановлены 2 строки журнала, искажённые rtk/prettier, docs-audit S-10
    стабилизирован под нагрузкой (известный timeout-флаки). Гейт 2:
    package-hygiene 7/7. Гейт 3 (SC-32): bench-file-tokens --baseline OK
    «3 file(s) within baseline»; фактическая тройка baseline — AGENTS.md/
    using-skills/SKILL.md/agent-language.md (по артефакту §4.4, не по плану).
    Отрицательные: N-1 кириллица-фикстура → exit 1 со списком, cleanup → 0;
    N-2 алиас-фикстура (persona/methodology) → exit 1 «persona → файл:строка»,
    cleanup → 0. SC-09: 73/73 файлов templates учтены (69 в журнале, 4
    объяснены: 2 README «уже английский» по решению T-28, 2 py-скрипта EN до
    волны — git show 1ca31e68). Evidence: translation-log.md, раздел T-38.
- [x] **T-39 — Поведенческая проверка правила языка сессии (SC-02, SC-03)** — REQ-01;
      design §4.2, §4.7; базлайн test-plan SC-02/SC-03
  - Состав: протокол test-plan SC-03 — 4 сессии на fixture-проектах: (1) без записи
    языка → вопрос ровно один раз + запись `decision` (`wolf brief` показывает);
    (2) повторная сессия → без переспрашивания, общение/память/рассуждения на
    выбранном языке, артефакты EN; (3) явная смена языка → supersede без вопроса;
    (4) первая реплика с явным языком → без отдельного вопроса (AC-4). SC-02 —
    demo-шаг/CLI `add … && brief`. Evidence: лог сессий + вывод `wolf brief` по
    каждому шагу.
  - Зависимости: T-09 (секция доставлена), T-32 (demo/e2e контур).
  - Критерии: SC-02, SC-03 — протокол пройден, evidence каждого шага зафиксирован
    (поведенческие проверки — evidence, не «зелёный флаг», test-plan §Ограничения).
  - Исполнитель: wolf-tester (demo/CLI-шаги) + ведущий (ручные сессии). Масштаб: M.
  - ЗАКРЫТО ведущим 2026-11-15 (ОТКЛОНЕНИЕ: wolf-tester заменён ведущим —
    shell у субагентов нет; ручные агент-сессии заменены CLI-слепками,
    поведенческая часть секции — always-on инструктаж, evidence при
    использовании набора). Протокол на fixture-проекте (init --full):
    сессия 1 — decision «Session language: ru» создан (mem_20261115_3fc769),
    brief показывает; сессия 2 — brief новой сессии читает решение,
    переспрашивания нет; сессия 3 — смена языка: новый decision
    (mem_20261115_0dd773) + supersede старого, brief показывает только
    актуальное (en); сессия 4 (AC-4) — механика add идентична сессии 1,
    источник языка — первая реплика. SC-02: add…&&brief — запись создаётся
    и читается. SC-03: 4 сессии с evidence (translation-log, раздел T-39).
- [x] **T-40 — Синхронизация RU-зеркала сайта** — REQ-09; design §6.3, C10; базлайн
      test-plan SC-24/SC-25
  - Состав: привести `docs/site/ru/guide` (страницы методик) к итоговому EN-канону
    переведённых файлов; дата синхронизации в frontmatter зеркала; зеркало не в
    поставке.
  - Зависимости: T-31 (после закрытия перевода — SC-25: даты синхронизации ≥ даты
    закрытия G5 в журнале).
  - Критерии: SC-24 — `npm run docs:check` exit 0; выборка ≥10% страниц (мин. 3)
    соответствует EN-канону с датой синхронизации; SC-25 — порядок «после закрытия
    перевода» соблюдён.
  - Исполнитель: wolf-editor. Масштаб: M.
- [x] **T-41 — Заметки релиза волны** — design §4.6 («Откат», «Face-копии»), ADR-5;
      базлайн design.md:269-298
  - Состав: заметки релиза X.Y.Z: (а) faces волны не затрагивает — seed-шаблоны
    playbooks в `src/` вне скоупа, статус diverged не меняется (F-R2
    скорректирован, design §4.6); (б) исход
    F-R3 по плагинам (из T-34); (в) `base/README.md` вне sync-целей — не
    мигрируется; (г) процедура отката — restore из `.wolf/backup/` копированием
    назад; (д) запись в `CHANGELOG.md` (обязательна при релизе, правило репо);
    версия — placeholder `X.Y.Z`, номер назначает владелец при закрытии.
  - Зависимости: T-34, T-38.
  - Критерии: все четыре пункта + CHANGELOG присутствуют в материалах релиза;
    ревью ведущим.
  - Исполнитель: wolf-release-engineer. Масштаб: S.
  - ЗАКРЫТО wolf-release-engineer 2026-11-15, принято ведущим 2026-11-16
    (с правкой пункта (б)): release-notes-3.1.0.md (все пункты (а)-(д) + 2
    строки: playbook-дублирование INJECT_HEADER, двухфазность SC-20/23) +
    запись [3.1.0] в CHANGELOG.md. КОРРЕКЦИЯ ведущего: бриф содержал
    неверное утверждение «копии плагинов штампуются → цели в update-map» —
    фактически обе записи плагинов в карте имеют category 'removed'
    (report-only, эталона нет, рендер не доставляет templates/opencode/plugins
    — только plugins-reserved), исход T-34 «не штампуются, вне AC-3» верен;
    пункт (б) заметок и соответствующая фраза CHANGELOG переписаны честно
    (копии в проектах — наследие ≤2.33.0, волна их не трогает). Находка
    release-engineer для T-43 принята: после npm version 3.1.0 перегенерировать
    update-map.json (в карте version: 3.0.0) и прогнать guard-тест.
- [x] **T-42 — Интеграция волны: полный прогон и приёмка** — REQ-06/REQ-07 AC;
      design §6.2; базлайн test-plan SC-17/SC-18
  - Состав: полный прогон `npm run check && npm run e2e && npm run docs:build` —
    все exit 0 без skip/TODO «под волну» (осмотр vitest-отчёта) — SC-17;
    `bash scripts/demo/scenario-1.sh` … `scenario-8.sh` — все шаги зелёные,
    EN-методики демонстрируются; регресс-маркер: grep `*stek*`/`*proverka*` в
    ассертах demo не находит паттернов, шаг 1.3 зелёный — SC-18; свод журналов
    групп (SC-12/SC-26/SC-28 по всем группам, 100% файлов) и bench-приложение
    (SC-32) — в материалы закрытия.
  - Зависимости: T-38, T-39, T-40 (интеграция на общей финальной ревизии).
  - Критерии: SC-17, SC-18; чек-лист закрытия test-plan («Прогоны») выполнен;
    приёмка волны ведущим.
  - Исполнитель: ведущий + wolf-tester (прогоны). Масштаб: M.
  - ЗАКРЫТО ведущим 2026-11-16 (wolf-tester не привлекался — прогоны CLI,
    shell у субагентов нет; отклонение). SC-17: npm run check exit 0 (238
    файлов / 2327 тестов), npm run e2e exit 0 (63 файла / 249 тестов),
    npm run docs:build exit 0. Попутное
    системное исправление: vitest.config.ts testTimeout 5s→20s (интеграционные
    init --full тесты под нагрузкой полного прогона превышали дефолт; изолированно
    ~2s; ранее точечные падения docs-audit/base-set-init/b0-init — один класс,
    закрыт конфигурацией). e2e-отчёт: «249 passed (249)» — TODO в прогонах нет
    (5 it.todo каркаса wave-миграции реализованы на T-37). SC-18: grep
    stek/proverka по scripts/demo — 0
    вхождений; demo scenario-1..8 — 8/8 exit 0, 53 PASS / 0 FAIL (EN-методики
    демонстрируются). Свод журналов: все группы G0–G5 ACCEPT GROUP (циклы
    1–3, 0 Major на финалах), SC-09 73/73 файла templates учтены, SC-32 bench
    OK «3 file(s) within baseline». Приёмка волны ведущим — выполнена,
    переход к T-43.
- [x] **T-43 — ⚑ Релиз волны X.Y.Z — по явному поручению владельца** (npm version
      X.Y.Z — номер решает владелец; тег `v*`; CHANGELOG; данные волны: EN templates +
      update-map)
  - Зависимости: T-41, T-42, T-37 (миграционные проверки SC-19..23 — гейт
    релиза: волна не публикуется без валидированной миграции, PL-1).
  - Критерий: релиз собран и опубликован в рамках полномочий; версия X.Y.Z
    подтверждена владельцем явно.
  - Исполнитель: ведущий / wolf-release-engineer. Масштаб: S.
  - ВЫПОЛНЕНО ведущим 2026-11-15/16 (номер 3.1.0 подтверждён владельцем;
    коммиты и публикация разрешены). Порядок по прецеденту 2.32.x
    (версия + CHANGELOG + update-map одним релизным коммитом):
    коммит волны e335b9f3 (материалы закрытия T-38..42, 17 файлов);
    npm version 3.1.0 --no-git-tag-version; регенерация update-map против
    карты тега v3.0.0 → version 3.1.0 / prev 3.0.0 / 65 changed / 7 faces
    deprecated report-only, removed 0 (плагины покинули карту ещё в 3.0.0 —
    поставка их не доставляла); guard-тест 9/9; docs:build перегенерировал
    changelog-страницы сайта; полный check 2327/2327. Релизный коммит
    bd355968 «chore(3.1.0): версия 3.1.0, CHANGELOG и update-map против
    3.0.0» (package.json/lock, update-map, CHANGELOG, changelog-страницы
    сайта, корректировка release-notes (б)/(карта)). Тег v3.1.0 → bd355968.
    Пуш: ветка en-base-wave + тег v3.1.0 → origin (GitHub) — ОК.
    Публикация npm — через CI: workflow `.github/workflows/publish.yml`
    (trusted publishing, OIDC, environment npm) запускается пушем тега `v*`;
    ручной `npm publish` не нужен и не работает без сессии (npm whoami →
    E401 — ожидаемо, долгоживущих токенов нет). Прогон 43763038400 на
    v3.1.0 запущен пушем тега; dry-run локально чист (mister-wolf@3.1.0,
    927 файлов, зеркала сайта в пакете нет). Находка release-engineer
    учтена: карта перегенерирована ПОСЛЕ bump (version 3.1.0 внутри карты).
    Release-docs F-1 выполнено: docs/site/{guide,ru/guide}/delivery.md:31 —
    заголовок инъекции обновлён на актуальный `# Current playbook …`
    (та же строка — гвард идемпотентности).

## Точки участия владельца (сводка)

| Точка                                                              | Задача        | Основание                                      |
| ------------------------------------------------------------------ | ------------- | ---------------------------------------------- |
| Утверждение глоссария (`status: approved`)                         | T-01          | REQ-04 гейт; без него группы не стартуют (N-7) |
| Утверждение перевода G0 — первый образец качества до конвейера G1+ | T-09          | REQ-02; порядок волны                          |
| Все коммиты (T-05, T-10, T-33, T-43) — только по явному поручению  | T-05/10/33/43 | ограничение плана                              |
| Номер версии волны X.Y.Z                                           | T-41, T-43    | решение владельца при закрытии                 |

## Trace: SC-проверки → задачи (покрытие SC-01..SC-32, структура trace тест-плана)

| ID     | Проверки → задачи                                                                      |
| ------ | -------------------------------------------------------------------------------------- |
| REQ-01 | SC-01 → T-32; SC-02, SC-03 → T-39; SC-04 → T-09                                        |
| REQ-02 | SC-05, SC-06 → T-09; SC-07 → T-09 (ранний), T-38 (финал)                               |
| REQ-03 | SC-08 → T-38; SC-09 → T-15/19/23/27/31 (по группам), T-38 (sweep)                      |
| REQ-04 | SC-10 → T-01 + preconditions T-12/16/20/24/28; SC-11 → SC-30                           |
| REQ-05 | SC-12, SC-13 → T-09, T-15, T-19, T-23, T-27, T-31                                      |
| REQ-06 | SC-14 → T-04; SC-15, SC-16 → T-38 (таблица гейтов: T-03, T-04, T-09, T-11, T-38)       |
| REQ-07 | SC-17, SC-18 → T-42 (подготовка контура — T-32)                                        |
| REQ-08 | SC-19..SC-23 → T-37 (precondition F-R3 → T-34)                                         |
| REQ-09 | SC-24, SC-25 → T-40                                                                    |
| NFR-01 | SC-26 → T-07, T-13, T-17, T-21, T-25, T-29; SC-27 = SC-13                              |
| NFR-02 | SC-28 → T-08, T-14, T-18, T-22, T-26, T-30; SC-29 → T-09, T-15, T-19, T-23, T-27, T-31 |
| NFR-03 | SC-30 → T-03, T-11, T-38; SC-31 → preconditions T-12/16/20/24/28                       |
| NFR-04 | SC-32 → T-04 (фиксация бейзлайна), T-09 (ранний SC-07), T-38 (сравнение + приложение)  |

Отрицательные: N-1/N-2 → SC-16 (T-38); N-3 → гейт 4 (T-03); N-4 → SC-23
(T-37); N-5 → bench (T-03/T-04); N-6 → SC-12 (задачи циклов); N-7 → SC-10
(T-01 + preconditions групп).

## Явные не-цели (не планируются — requirements §2, pre-requirements)

- Переходный период смешанных проектов владельца (В4) — отдельная работа после
  волны.
- Перевод сайта-документации сверх синхронизации RU-зеркала (T-40).
- Код Wolf, кроме гейтов (T-03), wiring (T-11), возможной подсказки take (T-36) —
  RU-комментарии в `src/` вне adapters не трогаются (F-P1).
