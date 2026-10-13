---
slug: wave-2-17-faces
title: wave-2-17-faces — дизайн
status: review
created: 2026-10-13
---

# wave-2-17-faces — дизайн

Вход: requirements.md (status: approved, ревизия с CR-2026-10-13-02). Baseline кода:
`859cb4a` (main). Тред: `mem_20261012_2_17_litsa_artefakt_versii_mutatsiya_vol_b69113`.
Решения владельца по открытым вопросам — `mem_20261013_vladelets_variant_b_po_req_05_nfr_01_pla_cca07b`
(CR-2026-10-13-02, см. «Решения для визы»).

## Глоссарий

- **Лицо (face)** — core-тип памяти; канонический playbook агента. Один агент = один
  `owner_skill`; каждой смене содержания соответствует новая запись-версия.
- **Версия лица** — объект типа `face` с номером `version`, основой `based_on`,
  причиной `reason` и инициатором `initiator`. Актуальная версия — единственная
  non-superseded запись данного `owner_skill`.
- **Запись мутации** — note (facet `history`) с обязательными полями шаблона G17,
  атомарно создаваемая вместе с версией при мутации Стюардом; связана relation с
  версией.
- **Сигнал-фасет `proposal`** — значение фасета, доступное записям любых core-типов;
  несёт контракт предложения (B6). Отличен от character-фасетов note.
- **Guard** — проверка полномочий в use-case (не в CLI): `agent:steward` — мутация;
  `user:*` — restore/breakglass; лица создаются только версионирующими командами.
- **Base-set посев** — создание исходных лиц при `wolf init` (сегодня —
  `seedBasePlaybooks`, посев note+howto).
- **Активное задание** — opencode-сессия агента, получившая инъекцию лица; граница
  «следующего задания» = новая сессия (фиксация дизайна по §6 requirements).

## Компоненты и ответственность

| Компонент                                           | Ответственность                                                                                                                                                              | Файл (baseline `859cb4a`)                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| CORE_TAXONOMY / декларация `face`                   | контракт типа `face` в штатном месте таксономии; поля — не passthrough                                                                                                       | `src/domain/memory-types.ts` (`CORE_TAXONOMY_DECLS`)      |
| Словарь фасетов                                     | `proposal` добавляется в character-словарь note (8/10 допустимого диапазона) + как сигнал-фасет на остальных core-типах                                                      | `src/domain/memory-types.ts` (`DEFAULT_CHARACTER_FACETS`) |
| buildTypeSchema                                     | генерация zod-схем; поддержка сигнал-фасета `proposal` на любом core-типе с контрактной валидацией полей                                                                     | `src/domain/type-schema-builder.ts`                       |
| use-case `createFaceVersion` (новый)                | единая механика версий: guard, номер версии, создание записи, supersede текущей, журнал; под MemoryLock                                                                      | `src/app/use-cases/` (новый файл)                         |
| use-case `migrateFaces` (новый)                     | идемпотентная физическая миграция legacy-playbook → face                                                                                                                     | `src/app/use-cases/` (новый файл)                         |
| use-case `saveProposal` / `deliverProposal` (новые) | контракт предложения, пиннинг автора, явная доставка                                                                                                                         | `src/app/use-cases/` (новые файлы)                        |
| `seedBasePlaybooks`                                 | посев base-set меняется на `face`; скип по `owner_skill` с учётом legacy-записей                                                                                             | `src/app/use-cases/seed-base-playbooks.ts`                |
| `scaffoldAgent`                                     | создание лица нового агента через `createFaceVersion` (вместо playbook-note)                                                                                                 | `src/app/use-cases/scaffold-agent.ts`                     |
| `addMemoryObject`                                   | guard: `wolf add --type face` отклоняется с указанием на `wolf face *` (прецедент — rule-guard `add-memory-object.ts:80`)                                                    | `src/app/use-cases/add-memory-object.ts`                  |
| CLI `wolf face` (проектируемая)                     | new / restore / breakglass / migrate / list / history / show                                                                                                                 | `src/adapters/cli/commands/` (новый файл)                 |
| CLI `wolf propose` (проектируемая)                  | add / deliver / list                                                                                                                                                         | `src/adapters/cli/commands/` (новый файл)                 |
| `wolf doctor`                                       | NFR-02: дубликаты канонических лиц, face вне контракта, битые `based_on`                                                                                                     | `src/adapters/cli/commands/memory-doctor.ts`              |
| wolf-router (плагин)                                | **вариант Б (CR-2026-10-13-02)**: правка механики кэша доставки — мемоизация инъекции по сессии + версионированный кэш; guard `owner_skill`, поиск и fail-safe без изменений | `.opencode/plugins/wolf-router.ts`                        |
| Event log                                           | журнал face-операций и предложений                                                                                                                                           | существующий порт `EventLog`                              |
| Relations                                           | связь «запись мутации»→версия, «предложение»→объект-адресат                                                                                                                  | существующий `wolf relation add`                          |

## Контракты

### Тип `face` (декларация в CORE_TAXONOMY_DECLS, FieldSpec)

```
name: 'face'
lifecycle: ['active', 'superseded', 'archived']   // T18: только существующие статусы
subdirThread: null, subdirShared: 'faces'
fields:
  owner_skill: string, required, min 1
  version:     string, required, min 1   // '1','2',… — номер, назначается командой
  based_on:    string, optional          // id версии-основы; null для первой версии
  reason:      string, required, min 1   // REQ-04: причина обязательна
  initiator:   enum ['steward','owner','breakglass','migration','seed'], required
```

Тело записи (`body`) — markdown лица, как у сегодняшних playbook-note. Тайтл/теги
переносятся миграцией дословно (совместимость FTS-поиска router, NFR-01). Лицо
Стюарда — та же декларация (REQ-01 AC3).

### Механика версий (use-case `createFaceVersion`, псевдокод)

```
lock.withLock(owner_skill):                 // ВНЕШНИЙ lock — единственный в операции
  cur   := активная face(owner_skill)            // null, если первой версии нет
  base  := вход (--from) ИЛИ cur                 // restore: любая версия из истории
  ver   := max(version всех face(owner_skill)) + 1   // номер назначает система
  guard(actor):  new        → actor === 'agent:steward'
                 restore    → actor.startsWith('user:')
                 breakglass → actor.startsWith('user:') && sessionPrefix() !== 'opc-'
  при отказе guard: log.append(memory.face.denied {owner_skill, actor, command}); throw UserFacingError
  faceNew := create(...)                         // вложенные вызовы — с lock: undefined
  если cur существует: supersedeMemoryObject(cur.id, faceNew.id)   // lock: undefined
  если initiator='steward': создать запись мутации (G17) + relation('mutates', …)
  если --from-proposal: relation('proposes', proposal, faceNew)
  log.append(memory.face.versioned {owner_skill, from: cur?.id, new: faceNew.id, initiator})
```

Паттерн блокировки — по прецеденту `tool-librarian.ts:167`: `FsMemoryLock` не
реентерабелен, поэтому внешний `withLock` держит только `createFaceVersion`;
`addMemoryObject` / `supersedeMemoryObject` / `recordRelation` внутри вызываются с
`lock: undefined` — атомарность операции обеспечивает внешний lock.

Инварианты: ровно одна активная версия на `owner_skill`; линейная история через
существующий `superseded_by` (циклы исключены проверкой `supersede-memory-object.ts:36`);
обратная supersede-ссылка не создаётся никогда — восстановление всегда порождает новую
запись (REQ-05 AC1); причина обязательна → без неё операция падает (REQ-04 AC2).

### Guard и доверенная граница

Атрибуция — существующий механизм `resolveCreatedBy` (`src/domain/actor.ts`):
CLI-флаг > `WOLF_ACTOR` > `user:cli`. Контур вызова — `WOLF_SESSION`: CLI-процесс
всегда получает `cli-<uuid>` от `ensureCliSessionId` (`cli-entry.ts:488`,
`actor.ts:27`), opencode-процесс агентов наследует `opc-<uuid>` от wolf-router
(`wolf-router.ts:177`; env не перезаписывается). Правила:

- `wolf face new` — actor строго `agent:steward`. Команды face **не принимают**
  `--created-by` (флаг не экспортируется) — атрибуция только из env.
- `wolf face restore` / `breakglass` — actor `user:*`; breakglass дополнительно
  отказывает при `WOLF_SESSION` с префиксом `opc-` (вызов из opencode-процесса
  агента); `cli-…` или отсутствие ключа — терминал владельца, разрешено.
- `wolf add --type face` — отклонение с указанием на версионирующие команды; посев
  base-set идёт внутренним путём с `initiator: 'seed'`.
- `wolf propose add` — любой actor; флаг `--created-by` не экспортируется: автор =
  env-атрибуция, подмена через флаг невозможна (REQ-09 AC3).

Каждый отказ guard журналируется событием `memory.face.denied` (REQ-03 AC1).

MCP-поверхность (осознанное ограничение v1): мутации лиц — только CLI (Стюард и
сегодня действует CLI-вызовами); предложение сохраняется CLI `wolf propose add`
либо существующим MCP-каналом `add` (note + facet `proposal` — контракт
валидируется тем же правилом); отдельные MCP-обёртки face/propose — кандидат
бэклога, в B-пакеты волны не входят.

Trust boundary (честно): env-атрибуция спуфится агентом, выставившим `WOLF_ACTOR`
или снявшим `WOLF_SESSION`; это принято допущением требований (§6: отдельная
аутентификация вне scope, кооперативная модель). Механизм запрещает _случайный_
обход и делает намеренный обход журналируемым (actor фиксируется в событиях);
`doctor` подсвечивает аномалии.

### Сигнал-фасет `proposal` (B6) и контракт предложения

`facet: 'proposal'` доступен записям любых core-типов: note получает значение в
существующий закрытый словарь (7→8 значений, диапазон 7–10 соблюдён); остальные
core-типы получают опциональный facet с единственным значением `proposal`
(сигнал-словарь `['proposal']`, отдельный от character-словаря note; новый
тег-словарь не вводится — REQ-08 AC3).

```
facet='proposal' ⇒ обязательны (валидация в schema-builder / saveProposal):
  addressee:           string  // любой адресат, включая 'user:owner' и вышестоящих (Q3)
  basis:               string  // наблюдение/опыт
  proposed_change:     string
  expected_benefit:    string
  applicability_bounds: string // CR-2026-10-13-01: границы применимости
  author := created_by          // пиннится системой из env-атрибуции
  delivered_at: string|null = null  // заполняется ТОЛЬКО командой propose deliver
```

Предложение — сигнал: никакого автоприменения, маршрут жалобы не активируется,
полномочия автора не меняются (REQ-08 AC4, REQ-09). В `list`/`search` признак
предложения — сам фасет (REQ-08 AC1). Закрытие — штатный supersede
(например, записью мутации) или archive после решения. Доставка — явный шаг
`wolf propose deliver <id>` (event `memory.proposal.delivered`); сохранение ≠
доставка ≠ обработка (REQ-09 AC4). Путь записи: `saveProposal` идёт через
`addMemoryObject` (сохраняются валидация, событие `memory.added`, индексация) —
расширение facet-guard в `add-memory-object.ts` разрешает `proposal` на типах
с сигнал-словарём (см. сводку изменений).

### Запись мутации Стюарда (B4, шаблон G17)

```
type: note, facet: history, title: 'mutation: <owner_skill> v<ver>'
обязательные поля (создаёт face new, не свободный add):
  reason, minimal_change, boundaries,   // границы: что НЕ меняется (суть/рамка)
  example_helps, example_keep, verification, rollback
relation: ('mutates', запись, face-версия)
```

Атомарность: запись мутации создаётся в той же lock-транзакции, что и версия; без
любого из полей G17 операция целиком не выполняется (REQ-06 AC2).

### CLI: существующие факты и проектируемые команды

Существующие (живой help-дамп `node dist/bootstrap/cli.js --help`, baseline `859cb4a`):
`init, sync, uninstall, add (--type/--facet/--set/--created-by), list (--type/--status/--facet),
get, search (--type/--facet/--hide-superseded/…), edit, archive, brief, relation add/list,
call, recap, rule, lesson, decision, thread, complaint, note, tool, complain, analytics,
upgrade, doctor, promote, projects`. Изменения существующих: справка `--facet` у add/list/search
дописывает `proposal`; сообщение `memory-sync.ts:37` заменяется на указание публичного пути
`wolf face *` (Стюард-зона сохраняется).

Проектируемые (помечены как новые, не из help-дампа):

```
wolf face new <owner_skill> --body <md|--file F> --reason <t>   // steward
  --minimal-change <t> --boundaries <t> --example-helps <t>    // G17: обязательны
  --example-keep <t> --verification <t> --rollback <t>
  [--from-proposal <id>]
wolf face restore <owner_skill> --from <id|vN> --reason <t>      // owner
wolf face breakglass <owner_skill> --from <id|vN> --reason <t>   // owner, без Стюарда
wolf face migrate                                                // идемпотентно
wolf face list | wolf face history <owner_skill> | wolf face show <owner_skill>
wolf propose add --addressee <a> --basis <t> --change <t> --benefit <t> --bounds <t>
  [--on <id>] [--type note]                                      // автор из env
wolf propose deliver <id>
wolf propose list [--addressee <a>] [--pending|--delivered]
```

### Миграция legacy-playbook → face (B1, `migrateFaces`)

Кандидат: запись, читаемая как `note` + facet `howto` + непустой `owner_skill`
(включая legacy-тип `playbook` через alias `DEPRECATED_TYPE_ALIASES`,
`memory-types.ts:232`). Записи `howto` без `owner_skill` не мигрируются (REQ-02 AC4).

```
для каждого owner_skill (независимо, идемпотентно):
  если активная face(owner_skill) уже есть → skip (повторный запуск безопасен)
  head := активная (non-superseded) playbook-запись
  если head нет (только superseded-цепочка или ничего) → skip с отчётом:
       цепочка предков остаётся legacy-записями и читается как раньше
  face := create(owner_skill, version='1' (нормализация meta.version: 'v1'→'1'),
                 based_on=null, reason='migrated from playbook note <id> (2.17)',
                 initiator='migration', body/title/tags = head)
  supersedeMemoryObject(head.id, face.id)      // superseded-цепочка предков не трогается
```

Совместимость чтения (REQ-02 AC1): alias-чтение `playbook`→note+howto сохраняется;
немигрированные проекты читаются как сегодня. Router ищет `search <agentId> playbook
--hide-superseded` → после миграции head скрыт (superseded), найдётся face с тем же
title/тегами; guard `owner_skill === agentId | skill:agentId` проходит по объявленному
полю face. Путь поиска router не меняется (ADR-4); механика кэша доставки — вариант Б
(CR-2026-10-13-02).

### События журнала (EventLog, существующий порт)

Enum типов событий закрыт (`src/domain/schemas/memory-event-schema.ts`; сегодня:
`memory.added/edited/updated/scan.updated/superseded/resolved/transitioned/
overwritten/aggregated/scope_promoted`) — схема расширяется четырьмя значениями:
`memory.face.versioned {owner_skill, from, new, initiator, reason}` — на каждую
версию; `memory.face.breakglass {…}` — на breakglass (журнал в составе самой
операции, REQ-07 AC2); `memory.face.denied {owner_skill, actor, command}` — на
каждый отказ guard (REQ-03 AC1); `memory.proposal.delivered {id, addressee}` — на
доставку. Существующие `memory.added` / `memory.superseded` переиспользуются без
изменений.

### Схемные изменения (точная сводка)

1. `CORE_TAXONOMY_DECLS` += декларация `face` (см. выше) — `src/domain/memory-types.ts`.
2. `DEFAULT_CHARACTER_FACETS` += `'proposal'` (7→8, диапазон 7–10) — тот же файл;
   сигнал-словарь `['proposal']` для прочих core-типов — там же.
3. `type-schema-builder.ts` — контрактная валидация полей предложения при
   `facet='proposal'` на любом core-типе.
4. `memory-event-schema.ts` — enum событий += `memory.face.versioned`,
   `memory.face.breakglass`, `memory.face.denied`, `memory.proposal.delivered`.
5. Guard в `add-memory-object.ts` — отказ `--type face` вне версионирующего пути;
   расширение facet-guard: `facet='proposal'` разрешён на типах с сигнал-словарём
   (character-фасеты по-прежнему только note; сегодня guard бросает
   `facet is only valid for type "note"` — `add-memory-object.ts:96`).
6. `seed-base-playbooks.ts`, `scaffold-agent.ts` — переход на face;
   `isPlaybookNote` (`scaffold-agent.ts:28`) распознаёт `type: 'face'`, чтобы
   `wolf scaffold --from-playbook <face-id>` работал после миграции.
7. `memory-doctor.ts` — проверки NFR-02 (дубликат канонического лица, face вне
   контракта, битый `based_on`, legacy+face одновременно).
8. `memory-sync.ts:37` — обновление сообщения о Стюард-зоне (указание на `wolf face *`).
9. Новые use-cases: `createFaceVersion`, `migrateFaces`, `saveProposal`,
   `deliverProposal`; новые CLI-группы `wolf face`, `wolf propose`.
10. wolf-router (плагин) — правка только механики кэша доставки по варианту Б
    (CR-2026-10-13-02); guard, поиск, fail-safe — без изменений (ADR-4).

## ADR-карточки

- **ADR-1: face — core-тип; версия = отдельная запись; история = существующий
  supersede.** Контекст: Q1 требует самостоятельный контракт; история версий уже
  есть как линейная цепочка `superseded_by`. Альтернативы: (а) одна запись с полем
  version и историей в теле — теряет FTS-доставку по `--hide-superseded`, требует
  нового механизма истории; (б) таблица версий вне памяти — новый стор. Выбор:
  запись-на-версию + supersede. Последствия: нулевая новая механика истории;
  размер памяти растёт линейно с мутациями (приемлемо: мутации редки, спека A2).
  Риск: цепочки длиннее поиска — закрыто ранним стопом router и `--hide-superseded`.
- **ADR-2: мутация Стюарда = отдельная запись note(history) c G17, а не поля на
  face.** Контекст: REQ-06 требует шаблон ТОЛЬКО для мутаций Стюарда. Альтернатива:
  G17-поля в контракте face (optional) с условной обязательностью — усложняет схему
  и заставляет миграцию/посев носить чужие поля. Выбор: отдельная note + relation
  `mutates`, создаётся атомарно командой. Последствие: +1 объект на мутацию
  Стюарда; аудит мутаций — запросом note+history+relation.
- **ADR-3: `proposal` — сигнал-фасет поверх core-типов.** Контекст: Q2 — фасет, не
  тип и не тег; REQ-08 AC2 требует работоспособности поверх разных core-типов.
  Альтернативы: отдельный тип (запрещён Q2), тег (запрещён), только note (не
  покрывает AC2). Выбор: значение в словаре note (8/10) + сигнал-словарь
  `['proposal']` для остальных core-типов; facet='proposal' триггерит контрактную
  валидацию. Последствия: facet перестаёт быть полем только-note (глоссарий
  requirements это предвидит); T18 не затронут (статусы не меняются).
- **ADR-4: путь поиска/доставки router не меняется; миграция сохраняет title/теги
  дословно.** Контекст: NFR-01/NFR-03 — доставка не должна деградировать. Альтернатива:
  научить router искать `--type face` — два пути доставки, регрессионный риск. Выбор:
  физическая миграция `wolf face migrate` с дословным переносом title/тегов/owner_skill.
  Правка механики кэша доставки плагина — вне ADR-4, ведётся по варианту Б
  (CR-2026-10-13-02). Проверка допущений (в test-plan): тест «мигрированное лицо
  резолвится router-путём»; e2e «мутация лица в живом чате не меняет доставленный
  текст» и «respawn после TTL получает актуальную версию» — проверяют усиленную
  механику варианта Б, а не допущение о персистентности system (см. блок отказов).
  Риск: метаданные FTS ранжируют face иначе, чем note, — закрывается указанным
  тестом до релиза.
- **ADR-5: guard на env-атрибуции, без новой аутентификации.** Контекст: §6
  requirements — опознание существующими механизмами. Альтернатива: подписи/токены
  — вне scope волны. Выбор: actor-префиксы + отказ breakglass при WOLF_SESSION +
  запрет `--created-by` в face/propose командах. Последствие: защита от случайного
  обхода и аудируемый след; намеренный спуфинг env остаётся residual-риском
  кооперативной модели (зафиксирован в требованиях).
- **ADR-6: инициатор 'seed' в enum.** REQ-04 перечисляет инициаторов смены версий;
  первая версия от init-посева — не смена версии. Enum расширен значением `seed`
  для полноты аудита первых версий; владелец уведомляется в отчёте (не блокирует).

## Отказы, конкурентность, восстановление

- **Конкурентные мутации** одного лица: сериализация внешним MemoryLock в
  `createFaceVersion` (существующий порт; паттерн — `tool-librarian.ts:167`,
  вложенные вызовы без lock); номер версии вычисляется под lock — дублей и дыр нет.
- **Частичный сбой миграции**: каждый owner_skill — независимая итерация; падение
  на N-м не откатывает N-1 (supersede каждой записи завершён); повторный запуск
  идемпотентен (skip при активной face; без активного head — skip с отчётом).
- **Сломанное лицо Стюарда / недоступный Стюард**: breakglass не вызывает Стюарда и
  работает по любой версии из истории, включая восстановление его собственного лица
  (REQ-07 AC1) — чтение истории не зависит от агента.
- **Повреждённая face-запись при доставке**: router уже fail-safe (try/catch,
  fallback-playbook, `wolf-router.ts:141–171`) — сессия не падает (NFR-03);
  fail-safe-путь правкой варианта Б не затрагивается.
- **Не переключение посередине задания — вариант Б, CR-2026-10-13-02 (решение
  владельца `mem_20261013_vladelets_variant_b_po_req_05_nfr_01_pla_cca07b`,
  против рекомендации L1 — осознанно)**: правка wolf-router-плагина в составе
  волны. Механика доставки: (а) инъекция мемоизируется по opencode-сессии
  (session-id) — повторная вставка в пределах сессии подавляется независимо от
  того, сохраняет ли рантайм system-текст чата между сообщениями; (б) кэш
  доставки между сессиями версионируется ключом лица — кэш-запись устаревшей
  версии не отдаётся, новая сессия всегда получает актуальную версию. Следствия:
  остаточный случай №1 (новая сессия в пределах TTL-кэша получает прежнюю
  версию) и №2 (пересборка system после TTL → новая версия посередине задания)
  устраняются механикой, не принимаются. TTL-тест (`wolf-router-plugin.test.ts:218`:
  respawn + повторная инъекция) перерабатывается под новые ожидания (NFR-01,
  отдельная задача плана); e2e «мутация лица в живом чате не меняет доставленный
  текст» проверяет усиленную механику.
- **Восстановление после «границы применимости» CR**: контракт предложения
  валидируется при сохранении; старых записей с proposal-фасетом нет (фасет новый) —
  обратной совместимости поля не требуется.

## Наблюдаемость (B7)

`wolf face list` — лица: owner_skill, актуальная версия, id, статус. `wolf face
history <owner_skill>` — версии по убыванию: version, id, initiator, reason,
based_on, created_at (покрывает и журнал мутаций, и breakglass — каждая операция
есть версия; REQ-10 AC2). `wolf face show` — тело актуальной версии. Статус доставки
канон/fallback остаётся в router.log с неизменной семантикой (REQ-10 AC3). Прямой
доступ к файлам памяти не требуется ни для одной из команд.

## Проверка целостности (NFR-02, doctor)

По образцу проверки owner_skill тулов (`memory-doctor.ts:236`): (а) >1 активной
face на owner_skill — finding «duplicate canonical face»; (б) активная face и
активная legacy-playbook-запись одного owner_skill — finding «run wolf face
migrate / supersede legacy»; (в) `based_on` указывает на несуществующий id;
(г) face-запись не проходит контрактную валидацию (схема). Прямая правка файлов
памяти обнаруживается (б)/(г) как расхождение с контрактом.

## Карта покрытия требований

| REQ/NFR | Компонент/контракт                                        | Проверяемое свойство                                                                                                                                                                                               |
| ------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| REQ-01  | декларация face в CORE_TAXONOMY                           | face в `--type` choices add; get/list/search показывают тип face; контракт един для всех лиц                                                                                                                       |
| REQ-02  | migrateFaces + alias-чтение + seed                        | legacy читается до/после; миграция сохраняет владелец/содержимое/цепочку; скип посева; howto без owner_skill не мигрируется                                                                                        |
| REQ-03  | createFaceVersion guard + add-guard                       | отказ не-Стюарду + событие memory.face.denied; успех Стюарда через публичный путь; add --type face отклонён; doctor видит правку в обход                                                                           |
| REQ-04  | поля версии + событие versioned                           | история показывает основу/причину/инициатора/время; без reason операция падает                                                                                                                                     |
| REQ-05  | механика версий + правка плагина (вариант Б)              | restore = новая версия с based_on; обратной supersede-ссылки нет; активное задание не переключается (мемоизация по сессии + версионированный кэш — см. отказы, CR-2026-10-13-02); доставка по умолчанию актуальная |
| REQ-06  | G17-запись мутации + relation                             | все поля шаблона обязательны; связь с версией; границы зафиксированы                                                                                                                                               |
| REQ-07  | face breakglass                                           | без вызова Стюарда (в т.ч. его собственное лицо); журнал в составе операции; не-владельцу отказ; результат = новая версия                                                                                          |
| REQ-08  | сигнал-фасет proposal + контракт                          | все поля (вкл. applicability_bounds) обязательны; поверх разных core-типов; без нового типа/тег-словаря; маршрут жалобы не активируется                                                                            |
| REQ-09  | saveProposal (пиннинг автора) + deliver                   | императивный текст не применяется; лицо адресата не меняется; автор = env-атрибуция; не доставлено ≠ обработано                                                                                                    |
| REQ-10  | face list/history/show + router.log                       | лица и версии перечисляются без чтения файлов памяти; метаданные версий полны; router.log не деградирует                                                                                                           |
| NFR-01  | миграция сохраняет метаданные; правка плагина (вариант Б) | тесты доставки зелёные (TTL-тест переработан с измеримым AC, CR-2026-10-13-02) + новый тест миграции (см. ADR-4)                                                                                                   |
| NFR-02  | doctor (проверки а–г)                                     | doctor сообщает дубликаты и face вне контракта                                                                                                                                                                     |
| NFR-03  | правки плагина — только кэш доставки (вариант Б)          | fail-safe поведение сохранено (существующие проверки)                                                                                                                                                              |

## Ссылки на NFR (бюджеты и измерения)

- **NFR-01**: критерий — зелёный `npm run check` целиком: существующие
  `tests/unit/wolf-router-plugin.test.ts`, `tests/unit/domain/playbook-schema.test.ts`,
  e2e taxonomy-alias / migrate-taxonomy остаются без правок ожиданий; новые тесты
  миграции face. Бюджет производительности миграции: O(N) по записям, повторный
  запуск — только skip-обход (без записи).
- **NFR-02**: doctor-находки форматируются в существующий вывод `! <file>: <issue>`;
  новые проверки не замедляют doctor асимптотически (один проход по store.list).
- **NFR-03**: правки плагина ограничены механикой кэша доставки (вариант Б,
  CR-2026-10-13-02); fail-safe (сбой → fallback-playbook) и инвариант «не более
  одной инъекции на сессию» сохраняются.

## Решения для визы владельца (продуктовые) — подтверждены 2026-10-13

1. **ADR-3** — предложение как сигнал-фасет затрагивает любые core-типы (расширение
   понятия фасета за пределы note); словарь note растёт 7→8. **Подтверждено
   владельцем.**
2. **ADR-6** — расширение enum `initiator` значением `seed` (посев первых версий).
   **Подтверждено владельцем.**
3. Граница «следующего задания» = новая opencode-сессия/чат. **Подтверждено
   владельцем.**
4. **Инвариант REQ-05 AC2 vs NFR-01 (из ревью, F-2).** РЕШЕНО — **вариант Б**
   (решение владельца `mem_20261013_vladelets_variant_b_po_req_05_nfr_01_pla_cca07b`;
   против рекомендации L1 (вариант А) — осознанное решение, scope волны расширен):
   правка wolf-router-плагина в составе волны — мемоизация инъекции по сессии +
   версионированный кэш доставки; NFR-01 переформулирован с измеримым AC
   (requirements CR-2026-10-13-02), TTL-тест перерабатывается (отдельная задача
   плана); остаточные случаи устраняются механикой, не принимаются. Механика
   описана в §Отказов («Не переключение посередине задания»).
5. **MCP-поверхность (из ревью, F-8).** v1 подтверждена владельцем: мутации и
   доставка предложений — CLI; сохранение предложения доступно и через существующий
   MCP `add` (валидация контракта та же). Отдельные MCP-обёртки face/propose —
   бэклог, вне B-пакетов.

Технические ADR-1/2/4/5 — в мандате L1, визы не требуют.
