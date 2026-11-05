---
slug: council
title: '2.31.0 — план'
status: draft
created: 2026-11-05
baseline: 174e5102f85a515a75c47a670b99b507811bb688
---

# Консилиум — план

## Задачи

Чекбоксы ниже относятся к внедрению релиза, не к наличию подготовленных документов.
Автор этого пакета не заявляет принятую реализацию. База package 2.30.0,
174e5102f85a515a75c47a670b99b507811bb688; целевой кандидат 2.31.0.

- [x] P01: независимо проверить quartet и candidate; уточнить технические ADR,
      занятость версии и актуальность main — design §ADR/источники, AGENTS.md:1.
      Сделано → 65a0d438 (кандидат применён чисто: 17 файлов, 284+/85-, sha256
      7e87e6ce…f10f6; тега v2.31\* нет, npm view 404; main=origin/main=174e5102;
      ADR-сверка по коду: note+facet/extra-deny/relations/MCP-каталог≤12 — см.
      wolf-заметку mem*20261105_rel_231_a_p01*…2d0430).
- [x] P02: реализовать экспертную роль и реально ограниченные права/изоляцию
      OpenCode, прототип S04/S06 до широкой интеграции — design §1–2;
      templates/base/agents/worker-reviewer.md:1 как сравнение, не наследовать его обязанности.
      Сделано → 364f0b7d (профиль прав worker-expert мигрирован на канонический
      v2-массив permissions, live-доказанный W2a на v2.2.5; S04 доказан: разрешённое
      чтение проходит, read вне scope/write/shell/subagent/webfetch/MCP реально
      отклоняются/скрыты; S06: конфиг-изоляция доказана, symlink-обход закрыт
      процедурой; поведенческий S06-прогон A/B заблокирован деградацией провайдера
      роутера — остаток срезу B; см. mem*20261105_rel_231_a_w2b*…\_cc4d2a).
- [x] P03: интегрировать wolf-council, нанимателей и маршруты, expert/synthesis
      профили языка — design §1/3; templates/base/skills/using-skills/references/contracts.md:32.
      Сделано → 65a0d438 (кандидат: профили/маршруты/ссылки) + 364f0b7d (синхронизация
      SKILL.md с фактическими CLI/MCP-формами; таблица соответствия методика↔реализация
      в отчёте среза A; расхождений канона с реализацией нет).
- [x] P04: реализовать валидируемый note write-path и CLI/MCP, idempotency/recovery
      — design §4; src/app/use-cases/add-memory-object.ts:91, src/domain/memory-types.ts:256.
      Сделано → af799f7d (RED: unit 31 + integration 6) → 60ba0fb7 (record-council.ts:
      строгая схема, canonical JSON, sha256 question_revision, идемпотентность
      request_key, recovery без дублей, MemoryLock; 47/47 GREEN, tsc clean) →
      a97006ef (CLI council record --input + MCP council_record одной операцией;
      каталог MCP 8≤12; guard'ы/справочники синхронизированы; адаптер-тесты 6/6).
- [x] P05: общий reader/normalizer и mixed council analytics — design §5;
      src/app/use-cases/build-analytics.ts:1845; существующие tests/integration/build-councils-v2.test.ts:1.
      Сделано → cf2d8644 (council-normalizer.ts: legacy/alias/envelope, дедуп по id,
      повреждённое тело не крашит; голоса только при реальном значении, legacy
      TIMEOUT-fallback сохранён; envelope_participation; тест S12 4→10 GREEN;
      memory-types/v2-схемы не тронуты).
- [x] P06: пакет ревью/проверка findings/scoped re-review — design §6;
      templates/base/skills/wolf-review/SKILL.md:58. Сохранить гейты и журнал.
      Сделано → 65a0d438 (кандидат: ADDRESSED/NOT_ADDRESSED/LIMIT по каждому finding,
      новые дефекты исправления, scoped re-review, соседняя находка → L1; 3 раунда
      ревью документов сохранены, не смешаны с лимитом уточнения консилиума;
      подтверждено сверкой W6 при синхронизации 364f0b7d).
- [x] P07: полный distribution: agent registry, seed, injection, fresh/upgrade,
      model/protect/keep, EN/RU и синхронизация roadmap C без изменения O1/U1 — design §6;
      src/app/use-cases/init-project.ts:44, scripts/generate-update-map.mjs:1.
      Сделано → 945050a0 (registry/seed/injection/update-map/doctor-fix/EN-RU
      доставка; smoke init/face/doctor).
- [x] P08: выполнить unit/integration/CLI-MCP/e2e проверки и живые сценарии,
      независимое итоговое ревью — test-plan; unknown не превращать в pass.
      Сделано → 269348a8 (гейты по отдельности на финальном HEAD — см.
      «Результаты среза B»; независимое ревью W6: APPROVED, 0 critical/
      0 major/2 minor; F1 закрыт в этом же коммите, F2 — рекомендация L0).
- [x] P09: release metadata, update-map по фактическому предыдущему тегу,
      staging rollout/rollback, штатные gates, затем выпуск в действующих полномочиях.
      Сделано → 808c0c03 (npm version 2.31.0 без тега; update-map --prev 2.30.0
      --verify; CHANGELOG/зеркала — этой волной W4; финальный SHA в отчёте поставки).

Зависимости: P02 проверяет реализуемость обещаний до P07; P03 и P04 независимы
после P01; P05 после контракта P04; P06 независим в согласованном scope; P07 после
P02–P06; P08 перед P09. Один writer общих документов/схем/метаданных; независимые
поставки — отдельные bounded TASK/worktrees, L0 назначает sibling L1.

## Граница candidate patch

`patches/releases/2.31.0-council-candidate.patch` создан на точный baseline.
Он содержит новую методику/рамку/seed и согласование языка, маршрутов и ревью.
Это ускоритель P02/P03/P06, не готовый релиз. Нет src реализации записи/аналитики,
реестра agent IDs, проверенного tool-enabled allowlist, plugin delivery, EN/RU,
release metadata, update-map или установки в пользовательский проект.
После apply обязательны оставшиеся задачи. Изменения templates сами не меняют
active faces и установленный OpenCode. Имена новых команд в design — план, не текущий API.

## Фактическая подготовка

- Выполнен clone и отдельный worktree feat/codex_council-release от проверенного SHA.
- npm ci --ignore-scripts установлен; TypeScript baseline build прошёл.
  Отдельный npm rebuild better-sqlite3 завершился ошибкой извлечения headers
  (fchown/EINVAL среды); CLI call/brief при этом реально выполнились.
- wolf call: нет active call injections. wolf brief: прочитан локально
  сформированный brief с документными note, не восстановлена живая память владельца.
- Quartet создан штатным `wolf scaffold artifact council` с claim текущего автора.
- Инструкционный кандидат проверяется отдельно от пакета, результат ревью и
  воспроизводимые подготовительные проверки дописываются ниже.

## Ревью и проверки пакета

Результаты подготовки будут зафиксированы здесь перед публикацией; этот раздел
не используется как утверждение о выполнении P02–P09. Агент выпуска обновляет
checkbox только после реализации с записью «сделано → commit».

### Независимое ревью подготовки, 2026-11-05

- Линза контрактов/безопасности/памяти: APPROVED для пакета подготовки;
  critical/major не обнаружены. Minor: NEEDS_CONTEXT смешивал неполный вход с
  завершённой экспертизой без позиции. Исправлено в design, contracts, worker-expert
  и S08/S13; адресная перепроверка — APPROVED, новых findings нет.
- Линза исполнимости методик/маршрутов/языка: первый вердикт CHANGES_REQUIRED.
  Major: context-and-memory и wolf-debug сохраняли старое условие обязательного
  блокера. Исправлены также wolf-sdd и устаревший .wolf/SKILL.md §7. Адресная
  перепроверка — APPROVED; конфликт устранён, новых findings нет.
- Оба прохода были независимыми read-only заданиями: первый получил quartet и
  исходники, второй — raw candidate и требования; чужие вердикты до первого
  результата не раскрывались. Это экспертное ревью подготовки, не живой совет Wolf.
  Runtime, реальные OpenCode permissions, запись и rollout не проверялись.

### Подготовительные проверки — passed

- Markdown quartet и release-agent: Prettier write/check.
- Frontmatter новой методики, frame и seed-face: YAML parse, name/description,
  owner_skill/title/version и default deny сопоставлены с текущими шаблонами.
- Карта REQ-01…13 → AC-01…13 → S01…18 и NFR-01…04: структурная проверка
  целостности; содержательное покрытие оценено ревью выше.
- Candidate: git diff --cached --check; 17 файлов, 284 добавления/85 удалений.
- Patch: git apply --check в неизменённом по исходникам package worktree на baseline;
  reverse --check в candidate, проверка совпадения patch со staged diff.
- SHA-256 candidate patch:
  `7e87e6cede046015e6cde73a8033fe9e531d71acebc508da4712be93006f10f6`.

### Не выполнено на стадии подготовки

P02–P09, полный npm run check/e2e/docs:check для реализации, S04/S06 live,
CLI/MCP write-path, mixed analytics, staging init/upgrade/rollback и публикация
релиза. Эти пункты остаются обязательными агенту финализации. Подготовительный
пакет публикуется отдельной веткой без применения patch и без изменения main.

### Результаты среза A (REL-231-A, 2026-11-05, HEAD 5ea41863)

Коммиты среза: 65a0d438 (кандидат) → af799f7d (RED) → cf2d8644 (mixed analytics)
→ 60ba0fb7 (record-council) → a97006ef (CLI+MCP) → 364f0b7d (методики↔реализация)
→ d5b52e17 (этот план) → 553c2773 (style) → 72a9678f (findings W7 F1–F5)
→ 5ea41863 (e2e mcp каталог).

Проверки (все логи: tmp/opencode/rel231a/, Wolf-заметки mem*…2d0430/mem*…cc4d2a):

- Целевые наборы: 85/85 GREEN на 5ea41863 (council-record unit 31+integration 9,
  build-councils-v2 10, адаптеры CLI/MCP 6+2, guards каталога/справочников);
  RED зафиксирован до реализации (w1/red.log: отсутствие модуля).
- tsc --noEmit: 0 ошибок; lint: OK; git diff --check: чист.
- npm run check: падает только на pre-existing `docs/dev/2026-11-03-wolf-console/design.md`
  (prettier; пришёл из main 30cdfca, не изменён срезом) и — после format-гейта —
  известные межсрезовые падения test:run (см. ниже). Проверка prettier по всем
  путям check-скрипта, кроме этого файла: все файлы среза чисты.
- npm run e2e: 241/245; 4 падения — межсрезовые B (base-set счётчик 6→7 агентов;
  upgrade-park ×2: worker-expert/wolf-council вне update-map — exit 2 needs-decision)
  до правки e2e mcp-каталога (закрыто в 5ea41863, 3/3).
- npm run docs:check: OK (5499 ссылок).
- Независимое ревью W7: CHANGES_REQUIRED (0 critical/1 major/4 minor) → закрыты
  W8 (72a9678f) → адресная перепроверка: APPROVED (все F1–F5 ADDRESSED).

Ограничения и непроверенное (остаток):

- Межсрезовые падения test:run/e2e, закрываемые поставкой B (registry/seed/update-map):
  tests/unit/agents-mode-guard (PACKAGE_AGENTS 6→7), b0-init S-30/S-32,
  base-set-init ×2, tests/unit/adapters/update-map (карта не покрывает новые
  templates), e2e base-set + upgrade-park T14 ×2.
- Pre-existing baseline (174e5102), не срезом: prettier wolf-console/design.md;
  tests/unit/skills/skill-runtime-helpers (macOS process-group);
  tests/unit/adapters/cli/memory-sync (isNpxRun-окружение, подтверждено
  stash-прогоном на чистом HEAD).
- Live S04/S06: механизм tool-enabled прав доказан W2a на v2.2.5 (чтение
  allowlist/отказы/скрытие тулов/MCP catch-all deny); поведенческий S06-прогон
  A/B (маркеры peer-мнений) и staging реального mr-wolf-тула НЕ выполнены —
  провайдер роутера деградировал (fb-zai 410 retired / flash 402 / funnel-404);
  повторить 2 командами из w2b/report/journal.md после восстановления endpoint.
  Symlink-обход закрыт канонизированным pre-run аудитом (W7-F1).
- Поставка B: P07 (BASE_SET_AGENT_IDS/seed/injection/renderer/update-map/EN-RU),
  P09 (npm version/CHANGELOG/update-map), массовая миграция v1-паттерна
  `permission:` прочих worker-агентов на v2 (worker-reviewer и др.).
- Поставка C: публикация (merge --no-ff, тег v2.31.0 на merge-коммите, push,
  npm publish, GH Release, сайт).

### Результаты среза B (REL-231-B, 2026-11-05/06)

Коммиты среза: 945050a0 (P07: registry/seed/injection/update-map/doctor-fix/EN-RU
доставка) → 808c0c03 (P09: npm version 2.31.0 без тега, update-map --prev 2.30.0
--verify). CHANGELOG/зеркала/сайт/roadmap/ledger — волна W4 этого же среза; финальный
SHA фиксируется в отчёте поставки.

Проверки:

- Структурные: 94/94 целевых тестов W1; полный test:run на финальном HEAD —
  exit 0 (230 файлов / 2150 тестов).
- Live: S04/S06/S16 passed (W2); staging S15/S18 passed (W3); доставленная
  роль worker-expert вызвана живьём в staging-проекте (`opencode run
--agent worker-expert` → ответ, exit 0).
- Кейс 1 — partial: позиции и синтез получены, независимость RUN A нарушена
  (эксперт читал оба пакета); причина — конфиг-фикстуры воркера, не продукт;
  решение L1 по вопросу консилиума: предупреждение doctor 6.4 о
  permission-map vs permissions-array СОХРАНЯЕТСЯ (консервативно, обе позиции
  отвергли полный отказ), проверка поведения старых v2.x — отдельное
  поручение (backlog), не блокер релиза.
- Кейс 2 — выполнен на материале поставки: противоречие «провайдер рабочий
  (L0) vs провайдер-блокер (W2 раунд 2)» → адресная диагностика (root cause:
  sandbox-конфиг без provider-плагина 9router, static provider-блок резолвит
  другой endpoint) → исправление конфигурации → чистовые прогоны W2 раунд 3
  (S04/S06/S16 passed); плюс цикл W6 F1 → правка plan.md → адресная
  перепроверка W6 (scoped re-review этого же коммита).
- Кейс 3 — passed: `insufficient_evidence` получен честно.
- Гейты на финальном HEAD: lint exit 0; build exit 0; test:run exit 0
  (230/230 файлов, 2150/2150); e2e exit 0 (62/62 файлов, 245/245);
  docs:check exit 0 (5727 ссылок, 35 EN/RU пар); npm pack --dry-run exit 0
  (mister-wolf-2.31.0.tgz); prettier scope exit 0; update-map --verify
  exit 0. `npm run check` exit 1 — ровно один warning:
  docs/dev/2026-11-03-wolf-console/design.md (pre-existing на baseline
  174e5102, вне среза; решает L0 до среза C — см. F2 ревью W6).
- Независимое итоговое ревью W6: APPROVED, 0 critical / 0 major / 2 minor.
  F1 (minor): маппинг AC-B → AC/P — добавлен ниже (этот коммит). F2 (minor):
  pre-existing check-файл — рекомендация L0, вне среза.

Ограничения среза: pin/variant не проверялись на живых объектах; граф-рёбра council
не верифицированы напрямую; debug-vs-run расхождение было конфиг-артефактом воркера
(не продукт); провайдер-зависимость живых проб снята конфигом 9router; behavioral-
изоляция кейса 1 ослаблена чтением обоих пакетов RUN A (контент-поток доказан).

Маппинг критериев среза B (F1, W6): AC-B1 → AC-13/P07 (доставка 945050a0);
AC-B2 → AC-13/S15+S18 (staging/upgrade/rollback); AC-B3 → документация EN/RU
и правила памяти (wolf-release-docs, W4); AC-B4 → roadmap C + план (D-5,
процессный критерий); AC-B5 → AC-01…AC-12 (S01–S18) + три кейса; AC-B6 →
релизные гейты по отдельности + классификация (P08); AC-B7 → P09 release
metadata (808c0c03); AC-B8 → AC-12/S14 (независимое ревью W6).

## Документация и сайт

Страницы сайта (EN + RU-зеркала):

| Страница                                                      | Назначение                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/site/guide/council.md`, `docs/site/ru/guide/council.md` | новая страница «Экспертный консилиум»: когда применять, как устроен, роль `worker-expert` и права, честный fallback, запись, границы |
| `docs/site/guide/cli/thinking-council.md`, RU-зеркало         | раздел `wolf council record` (фактические опции `--input`/`--created-by`)                                                            |
| `docs/site/guide/mcp.md`                                      | `council_record` в каталоге из 8 тулов (срез A)                                                                                      |
| `docs/site/guide/base-set.md`, RU-зеркало                     | агенты 6 → 7: строка `worker-expert`, seed-лицо `worker-expert-playbook`                                                             |
| `docs/site/guide/capabilities.md`, RU-зеркало                 | снято устаревшее «исполняемый консилиум — future work», ссылка на гид                                                                |
| `docs/site/.vitepress/config.ts`                              | sidebar EN+RU: «Expert Council» / «Экспертный консилиум» в CONCEPTS/КОНЦЕПЦИИ                                                        |
| `docs/reference/cli.md`                                       | перегенерирован `scripts/generate-cli-reference.mjs` (не вручную)                                                                    |
| `README.md` + `README.ru.md`                                  | согласованное упоминание консилиума, снято устаревшее «council runtime не гарантируется»                                             |
| `CHANGELOG.md`                                                | запись [2.31.0]; зеркала сайта обновляет `sync-changelog.mjs` в docs:build                                                           |
| `docs/dev/roadmap/roadmap-v4.md` + ledger                     | раздел C — статус «реализовано в ветке»; запись волны (O1/U1 не тронуты)                                                             |

Релизный чек-лист документации (mem_20260929):

- Сделано в ветке: страницы EN/RU и зеркала, sidebar config, base-set EN/RU,
  CLI-раздел EN/RU, README-пара, CHANGELOG, roadmap C + ledger, capabilities EN/RU,
  CLI-справочник генератором; prettier / docs:check / docs:build — см. отчёт W4.
- Остаётся срезу C: merge --no-ff, тег v2.31.0 на merge-коммите, push, npm publish,
  GitHub Release, деплой сайта, проверка changelog-страницы ПОСЛЕ публикации, уборка.
