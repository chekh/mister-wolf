---
slug: wave-2-20-0-upgrade-intentions
title: wave-2-20-0-upgrade-intentions — отчёт фазы документов
status: draft
created: 2026-10-24
---

# Фаза 0: документы волны 2.20.0 — отчёт исполнителя (executor-lead)

## Metadata

- task_id / тред: mem_20261024_upgrade_ux_namereniya_vladeltsa_i_tikhiy_e6daf7
- Исполнитель: executor-lead (сессия lead-wave-2200-docs)
- Worktree: .worktrees/wave-2-20-0-upgrade-intentions, ветка
  dev/wave-2-20-0-upgrade-intentions, baseline 0574e7c (v2.19.0)
- Дата: 2026-10-24/25
- Режим: FULL (артефакт 4 файла), статус requirements/design — draft

## Summary

Создан полный артефакт волны 2.20.0 «Upgrade UX: намерения владельца»:
requirements.md (7 разделов шаблона, 11 REQ + 6 NFR, сценарии приёмки владельца
включены в AC почти дословно, статус draft — утверждение через L0), design.md
(черновик ядра: нормализация protect, verify-код protected, версионированный
onboarding-маркер, формат бэкапов; ADR-1…4; spike R-01), plan.md и test-plan.md
— нетронутые шаблоны (наполнение после утверждения требований). Папка связана с
тредом заметкой context + отношениями based_on/basis_for
(mem_20261024_artefakt_volny_2_20_0_upgrade_ux_sozdan_36c63f). `npm run check`
зелёный. Решения владельца A1–A4, B5–B11 перенесены в REQ без изменений
толкования.

## Changes

- docs/dev/2026-10-24-wave-2-20-0-upgrade-intentions/requirements.md — новый
  (полный, draft): REQ-01 имена файлов, REQ-02 штамп-исцеление, REQ-03
  onboarding-маркер, REQ-04 init/mcp.wolf, REQ-05 protect (in-file, 5 AC),
  REQ-06 --resolve, REQ-07 --review, REQ-08 --show, REQ-09 Protections,
  REQ-10 --yes+бэкапы, REQ-11 --json; NFR-01…06 (exit-модель, идемпотентность,
  read-only check, атомарность, сохранность, детерминированность); 7 разделов
  шаблона, frontmatter slug/title/status=draft/created.
- docs/dev/2026-10-24-wave-2-20-0-upgrade-intentions/design.md — новый
  (черновик ядра, draft): контракты нормализации (3 точки), код protected,
  пара onboarding-маркеров с версией формата, бэкапы
  .wolf/backup/upgrade/<дата>/, краткие контракты исцеления и mcp.wolf,
  ADR-1…4, ссылки на NFR, открытые пункты и spike R-01 (opencode игнорирует
  неизвестный ключ frontmatter).
- docs/dev/2026-10-24-wave-2-20-0-upgrade-intentions/plan.md,
  test-plan.md — шаблоны scaffold (только форматирование prettier, наполнение —
  после утверждения требований; при наполнении plan — обязательный раздел
  «Документация и сайт» с релизным чек-листом, скилл wolf-release-docs).
- Память: заметка context о создании артефакта + 2 отношения с тредом.
- Код не менялся; коммитов нет (бриф не поручал).

## Task Decomposition

| Подзадача                                       | Класс                   | Исполнитель    |
| ----------------------------------------------- | ----------------------- | -------------- |
| Worktree + claim + scaffold-эквивалент          | TRIVIAL (процедура)     | сам            |
| requirements.md (документ из решений владельца) | документ lead-владельца | сам            |
| design.md (черновик ядра)                       | документ lead-владельца | сам            |
| plan/test-plan — шаблоны                        | TRIVIAL                 | сам (scaffold) |
| Валидация npm run check                         | SIMPLE                  | сам            |

Воркеры не привлекались: работа — компоновка уже утверждённых владельцем
решений в документы одного владельца; исследование кода выполнено точечными
чтениями по якорям брифа (verify-against-map, opencode-renderer,
memory-upgrade, doctor, prior-art design unified-update).

## Workers Used

Нет (0). Лимит не расходован.

## Validation Results

- npm run check (worktree, полный): exit 0 — english-surface, prettier
  format:check, tsc lint, build, vitest 210 files / 1704 tests passed.
- prettier --check docs/dev/2026-10-24-wave-2-20-0-upgrade-intentions/\*.md:
  All files formatted correctly (все 4 файла + отчёт ниже отформатирован
  тем же prettier).
- Структура requirements соответствует шаблону scaffold-artifact 2.19.0:
  frontmatter slug/title/status/created, 7 разделов в порядке шаблона, анатомия
  REQ/NFR сохранена.
- git status worktree: только `?? docs/dev/2026-10-24-.../` — allowlist
  соблюдён; главный worktree не тронут; ничего не закоммичено.
- Claim dev:2026-10-24-wave-2-20-0-upgrade-intentions удерживался на время
  записи и освобождён по завершении.

## FRICTION

- wolf scaffold artifact всегда берёт дату из системных часов: прогон 25-го
  создал бы папку 2026-10-25-… вне allowlist брифа (путь зафиксирован за 24-м).
  Использован fallback брифа: файлы созданы байт-точными шаблонами установленной
  версии (dist 2.19.0), claim на корректный artifact-id уже существовал. Стоит
  рассмотреть параметр --date/--artifact у scaffold (кандидат в бэклог, не
  жалоба — правило отсутствует, поведение среды).
- Первый acquire claim ушёл эфемерной CLI-сессией (WOLF_SESSION не был задан) —
  выпущен как владелец и переоформлен на стабильную сессию; +
  понимание WOLF_SESSION задокументировано здесь для следующих фаз.
- Свежесгенерированный шаблон test-plan.md не проходит prettier --check до
  ручного форматирования (шаблон генерируется без пустых строк после
  заголовков сценариев).

## Отклонения и вопросы владельцу

Отклонений от решений владельца нет. Вопросов, требующих решения до ревью
requirements, нет. Для следующей фазы (полный design) остаются открытыми пункты
из design.md §«Открытые пункты», включая spike R-01 (opencode и неизвестный
ключ frontmatter).
