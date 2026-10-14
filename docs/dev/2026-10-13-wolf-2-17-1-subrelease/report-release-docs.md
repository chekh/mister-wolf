---
slug: wolf-2-17-1-subrelease
title: '2.17.1 — релизный документационный проход и публикация (отчёт L1)'
status: done
created: 2026-10-14
method: wolf-release-docs + verification-before-completion
release-thread: mem_20261014_vladelets_poruchil_polnyy_reliznyy_tsikl_01b2a7
---

# 2.17.1 — документационный проход (Фаза A) и публикация (Фаза B)

Мандат владельца (2026-10-14): полный релизный цикл 2.17.1 — документация по
wolf-release-docs, затем публикация. Исполнитель: executor-lead (L1).

## 1. Основания

- Текущая версия: 2.17.0 → целевая: **2.17.1** (утверждена владельцем). Предыдущая база выпуска: v2.17.0.
- Проверяемый SHA: база прохода cfcdcc2 (наследник финального HEAD фазы 4 57fa8bc), дерево чистое, гейты на входе GREEN (check 185/1453, e2e 220/220 — из финального пакета фазы 4).
- Состав изменений: `git diff v2.17.0..HEAD` — 49 коммитов; src: claim-registry/claim-artifact/claim CLI (новые), face-operation.ts (новый, 672 строки), memory-root WT-ID, get-call-injections (фильтр во всех ветвях), promote-memory, migrate-faces (healing), seed-base-playbooks, guards transition/supersede/edit, doctor (face ops, WT-ID-токены); templates: steward.md, steward-nastavnik.md, complaint-protocol.md.
- Утверждённые решения: состав 2.17.1 (R01/R02/R04/R05/claim/R07/R08) — фаза 4 ACCEPTED; ограничение на заявления: измеренное улучшение поведения агентов от face-мутаций НЕ заявлять.
- Известные ограничения (из пакета фазы 4): claim без heartbeat (TTL 24h), claim list без stale-маркировки, banner-счётчик уроков по всему пулу, doctor не проверяет stale claims, scopeConflicts в doctor не доставлен (F-03, бэклог).

## 2. Карта покрытия (возможность/утверждение → страницы → источник → действие)

| #   | Поверхность                                                                | Утверждения 2.17.1                                                | Источник истины                                | Действие прохода                                                                                                            |
| --- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | CHANGELOG.md                                                               | пользовательский эффект, миграции, ограничения                    | пакет фазы 4 + код                             | **НАПИСАНО** — новая запись [2.17.1] (Added ×3, Fixed ×2, Upgrade notes)                                                    |
| 2   | README.md / README.ru.md                                                   | пути установки A/B, re-init после обновления, изоляция чтения     | T6 (S-49…S-55), чистые запуски                 | Сверено сверху — уже на факте, **без правок**                                                                               |
| 3   | Сайт: главная (index.md, HomeInstall.vue)                                  | нет заявлений, ломаемых 2.17.1                                    | grep — совпадений с изменённой семантикой нет  | Сверено — **без правок**                                                                                                    |
| 4   | getting-started RU (флаги `wolf add`)                                      | default scope = WT-ID, фасет proposal                             | generated cli.md, S-46                         | **ИСПРАВЛЕНО** — `worktree:<имя>` → `worktree:w-<12hex>` + proposal                                                         |
| 5   | guide/memory.md EN/RU (§ worktree)                                         | WT-ID по умолчанию; изоляция только `wolf call`; promote-конфликт | read-isolation контракт (NFR-03, doc-тест), T1 | **ИСПРАВЛЕНО** — старый текст обещал изоляцию `wolf brief` (противоречил замороженному контракту) и токен `worktree:<name>` |
| 6   | guide/cli/memory.md EN/RU (`--scope`)                                      | default WT-ID, legacy принимается                                 | generated cli.md                               | **ИСПРАВЛЕНО** (EN+RU)                                                                                                      |
| 7   | guide/artifact-pipeline.md EN/RU                                           | claim — обязательный шаг конвейера (AC-3)                         | e2e scaffold-artifact (без claim — отказ)      | **ИСПРАВЛЕНО** — claim acquire в Commands + объяснение, release/transfer/TTL 24h                                            |
| 8   | guide/read-isolation.md EN/RU                                              | замороженный контракт NFR-03                                      | T6 + doc-тест                                  | Сверено — **без правок** (док-тест 5/5)                                                                                     |
| 9   | CLI reference (docs/reference/cli.md)                                      | claim-группа, face ops                                            | генератор scripts/generate-cli-reference.mjs   | **Регенерирован** — без диффа (идемпотентен, уже на факте после T2/T5); руками не правился                                  |
| 10  | Сайт-Changelog                                                             | синхронность с CHANGELOG                                          | scripts/sync-changelog.mjs                     | **Синхронизирован** через docs:build (EN + RU-зеркало)                                                                      |
| 11  | docs/concept/maturity.md                                                   | честные статусы новых компонентов                                 | пакет фазы 4                                   | **ДОПОЛНЕНО** — 3 строки: faces I3/E1, WT-ID изоляция I3/E1, claims I2/E1 (измеренный эффект НЕ заявлен)                    |
| 12  | docs/concept/evidence.md, coverage.md                                      | регистр EVD/claim канона                                          | изменения канона нет (реализация, не концепт)  | **Без правок** — основание: 2.17.1 не меняет канон; строки E1 в maturity допустимы без evidence_id                          |
| 13  | troubleshooting / configuration / mcp / delivery / organization / base-set | затронуты T6                                                      | T6-ревью APPROVED                              | Сверено точечно — **без правок**                                                                                            |

## 3. Полезное развитие (закрытые пробелы читателя)

- Пробел 1: страница memory.md утверждала доставку scoped-записей через `wolf brief` — это противоречило замороженному контракту изоляции (фильтруется только `wolf call`); читатель ожидал бы скрытия записей в brief. Исправлено в обеих локализациях, добавлена ссылка на read-isolation.
- Пробел 2: artifact-pipeline учил `wolf scaffold artifact` без обязательного claim — чистый запуск по странице падал бы с «No claim held». Добавлен шаг acquire, текст отказа, пути release/transfer, TTL 24h (восстановление при ошибке).
- Пробел 3: в RU getting-started отсутствовал фасет `proposal` в списке `--facet` (расхождение с EN cli-страницей) — добавлен.
- Пробел 4: maturity не содержал строк по faces (2.17.0), WT-ID и claims (2.17.1) — добавлены с честными уровнями (E1 — тесты; догфудинг/effect не заявлены).
- CHANGELOG: эффект для пользователя, миграции (legacy worktree-токены, конфликт неоднозначного имени), известные ограничения (TTL 24h, claim list без stale-маркировки) — без преувеличений.

## 4. Проверки (команды / exit)

| Проверка                                               | Результат                                                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `npx vitest run tests/unit/read-isolation-doc.test.ts` | 5/5 GREEN (замороженный контракт не сломан)                                                        |
| `prettier --check` изменённых 9 md                     | GREEN (2 файла нормализованы `--write`: ru/guide/cli/memory.md, maturity.md)                       |
| `npm run docs:build`                                   | exit 0 — cli.md регенерирован без диффа, sync-changelog записал EN+RU страницы, VitePress собрался |
| `npm run check`                                        | GREEN — 185 файлов / 1453 теста                                                                    |
| cli-reference-guard                                    | GREEN (в составе check)                                                                            |

## 5. Независимое ревью

- Канал: `opencode run --agent worker-reviewer` (независимый процесс; вложенный спавн субагента заблокирован платформой — depth limit 1, зафиксировано как FRICTION).
- Мандаты (2 в одном): фактическое соответствие продукту (сверка утверждений с кодом/тестами/generated cli.md) + полезность читателю (новый пользователь, обновляющийся владелец, EN/RU пары).
- Ревью 1 (по диффу cfcdcc2..41bbc3b): **CHANGES_REQUIRED** — 1 critical / 0 major / 3 minor. F-1 critical: утверждение «stable across renames and moves» инвертировало ограничение ADR-1 (переименование/перенос копии = новый WT-ID); F-2: EN getting-started без фасета `proposal`, неточное «запрещён для остальных»; F-3: help `--scope` в src не упоминает WT-ID-дефолт; F-4: нечитаемый аппозитив id артефакта в claim-буллете. 20+ сверок CHECKED по коду/тестам.
- Фикс-раунд 1 (коммит a4048de): F-1 — инверсия устранена (CHANGELOG Added + Known limitations, memory.md EN/RU, зеркала перегенерированы); F-2 — EN/RU getting-started; F-4 — формулировка id. F-3 — бэклог (правка src вне docs-прохода после acceptance; reference-строка истинна, но неполна — гайд полон).
- Ревью 2 (повторное, по диффу 41bbc3b..a4048de): **APPROVED** — findings none; все находки подтверждены закрытыми (memory-root.ts:25-30, memory-doctor.ts:335-354, memory-types.ts:77-92, design.md ADR-1; grep инвертированной фразы по docs/ — 0).
- Логи: /private/var/folders/…/T/opencode/review-2171-docs-result.txt (152 КБ), review-2171-docs-recheck-result.txt.

## 5.1 Гейт перехода к публикации — ПРОЙДЕН

- вердикт независимого ревью **APPROVED** ✅
- `npm run check` GREEN 185 файлов / 1453 теста ✅
- `npm run docs:build` GREEN (cli.md идемпотентен, зеркала синхронны, VitePress собран) ✅
- CHANGELOG 2.17.1 заполнен ✅
- README-пара / сайт согласованы с чистым запуском ✅
- отчёт пакета документации записан (этот файл) ✅

## 6. Публикация (Фаза B) — ВЫПОЛНЕНА

- Отчёт документационного прохода финализирован и закоммичен (228d44c) ДО бампа версии; CHANGELOG финализирован до `npm version`.
- `npm version 2.17.1` → коммит 41d56e6 + тег v2.17.1 (единственный способ повышения версии). Тег на 41d56e6 по конвенции репо (тег на финальном HEAD, как v2.17.0/v2.16.3).
- Манифест-проверка: `npm pack --dry-run` — найден и устранён мусор: `templates/.wolf/router.log` (5.3 КБ, probe-лог, untracked-стрэй рабочей копии; npm pack с полем files не применяет .gitignore к включаемым каталогам — файл был только локально, в чекауте CI его нет). После удаления: 1195 файлов, подозрительных нет (`router-log.*`/`mask-secrets.*` — легитимный код).
- `git push origin main` (37ac8c0..41d56e6) и `git push origin v2.17.1` — мандат владельца (mem_20261014_vladelets_poruchil_polnyy_reliznyy_tsikl_01b2a7).
- Публикация npm: штатный механизм проекта — GitHub Actions `publish.yml` по пушу тега (npm trusted publishing, OIDC, provenance; локальных токенов нет) — **успех** (run 38532390172). Локальный `npm publish --dry-run` выполнен как manifest-проверка до пуша.
- Деплой сайта: `deploy-docs.yml` по пушу main — **успех** (54s).
- Отклонение от буквы брифа (одно): фактическая публикация — CI по тегу вместо локального `npm publish` (двойная публикация невозможна, локальный путь без OIDC не даёт provenance; прецеденты 2.16.0–2.17.0 — тот же путь).

## 7. Пост-верификация (факты, 2026-10-14)

| Факт                      | Evidence                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Версия в npm              | `npm view mister-wolf@2.17.1 version` → 2.17.1; tarball `registry.npmjs.org/mister-wolf/-/mister-wolf-2.17.1.tgz`; provenance SLSA v1 |
| latest dist-tag           | `npm view mister-wolf version` → 2.17.1                                                                                               |
| Тег на origin             | `git ls-remote --tags origin v2.17.1` → 41d56e6 (refs/tags/v2.17.1)                                                                   |
| Сайт: версия              | главная https://chekh.github.io/mister-wolf/ (HTTP 200) — навбар «v2.17.1»                                                            |
| Сайт: changelog синхронен | /changelog/ и /ru/changelog/ содержат секцию 2.17.1                                                                                   |
| Сайт: новые доки          | /guide/memory.html + /ru/guide/memory.html — токен `worktree:w-`; /guide/artifact-pipeline.html — `claim acquire`                     |
| CI на финальном main      | run на 4f289e9 — **success** (Node 22/24 × ubuntu/macos + Docker)                                                                     |

### Инцидент после публикации (закрыт в рамках цикла)

Первый CI-прогон на пуше (38532388542): **Docker checks failure** — в образе нет `git`, новые интеграционные тесты REQ-02 (worktree-фикстуры, `git init`) падали (`git: not found`). Реальные чек-джобы (Node 22/24 × ubuntu/macos) — success. Причина: origin/main был на 37ac8c0 (до фазы 4) — фазовые коммиты впервые встретили CI-окружение пушем релиза. Фикс: `git` добавлен в apt-get Dockerfile (4f289e9); повторный прогон — **success**. Продукт без git работает fail-closed; git нужен только тестовым фикстурам.

## 8. Итог релиза

- **2.17.1 опубликована**: npm (latest, provenance) + тег v2.17.1 + сайт на факте + CI зелёный на 4f289e9.
- Долг/бэклог (владельцу, вне цикла): F-3 — help `--scope` в src (memory-add.ts:106) не упоминает WT-ID-дефолт (reference истинна, но неполна; гайды полны); пакетная гигиена: рассмотреть `.npmignore`/сужение files-поля против стрэй-логов; e2e вне `npm run check` (из бэклога фазы 4).
- FRICTION: 1× subagent (depth limit 1 — ревью через независимый процесс `opencode run`); 1× `git rm --cached` (файл оказался untracked-стрэем — прямой вывод git расходился с оптимизированным выводом rtk, проверено прямыми командами).
