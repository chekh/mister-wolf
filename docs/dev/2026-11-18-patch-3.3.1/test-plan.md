---
slug: patch-331-test-plan
title: Тест-план патча 3.3.1 — регресс-покрытие REQ-331-1..5 и NFR-331-1..3
status: active
created: 2026-11-18
---

# 1. Основа, оракулы, метод

- База: `9ad2fea4` (v3.3.0). Входы: `requirements.md` (approved; REQ-331-1..5,
  NFR-331-1..3), `design.md` (approved: D4 — вариант A, JSONL
  `.wolf/memory/micro-note-delivery.jsonl`; ADR-3 — legacy-строки `index.sqlite`
  сохраняются; дубликат `suppression_id` — UserFacingError).
- Оракулы — формулировки AC требований, живое воспроизведение дефектов
  (`mem_20261118_8dc7c6`: стенд-сценарии P1-1, P1-2, P2-1, P2-2 — основа
  регрессов) и сохранённое поведение REQ-R4 (пустой list — «no open
  suppressions», AC-5.3). Ожидаемый результат берётся из требований, не из кода.
- Метод «красный → зелёный»: каждый регресс-тест, помеченный
  `red@9ad2fea4`, прогоняется на рабочем дереве базы ДО реализации
  (ожидаемо красный — механизм дефекта подтверждён чтением кода и живым
  стендом), после исправления — зелёный. Guard-тесты, помеченные
  `green@base`, зелёны на базе и обязаны остаться зелёными.
- Уровни: unit — чистая логика (валидация use-case, генерация id, some-правило,
  MCP-схема, адаптер JSONL на tmp-директории); integration — контейнер
  (use-case + порт + адаптер), миграция фикстуры, CLI-команды; E2E — главный
  сценарий приёмки на собранном CLI и существующая MCP stdio-кампания.
- Изоляция и стабильность: фикстуры в `os.tmpdir()`, без секретов и внешних
  эффектов; время и id детерминированы (инъекция/фиксация значений); нет
  ретраев, маскирующих нестабильность. Параллельная запись двух процессов вне
  поддержки (design §11) — не тест.
- Команды: целевые — `npx vitest run <файл>`; полный гейт волны —
  `npm run check` (delivery-language + glossary + english-surface +
  format:check + build + test:run).

# 2. REQ-331-1 — идентичность записей противоречия (design §4, §5/ADR-1)

- T-1.1 (AC-1.1) `red@9ad2fea4`, integration,
  `tests/integration/micro-note-contradictions.test.ts` (planned).
  Given: заметка с одним resolved-противоречием. When: повторный report по той
  же заметке (новая ревизия/наблюдение). Then: в журнале ДВЕ записи; поля
  первой (reason, оба evidence, `resolved_at`, `resolution`) не изменились.
  Красный механизм на базе: `INSERT … ON CONFLICT(memory_id) DO UPDATE`
  (`sqlite-search-index.ts:396`) перезаписывает строку и сбрасывает решение.
- T-1.2 (AC-1.2) `red@9ad2fea4`, unit + CLI:
  `suppression_id` формата `cnr_YYYYMMDD_<hex>`, уникален при повторном report;
  вывод report содержит id; каждая строка `list` содержит id. Красный на базе:
  id нет ни в порте, ни в выводах.
- T-1.3 (AC-1.3) `red@9ad2fea4`, integration: две открытые записи одной
  заметки → resolve по id первой → снимается ровно она; вторая остаётся
  открытой в `suppressions()` и продолжает блокировать доставку (call не
  доставляет заметку).
- T-1.4 (AC-1.4, NFR-331-2) `red@9ad2fea4`, unit + CLI: resolve по
  неизвестному id и по уже разрешённому id — UserFacingError с названным
  текстом, одинаковым для обоих случаев (REQ-03: unknown stays unknown); CLI
  `resolve --note` — отказ с подсказкой: перечнем ОТКРЫТЫХ id записей этой
  заметки (фактический перечень, не заглушка).
- T-1.5 (AC-1.5) `red@9ad2fea4`, integration: две открытые записи одной
  ревизии → resolve одной → заметка по-прежнему вне доставки (семантика
  «some»). Красный на базе: upsert не даёт двух записей, а resolve по заметке
  снимает единственную — доставка возобновляется.
- T-1.6 (дубликат suppression_id, design §4) `red@9ad2fea4`, unit адаптера:
  append записи с уже существующим `suppression_id` → UserFacingError, файл
  журнала не изменён (тихая перезапись запрещена); повтор с новым id —
  успешный append. Красный на базе: upsert перезаписывает молча.

# 3. REQ-331-2 — постоянный носитель журнала (design §6/ADR-2, вариант A)

- T-2.1 (AC-2.1) `red@9ad2fea4`, integration: report + resolve →
  `rm .wolf/cache/index.sqlite` → `rebuild-index` → `suppressions()`,
  `deliveries()`, `observations()` возвращают всё; файл
  `.wolf/memory/micro-note-delivery.jsonl` существует и находится вне
  `.wolf/cache`. Красный на базе = стенд P1-2 (`mem_20261118_8dc7c6`): после
  удаления кэша list — «no open suppressions».
- T-2.2 (AC-2.2) `red@9ad2fea4`, integration: после того же пересоздания
  индекса активное подавление действует — спорная ревизия не доставляется
  (call).
- T-2.3 (AC-2.3) `red@9ad2fea4`, integration: история атрибуции (deliveries)
  и наблюдения (observations) переживают пересоздание индекса; сверка с
  обновляемым `tests/integration/micro-note-attribution.test.ts`.
- T-2.4 (AC-2.4, NFR-331-2) `red@9ad2fea4` (носителя нет — путь журнала
  недоступен на базе), unit адаптера + CLI: файл журнала отсутствует →
  `suppressions() = []` (состояние не изобретается), первая запись создаёт файл,
  `list` — «no open suppressions», доставка возобновляется, без скрытой ошибки
  (exit 0).

# 4. REQ-331-3 — миграция 3.3.0 → 3.3.1 (design §7/ADR-3, legacy сохраняется)

- Фикстура (planned): `tests/fixtures/micro-note-index-330/index.sqlite` +
  детерминированный генератор в репо: схема 3.3.0 (таблицы
  `micro_note_suppressions`, `micro_note_deliveries`, наблюдения) со строками:
  открытая, разрешённая (`resolved_at` + `resolution`), несколько заметок и
  ревизий, оба evidence, NULL-поля.
- T-3.1 (AC-3.1) `red@9ad2fea4` (миграции нет), integration: открытие
  фикстуры кодом 3.3.1 → все строки в JSONL 1:1 (`resolved_at`/`resolution`/
  `revision`/оба evidence без изменений, включая NULL).
- T-3.2 (AC-3.2) `red@9ad2fea4`, unit/integration: присвоенные id следуют
  детерминированному порядку (suppressions по `suppressed_at`, затем
  `memory_id`; deliveries по `ts`) и формату `cnr_…`.
- T-3.3 (AC-3.3) `red@9ad2fea4`, integration + unit: повторное открытие не
  дублирует записи (существование файла — признак миграции); имитация сбоя до
  rename → файл журнала не создан, legacy-таблицы бит-в-бит нетронуты, повтор
  миграции успешен; после УСПЕШНОЙ миграции legacy-строки в `index.sqlite`
  сохранены (SELECT обеих таблиц = исходные строки) — проверка поправки ADR-3
  (замороженная копия для отката, design §7, §11).
- T-3.4 (AC-3.4) unit/integration: проект без legacy-таблиц или без строк в
  них → миграция ничего не создаёт (файла журнала нет), `suppressions() = []`,
  поведение доставки не меняется.

# 5. REQ-331-4 — общая trim-валидация reason/evidence (design §8)

- T-4.1 (AC-4.1) `red@9ad2fea4` (стенд P2-1: exit 0 на пустых), unit
  use-case: report с `reason=''`, `reason='   '`, `evidence=''`,
  оба пустые → UserFacingError с названной причиной в стиле resolve
  (`…(REQ-03: unknown stays unknown)`); журнал не изменён
  (`suppressions()` до/после равны). Маршрут — прямой вызов use-case (= путь
  CLI, без MCP-схемы): правило — один носитель.
- T-4.2 (AC-4.2) unit use-case: `'  reason  '` / `'\tevidence\n'` → в журнал
  записаны trim-значения.
- T-4.3 (AC-4.3) `red@9ad2fea4`, unit MCP-схемы:
  `NoteContradictionInputSchema` (`mcp-schemas.ts:109`) отклоняет пустые и
  whitespace-only `reason` и `contradiction_evidence` (ошибка схемы до
  use-case). Независимость правила use-case от схемы доказывается T-4.1.
- T-4.4 (AC-4.4) `green@base` (регресс-защита), unit use-case: resolve с
  пустым/whitespace `resolution` — UserFacingError, текст и поведение как в
  3.3.0 (`micro-note-contradiction.ts:89`); после патча не меняются.

# 6. REQ-331-5 — наблюдаемость `contradict list` (design §9)

- T-5.1 (AC-5.1) `red@9ad2fea4`, CLI integration,
  `tests/unit/adapters/contradict-cli.test.ts` (обновляемый): каждая строка
  list в формате design §9: `suppression_id`, `note_id@revision`, reason,
  `(suppressed at <ts>)`, `block: actual|superseded|unknown`. Красный на базе:
  id и ревизии нет.
- T-5.2 (AC-5.2, NFR-331-2) `red@9ad2fea4`, CLI/integration: три состояния —
  «actual» (ревизия записи = текущей, блокирует сейчас), «superseded» (после
  `edit --body` — сценарий стенда P2-2: старая ревизия числилась открытой без
  статуса), «unknown» (заметки нет в store — REQ-03).
- T-5.3 (AC-5.3) `green@base` (существующий регресс REQ-R4 AC-1.5): пустой
  журнал → «no open suppressions»; остаётся зелёным.
- T-5.4 (AC-5.4) `red@9ad2fea4`, ЯВНЫЙ parity-тест, integration: таблица
  решений list ↔ фильтр доставки — для состояний {открытая текущей ревизии;
  открытая устаревшей ревизии; две открытые одной ревизии, resolve одной;
  все resolved} статус в list совпадает с результатом call: «actual» ⇔
  доставку блокирует, «superseded» ⇔ доставляет. Правило одно —
  `openContradiction` some (`micro-note-delivery.ts:171`): list не показывает
  «actual» для не блокирующей записи и наоборот.

# 7. NFR-331-1..3

- NFR-331-1 (каталог MCP): `tests/unit/adapters/mcp/mcp-catalog-guard.test.ts`
  — `green@base`, без правок: ровно 10 тулов ≤ 12 после патча; новые
  tools/actions отсутствуют. Состав `note_contradiction` — только поля и
  actions существующего тула: `tests/unit/adapters/note-contradiction-mcp.test.ts`
  и `tests/unit/adapters/mcp-schemas.test.ts` (обновляемые: resolve требует
  `suppression_id`, `note_id` из resolve-схемы удалён; report — minLength).
  Дополнительно — инспекция diff'а при независимом ревью.
- NFR-331-2 (REQ-03 «unknown stays unknown»): покрытие T-1.4 (unknown/resolved
  id — одинаковый текст), T-2.4 (утрата журнала без синтеза состояния),
  T-5.2 («unknown» статус) — тексты фиксируются тестами.
- NFR-331-3 (обратная совместимость): T-3.1–T-3.4; гарантия отката —
  сохранение legacy-строк в T-3.3.

# 8. Главный E2E-сценарий приёмки (requirements §5, критерий D2)

Отдельный integration-тест (в `tests/integration/micro-note-contradictions.test.ts`)
плюс ручной прогон на собранном CLI по стенду `mem_20261118_8dc7c6`:

- Given: проект с заметкой.
- When: report r1/e1 → report r2/e2 (два и более противоречий к одной заметке)
  → resolve ОДНОЙ записи по id → `rm .wolf/cache/index.sqlite` →
  `rebuild-index`.
- Then: list показывает оба наблюдения и сохранённое решение; спорная ревизия
  вне доставки (call) — открыта хотя бы одна запись (семантика «some»);
  после resolve второй записи заметка доставляется. Дословная проверка
  критерия: «после нескольких противоречий к одной заметке и пересоздания
  индекса каждое наблюдение и решение сохранены, спорная ревизия остаётся вне
  доставки, пока её противоречие открыто».

# 9. Регресс существующего покрытия и ручной стенд

- Обновляемые существующие тесты (ожидаемая волна правок от удаления
  `micro_note_*` из `SQLITE_SCHEMA` и смены адресации): `tests/unit/adapters/contradict-cli.test.ts`,
  `tests/unit/adapters/note-contradiction-mcp.test.ts`,
  `tests/unit/adapters/mcp-schemas.test.ts`, sqlite-тесты
  `tests/unit/adapters/sqlite-*.test.ts` и `schema-guard`,
  `tests/integration/micro-note-attribution.test.ts`,
  `tests/integration/learning-cycle-micro-note-e2e.test.ts`.
  Guard-тесты (`mcp-catalog-guard`) не редактируются.
- Ручной стенд-смок (после интеграции, воспроизводимая процедура): временный
  проект (`wolf init --yes`; каталог с README.md — иначе init отказывает),
  CLI из репо `node dist/bootstrap/cli.js` (глобальный wolf 3.2.0 не
  использовать); 4 сценария стенда P1-1/P1-2/P2-1/P2-2 → все зелёные. Вывод
  wolf-команд проверять маркерами `echo` без grep (rtk-хук переписывает
  grep-вывод — урок `mem_20261118_8dc7c6`).
- Существующая MCP stdio-кампания (4 сценария из ревью) — при интеграции.

# 10. Гейты волны и evidence

1. Исполнитель per-задача: целевые `npx vitest run <файлы>` + `tsc --noEmit`;
   артефакт red→green (список тестов с исходом на базе и после) — в RESULT.
2. Интегратор (ведущий): полный `npm run check` зелёный.
3. Независимое ревью diff'а до коммита (requirements §5).
4. Приёмка: главный критерий D2 (§8) + выборочная сверка AC.

# 11. Границы тест-плана

- Компакция/ротация журнала, объём/деградация полного скана — вне scope
  3.3.1 (design §11–12), не верифицируется.
- Параллельная запись двух процессов — вне поддержки (design §11), не тест.
- «Красный на базе» для T-3.x/T-2.4 может выражаться отсутствием носителя/
  миграции (конструктивный red) — фактический исход фиксируется в артефакте.
- Формат строк list и тексты ошибок — контракт AC; снапшот-тесты вывода
  обновляются вместе с CLI-тестами (T-5.1), не вместо поведенческих проверок.
