---
slug: wolf-2-17-1-subrelease
title: '2.17.1 — релизный документационный проход и публикация (отчёт L1)'
status: in-progress
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
- Промпт: /private/var/folders/…/T/opencode/review-2171-docs-prompt.txt (полный текст, источники истины перечислены).
- **Вердикт: (заполняется по завершении ревью)**

## 6. Публикация (Фаза B — только после гейта)

- Штатный механизм публикации npm проекта: GitHub Actions `publish.yml` по пушу тега `v*` (npm trusted publishing, OIDC, provenance; локальных долгоживущих токенов нет). Прецеденты: 2.16.0–2.17.0 опубликованы этим путём (gh run list).
- Деплой сайта: GitHub Actions `deploy-docs.yml` по пушу main (paths: docs/site/\*\*) → GitHub Pages.
- Отклонение от буквы брифа: локальный `npm publish` заменён штатным CI-путём; `npm publish --dry-run` + проверка manifest выполняются локально до пуша. Основание: публикация тегом дважды невозможна, локальный путь не даёт provenance; бриф сам требует «штатный механизм проекта» для сайта — тот же принцип применён к npm.
- Статус: (заполняется)

## 7. Пост-верификация публикации (факты)

(заполняется после публикации)
