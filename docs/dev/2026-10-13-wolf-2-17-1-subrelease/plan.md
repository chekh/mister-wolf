---
slug: wolf-2-17-1-subrelease
title: '2.17.1 — план исполнения (REQ-01…REQ-07, NFR-01…NFR-03)'
status: draft
created: 2026-10-13
requirements: docs/dev/2026-10-13-wolf-2-17-1-subrelease/requirements.md
design: docs/dev/2026-10-13-wolf-2-17-1-subrelease/design.md
test-plan: docs/dev/2026-10-13-wolf-2-17-1-subrelease/test-plan.md
review: pending
---

# 2.17.1 — план

- База: requirements.md (утверждены владельцем, b8c3c51 + 31ab280), design.md (р2 APPROVED, 30a08a6). HEAD на момент планирования — `8ca53af09176cd13933d5e020b950cafb798e8fd` (после 31ab280 — только документные коммиты, src-база совпадает с baseline дизайна 31ab280).
- Профиль проекта: npm, vitest; точечная проверка `npx vitest run <путь>`, полный гейт `npm run check`; сборка доков `npm run docs:build`.
- Git: trunk-based (main = истина), работа в worktree-ветках; worktree внутри проекта — `.worktrees/<имя-задачи>` (правило mem_20260827). Коммитит L1; L2 не коммитит.
- Трассировка: во всех задачах/отчётах — пара «REQ-0x (R0y)» (F-05).

## Порядок и зависимости

```
T1 REQ-02 (R02)          ← база: WT-ID (нужен T5)
T2 REQ-03 (R04)          ← база: операция лица (нужны T3, T4)
T3 REQ-04 (R05)          ← T2        ┐ параллель допустима:
T4 REQ-01 (R01)          ← T2        ┘ разные файлы, общий предок T2
T5 REQ-05 (R06)          ← T1
T6 REQ-07 (R07)          ← T4 (примеры init сверяются с фактом после T4)
T7 REQ-06 (R08) + интеграция ← T1–T6 (полный гейт + e2e)
```

- **T1 и T2 не параллелить** (поручение координатора: общий контракт scope/мутации — обе задачи закладывают контракты, которые потребляют остальные).
- T3 ∥ T4 — разрешено только в раздельных worktree с раздельным allowlist (пересечение файлов исключено по §2 design); при одном исполнителе — последовательно (T3 → T4). Владелец интеграции — T7.
- Каждая задача: ветка из актуального main, вливание в main до старта зависимой задачи. `base_sha` задачи = HEAD main на момент её старта; для T1 зафиксирован явно.
- Правило разрешения конфликтов интеграции: конфликт в общем файле → rebase на main и повторное прохождение проверок задачи; конфликт контрактов (расхождение с design) → остановка, эскалация L0, не локальная импровизация.

## Задачи

Контракты TASK: task_id, цель, AC, base, worktree, allowlist, проверки, ожидаемый RESULT (DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED + evidence). Точные `file:line` исполнителю брать из design §2 (baseline 31ab280) и фактического кода.

- [x] **T1 — REQ-02 (R02): изоляция worktree-памяти** — исполнено 2026-10-13: коммит d7859f5, merge 11d62d5 в main. Ревью: CHANGES_REQUIRED (MAJOR-1 e2e-контракт 2.16 + 3 minor) → фикс-раунд устранил все; полные прогоны: `npm run check` GREEN (174/1335 на main после merge), `npm run e2e` GREEN 220/220, integration S-10…S-18 9/9. Evidence: RED/GREEN в tmp (волны 1–2), evidence-файлы воркера. Замечание ревью (banner уроков считает по всему пулу — pre-existing 2.14) — вне REQ-02, передано в риски фазы. — design §3.1–3.2, ADR-1/ADR-2, NFR-01 (R02); базлайн `src/adapters/fs/memory-root.ts:31`, `src/app/use-cases/get-call-injections.ts:82–129,144–158`, `src/app/use-cases/add-memory-object.ts:163–164`, `src/app/use-cases/promote-memory.ts:33–39`
  - Цель: единый WT-ID (`worktree:w-<12 hex sha1(realpath)>`), предикат `isVisible` во всех ветвях отбора, defaultScope = WT-ID, promote обоих токенов владельца, честный конфликт неоднозначного legacy-имени.
  - AC: REQ-02 AC-1…AC-6 + NFR-01 AC. Проверки: сценарии S-10…S-18 test-plan.
  - base_sha: `8ca53af09176cd13933d5e020b950cafb798e8fd`
  - worktree: `.worktrees/2-17-1-t1-req02-scope`
  - allowlist: `src/adapters/fs/memory-root.ts`, `src/app/use-cases/get-call-injections.ts`, `src/app/use-cases/add-memory-object.ts`, `src/app/use-cases/promote-memory.ts`, тип результата `CallInjectionResult` (файл по факту), новые тесты `tests/**` (пути по конвенции репозитория); чтение — без ограничений.
  - Проверки: `npx vitest run tests/<новые>` + `npm run check`.
  - Ожидаемый RESULT: DONE + evidence (запуски сценариев S-10…S-18).
- [ ] **T2 — REQ-03 (R04): восстанавливаемый commit мутации лица** — design §3.3, ADR-3; базлайн `src/app/use-cases/create-face-version.ts:193–353`, `src/domain/schemas/memory-event-schema.ts`, `src/app/use-cases/doctor.ts`
  - Цель: операция лица (staging + activation): события `memory.face.op_*`, цепочка шагов §3.3 под журналом, resume по `--op-id` (идемпотентные шаги), `wolf face recover <opId> --abort` (только до activation), `op_id` в extra face-объекта + правило усыновления, авто-resume, doctor «неполный след мутации», candidate скрыт от доставки.
  - AC: REQ-03 AC-1…AC-5 + NFR-02 (полный след читаем после каждого восстановления — матрица F1–F9, S-30; вклады T5/S-42 и T6/S-52 — карта покрытия test-plan). Проверки: сценарии S-20…S-30.
  - base_sha: HEAD main после вливания T1 (не ранее `8ca53af`).
  - worktree: `.worktrees/2-17-1-t2-req03-face-op`
  - allowlist: новый `src/app/use-cases/face-operation.ts`, `src/domain/schemas/memory-event-schema.ts`, `src/app/use-cases/create-face-version.ts`, `src/app/use-cases/doctor.ts` + `src/adapters/cli/commands/memory-doctor.ts` (по факту), `src/adapters/cli/commands/face.ts`, новые тесты (`tests/unit`, `tests/integration`).
  - Проверки: `npx vitest run tests/<fault-injection>` + `npm run check`.
  - Ожидаемый RESULT: DONE + evidence (матрица fault-injection зелёная).
- [ ] **T3 — REQ-04 (R05): миграция на общей операции + healing + аудит путей изменения face** — design §3.4, ADR-4, §7 (аудит); базлайн `src/app/use-cases/migrate-faces.ts:75,95,96–106`
  - Цель: `migrateFaces` на операциях (шаг `supersede_legacy`), skip-логика → 4 разбора §3.4 (resume / idempotent-skip / healing по anchored-совпадению точного reason-формата / конфликт), healing и resume не пишут body; аудит-документ путей изменения face (путь → кому разрешён → защита); запрет generic transition/supersede/edit на face-тип в use-case слое + негативный тест.
  - AC: REQ-04 AC-1…AC-4. Проверки: S-32…S-36.
  - base_sha: HEAD main после вливания T2.
  - worktree: `.worktrees/2-17-1-t3-req04-migrate`
  - allowlist: `src/app/use-cases/migrate-faces.ts`, use-case файлы transition/supersede/edit (`src/app/use-cases/transition-memory-object.ts`, `supersede-memory-object.ts`, edit-путь по факту), `docs/dev/2026-10-13-wolf-2-17-1-subrelease/face-change-paths-audit.md` (новый), новые тесты (`tests/unit`, `tests/integration`).
  - Проверки: `npx vitest run tests/<миграция+негатив>` + `npm run check`.
  - Ожидаемый RESULT: DONE + evidence + аудит-документ.
- [ ] **T4 — REQ-01 (R01): шаблонное обновление live-лица + правка шаблона Стюарда** — design §3.6, ADR-6; базлайн `templates/base/playbooks/steward-nastavnik.md:25,28`, `templates/base/agents/steward.md:56,90`, `src/app/use-cases/seed-base-playbooks.ts`, `src/adapters/cli/commands/memory-init.ts:228`
  - Цель: re-init (`wolf init --yes`) обновляет лица по решению §3.6 (нет лица + legacy howto → seed+supersede_legacy; дрейф при initiator seed/migration → template update; steward/owner/breakglass → diverged-отчёт); правка шаблона `steward-nastavnik.md`: мутация через `wolf face new` + 7 полей G17, атрибуция разрешённым механизмом launcher'а, без второго generic supersede и без перекладывания агрегации уроков в методику мутации; `wolf sync` не меняется.
  - AC: REQ-01 AC-1…AC-5. Проверки: S-01…S-08.
  - base_sha: HEAD main после вливания T2 (допустимо параллельно T3 — файлы не пересекаются).
  - worktree: `.worktrees/2-17-1-t4-req01-live-face`
  - allowlist: `templates/base/playbooks/steward-nastavnik.md`, `templates/base/agents/steward.md` (только пункты агрегации уроков, если затронуты), `src/app/use-cases/seed-base-playbooks.ts`, `src/adapters/cli/commands/memory-init.ts`, новые тесты (`tests/unit`, `tests/integration`).
  - Проверки: `npx vitest run tests/<обновление лиц>` + `npm run check`.
  - Ожидаемый RESULT: DONE + evidence (три популяции обновления: 2.16.3, 2.17.0, steward-мутнувшие).
- [ ] **T5 — REQ-05 (R06): claim владения артефактами** — design §3.5, ADR-5; базлайн — новые файлы, прецедент `FsMemoryLock` (`openSync(…, 'wx')`)
  - Цель: claim-реестр `.wolf/shared/claims/<slug>.json` (атомарный `wx`-create, stale по PID-liveness/TTL 24h, перехват с переименованием следа, порченый файл = stale), CLI `wolf claim acquire/release/list/–transfer-to`, `requireClaim` в use-cases записи общих артефактов (TASK-бриф, план, отчёт; связать фактические use-case файлы при реализации), worktree в claim идентифицируется WT-ID из T1.
  - AC: REQ-05 AC-1…AC-3. Проверки: S-38…S-42.
  - base_sha: HEAD main после вливания T1.
  - worktree: `.worktrees/2-17-1-t5-req05-claim`
  - allowlist: новые `src/adapters/fs/claim-registry.ts`, `src/app/use-cases/claim-artifact.ts`, `src/adapters/cli/commands/claim.ts` (путь по конвенции CLI), точки `requireClaim` в затронутых use-cases записи артефактов (кандидаты: `scaffold-artifact.ts`, sync-artifact-путь — связать по факту), новые тесты (`tests/unit`, `tests/integration`).
  - Проверки: `npx vitest run tests/<claim>` + `npm run check`.
  - Ожидаемый RESULT: DONE + evidence (два одновременных claim — ровно один успешен).
- [ ] **T6 — REQ-07 (R07): установка и документы по факту** — design §6 (NFR-03 список), требования REQ-07 AC; базлайн `README.md:41,49`, `README.ru.md:43`, `docs/site/**` (HomeInstall.vue:23–28,47, `guide/mcp.md:9`), отчёт 2.17 (`report-wave-2-17-execute.md:4`), roadmap (`wave-2.17.md:72`)
  - Цель: два явных пути установки (память `wolf init` / организация `wolf init --full --platform opencode`) на главной и в getting-started; примечание про npx try-out; примеры = чистый запуск; страница/раздел NFR-03 «изоляция чтения» с замороженным списком design §6 (CLI + зеркало MCP); отчёт 2.17 — статусы завершены, append-only журнал сохранён; roadmap без «ожидается» по исполненному; maturity-формулировки без преувеличений; `npm run docs:build` зелёный; версии X.Y.Z; legacy-каталоги не переименовываются.
  - AC: REQ-07 AC-1…AC-7. Проверки: S-49…S-55.
  - base_sha: HEAD main после вливания T4 (примеры сверяются с фактическим init после T4).
  - worktree: `.worktrees/2-17-1-t6-req07-docs`
  - allowlist: `README.md`, `README.ru.md`, `docs/site/**`, `docs/dev/2026-10-12-wave-2-17-faces/report-wave-2-17-execute.md`, `docs/dev/roadmap/wave-2.17.md` (явные цели T6, без общих масок); каталог артефактов подрелиза `docs/dev/2026-10-13-wolf-2-17-1-subrelease/**` НЕ трогать (зона T7/L1; в т.ч. `face-change-paths-audit.md` — файл задачи T3); прочие пути `docs/**` не входят; код `src/**` НЕ трогать (расхождение кода → эскалация L0, не правка молча).
  - Проверки: `npm run docs:build` + сквозная сверка примеров S-51 + `npm run check`.
  - Ожидаемый RESULT: DONE + evidence (чистые запуски, build-лог).
- [ ] **T7 — REQ-06 (R08): интеграционные проверки + 2 сквозных сценария + интеграция** — design ADR-2/ADR-3/ADR-4/ADR-5/ADR-6; требования REQ-06 AC
  - Цель: (а) интеграционные тесты на реальном хранилище/CLI для каждого изменённого пути: face-мутация (T2/T4), scope-доставка (T1), claim (T5), миграция (T3), установка (T4); (б) e2e сценарий 1 «Стюард-мутация с G17 → новое задание получает новую версию, активное — прежнюю» и сценарий 2 «доставка между рабочими копиями (своё/чужое/promote)» с сохранёнными tool traces в папке артефактов (revision + команды; критерии засчитывания — test-plan S-45/S-46); (в) интеграция: вливание остатков T3/T4/T5/T6 в main, полный гейт `npm run check` + e2e-набор, разрешение конфликтов по правилу раздела «Порядок». Write-зоны: исполнитель T7 пишет только traces/отчёт фазы в `artifacts/`; `[x]` в общем плане после приёмки ставит L1 (раздел «Отчётность и чекбоксы»), сам план меняет только L1.
  - AC: REQ-06 AC-1…AC-4; пакет приёмки: полный `npm run check` + e2e.
  - base_sha: HEAD main после вливания T1–T6.
  - worktree: `.worktrees/2-17-1-t7-req06-e2e` (сценарии ведут traces сюда же: `artifacts/` в папке задачи).
  - allowlist: тесты (`tests/integration`, `tests/e2e`), e2e-скрипты (по конвенции репозитория), `docs/dev/2026-10-13-wolf-2-17-1-subrelease/artifacts/**` и отчёт фазы T7 (только эти пути каталога подрелиза; `plan.md` и чекбоксы — зона L1), правки интеграции в файлах задач только по итогам проверок.
  - Проверки: `npx vitest run <интеграционные>` + e2e сценарии 1–2 + `npm run check` (полный, финальный).
  - Ожидаемый RESULT: DONE + evidence (traces, логи, SHA всех коммитов).

## Отчётность и чекбоксы

- `[x]` ставит L1 после проверок результата и необходимых ревью, рядом — revision/SHA и evidence. Коммит/чекбокс сам по себе приёмкой не является.
- Общий план меняет только L1 (автор этого документа). Воркеры возвращают RESULT в своих отчётах фаз; [x] в общем плане не их зона.
- Исполнение — после приёмки плана/тест-плана L0/владельцем; wolf-sdd при доступной диспетчеризации.
