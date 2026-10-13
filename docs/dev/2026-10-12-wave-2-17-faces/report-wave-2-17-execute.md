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

| Задача | Статус | Коммит |
|---|---|---|
| T-01 face+proposal схемный фундамент | DONE (принято L1) | ed7dd8f |
| T-02 createFaceVersion + guard | DONE (принято L1, 1 фикс по ревью L1) | 89dbdda |
| T-03 G17-запись мутации | DONE (принято L1) | (см. ниже) |
| T-04 CLI `wolf face` | DONE (принято L1) | 45ecd46 |
| T-05 миграция + alias + seed | pending | — |
| T-06 doctor NFR-02 + memory-sync | pending | — |
| T-07 guard `wolf add` | pending | — |
| T-08 wolf-router вариант Б | DONE (принято L1 + ревью APPROVED + минор-фикс) | c45b66e, 51e2477 |
| T-09 proposals save/deliver + CLI | pending | — |
| T-10 интеграция + e2e + полный гейт | pending | — |
| T-11 документация/сайт/версия (без публикации) | pending | — |

## Task Decomposition

Декомпозиция задана планом (T-01…T-11). Исполнение — worker-implementer (L2);
ревью — worker-reviewer (после T-08 ✅ и после T-10) + сверка diff L1 на каждой задаче.
Параллельность: T-02 ∥ T-08 (непересекающиеся write-наборы) — исполнено, коммиты раздельные.

## Workers Used

| Задача | Воркер | Исход |
|---|---|---|
| T-01 | worker-implementer ses_ecbe897e1ffeAksUlbNbPzBlNt | DONE_WITH_CONCERNS → принято L1 |
| T-02 | worker-implementer ses_ecbd3562bffepUfj7RRMimvvyy | DONE_WITH_CONCERNS → FINDING-1 (события breakglass: оба) → фикс DONE |
| T-08 | worker-implementer ses_ecbd35627ffeQDRwFQlB7KklEK | DONE → минор-фикс по ревью DONE |
| Ревью T-08 | worker-reviewer ses_ecbc13f2dffeLWqLnIZJnlUzIk | APPROVED (0 crit/major, 2 minor) |
| T-03 | worker-implementer ses_ecbb4faa2ffefj4S3ks2dlKCyR | DONE_WITH_CONCERNS → принято L1 |

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
- Guard (design §Guard): new → строго agent:steward; restore/breakglass → user:*; breakglass отказывает при WOLF_SESSION с префиксом opc- (F-04). Отказ → memory.face.denied + UserFacingError.
- Параметра-актёра у API нет — подмена инициатора исключена структурно.
- reason обязателен (REQ-04 AC2). Успех → memory.face.versioned; breakglass → ОБА события (versioned c initiator=breakglass, затем breakglass) — фикс по FINDING-1 ревью L1 (design: «versioned на каждую версию»).
Отклонения: store-wide lock вместо per-owner (порт без ключа, вне allowlist) — сериализация гарантирована, гранулярность грубее; initiator migration/seed без публичного входа — за T-05.
Риски: review_state face от agent:* = proposed (дефолт governance) — влияние на router не ожидается (поиск по hide-superseded), проверить на T-10.

### T-08 — wolf-router вариант Б (c45b66e + 51e2477)
Файлы: .opencode/plugins/wolf-router.ts + templates/opencode/plugins/wolf-router.ts (синхронно; templates — канон, .opencode — dogfood-рендер: правка одного не делает тест зелёным — отклонение от allowlist обосновано), tests/unit/wolf-router-plugin.test.ts.
- (а) sessionInject Map<'WOLF_SESSION:agentId', {text,name,variant,bytes}> в deliverPlaybook — повторная доставка в сессии отдаёт запечатанный текст без CLI-спавнов, работает при пересборке system (не зависит от персистентности).
- (б) resolvePlaybook: search живой на каждой новой сессии (барьер свежести); TTL-кэш отдаётся только при hit.value.id === ids[0] (head) — устаревшая версия не отдаётся никогда.
- TTL-тест переработан: (2) та же сессия + v2 + пересборка при <TTL → запечатана v1, 0 спавнов; (3) новая сессия в пределах TTL → v2; (1) respawn после TTL → v3. Fake timers по P106.
Ревью (ses_ecbc13f2dffeLWqLnIZJnlUzIk): APPROVED. Findings:
1. minor «ложный комментарий негативного кэша» — ИСПРАВЛЕН (51e2477).
2. minor «гранулярность сессии = процесс (WOLF_SESSION), не чат; sessionInject без TTL» — ОТКЛОНЁН аргументированно: design сам операционализирует сессию через WOLF_SESSION (§Guard), потолок закомментирован в коде, test-plan моделирует respawn сменой WOLF_SESSION; chat-уровневый ключ — вне scope волны (в Per-chat id нет в контракте V2ContextEvent/_input). Зафиксировано как осознанное ограничение варианта Б.
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
