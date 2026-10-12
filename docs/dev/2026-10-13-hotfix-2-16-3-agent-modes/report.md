---
slug: hotfix-2-16-3-agent-modes
title: hotfix-2.16.3-agent-modes — отчёт (RESULT/EVIDENCE)
status: done
created: 2026-10-13
---

# hotfix-2.16.3-agent-modes — RESULT / EVIDENCE

- **task_id:** hotfix-2-16-3-agent-modes
- **RESULT:** DONE
- **THREAD:** mem_20261012_defekt_executor_lead_ne_spavnitsya_subag_d6b464
- **Worktree:** `.worktrees/hotfix-2.16.3`, ветка `hotfix-2.16.3`, base `main@859cb4a`
- **Коммиты:** `3c168ee` fix (11 файлов) → `cfa8527` dogfood re-render (32) → `04538f3` review-фиксы (2)

## 1. Diff-стат

`git diff main..hotfix-2.16.3 --stat` → 43 файла, +220/−68 (до review-фикса: +218/−65):

- `templates/base/agents/{executor-lead,worker-implementer,worker-researcher,worker-reviewer}.md` — +`mode: all`;
- `templates/base/agents/steward.md` — `model:` литерал `zai-coding-plan/glm-5.3` → `{{model.primary}}`;
- `tests/unit/agents-mode-guard.test.ts` — новый guard (62 строки);
- `CHANGELOG.md` — [2.16.3]; `package.json`/`package-lock.json` — 2.16.3 (`--no-git-tag-version`, тега НЕТ);
- `docs/dev/2026-10-13-hotfix-2-16-3-agent-modes/` — артефакт фикса;
- `.opencode/**` + `docs/dev/INDEX.md` — dogfood-перерендер синка (штампы `set=2.16.3`).

Вне правок: `src/` не менялся (синк-механика исправлений не потребовала — см. §4), волна 2.17 не тронута.

## 2. TDD-след guard-теста (REQ-02)

- **RED** (`red-run.log`, exit 1): ровно 8 падений — 4 Task-chain шаблона × 2 ассерта
  («frontmatter has no mode line», «Task-chain agent must declare mode explicitly»);
  mr-wolf.md и steward.md проходили (валидный mode был). Падение по контракту, не по setup.
- **GREEN** (`green-run.log`, exit 0): 11/11 (перечисление сета 6 агентов + 6 валидных mode + 4 Task-chain).
- Ужесточение после ревью (F-01, `green-run2.log`): Task-chain ассерт `not.toBe('primary')` → `toBe('all')`
  (subagent ломал бы прямой CLI-запуск) — зелёное на текущих шаблонах, чувствительность сохранилась.

## 3. Sync / поведенческая проверка (REQ-01, REQ-03)

`node dist/bootstrap/cli.js sync` (worktree dist, version 2.16.3), мутированный steward-рендер удалён:

- `.opencode/agents/steward.md: created` (ветка opencode-renderer.ts:132-134), штамп
  `<!-- wolf:rendered base=steward.md set=2.16.3 -->` (был `set=2.16.1`);
- Task-chain агенты + mr-wolf: `updated`; skills/commands/plugins: `updated` (перештамповка — штатный
  post-release dogfood по паттерну 859cb4a);
- grep `^mode:` по `.opencode/agents/*.md`: executor-lead/worker-\* → `all`; steward → `all`;
  mr-wolf → `primary` (не менялся); 10 локальных агентов репо — нетронуты;
- steward: 0 строк `model` (omit-рендер опускает `{{model.primary}}` → платформенная дефолтная модель) —
  то же поведение, что давала локальная правка рендера.

## 4. Разбор mutated-skip (почему steward не пересинканился) — ПРИЧИНА УСТАНОВЛЕНА

Механика: `src/adapters/render/opencode/opencode-renderer.ts:152-162` (T010) — sync пропускает файл,
если контент отличается и от записанного рендера-свидетеля (`state.files[rel]`, wolf-sync-state), и от
свежего рендера: «mutated after render — differs from recorded render and fresh render; left untouched».

Хронология steward: рендер 2.16.1 с литералом `model: zai-coding-plan/glm-5.3` (omit-режим опускает
только `{{model.*}}`-строки — manifest.ts:18,26-28 — литерал проходил насквозь) → локальная правка
«закомментировать строку model» (дельта рендера против шаблона — ровно одна строка:
`# model:zai-coding-plan/glm-5.3`) → каждый sync фиксировал мутацию и пропускал файл → штамп застыл на
set=2.16.1. Это осознанная защита (не баг синка): слепой reseed запрещён (T010).

Разрешение: дельта не «затёрта молча» — первопричина (литерал модели в шаблоне) устранена параметризацией
`{{model.primary}}`, поведение сохранено (дефолтная модель), мутированный рендер удалён и пересоздан
синком (`created`); зафиксировано здесь и в CHANGELOG. Код синка не менялся.

## 5. CHANGELOG + версия

- `CHANGELOG.md` [2.16.3] - 2026-10-13, EN, Keep a Changelog, по образцу 2.16.2: Fixed (root cause,
  guard, steward) + Upgrade notes (wolf sync после апгрейда; латентный дефект во внешних проектах;
  caveat про mutated-skip — F-02).
- `package.json` 2.16.3 через `npm version 2.16.3 --no-git-tag-version`. **Тег v2.16.3 НЕ ставился,
  push/publish НЕ выполнялись** — требуют явной команды владельца.

## 6. Проверки (EVIDENCE)

| Проверка                 | Команда                                                                      | Результат                                    |
| ------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------- |
| Baseline до правок       | `npm run check` (baseline-check2.log)                                        | exit 0                                       |
| Guard RED                | `npx vitest run tests/unit/agents-mode-guard.test.ts` (red-run.log)          | exit 1, 8 падений по контракту               |
| Guard GREEN              | там же (green-run.log; green-run2.log после F-01)                            | exit 0, 11/11                                |
| Полный check после фикса | `npm run check` (final-check2.log, final-check3.log после review-фиксов)     | exit 0                                       |
| Sync-поведение           | `node dist/bootstrap/cli.js sync`                                            | steward created, штампы set=2.16.3           |
| Frontmatter рендера      | `grep '^mode:' .opencode/agents/*.md`                                        | Task-chain all; steward all; mr-wolf primary |
| Тег/пуш отсутствуют      | `git tag --list 'v2.16.3'`, `git branch -r --contains` (проверено ревьюером) | пусто                                        |

probe-спавн из аудита повторно не запускался: поведение платформы доказано тройно (код, бинарь,
probe-эксперимент), гейт и значения mode не менялись.

## 7. Документация и сайт (к релизу — НЕ публикую)

- CLI-референс (`docs:build` → generate-cli-reference.mjs): не меняется — новых команд/флагов нет.
- Сайт: changelog-страница синхронизируется `sync-changelog.mjs` при `npm run docs:build` — после влития
  в main и публикации релиза.
- README/docs-страницы: изменений CLI-поведения нет; на релизном чек-листе — контрольный grep по docs/
  на остаточные упоминания литерала glm-5.3 у стюарда.

Чек-лист релиза (осталось до публикации, всё — командой владельца): merge `hotfix-2.16.3` → main →
тег `v2.16.3` → `npm publish` → `docs:build` + публикация сайта → `wolf sync` в 8 затронутых внешних
проектах (photo-restoration, «Мартовский заяц», Tender, tender-replay-vis, my_home, adminvps,
wolf-playground и др.; при исходе «mutated after render» — разобрать локальную дельту и пересинкануть,
см. §4) → запись релиза в память Wolf.

## 8. Независимое ревью

worker-reviewer через вложенный `opencode run` (Task-спавн мёртв — фиксируемый дефект; обходной путь
штатный до релиза фикса; лог: review-out.log, ~7 мин). **VERDICT: APPROVE** — 0 critical / 0 major /
2 minor. Findings:

- F-01 (minor/QUESTION): Task-chain ассерт пропускал бы `subagent` → принят: ужесточён до `toBe('all')`
  (коммит 04538f3), зелёное подтверждено.
- F-02 (minor): Upgrade notes не упоминал mutated-skip для downstream-проектов → принят: строка добавлена
  (коммит 04538f3).

Ревьюер проверил: соответствие решениям владельца (mode ровно в 4 шаблонах; mr-wolf primary; steward
all + {{model.primary}}), отсутствие vacuous pass и YAML-краёв в guard, чистое разведение коммитов
fix/re-render (нет smuggled-изменений), формат CHANGELOG, отсутствие тега/пуша, чистое рабочее дерево.

## 9. Workers Used

- worker-researcher: не привлекался — исследовательские вопросы (root cause, механика гейта) закрыты
  аудитом 2026-10-12/13; остаточные вопросы (T010, substitute, штампы) решены точечными grep/read в
  рамках L1-рекогносцировки промптов.
- worker-reviewer: независимое ревью диффа — DONE, APPROVE (см. §8).

## 10. FRICTION

- 1× shell-тул: `vitest run … | tail` исказил вывод и потерял exit-код (известный паттерн из аудита) —
  обошёл перенаправлением в файл без пайпов; потерь фактов нет.
- 1× `wolf scaffold artifact` взял дату последнего скана (2026-10-12) вместо текущей — каталог
  переименован вручную под дату брифа (2026-10-13).
- 1× аномалия (открытый вопрос): после вложенной ревью-сессии `opencode run` (worktree, ~01:02)
  `.opencode/agents/steward.md` исчез из рабочего дерева (коммит cfa8527 не тронут; main-чекаут не
  тронут; следов в .wolf нет). Восстановлен `git checkout --` байт-в-байт (shasum e12e76da…
  совпадает с коммитом). Причина не установлена — кандидат: взаимодействие вложенной сессии OpenCode v2
  с wolf-управляемым `.opencode/`. Стоит отдельного взгляда при приёмке: тот же паттерн возможен в
  dogfood-проектах. Отчёт по-прежнему DONE — контент генерируемый и восстановим из git.
- Процессная заметка (не тул): baseline-прогон №1 упал на моём же scaffold-файле до prettier — ошибка
  последовательности (scaffold до baseline), исправлена форматированием; известное падение, не регрессия.

## 11. Риски

- Внешние проекты: до их `wolf sync` Task-цепь там остаётся мёртвой (латентный дефект тиражирован
  релизом 2.16.2); в проектах с мутированными рендерами sync молча пропустит файл — отражено в Upgrade
  notes (F-02) и чек-листе релиза.
- `mode: all` делает воркеров selectable в интерактивных сессиях (платформа показывает all-агентов) —
  ожидаемо; против v2-дефолта primary нового допуска нет (ревьюер подтвердил).
- Перештамповка skills/commands/plugins в dogfood-коммите увеличивает дифф; выбран штатный путь синка
  (консервативная альтернатива потребовала бы нестандартного синка).
