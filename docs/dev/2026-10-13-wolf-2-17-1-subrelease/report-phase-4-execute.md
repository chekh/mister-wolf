---
slug: wolf-2-17-1-subrelease
title: '2.17.1 — фаза 4: исполнение (отчёт L1, пополняемый)'
status: in-progress
created: 2026-10-13
plan: docs/dev/2026-10-13-wolf-2-17-1-subrelease/plan.md
test-plan: docs/dev/2026-10-13-wolf-2-17-1-subrelease/test-plan.md
---

# Фаза 4 — исполнение T1..T7 (wolf-sdd)

Методика: wolf-sdd (исполнение утверждённого плана) + test-driven-development.
Порядок: T1 → T2 → (T3 ∥ T4) → T5 → T6 → T7. Интеграция — L1; воркеры — чистые
сессии с allowlist из плана; каждый отчёт воркера принят по RESULT-контракту,
независимое ревью каждой задачи, финальное интегральное код-ревью — перед
финальным пакетом.

## Промежуточный отчёт 1: T1 (после интеграции)

### Статус: COMPLETE (принято L1, интегрировано в main)

- **base_sha**: b6852e1 (ветка feature/2-17-1-t1-req02-scope)
- **Коммиты**: d7859f5 (T1), merge 11d62d5 в main; [x] в плане — 5bf434f
- **Исполнение**: worker-implementer (воркер-1): DONE_WITH_CONCERNS → ревью
  worker-reviewer: CHANGES_REQUIRED (MAJOR-1 + 3 minor) → фикс-раунд
  (worker-implementer, воркер-2): DONE, все находки устранены.

### Изменения (8 файлов, allowlist соблюдён)

- `src/adapters/fs/memory-root.ts` — WT-ID `worktree:w-<12hex sha1(realpath)>`, resolveWorktreeIdentity, fail-closed
- `src/app/use-cases/get-call-injections.ts` — isVisible во всех 5 ветвях, scopeConflicts, stderr-предупреждения, R2-01 fallthrough (чужой WT-ID-токен → legacy-разбор)
- `src/app/use-cases/promote-memory.ts` — promote обоих токенов владельца; неоднозначный legacy → конфликт; null-identity → 0 promoted/exit 0 (S-17, решение L0)
- `tests/e2e/worktree-memory.e2e.ts` — переписан под контракт 2.17.1 (был закодирован контракт 2.16)
- тесты: unit (3 файла переписаны) + integration worktree-scope-isolation (S-10…S-18)

### Evidence

- RED/GREEN: 2 волны TDD (RED-wave1/GREEN-wave1, RED-wave2/GREEN-wave2), e2e RED-базлайн 2 failed → GREEN
- Верификация L1: integration 9/9, e2e точечный 4/4, allowlist-проверка diff — чисто
- Полный гейт после интеграции: `npm run check` GREEN — 174 файла / 1335 тестов
- Полный e2e: `npm run e2e` GREEN — 220/220 (59 файлов)

### Ревью: находки → исход

- MAJOR-1: tests/e2e/worktree-memory.e2e.ts кодировал отменённый контракт 2.16 → устранено (переписан: WT-ID-ассерт, S-17 из main + S-15 из копии, orphan-тест на предсказуемой фикстуре), полный e2e 220/220
- MINOR-1 (R2-01 fallthrough): устранено, 2 RED→GREEN теста
- MINOR-2 (дыра предупреждения при сбое git worktree list): устранено, RED→GREEN
- MINOR-3 (S-17 exit 0 на CLI): устранено в e2e (CLI-спавн — единственное место реального процесса); отклонение от буквы «в integration» зафиксировано честно
- Вне мандата (пре-существующее, 2.14): banner уроков считает по всему пулу включая чужие worktree-scoped объекты (утекает счётчик, не контент) → риски фазы, бэклог

### Отклонения/уроки

- Урок зафиксирован (mem_20261013_smena_kontrakta_e2e_nabor_tests_e2e_vne_a8fa85): e2e-набор вне npm run check — при смене контрактов гонять целевой e2e + grep по каталогу
- pre-existing format:check красный на 11 doc-файлах фаз 1–3 → prettier-фикс отдельным коммитом 6c97743 до интеграции T1 (семантика не менялась)
- concern T2-зоны: doctor не знает про WT-ID-токены (ложные orphan для WT-ID-объектов) и не показывает scopeConflicts — memory-doctor.ts в allowlist T2, покроется там (S-13 doctor-часть)

## Промежуточный отчёт 2: T2 (после интеграции)

### Статус: COMPLETE (принято L1, интегрировано в main)

- **base_sha**: 5bf434f (ветка feature/2-17-1-t2-req03-face-op, merge с main)
- **Коммиты**: 4e35cb5 (T2), merge в main; [x] в плане
- **Исполнение**: worker-implementer: NEEDS_CONTEXT (2 контракта вне allowlist, доказано PROOF-тестами) → L1 расширил allowlist (memory-types.ts, cli.md-регенерация; урок зафиксирован) → перезапуск: DONE → ревью worker-reviewer: CHANGES_REQUIRED (M1 + 3 minor) → фикс-раунд: DONE.

### Изменения (12 файлов, allowlist соблюдён)

- `src/app/use-cases/face-operation.ts` (новый) — механизм операций §3.3: op_started/op_step/op_committed/op_aborted, цепочка add_face→g17_record→proposal_relation→activate→supersede_prev→announce→op_committed, reconcile по store, resume/abort, усыновление по op_id, авто-resume, doctor-API, fault-seam, safeIndex
- `src/domain/schemas/memory-event-schema.ts` — 4 события memory.face.op\_\*
- `src/domain/memory-types.ts` — face lifecycle += candidate, fields += op_id (ADR-3, санкционировано L1)
- `src/app/use-cases/create-face-version.ts` — guard/валидация до op_started под lock → делегирование runFaceMutation
- `src/adapters/cli/commands/face.ts` — --op-id, recover <opId> [--abort], list скрывает candidate
- `src/adapters/cli/commands/memory-doctor.ts` — секция «Face operations» (issue + opId + подсказка recover)
- `docs/reference/cli.md` — только регенерация (идемпотентность доказана ревью)
- тесты: integration face-operation-recovery (16), unit face-operation (8), unit face-recover-cli (5), memory-doctor (7), taxonomy-пин обновлён

### Fault-матрица F1–F8 (T2-часть): все GREEN

F1 add_face / F2 g17_record / F3 proposal_relation → «не применено», resume доводит, candidate скрыт (canon=null до activation); F4 activate / F5 supersede_prev / F6 announce / F7 op_committed → «применено, требуется восстановление следа», resume дописывает ровно недостающее (идемпотентно); F8 FTS → операция успешна (индекс производный), rebuild лечит. Общие проверки матрицы (1)–(4) в каждом F; S-28 усыновление (3 случая), S-29 авто-resume (иной input + same-input), S-30 abort/doctor-матрица.

### Ревью: находки → исход

- M1 (major): ветка same-input авто-resume не покрыта тестом → integration-тест добавлен, RED-чувствительность доказана (ветка отключалась → тест ловит дубль версий; восстановлена байт-в-байт)
- m1: doctor-CLI печать под ассертом (7/7)
- m3: canon/доставка-ассерты добавлены в F2/F3/F8
- m2: recover без guard по актору — по design не требуется; путь включён в аудит T3 (S-36), передано

### Evidence

- Верификация L1: integration 16/16, tsc чист, allowlist-проверка
- Полный гейт после интеграции: `npm run check` GREEN — 1365 тестов на main
- Отклонения исполнителя: same-input=resume (выведено из AC-2, обосновано ревьюером, теперь покрыто тестом); prettier-only правка отчёта фазы; +memory.transitioned на activate/abort (консистентно с объектным журналом)

## Промежуточный отчёт 3: T3 + T4 (T4 — после проводки)

### T4: COMPLETE (принято L1, интегрировано 712bbd8; проводка d2e1f22, план [x] 9b157e2)

- Исполнение: воркер → NEEDS_CONTEXT (2 пункта) → решение L1 (allowlist+face-operation.ts) → DONE → ревью 1: CHANGES_REQUIRED (M1 seed-гейт §3.6, m1-m3) → фикс-раунд 2: DONE.
- M1 был сквозным: без него популяция 2.16.3 (§3.6) получала seed без поглощения legacy → вечный reason-mismatch. Закрыт (seed+migrate гейт, RED→GREEN).
- Guards: generic transition/supersede/edit на face отклонены в use-case слое (PROOF перевёрнуты). Аудит-документ: face-change-paths-audit.md (все пути §7 + открытый пробел `wolf update --tags` — вне REQ-04, помечен).
- F9: supersede_legacy — шаг той же операции (позиция/идемпотентность/head погашен операцией) — по букве design.
- Healing/resume под MemoryLock; body не пишется (S-35).
- Evidence: 81/81 точечно, 1388/1388 полный test:run, tsc чист.

### T4-проводка: COMPLETE (seed-путь на общий механизм)

- Ревью T4: 0 major, 3 minor (док-строки) — правки внесены L1 (steward.md авторство/шаг 6 через `wolf relation add outcome_of`, complaint-protocol resolution-формат), guard-тесты зелёные.
- Проводка: фолбэк supersedeMemoryObject в seed-пути → одна журналируемая операция seed с legacyHeadId (стало возможно после T3/M1) — коммит d2e1f22; merge T4 в main 712bbd8; план [x] 9b157e2. Полный гейт на main после T4 — GREEN (1388+ тестов).

## Промежуточный отчёт 4: T5 (после интеграции; смена lead-конвейера)

### Инцидент: гибель lead-процесса и зависший воркер T5 (честно)

- В ходе фазы 4 lead-процесс прежнего конвейера погиб (сбой провайдера). Его воркер T5 (worker-implementer) завис: процессы 65568/65567 спали и не писали; RESULT утерян.
- Восстановление: L0 запустил нового интегрирующего lead. Останов зависших процессов — административный (`kill -TERM`; к моменту останова процессы уже отсутствовали; параллельно обнаружен живой worker-reviewer прежнего конвейера (PID 29107) — его вывод ушёл в мёртвую сессию, недоступен; ревью выполнено заново).
- Состояние на момент восстановления проверено по git-фактам: T1..T4 COMPLETE в main (9b157e2), T5 воркер успел ЗАКОММИТИТЬ фичу (7bd53b9 в ветке t5) и оставить незакоммиченный частичный фикс-раунд (MINOR-1/2/4 реестра + e2e-workaround). Незакоммиченный мусор `mister-wolf-2.17.0.tgz` в корне worktree — вне коммитов, не тронут.

### T5: COMPLETE (принято L1, интегрировано 8e73640)

- **base_sha**: 9b157e2 (ветка feature/2-17-1-t5-req05-claim)
- **Коммиты**: 7bd53b9 (фича, воркер прежнего конвейера), d6dd30b (фикс-раунд 1), merge 8e73640 в main; [x] в плане.
- **Верификация L1 (RESULT прежнего воркера утерян — отклонение от схемы wolf-sdd, верификацию провёл L1)**: точечные claim-тесты 35/35, полный `npm run check` в worktree GREEN (183/1432).

### Ревью 1: CHANGES_REQUIRED (2 critical / 1 major / 4 minor) → фикс-раунд 1 → ревью 2: APPROVED

- **C1**: CLI acquire писал `process.pid` одноразового CLI-процесса → после выхода pid мёртв → claim stale: owner-lockout (acquire→scaffold цикл невыполним) и мгновенный перехват конкурентом (оба воспроизведены ревьюером на живом CLI). Фикс: CLI-acquire пишет pid=0 — держатель claim'а — агент-сессия (guard сверяет owner+session; pidAlive(0)=жив до TTL; прецедент transfer pid=0). S-38c: конкурент через 1с — отказ, следа нет.
- **C2**: регрессия e2e scaffold-artifact (3/4 RED) — scaffold без claim теперь отклонён (это AC-3), тесты не обновлены; e2e вне npm run check — гейт не ловил. Фикс: e2e переписан под claim-контракт (4/4), artifact-id парсится из отказа guard (UTC-дата).
- **M3**: гонка пустого файла (окно wx→write): конкурент читал '' → stale-перехват свежесозданного → два победителя. Фикс: пустой/in-flight файл → ожидание ≤60×10мс → ClaimHeldError; непустой не-JSON — по-прежнему stale+след (S-42b).
- **m4**: TOCTOU имени следа (exists+rename) — двойной перехват одной мс терял байты. Фикс: linkSync (excl) + bump эпохи + сверка контента с raw + inode-guard на unlink. Стресс: 4 воркера × 60 раундов: до — 7 потерь/16 ложных следов; после — 3 прогона × 0/0/ровно 1 победитель.
- **m5**: release порченого говорил «No claim held» → честное «corrupt» (файл не тронут). **m6**: S-42b порченый claim в интеграции. **m7** (санкционированное отклонение): transfer-claim (session null) доступен адресату с любой его сессией — иначе передача паркует запись до TTL; покрыто юнитом.
- Ревью 2: **APPROVED** — все находки №1–7 закрыты (таблица с файл:строка), 0 critical/0 major, 3 minor-наблюдения pre-existing, не блокируют.

### Санкции L1 (зафиксированы)

- Allowlist расширен: `tests/e2e/scaffold-artifact.e2e.ts` (регрессия от легитимного AC-3), `tests/e2e/artifact-index.e2e.ts` (prettier-only поверх правок погибшего воркера — иначе format-гейт красный).
- Семантика pid=0 для CLI-acquire — уточнение §3.5 (не смена контракта: REQ-05 AC-1/2/3 выполняются; одноактивный-писатель гарантируется реестром, держатель — сессия).

### Evidence T5

- Точечные: unit+integration claim — 45/45 (после фикса), e2e scaffold-artifact 4/4.
- Живой CLI: acquire (процесс A) → scaffold (процесс B, та же сессия) exit=0 + 4 файла; конкурент — отказ «Claim already held», след не создан; повторный scaffold — «already exists».
- Полный гейт на main после merge: `npm run check` GREEN — 183 файла / 1442 теста; целевой e2e (scaffold-artifact + artifact-index) 7/7.

## Промежуточный отчёт 5: T6 (после интеграции; продолжение после смены конвейера)

### T6: COMPLETE (принято L1, интегрировано 290914f)

- **base_sha**: 9b157e2 → merge main (d3eeb41) → коммит 8882eb4 в ветке t6.
- **Контекст**: работа начата погибшим конвейером (11 файлов незакоммичено: два пути на главной/getting-started, read-isolation EN/RU + config, статусы отчёта/roadmap, README-пары). Новый конвейер: merge main в t6, гейты (check 184/1447 GREEN, docs:build GREEN), верификация и доводка воркером.
- **Доводка воркером (12 правок в 10 файлах)**: mcp.md restart+platform-подключение, troubleshooting npx-fix, delivery/organization/base-set — «--full сеет лица» (проверено чистым запуском); NEEDS_CONTEXT-пунктов по коду нет.
- **Ревью: APPROVED** (0 critical / 0 major / 3 minor): allowlist соблюдён (19+3 файла), append-only отчёта 2.17 сохранён (только frontmatter + 2 ячейки статусов), чистые запуски Path A/B сверканы дословно (6/19/3/2 = templates/base), maturity-формулировки честны (council DESIGNED, learn removed), NFR-03-список на месте + юнит-тест 5/5.
- **Minor-исходы**: Minor-3 устранён L1 (сентинелы `wolf brief`/`owner_skill`/`mr-wolf_brief` в doc-тест); Minor-1 (frontmatter `updated:` — гигиенически корректно) и Minor-2 (страница опускает `show` из списка — top-level `wolf show` не существует, страница права; design §6 упоминает `mr-wolf.call`, которого в каталоге нет — расхождение в сторону факта) приняты как есть, зафиксированы для сведения владельца.
- **Evidence (S-49…S-55)**: docs:build exit 0; Path A `wolf init` — вывод дословно из дока, на диске только `.wolf/` + `AGENTS.md`; Path B `--full --platform opencode` — 6 агентов/19 скиллов/3 команды/2 плагина (= templates/base), opencode.json = обещанию; npx try-out — «base set skipped / platform configs: skipped»; S-54 (нумерация тест-плана) — реальная сцена 2.16.3 (npm pack) → re-init: сет 6/19/3/2, playbook-лица с `superseded legacy howto` (популяция §3.6 работает на живом обновлении); S-55 (нумерация тест-плана) — sync: mutated → `skipped — mutated after render`, unstamped → `conflict`, НЕ «updated».
- **Санкции L1**: tests/unit/read-isolation-doc.test.ts (тест замороженного списка NFR-03 в docs-зоне задачи); сентинел-ассерты внесены L1 после ревью (Minor-3).
- **Гейт после merge**: `npm run check` GREEN — 184 файла / 1447 теста на main.
- Примечание: нумерация S-54/S-55 в TASK-брифе T6 была переставлена относительно тест-плана; воркер корректно следовал тест-плану (отклонение брифа, не исполнения). Расхождение R2-02 test-plan (`.opencode/agent` vs `agents`) — в бэклог тест-плана (не блокер, путь в факте верный).

## Промежуточный отчёт 6: T7 (REQ-06/R08 — интеграция, карта, сквозные сценарии)

### Статус: DONE_WITH_CONCERNS (см. Расхождение-1 — ред гейта внесён T5, вне allowlist T7)

### Что сделано (все шаги — фактические tool calls, трассы в artifacts/)

- **Сценарий 1 (S-45)** — `artifacts/scenario-1-steward-g17.md` (+ `scenario-1-raw.log`, `scenario-1-router.log`): свежая установка 2.17.1-сборки в tmp (`init --full --platform opencode`, XDG изолирован); активное задание `ses-worker-1` получило лицо Стюарда **v1** через реальный router-плагин (search+get, router.log); Стюард (`WOLF_ACTOR=agent:steward`) — `wolf face new steward` со всеми **7 полями G17**, exit 0, op-id `faceop-1791933985203-237c`, G17-запись `mem_20261013_mutation_steward_v2_2d4d03`; `face show` → v2 active, `face history` → v1 superseded (head-1); **новое** задание `ses-worker-2` (свежий процесс) получило **v2**; **активное** задание (тот же процесс, та же сессия) удержало **v1** (router ms=0 — мемо без ре-резолва); цитата ограничения R03 §6 и граница «к следующему запуску процесса/задания» зафиксированы в артефакте.
- **Сценарий 2 (S-46)** — `artifacts/scenario-2-worktree-delivery.md` (+ `scenario-2-raw.log`): tmp git-репо + main + два linked worktree; `add --type lesson` из W1 → scope `worktree:w-a089d905af7c` (WT-ID); `call --for` — доставлено в W1 (ses-a), **не** доставлено в W2 (ses-b) и main (ses-m); `promote w1` → «Promoted 1 object(s) from worktree:w-a089d905af7c, worktree:w1 to main»; после promote доставлено W2 (ses-b2) и main (ses-m2). Отклонение буквы брифа: `promote <id>` → фактическая сигнатура `promote <worktree>` (имя; владелец по cwd-идентичности).
- **Интеграционная карта (S-44)** — `artifacts/integration-map.md`: все 6 изменённых путей покрыты зелёными интеграционными тестами на реальном хранилище/CLI (сводный прогон 6 файлов: **59 passed (59)**: face-operation-recovery 16, live-face-update 6, worktree-scope-isolation 9, claim-workflow 8, migrate-faces-healing 16, base-set-init 4); строка «установка» + tmp-запуски T6 (S-51 чистая установка; обновление 2.16.3 — S-55 тест-плана / «S-54» брифа T6) со ссылкой на Evidence-строку отчёта T5/T6 выше. Дыр покрытия нет; правки `tests/**` — 0.

### Гейты фазы

- `npm run check` — **GREEN**: `Test Files 184 passed (184)`, `Tests 1447 passed (1447)`.
- `npm run e2e` — **1 failed / 219 passed** (`Test Files 1 failed | 58 passed (59)`, 220 тестов, 445s).

### Расхождение-1 (для L1, не правилось молча)

`tests/e2e/help-budget.e2e.ts` (P224): `wolf --help` = **38** строк при бюджете ≤36 (`expected 38 to be less than or equal to 36`). Воспроизведён изолированно. Внесён **T5** (7bd53b9: команда `claim` добавила 2 строки; бюджет последний поднимался в 2.16.2 и не включает 2.17.1-команды) — ред существует на базе T7 (a1c7c85), diff T7 — только `artifacts/**`. Зона решения вне allowlist T7 (`src/**` запрещён; правка теста-гварда — продуктовое решение, не дыра покрытия). Варианты для L1: поднять бюджет P224 до 38 (прецеденты 2.16/2.16.2) или сократить поверхность help (однострочное описание claim); при правке — регенерация cli-reference.

### Прочее

- Allowlist соблюдён: новые файлы только в `artifacts/**` (6 файлов); `src/**`, `plan.md`, requirements, design не тронуты; коммитов нет.
- Гигиена окружения: первый разведочный init зарегистрировал tmp-проект в пользовательском `~/.config/wolf/projects.yaml` — запись удалена (backup сохранён); все последующие запуски шли с изолированным `XDG_CONFIG_HOME` (паттерн tests/e2e).
- Замечание по механике (для сведений): `wolf call` лица не доставляет (pool call-injections пуст после init) — доставка лиц идёт router-плагином (`search <agent-id> playbook --hide-superseded` + `get`); сценарий 1 исполнял реальный отрендеренный плагин с PATH-shim на тестируемый dist CLI.
