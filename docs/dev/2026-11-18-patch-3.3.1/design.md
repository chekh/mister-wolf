---
slug: patch-331-design
title: Дизайн патча 3.3.1 — журнал противоречий micro-notes: идентичность записей, постоянное хранение, миграция
status: approved — ведущий, 2026-11-18 (D4: вариант A; ADR-3: legacy-строки сохраняются)
created: 2026-11-18
---

# 1. Контекст и входы

- База: `9ad2fea4` (v3.3.0), рабочее дерево чистое. Требования:
  `docs/dev/2026-11-18-patch-3.3.1/requirements.md` (REQ-331-1..5 + NFR-331-1..3).
- Ревью-источник: `mem_20261118_f26dfb`; главный критерий приёмки — дословно в
  requirements.md §1.
- Механизмы дефектов подтверждены чтением кода:
  `src/adapters/sqlite/sqlite-search-index.ts:396,420,435`;
  `src/app/use-cases/micro-note-contradiction.ts:47,85`;
  `src/app/use-cases/micro-note-delivery.ts:171`;
  `src/adapters/cli/commands/memory-contradict.ts:60`;
  `src/adapters/mcp/mcp-schemas.ts:109`;
  `src/adapters/fs/project-paths.ts:26`;
  `src/app/use-cases/rebuild-memory-index.ts`;
  схема: `src/adapters/sqlite/sqlite-schema.ts:62-84`; порт:
  `src/ports/micro-note-delivery-log.port.ts:29-73`.
- Точки инъекции журнала (из R-4): CLI `memory-call.ts:48`, MCP
  `mcp-tools.ts:473` (контейнер отдаёт sqlite-индекс сразу как поиск и журнал).

# 2. Глоссарий

- Журнал — состояние порта `MicroNoteDeliveryLog`: подавления (suppressions),
  доставки (deliveries), наблюдения (observations).
- Запись противоречия — отдельное наблюдение противоречия с собственным
  id (`suppression_id`); несколько записей могут относиться к одной заметке.
- Актуальность блокировки — открытая запись, ревизия которой равна текущей
  ревизии заметки; только такая запись блокирует доставку сейчас.

# 3. Компоненты и ответственность

- Порт `src/ports/micro-note-delivery-log.port.ts` — контракт адресации:
  `MicroNoteSuppressionRecord` получает `suppression_id`;
  `recordSuppression` — вставка без upsert (append);
  `resolveSuppression(suppressionId, resolution, at)` — адресует запись.
- Новый адаптер `JsonlMicroNoteDeliveryLog` (предлагаемый путь
  `src/adapters/fs/jsonl-micro-note-delivery-log.ts`) — единственный владелец
  состояния журнала; файл `.wolf/memory/micro-note-delivery.jsonl`; возвращает
  к жизни и миграцию (ADR-3).
- `SQLiteSearchIndex` — снова только поисковый индекс/кэш: реализация
  `MicroNoteDeliveryLog` и таблицы `micro_note_*` из него убираются
  (`SQLITE_SCHEMA` правится); класс перестаёт implement порт.
- Контейнер (CLI `memory-call.ts:48`, MCP `mcp-tools.ts:473`): инъекция
  разделяется — поиск остаётся sqlite-индексом, журналом становится
  jsonl-адаптер. Контейнеры — единственные места сборки; use-case не меняет
  зависимости.
- Use-case `micro-note-contradiction.ts` — trim-валидация report (§8),
  генерация `suppression_id`, resolve по записи.
- Use-case `micro-note-delivery.ts` (`openContradiction`) — семантика «some» и
  общее правило актуальности (§9).
- CLI `memory-contradict.ts` — report печатает id; resolve `--id`; list
  обогащён (§9).
- MCP `mcp-schemas.ts` / `mcp-tools.ts` — схема report: minLength;
  схема resolve: `suppression_id` вместо note_id (§8, §9).

# 4. Контракты (ключевые фрагменты)

```ts
interface MicroNoteSuppressionRecord {
  suppression_id: string; // 'cnr_YYYYMMDD_<hex>', PK журнала
  memory_id: string; // заметка; НЕ уникален — записей может быть несколько
  revision: string;
  reason: string;
  note_evidence: string;
  contradiction_evidence: string;
  suppressed_at: string;
  resolved_at: string | null;
  resolution: string | null;
}

interface MicroNoteDeliveryLog {
  recordSuppression(record: MicroNoteSuppressionRecord): void; // append;
  // дубликат suppression_id → UserFacingError; ретрай генерирует новый id
  // (тихая перезапись запрещена — журнал append-only)
  resolveSuppression(suppressionId: string, resolution: string, at: string): void;
  suppressions(): MicroNoteSuppressionRecord[]; // + suppression_id
  // deliveries/observations — без изменений контракта
}
```

- `reportMicroNoteContradiction`: вход без изменений (`note_id`, `reason`,
  `contradiction_evidence`); результат дополняется `suppression_id`. Id
  генерируется существующим генератором id проекта (тем же, что создаёт
  `mem_…`-идентификаторы) с префиксом `cnr_`.
- `resolveMicroNoteSuppression`: вход `{ suppression_id, resolution }`;
  trim-валидация обоих полей сохраняется (REQ-03).
- CLI `contradict resolve`: `--id <suppression_id>` (обяз.); переданный
  `--note` — отказ UserFacingError со списком открытых id записей этой заметки
  (переходная подсказка; обратной совместимости флага нет — команда появилась
  в 3.3.0, адресация по заметке и есть дефект P1-1).
- MCP `note_contradiction`, action=resolve: обязателен `suppression_id`;
  `note_id` для resolve из схемы удаляется. action=report: reason и
  contradiction_evidence — `trim().min(1)`. Новых actions и тулов нет
  (NFR-331-1).
- `openContradiction` (`micro-note-delivery.ts:171`): условие
  `find(...)` заменяется на `some(...)` по открытой записи той же ревизии —
  блокирует ЛЮБАЯ открытая запись текущей ревизии; правило одно для фильтра
  доставки и list (AC-5.4).

# 5. ADR-1: идентичность записи противоречия (P1-1, REQ-331-1)

- Контекст: схема 3.3.0 держит «one open conflict per note» (upsert по
  memory_id, комментарий в `sqlite-schema.ts:71-74`) — повторное наблюдение
  затирает предыдущее вместе с решением.
- Альтернативы: (i) upsert + счётчик наблюдений в одной строке; (ii) append с
  собственным id каждой записи.
- Решение: (ii). Каждое наблюдение — самостоятельная запись с `suppression_id`;
  resolve адресует запись; история полная.
- Последствия: в журнале возможны несколько открытых записей одной ревизии —
  блокировка действует, пока открыта хотя бы одна (`some`, AC-1.5); resolve
  снимает ровно одну запись (AC-1.3); миграция присваивает id legacy-строкам
  (ADR-3); примечание «one open conflict per note» из схемы удаляется.
- Проверяемое свойство: повторный report не изменяет существующие строки
  (интеграционный тест на AC-1.1).

# 6. ADR-2: постоянное хранение журнала (P1-2, REQ-331-2) — развилка, рекомендация

Финальное решение — за ведущим (D4); ниже оба варианта с последствиями.

## Вариант A (рекомендация): отдельный постоянный журнал — файл в `.wolf/memory`

Append-only JSONL `.wolf/memory/micro-note-delivery.jsonl`; одна строка — одна
запись с полем kind (`suppression` | `delivery` | `observation`). Владелец —
`JsonlMicroNoteDeliveryLog`: чтение файла в память при первом обращении, append
с атомарной заменой при инициализации миграции (tmp + rename), директория —
та же, где уже живут `events.jsonl` и `relations.jsonl`
(`project-paths.ts:13,43`).

Плюсы: переживает rebuild и удаление `index.sqlite` — цель P1-2 достигается
прямо (журнал физически вне кэша); house-style (прецеденты JSONL-журналов в
той же директории); простая инспекция и diff; нет churn схемы объектов.

Минусы и последствия: чтение — полный скан файла; ожидаемый объём — тысячи
строк (deliveries пишутся по событию доставки), миллисекунды; компакция вне
scope 3.3.1 (§3, §11, будущий CR); конкурентная запись двух процессов не
поддерживается ровно как в 3.3.0 (однопользовательский CLI/MCP; у SQLite была
busy_timeout, у JSONL её нет — ограничение то же по контуру использования).

## Вариант B: записи противоречий как объекты памяти, журнал — производный кэш

Подавления становятся объектами памяти (новый тип `contradiction-record`),
rebuild восстанавливает их из object store автоматически; deliveries и
наблюдения остаются журналом.

Плюсы: единое хранилище с остальной памятью; rebuild восстанавливает без
отдельного механизма; подавления видны в `wolf search`/`brief`.

Минусы: операционное состояние загрязняет каталог знаний — подавления и
(тем более) факты доставок не являются знанием проекта и попадают в поиск,
brief и подменторинг памяти; resolve = правка объекта противоречит
append-only аудиту (evidence-пары должны сохраняться неизменными); нужен
новый тип объекта со schema_version и валидацией — churn контура памяти ради
patch-релиза; миграция сложнее (синтез объектов с датами); наблюдения всё равно остаются в журнале, который rebuild не восстанавливает, —
проблема P1-2 решается лишь наполовину.

Рекомендация: вариант A — он закрывает P1-2 целиком (все три семейства
записей порта), минимальным изменением и в стиле проекта. Вариант B
отклоняется как наполовину решающий и нарушающий границу «память = знание».

## Восстановление при утрате

- Утрата/пересоздание `index.sqlite`: делать ничего не нужно — журнал вне кэша
  (AC-2.1–2.3); rebuild восстанавливает только поисковый индекс.
- Утрата самого журнала: восстановить неоткуда — наблюдения были разовыми
  отчётами сессии; REQ-03: состояние не изобретается, доставка возобновляется,
  список пуст (AC-2.4). Граница потери зафиксирована и одинакова для A и B
  (в B — при утрате object store).

# 7. ADR-3: миграция 3.3.0 → 3.3.1 (REQ-331-3)

- Триггер: первый доступ к журналу в `JsonlMicroNoteDeliveryLog`: файла журнала
  нет И `index.sqlite` существует и содержит строки legacy-таблиц
  (`micro_note_suppressions`, `micro_note_deliveries`, наблюдения).
- Алгоритм: чтение legacy-строк в детерминированном порядке (suppressions по
  `suppressed_at, memory_id`; deliveries по `ts`); присвоение `suppression_id`
  по порядку; значения полей переносятся 1:1 (`resolved_at`/`resolution` —
  как есть, включая NULL); атомарная запись журнала (tmp + rename); после
  успеха legacy-таблицы НЕ удаляются и не используются 3.3.1: строки остаются
  в `index.sqlite` нетронутыми — замороженная копия журнала на момент миграции,
  страхующая откат на 3.3.0 (поправка ведущего при приёмке, 2026-11-18).
- Идемпотентность: существование файла журнала — признак выполненной миграции;
  сбой до rename оставляет legacy-таблицы нетронутыми, повтор возможен (AC-3.3).
- Совместимость схемы: таблицы `micro_note_*` удаляются из `SQLITE_SCHEMA`;
  `CREATE IF NOT EXISTS` на старом файле их не воссоздаёт; rebuild больше не
  наполняет журнал.
- Проверяемое свойство: фикстура `index.sqlite` формата 3.3.0 → открытие
  кодом 3.3.1 → все строки в журнале, второе открытие не дублирует (AC-3.1–3.4).

# 8. Валидация reason/evidence (P2-1, REQ-331-4)

Одно место правила — use-case `reportMicroNoteContradiction`
(`micro-note-contradiction.ts:47`): пустая или whitespace-only reason ИЛИ
evidence → `UserFacingError` с текстом в стиле resolve
(`:89`, «…(REQ-03: unknown stays unknown)»); в журнал пишутся trim-значения
(AC-4.1–4.2). CLI и MCP оба идут через use-case — правило покрывает оба
маршрута одним носителем (активное ограничение). MCP-схема
`NoteContradictionInputSchema` (`mcp-schemas.ts:109`) добавляет `trim().min(1)`
как первую линию защиты (ошибка схемы до use-case); правило use-case от схемы
не зависит — CLI схему не проходит (AC-4.3). Resolve-валидация не меняется
(AC-4.4).

# 9. Наблюдаемость: `contradict list` (P2-2, REQ-331-5)

- Формат строки: `<suppression_id> <note_id>@<revision> <reason> (suppressed at
<ts>) block: actual|superseded|unknown`.
- Актуальность — та же функция/правило, что фильтр доставки
  (`openContradiction`, `micro-note-delivery.ts:171`): actual — открытая
  запись и `record.revision === learningSignalRevision(obj)` текущего объекта;
  superseded — ревизии разошлись; unknown — заметки нет в store или ревизию
  определить нельзя (REQ-03, AC-5.2, AC-5.4). Для вычисления CLI list получает
  store из контейнера (уже доступен).
- Пустой список — «no open suppressions» (REQ-R4 AC-1.5 без регрессии).
- Подсказка в отказе `resolve --note` переиспользует тот же список открытых id
  записей заметки (AC-1.4).

# 10. Покрытие REQ/NFR

- REQ-331-1 → ADR-1, §4 (порт, use-case, CLI, MCP).
- REQ-331-2 → ADR-2 (вариант A), §3 (адаптер, контейнер).
- REQ-331-3 → ADR-3.
- REQ-331-4 → §8.
- REQ-331-5 → §9, §4 (`openContradiction` some).
- NFR-331-1 → §4 (без новых тулов/действий MCP).
- NFR-331-2 → §6 (утрата журнала), §8, §9 (unknown).
- NFR-331-3 → ADR-3; компакция — §6, §11.

# 11. Сценарии отказа, восстановления, совместимости

- Утрата/пересоздание `index.sqlite` — журнал цел, подавления действуют
  (REQ-331-2, главный критерий приёмки).
- Частичная запись журнала — невозможна: init-миграция через атомарный rename;
  рабочие appends — добавление строки (частичная строка при crash в append
  отбрасывается парсером как незавершённая, чтение устойчиво к последней
  неполной строке).
- Параллельные процессы — вне поддержки, как в 3.3.0 (§6, вариант A).
- Прямые чтения таблиц `index.sqlite` сторонними скриптами — не публичный
  контракт; публичный контракт — порт и CLI/MCP (фиксируется в CHANGELOG
  при релизе).
- Откат релиза: legacy-строки в `index.sqlite` сохраняются (§7) — откат на
  3.3.0 читает замороженный журнал на момент миграции; изменения 3.3.1 после
  миграции при откате не видны (фиксируется в рисках релиза).
- Утрата журнала в уже мигрированном проекте (ревью FINDING-1, 2026-11-19):
  при ручном удалении `micro-note-delivery.jsonl` следующий доступ к журналу
  реимпортирует замороженную копию из `index.sqlite` — пост-миграционные
  записи 3.3.1 не восстанавливаются, состояние не изобретается (значения из
  реальной копии). Принято ведущим без кодового изменения: ложное
  срабатывание подавления безопаснее потери подавления; фиксируется в рисках
  релиза.

# 12. Риски и открытые вопросы

- Риск: неограниченный рост deliveries-журнала — компакция вне scope 3.3.1;
  мониторинг размера файла, будущий CR.
- Риск: полный скан при чтении журнала — приемлем при ожидаемом объёме;
  индекс не нужен до появления признаков деградации.
- Решено (D4, ведущий 2026-11-18): утверждён вариант A — файл
  `.wolf/memory/micro-note-delivery.jsonl`; вариант B отклонён (половинное
  решение P1-2, загрязнение контура памяти операционным состоянием). ADR-3
  скорректирован при приёмке: legacy-строки сохраняются (§7, §11).
- Публикация релиза — вне этого дизайна (D3: только по команде владельца).
