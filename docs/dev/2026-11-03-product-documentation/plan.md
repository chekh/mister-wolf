---
slug: product-documentation
title: Product documentation
status: active
created: 2026-11-03
---

# План

База: 36f5e197 (main), пакет 2.27.0. Профиль FULL. Ветка feat/codex_product-docs, отдельный worktree. Тред mem_20261103_documentation_product_positioning_and_ca_8f0cf9. Подтверждённый набор требований — диалог владельца; повторное согласование не требуется.

## Задачи

- [x] Оформить FULL-пакет штатным scaffold и заполнить требования/дизайн до редакции — design «Компоненты», baseline src/app/use-cases/scaffold-artifact.ts:37.
- [x] Переписать README и вводные EN/RU; синхронизировать метаданные — design ADR-2, baseline README.md:15.
- [x] Перенести актуальное содержание docs/guide, удалить дубли, исправить активные ссылки — design ADR-1, baseline docs/README.md:37.
- [x] Переписать главную, добавить карту процесса и пользовательские сценарии — design ADR-3, baseline docs/site/.vitepress/theme/Layout.vue:1.
- [x] Согласовать organization/memory/feedback/bootstrap с рамками и CLI — design «Контракты», baseline templates/base/agents/executor-lead.md:76.
- [x] Добавить процедуру поддержания документации, проверки ссылок/парности и CI — REQ-07, baseline .github/workflows/ci.yml:1.
- [ ] Проверить сборку, формат, обязательные тесты, команды первого запуска и desktop/mobile; интегрировать ревью.
- [ ] Сохранить и опубликовать рабочую ветку; предъявить PR без merge/release.

## Покрытие

| Тема                       | Страницы                              | Основание                                           | Проверка                   |
| -------------------------- | ------------------------------------- | --------------------------------------------------- | -------------------------- |
| Удержание цели             | overview, organization, README        | концепция §2, рамки агентов                         | редакционная сверка        |
| Состав помощника и процесс | overview, base-set, working-with-wolf | using-skills, рамки L1/L2                           | пути и полномочия          |
| Документы как память       | overview, memory, bootstrap           | bootstrap-project, scan-project                     | smoke bootstrap            |
| Самообучение               | overview, feedback, delivery          | steward-nastavnik, face operations, aggregate apply | тесты + сверка             |
| Удобство человека          | working-with-wolf, getting-started    | wolf-explain, wolf-brainstorm, wolf-work-strategy   | сценарий первого поручения |
| Текущие границы            | capabilities                          | maturity, CLI, шаблоны                              | без runtime-обещаний       |

## Сохранение и приёмка

Временные скрипты и журналы — вне docs/dev. Значимые результаты в этих четырёх документах и Git-коммитах. Публикация и merge сайта не выполняются автоматически этой задачей.

## Дополнительное ревью

Перенос — дочерний коммит e9311904, интегрирован как c8d6d904. Независимое чтение нового README/вводных/главной подтвердило покрытие требований. Замечания: порядок жалоба→Стюард→исход, распознавание входящего outcome_of, настоящее время Council/runtime checkpoints. Исправлены в feedback и organization EN/RU. Таксономические проверки и контракт изоляции проверяют канонические страницы; README хранит ссылку, а не второй полный контракт.

Первый широкий прогон пересёкся с пересборкой dist при e2e: недостающие модули не трактуются как дефект runtime. Повторные проверки должны идти последовательно либо в отдельном worktree с отдельным dist. NO_COLOR окружения исключается для тестов цветов; сам продукт не меняется.
