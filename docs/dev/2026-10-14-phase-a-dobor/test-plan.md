---
slug: phase-a-dobor
title: '2.18.0 — Фаза A добор + B0 — тест-план'
status: review
created: 2026-10-14
requirements: docs/dev/2026-10-14-phase-a-dobor/requirements.md
design: docs/dev/2026-10-14-phase-a-dobor/design.md
plan: docs/dev/2026-10-14-phase-a-dobor/plan.md
review: pending
---

# 2.18.0 — Фаза A добор + B0 — тест-план

> **Методика:** `wolf-testplan`. Источник ожидаемого — `requirements.md` (AC) + `design.md` (контракты §3). Из кода ожидаемое не выводится.
> **Трассировка:** «REQ-NN (R0y)» — во всех сценариях.

## 1. Уровни тестов

- **unit** — vitest, изолированные модули; mock-окружение; deps.now / deps.isAlive (см. прецедент `claim-registry.test.ts`).
- **integration** — vitest с реальным tmp-каталогом (`fs.mkdtempSync`); реальная ФС; управляемое время.
- **e2e** — реальный диалог / CLI-сессии; traces; выполняется в CI или вручную (воспроизводимая процедура).
- **manual** — воспроизводимая ручная процедура для сайта/docs.

**Управляемое время** — все TTL-тесты используют `deps.now` seam (уже есть в `claim-registry.ts:51`); `CLAIM_HEARTBEAT_WINDOW_MS` тестируется с явной подменой.

**Flakiness** — воспроизводимые seed, фиксированные таймауты; без ретраев в тестах.

## 2. Карта REQ → сценарии

| REQ                                 | Уровень                             | Сценарии   |
| ----------------------------------- | ----------------------------------- | ---------- |
| REQ-01 (A9)                         | unit + integration + e2e            | S-01..S-09 |
| REQ-02 (A10)                        | unit (e2e grep) + manual            | S-10..S-15 |
| REQ-03 (A11)                        | unit + integration                  | S-20..S-28 |
| REQ-04 (B0)                         | integration + e2e (playground-lab)  | S-30..S-35 |
| REQ-05 (Release)                    | manual (чек-лист wolf-release-docs) | S-40..S-45 |
| NFR-01 (legacy чтение)              | unit                                | S-50..S-51 |
| NFR-02 (docs-audit в CI)            | unit (CI)                           | S-60..S-61 |
| NFR-03 (claim 2.17.1 совместимость) | unit + integration                  | S-70..S-71 |
| NFR-04 (2.17.x → 2.18.0)            | e2e                                 | S-80       |
| NFR-05 (полный релиз)               | manual                              | S-90       |

## 3. Сценарии

### REQ-01 (A9) — Council-контракт v2

**S-01** (unit, A9) — schema валидирует `council-opinion` v2.

- Given: type-schema-builder для `council-opinion` после изменений.
- When: `validate({ type: 'council-opinion', fields: { claims: ['X'], evidence: [...], confidence: 'high' } })`.
- Then: success; объект принимается.
- Oracle: REQ-01 AC-1.
- Путь: новый `tests/unit/council-opinion-schema.test.ts` (или расширение существующего).

**S-02** (unit, A9) — schema отклоняет opinion без `claims`.

- Given: type-schema-builder для `council-opinion`.
- When: `validate({ type: 'council-opinion', fields: { vote: 'yes' } })` (без claims).
- Then: ошибка «claims required, min 1».
- Oracle: REQ-01 AC-1.

**S-03** (unit, A9) — `extractClaims` для legacy (без claims).

- Given: legacy `council-opinion` (без поля claims).
- When: `extractClaims(opinion)`.
- Then: возвращает `[]`; `confidence` default `'medium'`; не падает.
- Oracle: NFR-01, REQ-01 AC «исторические остаются читаемыми».

**S-04** (unit, A9) — `extractSynthesisMeta` для новой synthesis.

- Given: `synthesis` с `accepted_claims`, `rejected_alternatives`, `unresolved_dissent`, `confidence`, `required_validation`.
- When: `extractSynthesisMeta(synthesis)`.
- Then: возвращает все 5 полей; `confidence` = 'high'.
- Oracle: REQ-01 AC «synthesis с 5 полями».

**S-05** (unit, A9) — schema отклоняет synthesis без `accepted_claims`.

- Given: type-schema-builder для `synthesis`.
- When: `validate({ type: 'synthesis', fields: { body: 'X' } })` (без accepted_claims).
- Then: ошибка «accepted_claims required, min 1».
- Oracle: REQ-01 AC-2.

**S-06** (integration, A9) — `buildCouncils` работает с mixed legacy+v2.

- Given: каталог с 2 legacy и 2 v2 council-opinion, 1 synthesis v2.
- When: `buildCouncils(objects, relations, now, weeks)`.
- Then: статистика (votes, opinions count, weekly buckets) совпадает; новые поля (audited_count, unresolved_dissent_total) присутствуют и не NaN.
- Oracle: REQ-01 AC «аналитика продолжает работать».

**S-07** (unit, A9) — `extractVote` обратно совместим.

- Given: legacy opinion с `vote: 'yes'` (только это поле).
- When: `extractVote(op)`.
- Then: возвращает `'yes'`; не падает.
- Oracle: REQ-01 AC «`extractVote` совместим».

**S-08** (manual, A9) — `.wolf/SKILL.md` содержит §X «Изоляция формирования мнений».

- Given: файл `.wolf/SKILL.md`.
- When: grep `^## .*Изоляция формирования мнений` или эквивалентный heading.
- Then: присутствует; содержит правило «до раскрытия ответов других».
- Oracle: REQ-01 AC «`.wolf/SKILL.md` зафиксировано правило изоляции».

**S-09** (manual, A9) — шаблон `templates/base/skills/wolf-brainstorm/SKILL.md` упоминает формат `council-opinion` v2.

- Given: файл.
- When: grep `claims|evidence|assumptions|confidence|risks|failure_conditions|counterexamples`.
- Then: минимум 4 из 7 терминов присутствуют.
- Oracle: REQ-01 AC «минимум один шаблон обновлён».

### REQ-02 (A10) — Полный аудит публичных документов

**S-10** (unit, A10) — docs-audit-тест зелёный для README.md.

- Given: `tests/e2e/docs-audit.test.ts` с FORBIDDEN_TOKENS из design §3.2.
- When: `auditFile('README.md')`.
- Then: `ok === true` (или `hits` — только в явно архивных секциях).
- Oracle: REQ-02 AC-1.

**S-11** (unit, A10) — docs-audit-тест зелёный для README.ru.md, concept.md, docs/README.md.

- Given: тест.
- When: `auditFile(...)` для каждого из 4 файлов.
- Then: все `ok === true`.
- Oracle: REQ-02 AC-1.

**S-12** (unit, A10) — `docs/superpowers/specs/*.md` имеют `historical: true` ИЛИ раздел «Историческое основание».

- Given: список файлов в `docs/superpowers/specs/`.
- When: для каждого — проверить frontmatter или наличие раздела в первых 50 строках.
- Then: все либо `historical: true`, либо содержат heading `Историческое основание` в первых 50 строках.
- Oracle: REQ-02 AC-3.
- Допустимое исключение: файлы, не описывающие удалённые команды (определяется по наличию `wolf learn|wolf run|Sandbox Replay|STOP-гейт` в первых 100 строках).

**S-13** (unit, A10) — `docs/superpowers/plans/*.md` — аналогично S-12.

- Oracle: REQ-02 AC-3.

**S-14** (unit, A10) — счётчик типов «25» отсутствует в публичных файлах.

- Given: 4 ключевых файла.
- When: grep `\b25\s*(типов|типы|types)\b` (RU/EN).
- Then: 0 совпадений вне архивных секций.
- Oracle: REQ-02 AC-4.

**S-15** (manual, A10) — каждый крупный документ (≥ 5 KB) имеет раздел «Действующий контракт версии».

- Given: список файлов `docs/**/*.md` ≥ 5 KB.
- When: для каждого — проверить heading `Действующий контракт` (или эквивалентный).
- Then: присутствует; версия указана (например, `2.18.0`).
- Oracle: REQ-02 AC-2.

### REQ-03 (A11) — Heartbeat-файл + TTL-продление

**S-20** (unit, A11) — `writeHeartbeat` создаёт файл с JSON.

- Given: `ClaimRegistryDeps` с `root = tmp`, `now = () => T0`.
- When: `writeHeartbeat({ artifact: 'dev:x', writer: 'agent:foo' })`.
- Then: файл `.wolf/shared/claims/dev_x.heartbeat` существует; JSON содержит `written_at = T0`, `writer = 'agent:foo'`.
- Oracle: REQ-03 AC «heartbeat пишется атомарно».

**S-21** (unit, A11) — `readHeartbeat` возвращает null при отсутствии файла.

- Given: нет `.heartbeat` файла.
- When: `readHeartbeat(path)`.
- Then: `null`.
- Oracle: NFR-03.

**S-22** (unit, A11) — `readHeartbeat` возвращает null при повреждённом JSON.

- Given: `.heartbeat` файл с `not-a-json`.
- When: `readHeartbeat(path)`.
- Then: `null` (повреждение = stale, как claim).
- Oracle: REQ-03 AC «повреждение heartbeat = stale».

**S-23** (unit, A11) — `isStale` обратно совместим без heartbeat.

- Given: `ClaimRecord` 2.17.1 (PID жив, acquired_at = T-23h).
- When: `isStale(rec, null, deps)`.
- Then: `false` (acquired < 24h).
- Oracle: NFR-03.

**S-24** (unit, A11) — `isStale` true при heartbeat старше окна.

- Given: ClaimRecord жив (PID жив, acquired_at = T-1h); HeartbeatRecord.written_at = T-15min (CLAIM_HEARTBEAT_WINDOW_MS = 10min).
- When: `isStale(rec, hb, deps)`.
- Then: `true`.
- Oracle: REQ-03 AC «просроченный heartbeat = stale».

**S-25** (unit, A11) — `isStale` true при acquired_at > 24h (даже если heartbeat свежий).

- Given: ClaimRecord acquired_at = T-25h, PID жив; HeartbeatRecord.written_at = T-1min.
- When: `isStale(rec, hb, deps)`.
- Then: `true`.
- Oracle: REQ-03 AC «старый acquired_at».

**S-26** (integration, A11) — долгая операция удерживает claim через heartbeat.

- Given: tmp-каталог; acquire `dev:task1` (identity X, PID X); T0; T0+5min: writeHeartbeat; T0+9min: ещё один heartbeat; now = T0+9min.
- When: `isStale(rec, hb, deps)` + `requireClaim(deps, 'dev:task1', who: X)`.
- Then: `isStale === false`; `requireClaim` успешен.
- Oracle: REQ-03 AC «долгая операция удерживает claim».

**S-27** (integration, A11) — просроченный heartbeat перехватывается.

- Given: tmp-каталог; предыдущий владелец X с heartbeat written_at = T0-15min (старше окна).
- When: `acquireClaim(deps, { artifact: 'dev:task1', identity: Y, cwd: '/tmp' })`.
- Then: новый claim создан (Y — владелец); файл-след `<slug>.<epochMs>.json` сохранён (как в 2.17.1 REQ-05).
- Oracle: REQ-03 AC «просроченный heartbeat перехватывается».

**S-28** (unit, A11) — параллельный heartbeat (X и Y пишут одновременно).

- Given: tmp; нет heartbeat.
- When: `writeHeartbeat` от X (T0) и Y (T0+1ms) в параллельных промисах.
- Then: ровно один файл `.heartbeat`; содержимое = X ИЛИ Y (последний выигрывает); никаких гонок (исключений нет, ни у X, ни у Y).
- Oracle: REQ-03 AC «параллельный heartbeat без гонок».

### REQ-04 (B0) — Доводка базовых наборов

**S-30** (integration, B0) — `wolf init` в новом проекте создаёт базовые наборы.

- Given: `mkdtempSync` пустой каталог; npm-сборка `templates/base/`.
- When: `wolf init --full --platform opencode --yes` (или эквивалент через use-case).
- Then: `.opencode/agent/*.md` присутствуют (mr-wolf, executor-lead, steward, worker-implementer, worker-researcher, worker-reviewer).
- Oracle: REQ-04 AC «новый проект».

**S-31** (integration, B0) — `wolf face show <each-agent>` возвращает правильный `owner_skill`.

- Given: после S-30.
- When: `wolf face show executor-lead` и т.д. для 6 базовых агентов.
- Then: `owner_skill === <agent_id>` для каждого.
- Oracle: REQ-04 AC «`scaffold agent` правильный `owner_skill`».

**S-32** (integration, B0) — `templates/base/agents/*.md` совпадают с установленными `.opencode/agent/*.md` (побайтово).

- Given: после S-30.
- When: `diff -q .opencode/agent/ <expected-paths>`.
- Then: 0 расхождений.
- Oracle: REQ-04 AC «синхронизированы с реальной ролью».

**S-33** (e2e, B0, playground-lab) — полный сценарий на playground-lab.

- Given: `playground-lab` в репозитории.
- When: `cd playground-lab && wolf init --yes` (или полный сценарий).
- Then: 0 ошибок; `wolf doctor` зелёный; `wolf call` возвращает ожидаемый список инъекций; `wolf face show` — все 6 базовых агентов.
- Oracle: REQ-04 AC «playground-lab».

**S-34** (integration, B0) — `wolf sync` не перезаписывает локальные мутации.

- Given: после S-30; пользователь изменяет `.opencode/agent/worker-researcher.md` (добавляет комментарий).
- When: `wolf sync` (с заранее изменённым шаблоном в `templates/base/agents/worker-researcher.md`).
- Then: `.opencode/agent/worker-researcher.md` НЕ перезаписан; пометка `mutated-skip` (если есть — `mutated`).
- Oracle: REQ-04 AC «sync не теряет локальные мутации».

**S-35** (e2e, B0, NFR-04) — проект 2.17.x → 2.18.0.

- Given: проект, инициализированный в 2.17.1 (или его имитация в playground-lab до upgrade).
- When: установка 2.18.0 + `wolf init --yes`.
- Then: 0 потерь лиц; steward-мутнувшие = `diverged` (не переписаны); re-init с initiator `seed` для неизменённых.
- Oracle: NFR-04.

### REQ-05 (Release) — Релизный цикл 2.18.0

**S-40** (manual) — `package.json` = `2.18.0`; `git tag v2.18.0` создан; provenance — успешно.

- Oracle: REQ-05 AC.

**S-41** (manual) — `CHANGELOG.md` содержит секцию `## 2.18.0` со всеми REQ-01..04.

- Oracle: REQ-05 AC.

**S-42** (manual) — сайт собран (`docs:build`) и задеплоен; страница Changelog синхронизирована.

- Oracle: REQ-05 AC + правило `mem_20260929_sayt_soderzhit_stranitsu_changelog_s_ist_c0ac8b`.

**S-43** (manual) — `docs/superpowers/plans/roadmap-v3.md` обновлён (A9/A10/A11 = доставлено; B0 = доставлено).

- Oracle: REQ-05 AC.

**S-44** (manual) — `npm publish` успешно; tarball содержит `templates/base/**`, `dist/**`, `package.json`, `README*`.

- Oracle: REQ-05 AC.

**S-45** (manual) — финальный acceptance-отчёт собран (L1) и передан L0; L0 принимает по ACCEPTANCE.

- Oracle: REQ-05 AC.

### NFR — derived scenarios

**S-50** (unit, NFR-01) — legacy `council-opinion` с `vote: 'yes'` и без claims читается.

- Oracle: NFR-01.

**S-51** (unit, NFR-01) — legacy `synthesis` без `accepted_claims` читается.

- Oracle: NFR-01.

**S-60** (CI, NFR-02) — `npm run check` (или эквивалент) запускает `tests/e2e/docs-audit.test.ts` и проходит.

- Oracle: NFR-02.

**S-61** (CI, NFR-02) — docs-audit-тест отклоняет внесение `wolf learn` (симуляция через временный файл или git diff).

- Oracle: NFR-02.

**S-70** (integration, NFR-03) — claim-файл 2.17.1 (без `.heartbeat`) обрабатывается: `acquire` (identity Y) → если PID X мёртв, перехват со следом.

- Oracle: NFR-03.

**S-71** (integration, NFR-03) — claim-файл 2.17.1 + heartbeat 2.18.0: PID жив, heartbeat свежий → claim жив; PID мёртв → claim stale (heartbeat не спасает).

- Oracle: NFR-03.

**S-80** (e2e, NFR-04) — playground-lab upgrade scenario (см. S-35).

- Oracle: NFR-04.

**S-90** (manual, NFR-05) — `wolf-release-docs` чек-лист полностью зелёный.

- Oracle: NFR-05.

## 4. Команды прогона

- **unit:** `npm run test:unit` (или эквивалент из `package.json`).
- **integration:** `npm run test:integration`.
- **e2e:** `npm run test:e2e` (Playwright/CLI) — для S-33, S-35, S-80.
- **CI:** `npm run check` — все уровни + docs-audit.

## 5. Setup / cleanup

- **tmp-каталоги:** `fs.mkdtempSync(path.join(os.tmpdir(), 'wolf-2180-'))`; `afterEach` → `rm -rf` (через `fs.rmSync`).
- **Изоляция:** каждый test — свой root; `CLAIM_TTL_MS` и `CLAIM_HEARTBEAT_WINDOW_MS` подменяются через `deps` или env.
- **Без реальных секретов / внешних сетевых вызовов.**
- **Seed для воспроизводимости:** `vi.setSystemTime(...)` для time-control; `Math.random` не используется в проверяемой логике (если используется — seed фиксирован).

## 6. Известные ограничения / риски

- S-33/S-35/S-80 требуют playground-lab в актуальном состоянии; если он дрейфует — пометить как skipped, не блокировать релиз (если не критично).
- S-44 (npm publish) — выполняется L0/владельцем, не в CI.
- NFR-04 (S-80) — полный upgrade-сценарий дорог; smoke-тест достаточен.

## 7. Готовность

- ✅ Все REQ-01..04 покрыты (S-01..S-35, S-50..S-90).
- ✅ NFR-01..05 покрыты.
- ✅ Уровни тестов, oracle, setup/cleanup зафиксированы.
- ✅ Привязка к командам профиля проекта.
- Передача в plan (wolf-plan) и затем в реализацию (через wolf-sdd).
