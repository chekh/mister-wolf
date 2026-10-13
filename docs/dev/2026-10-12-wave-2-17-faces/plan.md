---
slug: wave-2-17-faces
title: wave-2-17-faces — план
status: draft
created: 2026-10-12
updated: 2026-10-13
---

# wave-2-17-faces — план

Входы: requirements.md (approved, ревизия CR-2026-10-13-02), design.md (утверждён
владельцем, раунд 3 APPROVED; вариант Б — CR-2026-10-13-02,
`mem_20261013_vladelets_variant_b_po_req_05_nfr_01_pla_cca07b`). Baseline кода:
`feaf9a0` + коммит планирования (CR-2026-10-13-02; исполнитель сверяет актуальный
HEAD main при старте). Профиль проекта: npm, vitest, полный гейт `npm run check`
(english-surface + prettier + lint + build + test:run), trunk-based, изоляция записи —
worktree `.worktrees/<имя-задачи>` (правило `mem_20260827`). Тест-план: test-plan.md
этой папки (согласован с планом — сверка в конце документа).

Режим: FULL. Общий план и порядок интеграции принадлежит L1; параллельность разрешена
только для задач с независимыми outputs и изолированной записью (T-08 — уникальные
файлы плагина и его теста).

## Задачи

<!-- Исполнитель переворачивает чекбокс в [x] в конце задачи вместе со строкой «сделано → коммит». Чекбокс — истина завершённости. -->

- [ ] **T-01: Схемный фундамент `face` + `proposal`** — design §Контракты («Тип face»,
      «Proposal»), §Схемные изменения п.1–4, ADR-3, ADR-6. Декларация `face` в
      `CORE_TAXONOMY_DECLS`, `DEFAULT_CHARACTER_FACETS` += `'proposal'` (7→8),
      сигнал-словарь `['proposal']` для прочих core-типов (`src/domain/memory-types.ts`);
      контрактная валидация полей предложения при `facet='proposal'` на любом core-типе
      (`src/domain/type-schema-builder.ts`); enum событий += `memory.face.versioned`,
      `memory.face.breakglass`, `memory.face.denied`, `memory.proposal.delivered`
      (`src/domain/schemas/memory-event-schema.ts`); осознанная правка ожиданий
      `tests/unit/domain/taxonomy.test.ts` («MEMORY_TYPES ровно 7» → 8, «covers
      every entry» — пополнение состава, F-02 ревью плана). AC: REQ-01 (тип
      объявлен, контракт един), REQ-08 AC2/AC3. Проверки: unit domain (test-plan
      §REQ-01, §REQ-08). Зависимости: нет.
- [ ] **T-02: Use-case `createFaceVersion` + guard** — design §Затронутые модули п.9,
      ADR-1, §Отказов (MemoryLock-сериализация, паттерн `tool-librarian.ts:167`).
      Новый `src/app/use-cases/create-face-version.ts`: версионирующий путь (новая запись +
      supersede прежней), lock на owner_skill, номер версии под lock, события
      `memory.face.versioned`/`memory.face.denied` (отказ breakglass — при
      WOLF_SESSION с префиксом `opc-`, т.е. из агент-сессии; F-04 ревью плана),
      guard доступа (Стюард; отказ при агентской WOLF_SESSION / `--created-by`),
      reason обязателен (REQ-04 AC2). AC: REQ-03, REQ-04.
      Проверки: unit use-cases (test-plan §REQ-03, §REQ-04). Зависимость: T-01.
- [ ] **T-03: G17-запись мутации Стюарда** — design ADR-2, REQ-06. Мутация Стюарда
      создаёт атомарно note(history) c полями G17 + relation `mutates` → версия лица;
      шаблон неопционален (без обязательных полей операция не завершается успехом);
      поле «границы» фиксирует, что не меняется. AC: REQ-06. Проверки: unit use-cases
      (test-plan §REQ-06). Зависимость: T-02.
- [ ] **T-04: CLI-группа `wolf face`** — design таблица (CLI `wolf face`),
      REQ-03/04/05/07/10. Новый файл в `src/adapters/cli/commands/`: подкоманды
      new / restore / breakglass / list / history / show; breakglass — только владелец,
      журнал в составе операции (REQ-07 AC2), без вызова Стюарда; restore = новая версия
      с based_on (REQ-05 AC1); запрет `--created-by` (ADR-5). AC: REQ-10, REQ-07, REQ-05.
      Проверки: unit adapters/cli (test-plan §REQ-10, §REQ-07, §REQ-05-restore).
      Зависимость: T-03 (G17-контракт в пути new от Стюарда).
- [ ] **T-05: Миграция + alias-чтение + seed** — design ADR-4, §Затронутые модули
      п.6, REQ-02. Use-case `migrateFaces` + подкоманда `wolf face migrate` в CLI-группу
      T-04: физическая миграция с дословным переносом title/тегов/owner_skill,
      поэтапная (падение на N-м не откатывает N-1, повторный запуск идемпотентен —
      §Отказов), skip посева при живом лице, howto без owner_skill не мигрируется;
      alias-чтение legacy-`playbook`; `seed-base-playbooks.ts` и `scaffold-agent.ts`
      переходят на face, `isPlaybookNote` (`scaffold-agent.ts:28`) распознаёт
      `type: 'face'`. AC: REQ-02. Проверки: unit + e2e migrate-taxonomy/taxonomy-alias
      (test-plan §REQ-02). Зависимости: T-04, T-01.
- [ ] **T-06: doctor-проверки NFR-02 + memory-sync** — design §Затронутые модули
      п.7–8, NFR-02. `memory-doctor.ts`: дубликат канонического лица, face вне
      контракта, битый `based_on`, legacy+face одновременно (по образцу
      `memory-doctor.ts:236`); `memory-sync.ts:37` — сообщение Стюард-зоны указывает на
      `wolf face *`. Формат вывода `! <file>: <issue>` сохраняется. AC: NFR-02.
      Проверки: unit + e2e doctor-hygiene (test-plan §NFR-02). Зависимость: T-05
      (проверка legacy+face осмысленна после миграции).
- [ ] **T-07: Guard прямого `wolf add`** — design §Затронутые модули п.5, REQ-01 AC3,
      REQ-08 AC3. `src/app/use-cases/add-memory-object.ts`: отказ `--type face` с
      указанием на `wolf face *` (прецедент rule-guard `add-memory-object.ts:80`);
      расширение facet-guard — `facet='proposal'` разрешён на типах с сигнал-словарём
      (сейчас бросает «only valid for type note», `add-memory-object.ts:96`),
      character-фасеты по-прежнему только note. Проверки: unit use-cases + e2e
      add-collision-guard (test-plan §REQ-01, §REQ-08). Зависимость: T-01.
- [ ] **T-08: wolf-router вариант Б + переработка TTL-теста** — design §Отказов
      («Не переключение посередине задания — вариант Б», CR-2026-10-13-02), NFR-01 AC2,
      REQ-05 AC2 + усиленный AC. `.opencode/plugins/wolf-router.ts` (единственные файлы
      задачи — плагин и его тест): (а) мемоизация инъекции по opencode-сессии
      (session-id) — повторная вставка в пределах сессии подавляется независимо от
      персистентности system-текста; (б) кэш между сессиями версионируется ключом
      актуальной записи (head) — кэш-запись устаревшей версии не отдаётся. Guard,
      поиск, fail-safe не меняются. Переработка TTL-теста
      `tests/unit/wolf-router-plugin.test.ts:218` (respawn + повторная инъекция) под
      новые ожидания: respawn после TTL → актуальная версия; повторная инъекция в той
      же сессии → без нового содержания; новая сессия в пределах TTL после публикации
      новой версии → актуальная версия (остаточный случай №1, F-01 ревью плана).
      AC: REQ-05 (AC2, усиленный), NFR-01 AC2.
      Проверки: `npx vitest run tests/unit/wolf-router-plugin.test.ts` (test-plan
      §REQ-05, §NFR-01). Зависимости: нет — параллельно с T-01 (изолированная запись).
- [ ] **T-09: Предложения: save/deliver + CLI `wolf propose`** — design §Затронутые
      модули п.9, таблица (CLI `wolf propose`), REQ-08/REQ-09. Новые use-cases
      `save-proposal.ts` (пиннинг автора env-атрибуцией, контрактные поля обязательны,
      вкл. `applicability_bounds`), `deliver-proposal.ts` (императивный текст не
      применяется, лицо адресата не меняется, событие `memory.proposal.delivered`);
      CLI-группа `wolf propose` (add/deliver/list); сохранение через существующий MCP
      `add` — та же валидация контракта (v1, обёртки face/propose — бэклог).
      Проверки: unit use-cases/adapters (test-plan §REQ-08, §REQ-09). Зависимости:
      T-07 (facet-guard).
- [ ] **T-10: Интеграция + e2e волны + полный гейт** — design ADR-4 (проверки),
      §Отказов. Порядок объединения: T-01→T-02→T-03→T-04→T-05→T-06, параллельные ветви
      T-07→T-09 и T-08 вливаются до T-10. E2E-сценарии волны: «мутация лица в живом
      чате не меняет доставленный текст» (усиленная механика T-08, не допущение);
      «мигрированное лицо резолвится router-путём» (после T-05); «respawn после TTL —
      актуальная версия»; существующие taxonomy-alias / migrate-taxonomy /
      router-fallback зелёные. Полный `npm run check` — гейт задачи. Обновление
      docs/dev/INDEX.md и docs/dev/roadmap/wave-2.17.md (фазы волны — по фактическому
      исполнению). Правила разрешения конфликтов: конфликт в общем файле —
      перебазировка ветви на обновлённый main, повторный targeted-прогон ветви.
      Зависимости: T-01…T-09.

## Документация и сайт (T-11) + релизный чек-лист

По правилам `mem_20260929_kazhdyy_plan_volny…` и
`mem_20260929_sayt_soderzhit_stranitsu_changelog_c0ac8b`: релиз завершён только
с опубликованными доками и сайтом.

- [ ] **T-11: Документация, сайт, релизная подготовка** — выполняется после приёмки
      T-10: (1) docs/ актуальны (README/docs по новым CLI `wolf face`, `wolf propose`;
      CLI-reference перегенерируется `docs:build`); (2) CHANGELOG.md — запись версии;
      (3) версия — `npm version X.Y.Z` (полный номер, package.json — единственный
      источник, правило `mem_20260831_vedenie_versiy…`); (4) `npm run docs:build` —
      сайт собирается, changelog-страница синхронна с CHANGELOG.md
      (scripts/sync-changelog.mjs); (5) публикация (тег `vX.Y.Z`, GitHub Release,
      npm publish, sync) — отдельным согласованным шагом с владельцем, не внутри
      задач T-01…T-10.

Релизный чек-лист (отметки — по факту):

1. [ ] `npm run check` зелёный
2. [ ] `npm version X.Y.Z` (полный X.Y.Z)
3. [ ] CHANGELOG.md дополнен
4. [ ] docs/ актуальны (вкл. CLI-reference)
5. [ ] `npm run docs:build` собран, changelog-страница синхронна
6. [ ] тег `vX.Y.Z` + GitHub Release
7. [ ] npm publish (trusted publishing)
8. [ ] `wolf sync` в проекты-потребители

## Сверка план ↔ test-plan

- REQ-01 → T-01, T-07; REQ-02 → T-05 (+T-06 doctor, T-10 e2e); REQ-03 → T-02, T-04,
  T-07; REQ-04 → T-02, T-04; REQ-05 → T-04 (restore) + T-08 (доставка, вариант Б);
  REQ-06 → T-03; REQ-07 → T-04; REQ-08 → T-01 (валидация), T-07 (guard), T-09;
  REQ-09 → T-09; REQ-10 → T-04; NFR-01 → T-08 (переработка TTL-теста) + T-10
  (полный гейт); NFR-02 → T-06; NFR-03 → T-08 (инвариант сохранён) + существующие
  проверки доставки.
- Каждый REQ/NFR имеет измерение в test-plan.md; версии входов сверены на дату
  плана (requirements CR-2026-10-13-02, design — вариант Б CR-2026-10-13-02).
