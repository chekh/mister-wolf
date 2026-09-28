# План исполнения: dogfooding-hardening волны 0–3

Версия: v2 (после ревью итерации 1: исполнимость/минимализм/доки; отчёты `.wolf/orchestration/report-2026-09-28-plan-review-*.md`).
Дата: 2026-09-28. Спека: `docs/superpowers/specs/2026-09-27-dogfooding-hardening-design.md` (reviewed). Правила: CHANGELOG при релизе, доки+сайт при каждом релизе (`mem_20260928_..._fb4166`), теги EN-only, коммит после работы, полное E2E после плана.

## Порядок и релизы

`Волна 0 → 2.10.0 · Волна 1 → 2.11.0 · Волна 2 → 2.12.0 · Волна 3 → 2.13.0`. Один релиз на волну.

- Старт **работ** волны 1 — сразу после релиза 2.10.0; **приёмка/релиз** 2.11.0 — только после soak-гейта (спека §0.3: «волна 1 не принимается до soak»).
- Волна 2 стартует после 72h-алёрта телеметрии волны 1; 14-дневное post-окно — гейт релиза волны 1, не блокатор работ.
- Staging-копия (для smoke/тестов): rsync живого проекта во временный каталог вне его (прецедент `tests/e2e/helpers.ts:33`), никогда не работать в живом каталоге.
- Формат задач: требование → шаги → DoD. DoD: тесты (именованные), `npm run check`, доки-хвост (конкретные файлы, `+ru` = зеркальная RU-страница + оба sidebar'а в `docs/site/.vitepress/config.ts`), CHANGELOG — в релизе волны.

## Документация и сайт (обязательство §5.5 спеки, правило `mem_20260928_..._fb4166`)

Каждый релиз волны (2.10.0–2.13.0) обновляет в том же релизе: CHANGELOG, README-пару (`README.md` + `README.ru.md` синхронно), сайт https://chekh.github.io/mister-wolf/ (VitePress `docs/site/`, деплой GitHub Pages). Все страницы сайта — **парами EN+RU** (+ оба sidebar'а в `docs/site/.vitepress/config.ts` — dead links валят build). Полная карта по волнам:

| Релиз      | Создать (EN+RU+config.ts)                                                                   | Обновить                                                                                                                                                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2.10.0** | `docs/site/guide/telemetry.md` — телеметрия: новые поля detail, session_key, формат событий | `docs/guide/signal-log.md` (RU-канон полей); `docs/site/guide/cli/platform.md` (WOLF_SESSION, sync); `docs/site/guide/cli/analytics.md` (новые метрики); `docs/reference/cli.md`; **catch-up: версионные маркеры 2.8.0→актуальная (`docs/reference/cli.md:1`, `docs/guide/user-guide.md:3`) + CHANGELOG [Unreleased] (см. ниже)** |
| **2.11.0** | `docs/site/guide/router.md` — playbook-инъекции, fallback, mutated-skip                     | `docs/site/guide/troubleshooting.md` (классы ошибок add); `docs/site/guide/mcp.md` (brief-кэш скана, include_body); `docs/site/guide/cli/index.md`; RU-канон `docs/README.md`                                                                                                                                                     |
| **2.12.0** | `docs/site/guide/security.md` — секреты в .wolf, .gitignore, shared/local                   | `docs/site/guide/core-concepts.md` (тег-политика EN-only); `docs/site/guide/mcp.md` (memoryClass в list); README-пара                                                                                                                                                                                                             |
| **2.13.0** | `docs/site/guide/types.md` — справочник типов после диеты                                   | `docs/site/guide/mcp.md` — **каталог ≤12 тулов + guard автосверки «таблица == регистр тулов» в docs:build**; README-пара (§ MCP/Integrations, Demos — снять solve/scaffold/effectiveness); `docs/reference/cli.md`; CHANGELOG: Removed/Breaking + миграция промптов                                                               |

Механика релиза: docs:build гоняется в релизном PR (CI check его не покрывает); PR обязан содержать `docs/site/**`, иначе path-filter деплоя не стартует; после деплоя — проверка живого URL на маркер изменений. Релиз без пунктов этой таблицы не считается завершённым (чек-лист, п.3–4).

### Catch-up: полная актуализация накопленного отставания (аудит 2026-09-28)

Аудит «доки vs продукт 2.9.0» (отчёт: `.wolf/orchestration/report-2026-09-28-docs-audit-vs-product.md`): ~95% поверхности верно, лишнего 0, RU-EN паритет — но есть накопленное отставание. План актуализации — не только дельта волн, но и приведение витрины в соответствие продукту. Два первых пункта — **блокеры релиза 2.10.0**:

| #   | Что                                                                                                                                                                                                                                               | Релиз     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| C1  | **CHANGELOG [Unreleased]**: задним числом — security-фикс F26 (WOLF_SANDBOX sandbox-escape, `user-config.ts:10-33`) + продуктовое из 31 коммита после v2.9.0 (сверка с `git log v2.9.0..main`)                                                    | до 2.10.0 |
| C2  | **Версионные маркеры**: `docs/reference/cli.md:1` и `docs/guide/user-guide.md:3` «2.8.0» → актуальная версия продукта в релизном PR (2.10.0)                                                                                                      | до 2.10.0 |
| C3  | Base set на сайте: состав набора (6 агентов, 13 skills, 3 команды, 2 плагина, 6 плейбуков; источник истины `templates/base/`; политика sync/штампов wx) — новая страница `guide/base-set.md` EN+RU (или расширение platform.md — решить в задаче) | 2.11.0    |
| C4  | `migrate doc-ids [--apply]` — site platform.md EN+RU (попутно с тачем T002/T010)                                                                                                                                                                  | 2.11.0    |
| C5  | `update --actor` — site memory.md EN+RU (добавить тач страницы в волну 1)                                                                                                                                                                         | 2.11.0    |
| C6  | Матрица переходов lifecycle: `active→paused` (work-thread) — core-concepts.md EN+RU (та же страница, что и тег-политика)                                                                                                                          | 2.12.0    |
| C7  | README-пара: указатель MCP ведёт на внутреннюю superpowers-спеку → публичный каталог `docs/site/guide/mcp.md`                                                                                                                                     | 2.12.0    |
| C8  | `add` per-type поля таксономии — в переработку mcp.md (T030, guard покроет и параметры)                                                                                                                                                           | 2.13.0    |
| C9  | DEPRECATED_TYPE_ALIASES (document→document-ref) — в types.md                                                                                                                                                                                      | 2.13.0    |
| C10 | Косметика: README.ru.md:27 «Installation»→«Установка»; ru/configuration.md — полный пример YAML + recovery-абзац; label ссылки steward-bootstrap в паре                                                                                           | любой тач |

**Не чинить** (рационализировано): README-компактность (16 команд вне витрины — T030 сознательно сокращает); analytics-описание в mcp.md (тул удаляется в 2.13.0); harness-integration без MCP-каталога (другая роль документа); badges/Demos-gif (wish-list вне плана).
DoD catch-up: повторный аудит «доки vs продукт» по чек-листу релиза 2.13.0 — 0 расхождений класса УСТАРЕЛО/ОТСУТСТВУЕТ вне списка «не чинить».

## Волна 0 — 2.10.0 (инструментация + session-key)

**T001 Телеметрия: поля в detail (S–M: 5 писателей, jsonl-фикстуры с нуля)**
`mcp_call.detail`: error.message/error.code/error_class_id (classifyError), args_summary (add: type, title≤80, ключи extra, без body), memory_id (get), CLI-имя команды. `delivery.detail`: injection_bytes (байты). `router.log` при hit: имя playbook + метка canonical/fallback. Обрезка `target` до 200 симв (`memory-call.ts:56`).
Тесты: `session-metrics-log.test.ts` (per-writer поля), `memory-call.test.ts` (обрезка target), e2e fault-injection (add с кривым полем → error-поля заполнены; старые jsonl-строки читаются).
Доки: обновить `docs/guide/signal-log.md` (RU-канон полей); **создать** `docs/site/guide/telemetry.md` + ru + config.ts; заметка о сверке с p1-telemetry-identity в PR.

**T002 Session-key CLI-канала (M)**
Продюсер WOLF_SESSION per-invocation в CLI-обёртке; штампованные шаблоны передают env при spawn (доставка — sync). MCP не трогаем. `appendDeliverySignal` + 4 call-site'а.
Тесты: `actor.test.ts` (дискриминативность), e2e: без env — null, ничего не ломается.
DoD: в окне ≥100 CLI-вызовов ≥90% уникальных session_id.
Зависимость: → T003. Доки: страницы телеметрии (T001); поведение sync — `docs/site/guide/cli/platform.md` + ru.

**T003 Машинная приёмка: wolf analytics (M: build-analytics.ts ~1567 стр., golden-корпус)**
Расширение: miss-rate per agent-id; burst-статистика (гэп>60 c в session_key: доставок/burst, repeat-streak, уникальные); **error-rate per tool; p50/p90 per tool (duration_ms уже пишется); malformedLines; search→get follow-rate (джойн detail.memory_id, окно Δt=10 с); витальность (core-вызовы/72ч/проект); error_class_id-разрез**. Выход JSON + сводка.
Тесты: golden-фикстура jsonl с известными ответами (`tests/unit/app/analytics-acceptance.test.ts`).
Зависимости: после T002 (burst по session_key); **обязан уехать в 2.10.0 до soak**. Доки: `docs/reference/cli.md` (существующий язык файла — EN), `docs/site/guide/cli/analytics.md` + ru.

**T004 Soak + baseline (календарь)**
Окно с релиза 2.10.0: ≥7 дней И ≥30 add суммарно по активным проектам (или ≥30 burst'ов). Baseline-снепшоты (запросы + результаты через T003) — закоммитить в `docs/research/soak-baseline-2.10.0.md`. Гейт приёмки волны 1.

## Волна 1 — 2.11.0 (ядро)

**T010 sync mutated-skip (S–M)** → блокирует T012
Ветка в opencode-renderer: штампованный файл ≠ старый канон ≠ новый рендер → skip + warning (формат outcomes). Тесты: матрица `sync-base-set.test.ts` (created/skip-identical/updated/mutated-skip/conflict-unstamped). DoD: матрица зелёная; на staging-копии Tender sync не трогает локально-правленные штампованные файлы. Доки: sync-раздел `docs/site/guide/cli/platform.md` + ru; RU-канон `docs/README.md`.

**T011 add-диагностика → фикс (S/M; timebox диагностики 1 день)**
Диагностика по T001-полям (кандидаты: `.strict()` snake/camel, plain Error без хинта `memory-types.ts:353-355`). **Стоп-правило (дословно спека 1.2.a): корень в схеме данных, требующий миграции frontmatter → вынос в отдельную спеку с апгрейд-контуром.**
Тесты: fault-injection-набор из T001 (те же кейсы зелёные после фикса).
DoD: error-rate add <5% на soak-окне dogfood (n≥30, T003). Доки: `docs/site/guide/troubleshooting.md` + ru (классы ошибок).

**T012 Router fallback + executor-lead (M; после T010)**
Fallback-playbook в wolf-router (пометка fallback в router.log); playbook executor-lead в дефолтный набор; правка `templates/base/agents/executor-lead.md`.
Тесты: `wolf-router-plugin.test.ts` (fallback-инъекция), e2e против templates/-канона (не догфуд-копии).
DoD: miss-rate executor-lead <5% (miss = нет ни канона, ни fallback); hit-rate worker-\* ±1 пп **относительно baseline T004**; sync на staging-копии доставляет без затирания мутаций.
Доки: **создать** `docs/site/guide/router.md` + ru + config.ts; синхронизировать упоминания в cli/platform.md, cli/index.md.

**T013 brief: этап 1 (M)**
Не звать scanProject на каждом вызове (`mcp-tools.ts:369-371`; инкрементальный скан по mtime); не `store.list()` целиком (`generate-agent-brief.ts:21`).
Тесты: `generate-agent-brief.test.ts` (фикстура 250+ объектов), замер p90 через T003 на staging-копии trading-signal.
DoD: p90 < 1 с (n≥20, T003); непустота брифа — контентная e2e. Доки: `docs/reference/cli.md`, `docs/site/guide/mcp.md` + ru, cli/index.md.

**T014 search include_body (S; дефер-гейт на старте волны 1)**
Параметр include_body (дефолт false) + обязательный limit + обрезка body; тело уже в FTS5.
Дефер-решение по данным soak: follow-rate и объём search из T003; при follow-rate <1.5 — дефер в волну 3 (поедет в релиз T030).
DoD: follow-rate ↓ >3× (джойн detail.memory_id, Δt=10 с, T003); лимит соблюдён. Доки: `docs/site/guide/mcp.md` + ru.

**T015 trigger_keywords конституции (владелец, вручную)**
Точные ключи топ-2 памятей trading-signal. Критерий (§5.4): конституция доставляется 48ч+ после правки (T003).

**Приёмка волны 1** — §8 спеки: канарейки dogfood+Tender → +7 дней trading-signal; окна/min-n/контрольные метрики — через T003; полное 14-дневное post-окно (не сокращаем: n мал, пороги не ослабляем).

## Волна 2 — 2.12.0 (гигиена)

**T020 EN-only теги в шаблон (S)**
Абзац политики в onboarding-шаблон; слияние ru/en-дублей — ручной проход владельца (пар ≈ две).
DoD: шаблон обновлён; на контрольном окне 14 дней dogfood новые ru-теги <5% новых тегов; ручной проход: ru/en дубль-пар = 0.
Доки: `docs/guide/user-guide.md` (RU), `docs/site/guide/core-concepts.md` + ru (раздел тегов).

**T021 list: memoryClass фикс (S)**
Починка no-op (`mcp-schemas.ts:14-16` / `list-memory-objects.ts:4-8`); дефолт canonical-only, `--all`; терминология curated≡canonical.
Тесты: `list-memory-objects.test.ts` (дефолт/флаг/MCP-параметр). DoD: доля machine в выдаче по дефолту = 0 (e2e).
Доки: `docs/site/guide/mcp.md` + ru, README-пара, `docs/reference/cli.md`.

**T022 init/doctor: секреты + ghost (S–M)**
Секрет-детект **в `.wolf/`** (3 паттерна имён: `.creds`, `*.pem`, `.env*` — без контент-скана); предупреждение + вопрос про `.gitignore .wolf/`; ghost-детект в doctor (маркер onboarding без `.wolf/memory/`).
Тесты на фикстурах каталогов. Доки: **создать** `docs/site/guide/security.md` + ru + config.ts; связка с `SECURITY.md`.

## Волна 3 — 2.13.0 (диета; главный доковый релиз)

**T030 Диета поверхности: MCP + publicity (M; поглощает бывш. T033)**
Удалить MCP-инструменты: thinking×4, insights, analytics, scan. Слить в add: create_rule (гвард «rules by user request only» → в домен), create_article, create_info_request, create_thread (после теста work-thread layout). Оставить: recap, create_decision, create_blocker/resolve_blocker, ядро. Publicity: solve/scaffold/coord/effectiveness убрать из README/help (код не трогаем).
Тесты: e2e MCP-каталога (≤12 тулов); «tool not found» обработан; `wolf --help` без замороженных.
DoD: каталог ≤12; error-rate core-тулов 72ч ≤ pre+2 пп; **витальность ≥1 core-вызова/72ч/проект** (T003).
Доки (витрина): README-пара (§ MCP/Integrations, Demos); `docs/site/guide/mcp.md` + ru — таблица тулов по факту; **guard рассинхрона: тест/скрипт «таблица mcp.md == регистр тулов» в docs:build** (ручной каталог ×2 языка без guard не принимается); CHANGELOG (Removed/Breaking + пути миграции промптов); `docs/reference/cli.md`.

**T031 Типы: удалить/заморозить (S)**
Удалить escalation/decision-request/document-native (гвард-тест); заморозить open-question/session-checkpoint/council-opinion deprecated-флагом; `wolf taxonomy sync` на staging-копии — no-op.
Доки: **создать** `docs/site/guide/types.md` + ru + config.ts (или расширить core-concepts — решить по ходу, пара EN+RU обязательна).

**T032 Мёртвый код (S)**
prune() + дубль doctor; artifact_sources (zod-strip); run-log-цепочка (памятка в CHANGELOG).
DoD: `npm run check`; старый конфиг с artifact_sources парсится без поля. Доки: CHANGELOG.

## Релизный чек-лист (каждая волна; 7 пунктов)

1. `npm run check` + e2e зелёные; **docs:build зелёный в релизном PR** (CI гоняет только check — сайт ловится только так); новые страницы — парами EN+RU + config.ts (dead links валят build).
2. Staging-smoke §5.3 на rsync-копии живого проекта (включая «доки соответствуют поверхности»).
3. CHANGELOG (формат файла; обновить ref-блок сравнения `[Unreleased]`).
4. Доки+сайт (§5.5): README-пара синхронно; ru-зеркала сайта; PR содержит `docs/site/**` (иначе path-filter деплоя не стартует); после деплоя — живой URL несёт маркер изменений (число тулов и т.п.).
5. `npm version minor` + `npm publish` (пакет — единственный канал апгрейда).
6. Телеметрия обновления §5.4 (24–48ч, через T003).
7. Коммит/тег — trunk-based.

## Риски-триггеры выхода

Корень add-ошибок в схеме → стоп-правило T011 (=спека 1.2.a) · p90 brief не достигнут → T013 этап 2 отдельным решением · soak не набирается → продление окна, не ослабление порога · T014 дефер-гейт по follow-rate soak.
