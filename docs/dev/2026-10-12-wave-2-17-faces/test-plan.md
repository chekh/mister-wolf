---
slug: wave-2-17-faces
title: wave-2-17-faces — тест-план
status: draft
created: 2026-10-12
updated: 2026-10-13
---

# wave-2-17-faces — тест-план

Вход: requirements.md (CR-2026-10-13-02) — AC единый источник ожиданий; design.md —
механика (вариант Б CR-2026-10-13-02). План: plan.md T-01…T-11 (маппинг — в сверке
плана). Oracle — формулировки AC requirements; уровень unit/e2e указан в маппинге.

## Сценарии

### REQ-01 — face как core-тип (T-01, T-07)

- Given декларация `face` в `CORE_TAXONOMY_DECLS`, When `wolf add --help` / choices
  типов, Then `face` присутствует; get/list/search показывают тип face.
- Given вызов `wolf add --type face` (прямой), When guard, Then отказ с указанием
  на `wolf face *`.
- Маппинг: unit `tests/unit/domain/taxonomy.test.ts` (осознанная правка ожиданий
  «ровно 7»→8 — см. T-01), use-cases guard
  (аналог `tests/e2e/add-collision-guard.e2e.ts` паттерн).

### REQ-02 — миграция + alias + seed (T-05)

- Given репозиторий с legacy-`playbook` записями, When `wolf face migrate`, Then
  созданы face-версии с дословными title/тегами/owner_skill; цепочка supersede
  сохранена; head скрыт.
- Given мигрированное лицо, When `wolf scaffold --from-playbook <face-id>`, Then
  операция работает после миграции (`isPlaybookNote` распознаёт `type: 'face'`).
- Given howto без `owner_skill`, When миграция, Then запись не мигрируется
  (skip с отчётом).
- Given падение на N-й записи, When повторный запуск, Then N-1 не откатывается,
  запуск идемпотентен.
- Given init-посев при живом лице агента, When seed, Then skip (не пересеивает).
- Маппинг: unit use-cases migrate-faces; unit scaffold (face-id); e2e
  `tests/e2e/migrate-taxonomy.e2e.ts`,
  `tests/e2e/taxonomy-alias.e2e.ts` остаются зелёными; новый тест «мигрированное
  лицо резолвится router-путём» (в e2e волны T-10).

### REQ-03 — guard версионирования (T-02, T-07)

- Given не-Стюард, When createFaceVersion, Then отказ + событие
  `memory.face.denied {owner_skill, actor, command}`.
- Given Стюард (WOLF_ACTOR=agent:steward) без `--created-by`, When операция, Then
  успех через публичный путь.
- Given doctor, When правка лица в обход, Then находка видна.
- Маппинг: unit `tests/unit/use-cases/create-face-version.test.ts` (новый).

### REQ-04 — поля версии + событие (T-02)

- Given создание версии с основой/причиной/инициатором, When history, Then поля
  полны (based_on, reason, initiator вкл. `seed`, время).
- Given операция без reason, When выполнение, Then падение.
- Given успех, When журнал, Then `memory.face.versioned {owner_skill, from, new,
initiator, reason}`.
- Маппинг: unit `tests/unit/use-cases/create-face-version.test.ts`.

### REQ-05 — restore + механика доставки, вариант Б (T-04, T-08)

- Given восстановление V_n из истории, When restore, Then новая V_k с based_on=V_n;
  обратной supersede-ссылки на V_n нет.
- Given живая сессия с доставленной инъекцией, When в ней публикуется новая версия
  и рантайм пересобирает system, Then повторной вставки нового содержания нет
  (мемоизация по session-id) — усиленная механика, не допущение.
- Given новая сессия/чат после истечения TTL-кэша, When доставка, Then актуальная
  версия лица (не устаревшая из кэша).
- Given опубликована новая версия лица, When новая сессия/чат в пределах
  TTL-кэша, Then доставлена актуальная версия (версионированный кэш не отдаёт
  устаревшую запись — остаточный случай №1, F-01 ревью плана).
- Маппинг: unit `tests/unit/wolf-router-plugin.test.ts` (переработка TTL-теста,
  строка 218: respawn + повторная инъекция — новые ожидания); e2e волны «мутация
  лица в живом чате не меняет доставленный текст» (T-10).

### REQ-06 — G17-запись мутации (T-03)

- Given мутация лица Стюардом, When операция завершена, Then note(history) со всеми
  полями G17 + relation `mutates` → версия.
- Given отсутствующее обязательное поле, When завершение, Then не успех.
- Given запись, When чтение «границы», Then зафиксировано, что не меняется.
- Маппинг: unit use-cases (файл по месту реализации в T-03).

### REQ-07 — breakglass (T-04)

- Given недоступный/сломанный Стюард, When `wolf face breakglass` его лица, Then
  операция выполняется без Стюарда.
- Given breakglass, When выполнение, Then журнальная запись `memory.face.breakglass`
  в составе операции; не-владельцу — отказ.
- Маппинг: unit adapters/cli + use-cases.

### REQ-08 — сигнал-фасет proposal (T-01, T-07, T-09)

- Given сохранение предложения с полным контрактом (автор, адресат, основание,
  изменение, польза, applicability_bounds), When операция, Then успех; фасет
  поверх note и не-note core-типов.
- Given поле отсутствует (вкл. applicability_bounds), When сохранение, Then отказ
  валидации.
- Given proposal-фасет, When жалоба на ту же запись, Then маршрут жалобы не
  активируется.
- Given сохранённое предложение, When list/search или `wolf propose list`, Then
  объект читается с распознаваемым признаком предложения (AC1 REQ-08).
- Маппинг: unit `tests/unit/domain/type-schema-builder.test.ts` (валидация),
  use-cases save-proposal.

### REQ-09 — deliver предложения (T-09)

- Given доставленное предложение, When доставка, Then императивный текст не
  применяется, лицо адресата не меняется, автор = env-атрибуция (пиннинг),
  событие `memory.proposal.delivered {id, addressee}`; не доставлено ≠ обработано.
- Маппинг: unit use-cases deliver-proposal.

### REQ-10 — face list/history/show + router.log (T-04)

- Given лица в памяти, When `wolf face list/history/show`, Then перечисление и
  метаданные версий полны без чтения файлов памяти.
- Given доставка, When журналирование, Then формат router.log не деградирует
  (hit канон/fallback).
- Маппинг: unit adapters/cli; существующие тесты формата строк router
  (`wolf-router-plugin.test.ts`).

### NFR-01 — совместимость доставки + переработанный TTL-тест (T-08, T-10)

- Given правка плагина (вариант Б), When полный прогон, Then зелёные:
  `tests/unit/wolf-router-plugin.test.ts` (доставка playbook, fallback,
  fail-safe), `tests/unit/domain/playbook-schema.test.ts`, e2e
  taxonomy-alias/migrate-taxonomy.
- Измеримый AC TTL: после истечения TTL respawn → актуальная версия; повторная
  инъекция в той же сессии → без нового содержания; новая сессия в пределах TTL
  после публикации новой версии → актуальная версия (переработанный тест,
  `wolf-router-plugin.test.ts:218`, включая срединный сегмент «в пределах TTL»).
- Маппинг: полный гейт `npm run check` + targeted `npx vitest run
tests/unit/wolf-router-plugin.test.ts`.

### NFR-02 — doctor (T-06)

- Given дубликаты канонических лиц / face вне контракта / битый based_on /
  legacy+face, When `wolf doctor`, Then находки в формате `! <file>: <issue>`,
  асимптотика doctor не меняется (один проход по store.list).
- Маппинг: unit memory-doctor + e2e `tests/e2e/doctor-hygiene.e2e.ts`.

### NFR-03 — fail-safe доставки (T-08 — инвариант сохранён)

- Given повреждённая face-запись, When доставка, Then fallback-playbook, сессия
  жива; инъекция — не более одной на сессию.
- Маппинг: существующие тесты доставки `wolf-router-plugin.test.ts` (fail-safe).

## Прогоны

- Точечные: `npx vitest run tests/unit/wolf-router-plugin.test.ts`,
  `npx vitest run tests/unit/use-cases/`, `npx vitest run tests/unit/domain/`,
  `npx vitest run tests/e2e/migrate-taxonomy.e2e.ts`,
  `npx vitest run tests/e2e/taxonomy-alias.e2e.ts`,
  `npx vitest run tests/e2e/doctor-hygiene.e2e.ts`.
- Полный гейт: `npm run check` (english-surface + prettier + lint + build +
  test:run) — гейт T-10 и каждого чекбокса плана.
- Изоляция: fixtures во временных каталогах (`os.tmpdir()`-паттерн существующих
  e2e), реальных секретов и внешних побочных действий нет; время для TTL —
  `vi.useFakeTimers({ toFake: ['Date'] })` (существующий паттерн теста P106).
