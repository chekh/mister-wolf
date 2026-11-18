---
slug: patch-331-plan
title: План исполнения патча 3.3.1 — журнал противоречий micro-notes
status: active
created: 2026-11-18
---

# 1. Основание, роли, git-рамка

- Входы (approved): `requirements.md` (REQ-331-1..5, NFR-331-1..3, критерий D2),
  `design.md` (D4 — вариант A: append-only JSONL
  `.wolf/memory/micro-note-delivery.jsonl`; ADR-3 — legacy-строки
  `index.sqlite` сохраняются; дубликат `suppression_id` = UserFacingError),
  `test-plan.md` этой папки. База `9ad2fea4` (v3.3.0).
- Git: рабочая ветка от `9ad2fea4`; коммиты — только по явному разрешению
  владельца; независимое ревью diff'а до коммита (requirements §5). Публикация
  (PR → merge → `npm version 3.3.1` → тег) — вне scope, только по отдельной
  команде владельца (D3).
- Роли: интегратор, гейт волны и приёмка — ведущий (L0). Разработку ведёт
  свежий wolf-developer мандатом от ведущего (wolf-execute); план никого не
  нанимает. Допустимо два мандата: M1 = T1–T3 (ядро контракта), M2 = T4–T6
  (CLI/MCP + сквозное) — по готовности M1.
- Каждый регресс-тест из test-plan пишется до реализации своей задачи
  (TDD, red@9ad2fea4) — см. test-plan §1, §10.

# 2. Задачи

## T1 — Порт, JSONL-адаптер, фикстура, миграция (ADR-3)

- [ ] **T1** Цель: контракт журнала с идентичностью записей и постоянный
      носитель. `MicroNoteSuppressionRecord` получает `suppression_id`
      (`cnr_YYYYMMDD_<hex>`, PK журнала); `recordSuppression` — append без upsert,
      дубликат `suppression_id` → UserFacingError (ретрай — новый id, тихая
      перезапись запрещена); `resolveSuppression(suppressionId, resolution, at)`;
      новый `JsonlMicroNoteDeliveryLog` (файл
      `src/adapters/fs/jsonl-micro-note-delivery-log.ts`, предлагается design §3) —
      единственный владелец состояния; чтение полным сканом, устойчивость к
      незавершённой последней строке (design §11); init-миграция (design §7):
      триггер «файла журнала нет И `index.sqlite` содержит legacy-строки»,
      порядок suppressed по `suppressed_at, memory_id` (deliveries по `ts`),
      значения 1:1 включая NULL, атомарная запись (tmp + rename), legacy-строки
      НЕ удаляются. Фикстура формата 3.3.0 + детерминированный генератор.
  - Файлы (write allowlist): `src/ports/micro-note-delivery-log.port.ts`;
    `src/adapters/fs/jsonl-micro-note-delivery-log.ts` (новый);
    `tests/unit/adapters/fs/jsonl-micro-note-delivery-log.test.ts` (новый);
    `tests/fixtures/micro-note-index-330/` (новое, генератор + бинарник).
  - Зависимости: нет (первая задача).
  - Связи: design §3, §4, §6 (A), §7, §11; REQ-331-1, REQ-331-2, REQ-331-3;
    NFR-331-3. Тесты: T-1.6, T-2.4, T-3.1–T-3.4 (миграционная часть).
  - Самопроверка: `npx vitest run tests/unit/adapters/fs/jsonl-micro-note-delivery-log.test.ts`
    зелёный, red@9ad2fea4 подтверждён до реализации; `tsc --noEmit` в области
    задачи (дерево целиком компилируется после T2).

## T2 — Чистка SQLiteSearchIndex и переключение контейнеров

- [ ] **T2** Цель: `SQLiteSearchIndex` — снова только поисковый индекс/кэш:
      реализация `MicroNoteDeliveryLog` и таблицы `micro_note_*` удаляются
      (`SQLITE_SCHEMA`, `src/adapters/sqlite/sqlite-schema.ts:62-84`; примечание
      «one open conflict per note» удаляется); класс перестаёт implement порт.
      Контейнеры инъекцию разделяют (design §3): поиск — sqlite-индекс, журнал —
      jsonl-адаптер: CLI `src/adapters/cli/commands/memory-call.ts:48`, MCP
      `src/adapters/mcp/mcp-tools.ts:473`. Контейнеры — единственные места сборки.
  - Файлы (write allowlist): `src/adapters/sqlite/sqlite-search-index.ts`;
    `src/adapters/sqlite/sqlite-schema.ts`; `src/adapters/cli/commands/memory-call.ts`;
    `src/adapters/mcp/mcp-tools.ts` (только инъекция журнала);
    обновление существующих sqlite/schema-тестов
    (`tests/unit/adapters/sqlite-*.test.ts`, `schema-guard`).
  - Зависимости: T1 (новый порт). Рядом с T3 общая ревизия компиляции —
    см. §3.
  - Связи: design §3, §7 (совместимость схемы), §11; REQ-331-2.
  - Самопроверка: обновлённые sqlite-тесты зелёные; `tsc --noEmit` после
    минимального согласования вызовов use-case (полная компиляция — после T3).

## T3 — Use-cases: валидация, генерация id, some-семантика

- [ ] **T3** Цель: `reportMicroNoteContradiction` — trim-валидация
      reason/evidence (design §8): пустое/whitespace → UserFacingError в стиле
      resolve, журнал не изменён; значения пишутся trim; генерация
      `suppression_id` существующим генератором id проекта с префиксом `cnr_`;
      результат report дополняется id. `resolveMicroNoteSuppression` — вход
      `{ suppression_id, resolution }`, REQ-03-тексты для unknown/resolved.
      `openContradiction` (`micro-note-delivery.ts:171`) — `some(...)` по открытым
      записям текущей ревизии; правило актуальности общее для фильтра доставки и
      list (AC-5.4, design §9).
  - Файлы (write allowlist): `src/app/use-cases/micro-note-contradiction.ts`;
    `src/app/use-cases/micro-note-delivery.ts`; юнит-тесты use-case
    (new/updated рядом с существующими).
  - Зависимости: T1 (порт с id).
  - Связи: design §4, §8, §9; REQ-331-1, REQ-331-4, REQ-331-5; NFR-331-2.
    Тесты: T-1.4 (use-case часть), T-1.5, T-4.1, T-4.2, T-4.4.
  - Самопроверка: юнит-тесты зелёные (red до реализации), `tsc --noEmit`
    зелёный на всём дереве (совместно с T2).

## T4 — CLI memory-contradict: report печатает id, resolve --id, list §9

- [ ] **T4** Цель: `contradict report` печатает `suppression_id`;
      `contradict resolve` — обязательный `--id <suppression_id>`; переданный
      `--note` — отказ UserFacingError со списком открытых id записей заметки
      (переиспользует список list, design §9; обратной совместимости флага нет);
      `contradict list` — формат design §9: id, `note_id@revision`, reason,
      `(suppressed at <ts>)`, `block: actual|superseded|unknown`; актуальность по
      общему правилу `openContradiction` (store из контейнера — уже доступен);
      пустой список — «no open suppressions» (без регрессии REQ-R4 AC-1.5).
  - Файлы (write allowlist): `src/adapters/cli/commands/memory-contradict.ts`;
    `tests/unit/adapters/contradict-cli.test.ts` (обновляемый).
  - Зависимости: T3 (use-case, правило актуальности).
  - Связи: design §4, §9; REQ-331-1 (AC-1.2, AC-1.4), REQ-331-5; NFR-331-2.
    Тесты: T-1.2 (вывод), T-1.4 (CLI), T-5.1–T-5.3.
  - Самопроверка: `npx vitest run tests/unit/adapters/contradict-cli.test.ts`
    зелёный; красные состояния до реализации зафиксированы.

## T5 — MCP: схема report minLength, resolve по suppression_id

- [ ] **T5** Цель: `NoteContradictionInputSchema` (`mcp-schemas.ts:109`) —
      `reason` и `contradiction_evidence` `trim().min(1)` (первая линия защиты,
      design §8); действие resolve — обязательный `suppression_id`, `note_id`
      из resolve-схемы удалён (design §4). Новых тулов и actions нет
      (NFR-331-1, guard не трогается).
  - Файлы (write allowlist): `src/adapters/mcp/mcp-schemas.ts`;
    `src/adapters/mcp/mcp-tools.ts` (только тело действия resolve);
    `tests/unit/adapters/note-contradiction-mcp.test.ts`,
    `tests/unit/adapters/mcp-schemas.test.ts` (обновляемые).
  - Зависимости: T3; параллельно с T4 (разные файлы) при готовности T3.
  - Связи: design §4, §8; REQ-331-1 (AC-1.3/1.4 через MCP), REQ-331-4;
    NFR-331-1 (`mcp-catalog-guard.test.ts` зелёный без правок). Тесты:
    T-4.3, T-1.3/T-1.4 (MCP-маршрут), guard.
  - Самопроверка: `npx vitest run tests/unit/adapters/note-contradiction-mcp.test.ts tests/unit/adapters/mcp-schemas.test.ts tests/unit/adapters/mcp/mcp-catalog-guard.test.ts`
    зелёные.

## T6 — Сквозные тесты волны и главный E2E-сценарий

- [ ] **T6** Цель: интеграционный файл
      `tests/integration/micro-note-contradictions.test.ts` — T-1.1, T-1.3,
      T-1.5, T-2.1–T-2.3, T-5.4 (parity) и главный E2E-сценарий приёмки
      (test-plan §8, критерий D2); обновление
      `tests/integration/micro-note-attribution.test.ts` и
      `learning-cycle-micro-note-e2e.test.ts` от смены носителя; артефакт
      red→green по всем регресс-тестам test-plan.
  - Файлы (write allowlist): `tests/integration/micro-note-contradictions.test.ts`
    (новый); `tests/integration/micro-note-attribution.test.ts`,
    `tests/integration/learning-cycle-micro-note-e2e.test.ts` (обновление).
  - Зависимости: T4, T5 (полная вертикаль).
  - Связи: REQ-331-1, 2, 5; главный критерий D2; test-plan §2, §3, §6, §8.
  - Самопроверка: `npx vitest run tests/integration/micro-note-contradictions.test.ts tests/integration/micro-note-attribution.test.ts tests/integration/learning-cycle-micro-note-e2e.test.ts`
    зелёные; таблица red@9ad2fea4 → green в RESULT.

## T7 — CHANGELOG

- [ ] **T7** Цель: запись `[3.3.1]` в `CHANGELOG.md`: breaking change команды
      `contradict resolve` (адресация `--note` → `--id`); журнал противоречий и
      доставки вынесен из `index.sqlite` в `.wolf/memory/micro-note-delivery.jsonl`;
      таблицы `micro_note_*` больше не используются, legacy-строки в
      `index.sqlite` сохранены (откат на 3.3.0 читает замороженный журнал);
      trim-валидация report; list с ревизией и актуальностью блокировки. Прямые
      чтения таблиц `index.sqlite` — не публичный контракт (design §11).
  - Файлы (write allowlist): `CHANGELOG.md`.
  - Зависимости: T6 (формулировки по факту интеграции).
  - Связи: design §7, §11; requirements §4 (вне scope — публикация).
  - Самопроверка: `npx prettier --check CHANGELOG.md` (входит в
    `npm run check` интегратора); запись согласована с фактическим diff.

## T8 — Гейт волны (ведущий, L0)

- [ ] **T8** Цель: интеграция на одной ревизии; полный `npm run check` зелёный;
      независимое ревью diff'а до коммита (wolf-reviewer, свежий); подтверждение
      red→green артефакта; ручной стенд-смок test-plan §9; приёмка по главному
      критерию D2 (test-plan §8); чекбоксы `[x]` — только после проверки
      результата и evidence. Коммиты — по явному разрешению владельца; публикация
      вне scope (D3).
  - Файлы: без write-allowlist (рамочная задача ведущего; правки — точечные
    исправления по ревью в рамках задач T1–T7).
  - Зависимости: T6, T7.
  - Связи: requirements §5 (верификация волны); D3.

# 3. Порядок, зависимости, интеграция

- Порядок: T1 → T2 → T3 → (T4 ∥ T5) → T6 → T7 → T8.
- T1–T3 сериально: общий контракт порта — дерево компилируется целиком только
  на их стыке (SQLite перестаёт implement порт, use-case меняет сигнатуры);
  запись в разные файлы, но одна ревизия. T4/T5 — параллельно (разные файлы,
  общий T3-контракт уже заморожен); интеграция их результатов — ведущий на
  общей ревизии.
- Mандаты (решает ведущий): один wolf-developer на T1–T6 (патч сцеплен через
  порт — прецедент волны R-4) или два: M1 = T1–T3, M2 = T4–T6. T7 — после
  интеграции; T8 — ведущий.
- Общий ресурс — контракт `MicroNoteDeliveryLog`: меняется только в T1,
  потребители (T2–T5) сериализованы этим. Фикстуры и временные проекты — в
  tmpdir, без общих путей.

# 4. Покрытие REQ/NFR → задачи и верификации

- REQ-331-1 → T1 (порт, адаптер), T3 (use-case), T4 (CLI), T5 (MCP);
  верификации T-1.1–T-1.6 (test-plan §2).
- REQ-331-2 → T1 (носитель), T2 (развязка контейнеров); T-2.1–T-2.4 (§3).
- REQ-331-3 → T1 (миграция + фикстура); T-3.1–T-3.4 (§4).
- REQ-331-4 → T3 (правило), T5 (схема); T-4.1–T-4.4 (§5).
- REQ-331-5 → T3 (правило актуальности), T4 (list); T-5.1–T-5.4 (§6).
- NFR-331-1 → T5 без правок guard (ровно 10 ≤ 12), инспекция diff'а (§7).
- NFR-331-2 → T3/T4: T-1.4, T-2.4, T-5.2 (§7).
- NFR-331-3 → T1: T-3.1–T-3.3, гарантия отката (§7).
- Главный критерий D2 → T6 (E2E §8) + приёмка T8.

# 5. Границы и риски

- Вне scope: новые MCP-тулы/actions и list-действие в MCP (guard 10 ≤ 12),
  компакция/ротация журнала, представления журнала кроме `list`,
  `reconcileMicroNoteObservations`, публикация (D3).
- Риски: волна правок в существующих CLI/MCP-тестах от смены адресации
  (учитывать, не считать регрессом); `mcp-tools.ts` правится двумя задачами
  (T2 — инъекция, T5 — действие resolve) — сериализовать интеграцию;
  rtk-хук переписывает grep-вывод wolf-CLI — стенд-проверки маркерами `echo`
  (test-plan §9); формат строк list — контрактом AC, снапшоты обновляются
  вместе с поведенческими тестами.
