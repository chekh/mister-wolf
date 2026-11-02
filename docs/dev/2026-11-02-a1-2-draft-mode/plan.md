---
slug: a1-2-draft-mode
title: A1.2 — план поставки и релиза 2.24.0
status: active
created: 2026-11-02
---

# A1.2 — план

Владелец интеграции и поставки: executor-lead (L1). Тред: `mem_20261102_a1_2_srez_izmereniy_now_req_23a_reliz_2_8e1a99`. Worktree: `.worktrees/a1-2`, ветка `a1-2` от `ebe1d54`. Mode: **FULL**.

## Декомпозиция

| #   | Подзадача                                                   | Класс                                   | Исполнитель                                                      |
| --- | ----------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| 1   | Пакет среза (requirements/design/plan/test-plan)            | доки среза                              | L1                                                               |
| 2   | Контракт плотности в 9 шаблонах (единый владелец §13)       | MEDIUM по составу, каждый файл ≤6 строк | L1 (право малой связанной работы; один владелец общих файлов)    |
| 3   | Delivery-тест + fixtures сценариев (TDD RED/GREEN)          | SIMPLE (1–2 файла)                      | L1                                                               |
| 4   | Независимое ревью (соответствие продукту + польза читателю) | review-мандат                           | worker-reviewer (1 вызов, два мандата — прецедент 2.23.2/2.23.3) |
| 5   | Релизный цикл 2.24.0 + публикация + верификация фактов      | релиз по чек-листу                      | L1                                                               |

Бюджет L2: ≤ 5 вызовов; план — 1 (reviewer).

## Шаги

1. [x] Slice Reality Check (requirements.md §0) — до design/implementation.
2. [x] Пакет среза через `wolf scaffold artifact a1-2-draft-mode`.
3. [x] wolf-release-docs загружен до планирования релизной документации.
4. [x] Delivery-тест плотности (5 тестов, GREEN на 726e30c; RED-прогон на чистом baseline оборван прерыванием сессии — свойство зафиксировано тестом, ловит удаление носителя).
5. [x] Правки 9 шаблонов (design §2) + GREEN (density тест 5/5) + `npm run check` exit 0 (2041 теста, 2026-11-02).
6. [ ] Независимое ревью (worker-reviewer) → обработка замечаний (receiving-code-review).
7. [ ] `npm run e2e` на релизном контенте.
8. [ ] Релизный чек-лист (ниже) → merge `--no-ff` в main → тег `v2.24.0` → push → публикация CI → верификация фактов.
9. [ ] Память: note+history к треду, `wolf recap`, тред по итогам.

## Документация и сайт

- `docs/site/guide/base-set.md` EN/RU — ось плотности в описании контракта поручений (карта design §5).
- `CHANGELOG.md` — запись 2.24.0 (без заявлений об экономии).
- README/главная/getting-started — проверка обещаний без правок (счётчики скиллов и команды не менялись); фиксация проверки в отчёте.
- Generated: `npm run docs:build` — CLI reference/changelog-зеркала без ручных правок; проверка отсутствия диффа.
- Роадмап: front-matter baseline → 2.24.0, §3 «Текущий фронт» → A1.2 выпущен 2.24.0, NOW → E1 среза-1; ledger — запись REL-2.24.0.

## Релизный чек-лист 2.24.0 (правило «полный релизный чек-лист»)

- [ ] `npm version 2.24.0` (package.json = единственный источник; полный X.Y.Z).
- [ ] CHANGELOG-запись с датой и составом.
- [ ] `node scripts/generate-update-map.mjs --prev 2.23.3` + `--verify` (категории new/changed/unchanged; faces; `schema_migrations` пуст).
- [ ] Re-stamp delivered set: штатный `wolf upgrade --here --yes` в worktree; известная unstamped-доставка `wolf-release-docs` не скрывается.
- [ ] `npm run check` exit 0 (полный набор).
- [ ] `npm run e2e` exit 0 на релизном коммите (AC среза, не только гейт).
- [ ] `npm run docs:build` exit 0; страницы changelog/base-set отдают 2.24.0; второй прогон без диффа.
- [ ] Форматирование: `format:check` в гейте — ledger/CHANGELOG отформатированы заранее (урок 2.23.3).
- [ ] Merge `--no-ff` в main; тег `v2.24.0` на релизном коммите; git-цепочки — bash-скриптом, факт — отдельной сверкой (rtk-урок).
- [ ] Push main + тег; CI Publish/CI/Deploy Docs — success.
- [ ] Факт npm: `npm view mister-wolf dist-tags` → latest = 2.24.0.
- [ ] Факт GitHub: `gh release view v2.24.0` → не draft, не prerelease.
- [ ] Факт сайт: живой `curl https://chekh.github.io/mister-wolf/` → 2.24.0.
- [ ] Ledger-запись (что изменилось, чем проверено, чего не делает, откат, публикация).
- [ ] Память: note+history с RESULT/EVIDENCE к треду A1.2; `wolf recap`; complaint-триаж перед приёмкой.

## Стоп-условия

Новые контракты, второй компонент или причина сверх среза → STOP/возврат L0 (2 шага без продвижения — возврат). Другой полный номер или срез не помещается в один релиз → NEEDS_CONTEXT до публикации.
