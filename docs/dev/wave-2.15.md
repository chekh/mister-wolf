---
slug: wave-2.15
title: Волна 2.15 — конвейер артефактов + skill intake
status: active
created: 2026-10-08
---

# Волна 2.15 — конвейер артефактов + skill intake

Состав и порядок — план `docs/superpowers/plans/2026-10-08-wave-2.15-artifact-pipeline-skill-intake-plan.md`
(последний план старой конвенции; следующие циклы — папками `docs/dev/<дата>-<slug>/`).

## Состав (потоки)

- Поток A (тулинг): A1 scaffold artifact → A2 sync-индексы → A3 doctor «Артефакты».
- Поток B (скиллы): B1 → B2 → B3 → B4 → B5 → B6 (после влития A).
- Поток C (intake): C1 → C2 (параллельно B, влитие после).
- Поток D (догфуд): D0 (этот файл) → D1 → D2 → D4.
- Финал: V (валидация §6 спеки) → R (релиз 2.15.0).

## Порядок влитий

A → B → C → D → V → R (каждое влитие — `npm run check` зелёный).

## Релизный чек-лист 2.15.0 (канон — спека §8, дословно)

1. Все критерии §6 зелёные (юнит + e2e).
2. `npm run check` зелёный в worktree и в чистом чекауте.
3. Документация обновлена (§7 спеки), docs:build собирается, changelog-страница сайта синхронна с CHANGELOG.md.
4. Контейнерный smoke (если затронуты плагины/конфиг) — в этой волне не ожидается; при изменении seeding-пути — прогнать.
5. Версия: `npm version X.Y.Z`, CHANGELOG-запись, тег `v*`.
6. `npm publish` (CI Publish зелёный), GitHub Release с notes.
7. Push main + `--follow-tags`; docs/site деплой зелёный.
8. Dogfood: `wolf sync` в проектах-пользователях (mister-wolf, Tender) — no-op/штампы обновлены.
9. Память Wolf: решение релиза, обновление треда.
