---
slug: wave-2.17-faces
title: wave-2.17-faces — исполнение (T-01…T-11)
status: in-progress
created: 2026-10-13
updated: 2026-10-13
---

# wave-2.17-faces — отчёт исполнения

## Metadata

- TASK: wave-2.17-execute; THREAD: mem_20261012_2_17_litsa_artefakt_versii_mutatsiya_vol_b69113
- L1: executor-lead (wolf-sdd); воркеры: worker-implementer / worker-reviewer.
- Worktree: `.worktrees/wave-2.17-faces`, ветка `wave-2.17-faces`, base = 269d549 (main).
- Baseline-гейт: `npm run check` ЗЕЛЁНЫЙ — 164 test files / 1233 tests (2026-10-13, worktree, после npm ci).
- Журнал восстановления: этот файл + git log ветки. Обновляется после каждой задачи.
- FRICTION: 1× read/edit-инструменты — для файлов, созданных после старта сессии в `.worktrees/…`, видят «призрачную» копию с искажённым именем (`report-wave.2.17-execute.md` вместо `-2-17-`), отдают «File not found» по реальному пути; обошёл через write (полная перезапись файла) + shell/rtk для верификации (git видит реальное состояние).
- FRICTION: 2× tools.rtk.run_command (у воркеров) — rtk переписывает `npx …` в `npm run …` (Missing script) и протаскивает шелл-пайпы в аргументы; обход — `node node_modules/vitest/vitest.mjs run …` без пайпов. В брифы воркеров добавлен этот hint.

## Summary

Исполнение волны 2.17 «Лица» по plan.md (T-01…T-11), вариант Б (CR-2026-10-13-02).

| Задача                                         | Статус                                          | Коммит           |
| ---------------------------------------------- | ----------------------------------------------- | ---------------- |
| T-01 face+proposal схемный фундамент           | DONE (принято L1)                               | ed7dd8f          |
| T-02 createFaceVersion + guard                 | DONE (принято L1, 1 фикс по ревью L1)           | 89dbdda          |
| T-03 G17-запись мутации                        | DONE (принято L1)                               | (см. ниже)       |
| T-04 CLI `wolf face`                           | DONE (принято L1)                               | 45ecd46          |
| T-05 миграция + alias + seed                   | DONE (принято L1)                               | см. ниже         |
| T-06 doctor NFR-02 + memory-sync               | DONE (принято L1)                               | см. ниже         |
| T-07 guard `wolf add`                          | DONE (принято L1)                               | ff10f7f          |
| T-08 wolf-router вариант Б                     | DONE (принято L1 + ревью APPROVED + минор-фикс) | c45b66e, 51e2477 |
| T-09 proposals save/deliver + CLI              | DONE (принято L1)                               | e030d8b          |
| T-10 интеграция + e2e + полный гейт            | pending                                         | —                |
| T-11 документация/сайт/версия (без публикации) | pending                                         | —                |

## Task Decomposition

Декомпозиция задана планом (T-01…T-11). Исполнение — worker-implementer (L2);
ревью — worker-reviewer (после T-08 ✅ и после T-10) + сверка diff L1 на каждой задаче.
Параллельность: T-02 ∥ T-08 (непересекающиеся write-наборы) — исполнено, коммиты раздельные.

## Workers Used

| Задача     | Воркер                                            | Исход                                                                |
| ---------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| T-01       | worker-implementer ses_ecbe897e1ffeAksUlbNbPzBlNt | DONE_WITH_CONCERNS → принято L1                                      |
| T-02       | worker-implementer ses_ecbd3562bffepUfj7RRMimvvyy | DONE_WITH_CONCERNS → FINDING-1 (события breakglass: оба) → фикс DONE |
| T-08       | worker-implementer ses_ecbd35627ffeQDRwFQlB7KklEK | DONE → минор-фикс по ревью DONE                                      |
| Ревью T-08 | worker-reviewer ses_ecbc13f2dffeLWqLnIZJnlUzIk    | APPROVED (0 crit/major, 2 minor)                                     |
| T-03       | worker-implementer ses_ecbb4faa2ffefj4S3ks2dlKCyR | DONE_WITH_CONCERNS → принято L1                                      |

## Validation Results

### T-01 (2026-10-13)

- `npx vitest run tests/unit/domain/` — ✅ 24 файла / 166 тестов.
- `npx tsc --noEmit` — ✅ exit 0; `npx vitest run tests/unit/` — ✅ 154/1219; prettier — ✅.
- TDD: RED (12 failed) → GREEN.

### T-02 (2026-10-13)

- `npx vitest run tests/unit/use-cases/create-face-version.test.ts` — ✅ 9/9 (до и после фикса).
- `npx vitest run tests/unit/use-cases/` — ✅ 57 файлов / 464 теста.
- `npx tsc --noEmit` — ✅; `npx vitest run tests/unit/` — ✅ 155/1228.

### T-08 (2026-10-13)

- `npx vitest run tests/unit/wolf-router-plugin.test.ts` — ✅ 14/14 (TTL-тест переработан: 3 ожидания).
- `npx vitest run tests/unit/domain/playbook-schema.test.ts` — ✅ 2/2.
- Совместный прогон L1: `npx vitest run tests/unit/use-cases/ tests/unit/wolf-router-plugin.test.ts` — ✅ 478 passed.
- Ревью worker-reviewer: APPROVED, evidence — см. Workers Used.

### T-03 (2026-10-13)

- `node node_modules/vitest/vitest.mjs run tests/unit/use-cases/` — ✅ 58 файлов / 469 тестов (L1 повторил — совпадает).
- Регрессия relation (relation-outcome, jsonl-relation-log, memory-relation) — ✅ 3 файла / 9 passed.
- `tsc --noEmit` — ✅ exit 0. TDD: RED 4 failed → GREEN.

## Changes

### T-01 — схемный фундамент `face` + `proposal` (ed7dd8f)

Файлы (9, +315/−29): memory-types.ts (face в CORE_TAXONOMY_DECLS: owner_skill/version/reason required, based_on optional не-nullable, initiator enum, lifecycle, subdirShared faces; DEFAULT_CHARACTER_FACETS += proposal 7→8; SIGNAL_FACETS=['proposal']); type-schema-builder.ts (PROPOSAL_CONTRACT_FIELDS: addressee, basis, proposed_change, expected_benefit, applicability_bounds; facet='proposal' ⇒ 5 полей обязательны); memory-event-schema.ts (+4 события с payload-ключами); тесты taxonomy/type-schema-builder/memory-event-schema.
Отклонения от allowlist (приняты L1): facet-colors +1 (цвет proposal), type-command-generator +2 (ключ face в Record, tsc), add-memory-object.test 2/2 (regex-якоря фасетов).
Риски: e2e generic-add ожидаемо красный до T-07 (guard `add --type face`); based_on не nullable — первая версия опускает поле.

### T-02 — use-case `createFaceVersion` + guard (89dbdda)

Новые: src/app/use-cases/create-face-version.ts (~230 строк), tests/unit/use-cases/create-face-version.test.ts (9 тестов).

- Версионирующий путь: head + основа (id|vN), номер = max+1 под MemoryLock (store-wide — порт не имеет ключа; прецедент tool-librarian.ts:167), addMemoryObject + supersedeMemoryObject (вложенные с lock: undefined).
- Guard (design §Guard): new → строго agent:steward; restore/breakglass → user:\*; breakglass отказывает при WOLF_SESSION с префиксом opc- (F-04). Отказ → memory.face.denied + UserFacingError.
- Параметра-актёра у API нет — подмена инициатора исключена структурно.
- reason обязателен (REQ-04 AC2). Успех → memory.face.versioned; breakglass → ОБА события (versioned c initiator=breakglass, затем breakglass) — фикс по FINDING-1 ревью L1 (design: «versioned на каждую версию»).
  Отклонения: store-wide lock вместо per-owner (порт без ключа, вне allowlist) — сериализация гарантирована, гранулярность грубее; initiator migration/seed без публичного входа — за T-05.
  Риски: review_state face от agent:\* = proposed (дефолт governance) — влияние на router не ожидается (поиск по hide-superseded), проверить на T-10.

### T-08 — wolf-router вариант Б (c45b66e + 51e2477)

Файлы: .opencode/plugins/wolf-router.ts + templates/opencode/plugins/wolf-router.ts (синхронно; templates — канон, .opencode — dogfood-рендер: правка одного не делает тест зелёным — отклонение от allowlist обосновано), tests/unit/wolf-router-plugin.test.ts.

- (а) sessionInject Map<'WOLF_SESSION:agentId', {text,name,variant,bytes}> в deliverPlaybook — повторная доставка в сессии отдаёт запечатанный текст без CLI-спавнов, работает при пересборке system (не зависит от персистентности).
- (б) resolvePlaybook: search живой на каждой новой сессии (барьер свежести); TTL-кэш отдаётся только при hit.value.id === ids[0] (head) — устаревшая версия не отдаётся никогда.
- TTL-тест переработан: (2) та же сессия + v2 + пересборка при <TTL → запечатана v1, 0 спавнов; (3) новая сессия в пределах TTL → v2; (1) respawn после TTL → v3. Fake timers по P106.
  Ревью (ses_ecbc13f2dffeLWqLnIZJnlUzIk): APPROVED. Findings:

1. minor «ложный комментарий негативного кэша» — ИСПРАВЛЕН (51e2477).
2. minor «гранулярность сессии = процесс (WOLF_SESSION), не чат; sessionInject без TTL» — ОТКЛОНЁН аргументированно: design сам операционализирует сессию через WOLF_SESSION (§Guard), потолок закомментирован в коде, test-plan моделирует respawn сменой WOLF_SESSION; chat-уровневый ключ — вне scope волны (в Per-chat id нет в контракте V2ContextEvent/\_input). Зафиксировано как осознанное ограничение варианта Б.
   3–4. nit — без действия (консервативное поведение, лучше до-коммитного).
   Известное поведение: новая сессия делает один search-спавн (барьер свежести) — рост ограничен «один на агент на сессию»; мемоизация пиннит fallback на сессию (тот же инвариант «не переключаться посередине»).

### T-03 — G17-запись мутации Стюарда

Файлы: src/app/use-cases/create-mutation-record.ts (новый), tests/unit/use-cases/create-mutation-record.test.ts (новый, 5 тестов), src/app/use-cases/create-face-version.ts (G17-хук: relations? в deps, G17-поля в input, валидация ДО записей — атомарность, запись после supersede в той же lock-транзакции, mutationRecordId в результате), src/domain/schemas/relation-schema.ts (+пара mutates/mutated_by), src/app/use-cases/record-relation.ts (INVERSE-пары), tests/unit/use-cases/create-face-version.test.ts (G17-фикстуры).

- note(facet=history, title `mutation: <owner_skill> v<ver>`), 7 полей G17 дословно из design (reason, minimal_change, boundaries, example_helps, example_keep, verification, rollback), relation mutates → face-версия.
- Шаблон неопционален: без обязательных полей — отказ до записей (REQ-06 AC2). Прямой store.save по прецеденту scaffold-agent.ts:152 (addMemoryObject не пускает спец-поля note).
  Отклонения (приняты L1): relation-schema закрытый enum не содержал mutates — физически необходимо по design; тесты T-02 требуют G17-фикстуру после обязательности шаблона.
  Передачи: T-09 может упереться в предикат proposes (если design его требует — расширить enum аналогично); mutationRecordId в контракте createFaceVersion — учесть в T-04 CLI; guard-отказ срабатывает раньше G17-валидации (security-граница, design порядок не фиксировал).

### T-04 (2026-10-13)

- `vitest run tests/unit/adapters/cli/face-cli.test.ts` — ✅ 12/12 (L1 повторил — совпадает).
- `vitest run tests/unit/adapters/` — ✅ 522/522; `tsc --noEmit` — ✅ exit 0.
- cli-reference-guard — ✅ 1/1 (после build + регенерации; до регенерации — ложнозелёный на устаревшем dist, выявлено и закрыто воркером).
- help-budget e2e — ✅ 3/3 (после бюджета 34→35); english-surface — ✅ OK; prettier — ✅.
- TDD: RED 12 failed (нет модуля) → GREEN.

### T-04 — CLI-группа `wolf face` (45ecd46)

Файлы: src/adapters/cli/commands/face.ts (новый), tests/unit/adapters/cli/face-cli.test.ts (новый, 12 тестов), src/adapters/cli/cli-entry.ts (+регистрация), docs/reference/cli.md (регенерация, +127/−3), tests/e2e/help-budget.e2e.ts (бюджет 34→35).

- new (G17-флаги обязательны, --body/--file), restore/breakglass (--from id|vN), list/history/show через store без чтения файлов; мутации — только вызов createFaceVersion.
- --created-by — скрытая ловушка ADR-5: парсится, в action отказ с пояснением (env-only атрибуция).
- breakglass: журнал memory.face.breakglass в операции, отказ не-владельцу/opc-сессии → memory.face.denied (REQ-07).
  Отклонения от allowlist (приняты L1, механические следствия): cli-reference.md — требование guard-теста P224; help-budget — прецедент волны («2.16: +promote»), face скрыть отвергнуто (breakglass — аварийная поверхность владельца).
  Риски: дубль активных лиц в list/history/show разрешается старшей версией (находка дублей — doctor T-06); `wolf face new` без WOLF_ACTOR=agent:steward откажется (контракт REQ-03).

### T-05 (2026-10-13)

- `vitest run tests/unit/use-cases/ tests/unit/adapters/` — ✅ 115 файлов / 1002 теста.
- e2e migrate-taxonomy + taxonomy-alias — ✅ 15 passed; e2e scaffold + router-fallback — ✅ 7 passed (допущение ADR-4 проверено: face резолвится router-путём).
- `tsc --noEmit` — ✅; english-surface — ✅; prettier (файлы T-05) — ✅.
- L1 повтор: migrate-faces.test.ts — ✅ 5/5; prettier-долг T-03 подтверждён → закрыт отдельным коммитом 5d7eaf1.
- TDD: RED (нет модуля) → GREEN 5/5; seed/scaffold — ассерты переключены на face-контракт, GREEN.

### T-05 — миграция + alias-чтение + seed

Файлы: src/app/use-cases/migrate-faces.ts (+тест 5 сценариев), src/app/use-cases/create-face-version.ts (вход += migrate/seed, initiator migration/seed, guard для служебных путей не применяется), src/adapters/cli/commands/face.ts (+migrate: отчёт, exitCode 1 при частичном сбое, --created-by отказ), seed-base-playbooks.ts (посев через face, skip при живом face ИЛИ legacy-note), scaffold-agent.ts (лицо через command 'seed', isPlaybookNote знает 'face', --from-playbook <face-id> работает), memory-init.ts (вызывающая сторона контракта посева), тесты seed/scaffold/face-cli переписаны, tests/e2e/scaffold.e2e.ts (якорь face-контракта).

- Миграция: кандидат = note+howto+owner_skill (вкл. legacy playbook через alias P211); skip при живом face; face v1 initiator='migration' + supersede head; поэтапность (try/catch на владельца), идемпотентность.
- DEPRECATED_TYPE_ALIASES.playbook→note+howto СОЗНАТЕЛЬНО не менялся (design: alias-чтение сохраняется; переучить на face = старые файлы нечитаемы, нарушение REQ-02 AC1); живость alias-пути доказана тестами.
  Отклонения (приняты L1): memory-init.ts — обязательное следование изменённому контракту seedBasePlaybooks (−61/+11); scaffold.e2e.ts — якорь старого поведения; prettier-нормализация create-face-version.ts (латентные нарушения).
  Риски: атрибуция посева env-only (ADR-5); «face создан, supersede head упал» → повторный мигрейт скипает владельца, остаток подсветит doctor T-06; скип посева консервативнее AC (любой face владельца, не только активный).

### T-07 (2026-10-13)

- `vitest run tests/unit/use-cases/add-memory-object.test.ts` — ✅ 30/30 (L1 повторил; TDD RED 4 failed → GREEN).
- e2e generic-add + add-collision-guard — ✅ 13/13 + 1/1; `tsc --noEmit` — ✅; prettier — ✅.
- Инцидент: рестарт сервера оборвал параллельные T-06/T-07; T-07 возобновлён в своей сессии (ses_ecb651657ffeqm2A4Z9ML2c9Xg), частичные правки доделаны; T-06 перезапущен новой сессией (частичный тест-файл оставлен ему).

### T-07 — guard прямого `wolf add` (ff10f7f)

Файлы: src/app/use-cases/add-memory-object.ts (+33/−8), tests/unit/use-cases/add-memory-object.test.ts (+105), tests/e2e/generic-add.e2e.ts (+22/−3).

- Guard face (REQ-01 AC3): UserFacingError «type "face" cannot be created with add … use "wolf face" commands» — покрывает generic add, генерённые <type> add, MCP add (все через runAddAction → addMemoryObject).
- Facet-guard (REQ-08/ADR-3): proposal разрешён на не-note core-типах (SIGNAL_FACETS); character-фасеты только note (якорь не изменён).
- Allowance PROPOSAL_CONTRACT_FIELDS в extra при facet=proposal (обязательное следствие; фундамент T-09).
- generic-add: CREATABLE_TYPES = MEMORY_TYPES кроме face + тест «face direct add is refused».
  Отклонение (принято L1): allowance контрактных полей — расширение внутри назначенного файла, без него контракт proposal невыполним.
  Передачи: хинт `--facet` в memory-add.ts:108 не упоминает proposal (design: «справка дописывает proposal») — кандидат T-09/T-10; сообщение «facet only valid for note» для не-core типов чуть неточное — якорь сохранён, риск принят.

### T-06 (2026-10-13)

- `vitest run memory-doctor.test.ts memory-sync.test.ts` — ✅ 7/7 (L1 повторил; TDD RED 6 failed → GREEN).
- e2e doctor-hygiene — ✅ 6/6 (L1 повторил); `tsc --noEmit` — ✅; prettier — ✅.

### T-06 — doctor NFR-02 + memory-sync

Файлы: src/adapters/cli/commands/memory-doctor.ts (lintFaces: дубликат канона / based_on не существует / legacy+face — указание wolf face migrate / face вне контракта из faceProblems; общая секция `## Faces`, формат `! <file>: <issue>` + maskSecrets), memory-sync.ts:37 (Стюард-зона → `wolf face *`), tests/unit/adapters/cli/memory-doctor.test.ts (черновик после сбоя доработан), tests/unit/adapters/cli/memory-sync.test.ts (НОВЫЙ — unit-теста не существовало, бриф предусматривал), doctor-hygiene.e2e.ts (+2 сценария: все 4 грязных состояния разом; чистые лица не шумят).

- face вне контракта: единственный источник — store.scanProblems() (файлы молча выпадают из store.list; прецедент memory-validate.ts:91), гейт existsSync(shared/faces) — проекты без лиц не платят.
- Асимптотика: один проход store.list для lint; scanProblems — отдельный линейный обход.
  Отклонения: новый unit-тест memory-sync (разрешено брифом). Риски: scanProblems удваивает IO-обход для проектов с лицами (линейно, гейт смягчает); based_on на face ДРУГОГО владельца не флагуется (design требует только существование).

### T-09 (2026-10-13)

- `vitest run tests/unit/use-cases/ tests/unit/adapters/` — ✅ 120 файлов / 1031 теста (L1 повторил).
- e2e help-budget — ✅ 3/3 (бюджет 36); контрольные generic-add 13, cli-reference-guard 1 — ✅; tsc — ✅; prettier (16 файлов) — ✅.
- TDD: RED 7 → GREEN; smoke полного цикла через dist (add→pending→deliver→list→фильтры→guard).

### T-09 — предложения save/deliver + CLI `wolf propose` (e030d8b)

Файлы: save-proposal.ts (+5 тестов), deliver-proposal.ts (+5), propose.ts CLI add/deliver/list (+7), cli-entry (регистрация), relation-schema (+пара proposes/proposed_by), create-face-version (fromProposal → relation proposes по design:88, валидация ДО записей), face.ts (--from-proposal), memory-add/memory-list/memory-search (хинт --facet +proposal), help-budget (36), cli-reference.md (регенерация).

- Автор пиннится env-атрибуцией (параметра-актора нет структурно); delivered_at заполняет ТОЛЬКО deliver; повторная доставка/не-proposal id — осмысленные отказы; событие memory.proposal.delivered {id, addressee}.
  Отклонения (приняты L1):

1. add-memory-object.ts — фикс регрессии T-07: guard блокировал и версионирующий путь (подтверждено L1: на ff10f7f create-face-version.test.ts 7/9 красных — приёмка T-07 прогоняла только якорные сьюты). Фикс: input.internalFacePath — маркер версионирующего пути; герметичность проверена L1 (CLI/MCP собирают input явно, extra не пробрасывает верхнеуровневое поле).
2. memory-list/memory-search хинты — design:183 требует add/list/search.
3. Пропущен `--on <id>` из design:197 (нет в CLI-спеке задачи; связывание — штатный relation add).
   Урок процесса (в память Wolf): приёмка каждой задачи обязана прогонять смежные сьюты (unit use-cases + adapters целиком), точечных якорей недостаточно — регрессия T-07 жила 3 коммита.
   Риски: пробельные строки (' ') проходят контракт-валидатор (length≥1 без trim) — oracle тест-плана «поле отсутствует» покрыт; ужесточение на усмотрение владельца.

### T-10 (2026-10-13)

- `vitest run --config tests/e2e/vitest.config.ts tests/e2e/face-router.e2e.ts` — ✅ 3/3.
- Существующие router-fallback + migrate-taxonomy + taxonomy-alias — ✅ 19/19.
- Полный гейт `npm run check` — ✅ EXIT=0, 173 test files / 1312 tests (базeline 164/1233 → +9/+79).
- docs/dev/roadmap/wave-2.17.md — фазы по факту; INDEX.md — правка не потребовалась (волна уже зарегистрирована; файл генерируемый wolf sync).

### T-10 — интеграция + e2e волны (8610588)

Файлы: tests/e2e/face-router.e2e.ts (новый, 3 сценария плана: мигрированное лицо резолвится router-путём; мутация в живом чате не меняет доставленный текст — мемоизация по логу ms=0 + имя v1; respawn после TTL → актуальная), tests/integration/base-set-init.test.ts (посев после T-05 = 6×face в shared/faces — краснота, вскрытая гейтом, пропущенная при T-05), roadmap-фазы.
ИНЦИДЕНТ: воркер T-10 наблюдал «параллельного агента» в worktree (транзиентный tests/e2e/faces-wave.e2e.ts, застейдженное удаление журнала, один зафлейкавший прогон под нагрузкой). Расследование L1: посторонних коммитов нет; диф журнала — только prettier-форматирование; через 45с после коммита T-10 дрейфа нет — вероятная причина: хвосты собственных длительных прогонов воркера + артефакты ghost-view. Файл восстановлен из стейджа, журнал цел.
Отклонения: prettier-нормализация журнала (принята); INDEX.md не менялся (генерируемый файл — правка была бы перезаписана).

### T-10 — приёмка continuation-сессией (2026-10-13, TASK wave-2-17-execute-continue)

- Сверка состояния: бриф диспетчера неточен — T-05 закрыта до рестарта (ff1c3f2 + 351318f + 5d7eaf1), фактический порядок T-05→T-06 соответствовал плану. Перепроверка зон T-06 (п.1 ВНИМАНИЯ брифа): unit memory-doctor + memory-sync — ✅ 7/7; e2e doctor-hygiene — ✅ 6/6; предположения T-06 (lintFaces, memory-sync) миграцией не сломаны.
- Орфанный vitest (п.2 ВНИМАНИЯ): не найден — первичный ps-мэтч был строкой «vitest» в тексте собственного TASK-промпта continuation-сессии.
- ИНЦИДЕНТ — уточнение записи выше: «ghost-view»-артефактов не было; в worktree 13:36–14:36 работали ДВЕ живые L1-сессии (предыдущая, ошибочно считавшаяся убитой по ps=0 диспетчера, и continuation). «Транзиентный faces-wave.e2e.ts» — реальный файл воркера continuation-сессии (дубль-подмножество, удалён); «застейдженное удаление журнала» — её же легитимная зачистка стейл-дубликата report-wave-2.17-execute.md (закоммиченный черновик скаффолда с pending-таблицей; переименован в git rm -f, уникального контента нет); флейки 14:13–14:29 (p90 perf, mcp-stdio) — две полные сьюты параллельно на одной машине, изолированно 7/7. Обе сессии независимо прогнали одинаковый зелёный полный гейт 173/1312 на одном дереве; результаты слились в 8610588/eb7a5fe без потерь. Урок (в память Wolf): ps=0 в момент X не доказывает смерть исполнителя — перед каждой записью в общий worktree нужна сверка HEAD (drift-check), при расхождении — верификация чужого состояния, не перезапись.
- Полный гейт npm run check (L1 continuation, idle-машина, foreground) — ✅ EXIT=0: 173 test files / 1312 tests (базeline волны 164/1233).
- e2e (L1, независимый прогон): face-router 3/3 + router-fallback 4/4 + taxonomy-alias 9/9 + migrate-taxonomy 6/6 = 22/22.
- Независимое ревью T-10: worker-reviewer ses_ecaec4a54ffeoVixgg5DVHovuU — VERDICT: APPROVED (0 crit/major; 2 minor + 1 docs-minor + 2 nit). Evidence ревью: face-router 3/3, targeted 33/33, канон RENDER-IN-SYNC.
- Обработка findings: F1 (sessionInject без TTL — потолок варианта Б) и F2 (окно полу-миграции без самолечения) → зафиксированы как остаточные риски в docs/dev/roadmap/wave-2.17.md, решение за владельцем/бэклог; F3 (чекбоксы плана) → T-01…T-10 перевёрнуты; F4 (proposal-фасет формально на face — публично недостижим, guard выше) и F5 (raw-diff канона ловит штамп рендера — пре-существующее) → отклонены аргументированно.
- Прочее: prettier-нормализация журнала (запись T-10 выше нарушала формат:check); INDEX.md не менялся (генерируется wolf sync, волна зарегистрирована).

### T-11 (2026-10-13; версия и CHANGELOG фактически легли в f73fb1a — коммит-захват, см. инцидент)

- `npm version 2.17.0 --no-git-tag-version` — версия в package.json (единственный источник), ТЕГА НЕТ (тег — шаг 6 релизного чек-листа, отдельный запуск).
- CHANGELOG.md — запись [2.17.0] - 2026-10-13 (EN, Keep-a-Changelog) + compare-link v2.16.3...v2.17.0.
- README.md/README.ru.md (таксономия 8, wolf face/propose, Steward-абзац), docs/site/guide delivery/memory/base-set/feedback/cli + RU-зеркала, changelog-страницы EN+RU регенерированы sync-changelog.
- `npm run docs:build` — exit 0; `npm run check` — ЗЕЛЁНЫЙ 173/1312 (прогон воркера T-11 на итоговом состоянии).
- Релизный чек-лист: пункты 1–5 закрыты локально; 6–8 (тег v2.17.0 + GitHub Release, npm publish, wolf sync) — релизный запуск с владельцем после приёмки L0. ЗАПРЕЩЁННЫЕ действия (push/тег/publish/деплой) НЕ выполнялись.

## Финальная сводка (EXECUTION COMPLETE)

- Все T-01…T-11 закрыты; полный гейт зелёный: `npm run check` = 173 test files / 1312 tests (baseline 164/1233, +9/+79), exit 0.
- Ревью: T-08 — worker-reviewer APPROVED (0 crit/major, 2 minor: 1 закрыт фиксом, 1 отклонён аргументированно — потолок варианта Б на уровне дизайна); финальное волны — ДВА независимых ревью APPROVED (ses_ecaf1c8fbffexHDXsUKqP8vAuJ от исходной сессии; ses_ecaec4a54ffeoVixgg5DVHovuU от continuation-сессии), 0 critical / 0 major, findings minor/nit обработаны или аргументированно отклонены (см. записи T-10).
- ИНЦИДЕНТ ДУБЛЬ-ДИСПЕТЧЕРИЗАЦИИ (ESCALATION к L0): после рестартов платформы диспетчер выдал TASK волны ДВУМ L1-сессиям (исходной — этот журнал T-01…T-09, и continuation-сессии wave-2-17-execute-continue). Обе работали в одном worktree .worktrees/wave-2.17-faces с ~13:36 до ~15:00: пересекающиеся коммиты журнала, «параллельный агент» в наблюдениях воркеров, один коммит-захват (f73fb1a вобрал правки T-11 в работе — потерь нет, всё на диске верно). Состояние не пострадало: обе сессии независимо прогнали зелёный гейт на одном дереве, результаты слились без конфликтов. Требование к диспетчеру: перед повторной диспетчеризацией незавершённого TASK — проверка живости предыдущей сессии (heartbeat/журнал/HEAD drift-check), ps=0 недостаточен (урок в памяти Wolf).
- COMPLAINT-TRIAGE: seen 0 → resolved 0 / rejected 0 / escalated 0 / open 0.
- Осталось до публикации (релизный запуск с владельцем): тег v2.17.0 + GitHub Release; npm publish (trusted publishing); wolf sync в потребители; деплой сайта; докат ru/en доков уже в ветке.

## Workers Used — финал

| Задача                | Воркер                                                                | Исход                                      |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| T-01                  | worker-implementer ses_ecbe897e1ffeAksUlbNbPzBlNt                     | DONE_WITH_CONCERNS → принято L1            |
| T-02                  | worker-implementer ses_ecbd3562bffepUfj7RRMimvvyy                     | DONE_WITH_CONCERNS → FINDING-1 фикс → DONE |
| T-08                  | worker-implementer ses_ecbd35627ffeQDRwFQlB7KklEK                     | DONE → минор-фикс по ревью DONE            |
| Ревью T-08            | worker-reviewer ses_ecbc13f2dffeLWqLnIZJnlUzIk                        | APPROVED                                   |
| T-03                  | worker-implementer ses_ecbb4faa2ffefj4S3ks2dlKCyR                     | DONE_WITH_CONCERNS → принято L1            |
| T-04                  | worker-implementer ses_ecba36c95ffeGn3gI0JL23DXNz                     | DONE_WITH_CONCERNS → принято L1            |
| T-05                  | worker-implementer ses_ecb85794bffe3ArHJhyZmgFSPk                     | DONE → принято L1                          |
| T-07                  | worker-implementer ses_ecb651657ffeqm2A4Z9ML2c9Xg                     | прерван рестартом → возобновлён → DONE     |
| T-06                  | worker-implementer ses_ecb52fed0ffek61XJtSb48hZS6                     | перезапуск после сбоя → DONE               |
| T-09                  | worker-implementer ses_ecb427e56ffeaVXeQZdKW2109a                     | DONE (вскрыл и закрыл регрессию T-07)      |
| T-10                  | worker-implementer ses_ecb2e3a87ffeiIfFJ1H0142F5d                     | DONE (гейт 173/1312)                       |
| Ревью волны           | worker-reviewer ses_ecaf1c8fbffexHDXsUKqP8vAuJ                        | APPROVED (0 crit/major)                    |
| T-11                  | worker-implementer ses_ecae8f5ddffeU394e1lvXsyzdD                     | DONE (без публикации)                      |
| (continuation-сессия) | воркеры её диспетчеризации, вкл. ревью ses_ecaec4a54ffeoVixgg5DVHovuU | APPROVED                                   |

### T-11 — документация, сайт, версия 2.17.0 без публикации (2026-10-13)

- Состав: README.md / README.ru.md (8-типная таксономия, face/propose), сайтовые гиды en+ru (memory, delivery, base-set, feedback, cli/memory), docs/reference/cli.md — без дрейфа (T-04/T-09 регенерации актуальны), CHANGELOG.md — запись 2.17.0 (EN, Keep-a-Changelog: Added/Changed/Upgrade notes), package.json + lock = 2.17.0.
- `npm run docs:build` — ✅ EXIT=0 (vitepress build complete, 7.74s); changelog-страницы en/ru синхронизированы scripts/sync-changelog.mjs (+35/+35 — секция 2.17.0); prettier docs — ✅ чисто.
- Финальный полный гейт на итоговом дереве — ✅ EXIT=0: 173 test files / 1312 tests (15:00, idle-машина).
- Особенность исполнения: бо́льшая часть T-11-контента создана параллельной сессией (всплески до 14:55; см. инцидент в записи T-10) и частично поглощена коммитом f73fb1a через add -A; финальный сайтовый дельта-набор (base-set, feedback, memory en/ru, cli/memory, changelog-страницы) — коммитом T-11. Диффы проверены L1: выдумок нет, стиль волны, prettier зелёный.
- Отклонение от брифа диспетчера: стандартный `npm version 2.17.0` НЕ выполнялся — версия уже поднята параллельной сессией (повтор дал бы 2.17.1); тег v2.17.0 НЕ создан: бриф запрещает теги, конвенция репо — no-tag-prep (прецедент 2b6491e «no deploy/tag», тег v2.16.3 создан релизным запуском на итоговом коммите). Пункты чек-листа 6–8 (тег+GitHub Release, npm publish, wolf sync в проекты) — релизному запуску после приёмки L0.
