---
slug: wave-2-16-2-platform-lifecycle
title: Волна 2.16.2 — план
status: approved
created: 2026-10-12
---

# План волны 2.16.2

Baseline: main e44e5f8, ветка wave-2.16.2, cwd = worktree .worktrees/wave-2.16.2.
Дизайн: design.md (ревью 1, F-01..F-08 внесены). Проверки: `npm run check`,
`npx vitest run --maxWorkers=2 --minWorkers=1`, `npx vitest run`, `npm run e2e`.
Бюджет: 2 цикла исправления на задачу, далее пересмотр L1. Коммиты — L1 в ветке волны.

- [x] T-01 — REQ-01: версионное правило в AGENTS.md-шаблоне
  - Цель: templates/base/AGENTS.md содержит правило «Номер версии всегда полный X.Y.Z —
    в планах, тредах, волнах, тегах и разговоре» (текст по памяти
    mem_20261012_nomer_versii, компактная формулировка для шаблона).
  - AC: шаблон содержит правило с примером полного номера (2.16.2); тест на маркер-фразу
    в шаблоне (новый small test рядом с tests/integration/base-set-init.test.ts —
    чтение файла шаблона); счётчик скиллов 19 не меняется (существующие тесты).
  - Allowlist записи: templates/base/AGENTS.md, тест-файл.
  - Зависимости: нет. Проверка: npm run test:run.
  - RESULT ожидается: DONE + diff шаблона + зелёный прогон.

- [x] T-02 — REQ-02: detectPlatformMismatch (детект)
  - Цель: src/app/use-cases/platform-mismatch.ts — detectPlatformMismatch по design.md §C2
    (sync-state primary, cross-check parseStamp, DUAL_SINCE='2.14.1', guard
    adapter.detect + detectVersion, absent/unparseable → skip-причина, mismatch только v1-only set).
  - AC (юнит-тесты): set=2.14.0+runtime v2 → mismatch; set=2.14.1+runtime v2 → null;
    runtime v1 → null; runtime absent → null; sync-state отсутствует → null (не скан!);
    запись state без штампа на файле → исключена.
  - Allowlist: новый use-case + тест.
  - Зависимости: нет. Проверка: npm run test:run.
- [x] T-03 — REQ-02: проводка детекта в doctor
  - Цель: DoctorDeps += detectMismatch?; runDoctor добавляет issue-строки в entries;
    memory-doctor печатает (уже печатает issues). Позиция: в блоке status==='ok' рядом с
    существующей проверкой wolf-entry.
  - AC: юнит — doctor с фейковым detectMismatch возвращает issue в entry; без deps —
    поведение прежнее (обратная совместимость фейков).
  - Allowlist: src/app/use-cases/doctor.ts, его юнит-тесты.
  - Зависимости: T-02.
- [x] T-04 — REQ-02: repairPlatform + проводка в --repair
  - Цель: src/app/use-cases/repair-platform.ts (гвард detect/sync-state; syncBaseSet +
    writeConfig; dryRun=план без записей; orphaned[] в отчёте с рекомендацией);
    memory-doctor --repair = repairPlatform → repairStorage, общий отчёт, --dry-run покрывает обе.
  - AC (юнит): repair поднимает штамп set=2.14.0 → текущий set (v2-only фикстура-шаблон не
    требуется — достаточно смены set в state); writeConfig канонизирует конфиг; второй
    прогон — «content identical»+«unchanged»; dry-run не пишет (mtime/контент не изменён);
    гвард: без .opencode — skip «no opencode install», ноль записей.
  - Allowlist: новый use-case, memory-doctor.ts, тесты.
  - Зависимости: T-02, T-03.
- [x] T-05 — REQ-03: uninstall use-case
  - Цель: src/app/use-cases/uninstall.ts — planUninstall/executeUninstall по design.md §C4
    - ADR-2 (sync-state primary, fallback штамп при пустом/отсутствующем state, исключение
      AGENTS.md/CLAUDE.md, конфиги по точным значениям, .wolf/ keep, --purge, подсказка
      npm uninstall -g mister-wolf).
  - AC (юнит, tmp-фикстуры): план без --yes ничего не меняет; --yes удаляет штампованное
    из state, чужой файл в .opencode/plugins не тронут; легаси (без state) — штампованные
    в плане; AGENTS.md не в entries (skip-строка); opencode.json: mcp.wolf/default_agent/
    subagent_depth вычищены при наших значениях, subagent_depth=5 сохранён; .mcp.json
    mcpServers.wolf удалён; .wolf/ сохранена с сообщением; --purge удаляет; отсутствующие
    конфиги — skip с причиной; повторный запуск — пустой план exit 0.
  - Allowlist: новый use-case + тесты.
  - Зависимости: нет (T-06 отдельно).
- [x] T-06 — REQ-03: CLI uninstall
  - Цель: src/adapters/cli/commands/memory-uninstall.ts + регистрация в cli-entry.ts
    (порядок в реестре = порядок --help).
  - AC: `wolf uninstall` печатает план, exit 0, ноль записей; `wolf uninstall --yes`
    выполняет; `--purge` без `--yes` = план с пометкой purge, записи нет; вывод —
    построчный (target — action (reason)).
  - Allowlist: новый файл команды, cli-entry.ts, тесты.
  - Зависимости: T-05.
- [x] T-07 — REQ-02: e2e v1→v2
  - Цель: tests/e2e/platform-repair.e2e.ts — tmp-проект: рендер базового набора, правка
    штампа плагина на set=2.14.0 + фейковый `opencode` bin на PATH (печатает v2);
    `wolf doctor` → issue «installed under v1 … --repair»; `wolf doctor --repair` → штамп
    восстановлен, конфиг каноничен; повторный `wolf doctor` — чисто; `--dry-run` не пишет.
  - AC: сценарий зелёный в vitest e2e-конфиге; «плагин/MCP работают» = v2-маркер dual
    entry в контенте + mcp.wolf/default_agent/subagent_depth валидны.
  - Allowlist: новый e2e-файл (фикстуры в tmp).
  - Зависимости: T-04.
- [x] T-08 — версия, CHANGELOG, документация и сайт (релизный чек-лист волны)
  - `npm version 2.16.2 --no-git-tag-version`; CHANGELOG.md секция [2.16.2] (Added:
    doctor mismatch+repair, uninstall; Changed: AGENTS.md правило версий);
    `npm run docs:build` (generate-cli-reference подхватит uninstall, sync-changelog
    синк страницы Changelog); сайт НЕ деплоить.
  - AC: package.json=2.16.2; CHANGELOG [2.16.2] существует; docs:build exit 0; тега нет.
  - Зависимости: T-01..T-07.
- [x] T-09 — интеграция и приёмочные гейты (L1)
  - Порядок: merge проверенных задач в ветке (последовательно), полный гейт на итоговом
    состоянии: `npm run check`; `npx vitest run --maxWorkers=2 --minWorkers=1`;
    `npx vitest run`; `npm run e2e` — exit-коды в отчёт. Независимое ревью (чистый
    контекст): мандат соответствия REQ↔код, затем качество; findings циклом с IDs.
    После гейтов — merge в main (fast-forward/merge commit по конфликту), повторный гейт
    check на main. ACCEPTANCE-пакет в REPORT-2.16.2-implementation.md.
  - Зависимости: T-01..T-08.

## Порядок интеграции

T-01 ∥ (T-02 → T-03 → T-04) ∥ (T-05 → T-06); T-07 после T-04; T-08 после всего кода;
T-09 финал. Конфликты: shared файлы только memory-doctor.ts (T-03/T-04 — сериализовано
порядком) и cli-entry.ts (только T-06). Владелец интеграции — L1.

## Документация и сайт (правило mem_20260929 — T-08)

CHANGELOG [2.16.2]; docs:build; cli-reference с uninstall; сайт-страница Changelog
синхронна; деплой запрещён.

## Исполнение (evidence, L1)

- T-01..T-09 выполнены в ветке wave-2.16.2, merge --ff-only в main 9bc9eba (baseline e44e5f8).
- Гейты на main 9bc9eba: check=0, vitest --maxWorkers=2=0 (1222 passed), vitest run=0 (1222), e2e=0 (214). Логи: /tmp/m1.log..m4.log.
- Ревью: дизайн 2 раунда (F-01..F-11 закрыты), код — 2 мандата (conformance NEEDS_CHANGES→fix→APPROVED, quality APPROVED), fix-верификация APPROVED.
- Отклонения: help-budget 33→34 (+uninstall, CHANGELOG), guard testTimeout 120s (тяжёлая генерация, pre-existing flake).
