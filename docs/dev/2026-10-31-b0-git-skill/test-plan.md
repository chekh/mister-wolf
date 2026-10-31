---
slug: b0-git-skill
title: b0-git-skill — тест-план
status: draft
created: 2026-10-31
---

# b0-git-skill — тест-план

AC берутся из requirements.md; здесь — только сценарии и способ проверки.

## Сценарии

### REQ-01 — канон закреплён

- Given репозиторий на revision среза
- When `git ls-files docs/reference/git-collaboration-policy-v1.1.md` и `sha256`
- Then файл tracked, sha256 = `df7d3d82…56c208`, версия/дата в шапке = 1.1 / 1 ноября 2026
- Маппинг: guard-тест `tests/unit/skills/wolf-git-contract.test.ts` (sha256), плюс
  evidence L1: `git ls-files`, `shasum -a 256`.

### REQ-02 — скилл существует и срабатывает на Git-этапах

- Given установленный base-set
- When читаем `templates/base/skills/wolf-git/SKILL.md`
- Then frontmatter содержит `name: wolf-git` и `description` с триггером; тело содержит
  разделы этапов (вход/G0, ветка/G1, checkpoint, передача/G2, завершение/G9), у каждого —
  проверка, реакция на отказ и ссылка на § регламента
- Маппинг: guard-тест (frontmatter + обязательные подстроки-разделы), ревью T3 (смысл).

### REQ-03 — регламент доступен в установленной поставке

- Given пустой каталог вне исходного checkout
- When рендер base-set (`wolf init`/`wolf sync` либо рендерер на tmp-каталог) и `npm pack`
- Then существует `<project>/.opencode/skills/wolf-git/reference/git-collaboration-policy-v1.1.md`,
  его содержимое после снятия штампа байт-идентично канону, а путь из `SKILL.md`
  разрешается в существующий файл
- Маппинг: guard-тест рендера в tmp + evidence L1: распаковка `npm pack` и рендер в
  отдельный каталог, `ls`/`shasum`, попытка открыть указанный путь.

### REQ-04 — согласованность методик

- Given `wolf-git`, `using-git-worktrees`, `finishing-a-development-branch`, `wolf-handoff`,
  `using-skills`
- When сверяем утверждения по baseline/ownership/сохранению/полномочиям/завершению
- Then нет взаимоисключающих предписаний; `update-map.json` содержит все изменённые
  цели, `node scripts/generate-update-map.mjs --verify` зелёный
- Маппинг: таблица сверки в design.md (ревью T3), `--verify` в `npm run check`-контуре
  и evidence L1.

### REQ-05 — G0/G1/G2/G9 и честность непоставленного

- Given текст скилла
- When ищем каждый гейт и раздел «Что не поставлено»
- Then все четыре гейта адресно присутствуют; непоставленное (MR-статусы, CI, очередь,
  scheduler, структурный inspect) названо; нет команд/полей, которых нет в реализации
- Маппинг: guard-тест (наличие разделов), ревью T3 (отсутствие выдуманных операций),
  evidence L1 (список реально доступных команд в отчёте).

### NFR-01 — размер скилла

- Given `templates/base/skills/wolf-git/SKILL.md`
- When считаем строки и байты
- Then ≤ 150 строк и ≤ 8000 байт
- Маппинг: guard-тест.

### NFR-02 — отсутствие расхождения копий

- Given канон и поставляемая копия
- When сравниваем bytes и sha256
- Then идентичны; правка одной стороны валит тест
- Маппинг: guard-тест (негативная проверка — на фикстуре в tmp).

### NFR-03 — отсутствие новых контрактов

- Given diff среза
- When `git diff --stat main...HEAD` и `npm run check`
- Then `src/**` не изменён (кроме ничего), схема карты и CLI не тронуты, гейт зелёный
- Маппинг: evidence L1 (diff + полный гейт).

## Прогоны

- Точечно: `npx vitest run tests/unit/skills/wolf-git-contract.test.ts`
- Карта: `node scripts/generate-update-map.mjs --verify`
- Полный гейт: `npm run check` (english-surface → format:check → tsc → build → vitest)
- Установка вне checkout: `npm pack` в системный tmp + рендер в отдельный каталог,
  проверка `SKILL.md` и `reference/…` , открытие указанного из скилла пути.

## Известные ограничения проверки

- Харнес-загрузчик скиллов проверяется настолько, насколько доступен: подтверждается
  наличие файла и валидный frontmatter в установленной поставке; «скилл загружен в
  контекст сессии» доказывается отдельно (иначе фиксируется как непроверенное).
- Защиты `main`, CI и release-процесс в репозитории не настроены — их наличие не
  проверяется и не заявляется.
