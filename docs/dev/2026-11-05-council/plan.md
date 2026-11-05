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

- [ ] P01: независимо проверить quartet и candidate; уточнить технические ADR,
      занятость версии и актуальность main — design §ADR/источники, AGENTS.md:1.
- [ ] P02: реализовать экспертную роль и реально ограниченные права/изоляцию
      OpenCode, прототип S04/S06 до широкой интеграции — design §1–2;
      templates/base/agents/worker-reviewer.md:1 как сравнение, не наследовать его обязанности.
- [ ] P03: интегрировать wolf-council, нанимателей и маршруты, expert/synthesis
      профили языка — design §1/3; templates/base/skills/using-skills/references/contracts.md:32.
- [ ] P04: реализовать валидируемый note write-path и CLI/MCP, idempotency/recovery
      — design §4; src/app/use-cases/add-memory-object.ts:91, src/domain/memory-types.ts:256.
- [ ] P05: общий reader/normalizer и mixed council analytics — design §5;
      src/app/use-cases/build-analytics.ts:1845; существующие tests/integration/build-councils-v2.test.ts:1.
- [ ] P06: пакет ревью/проверка findings/scoped re-review — design §6;
      templates/base/skills/wolf-review/SKILL.md:58. Сохранить гейты и журнал.
- [ ] P07: полный distribution: agent registry, seed, injection, fresh/upgrade,
      model/protect/keep, EN/RU и синхронизация roadmap C без изменения O1/U1 — design §6;
      src/app/use-cases/init-project.ts:44, scripts/generate-update-map.mjs:1.
- [ ] P08: выполнить unit/integration/CLI-MCP/e2e проверки и живые сценарии,
      независимое итоговое ревью — test-plan; unknown не превращать в pass.
- [ ] P09: release metadata, update-map по фактическому предыдущему тегу,
      staging rollout/rollback, штатные gates, затем выпуск в действующих полномочиях.

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
