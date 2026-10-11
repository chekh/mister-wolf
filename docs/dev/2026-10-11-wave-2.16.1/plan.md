---
slug: wave-2.16.1
title: Волна 2.16.1 — интеграция экспертного пакета skills-superpowers + обязательные правки разбора + фикс детектора
status: active
created: 2026-10-11
---

# Волна 2.16.1 — экспертный пакет skills-superpowers: реализация

**Режим: LITE** (фиксирует L1). Объём определён разбором
`.external_experts_review/2026-10-11-skills-superpowers/REPORT-2.16.1-skills-analysis.md`,
вердикты утверждены владельцем (`mem_20261011_vladelets_utverdil_verdikty_razbora_2_16_d935df`).
Новых контрактов нет; при вскрытии второго компонента — остановка и переклассификация FULL.

**База:** ветка `wave-2.16.1` от `bec0f02` (патч эксперта, 28 файлов, +711/−87; семантический
мерж ханка теста уже в базе: `--full` + 19 скиллов — MAJOR-2 разрешён базой). Worktree:
`.worktrees/wave-2.16.1`. Родитель базы = `8baec9d` (main, пост-релиз 2.16.0) → merge в main
возможен без конфликтов.

## Задачи

### [ ] T1 (W1, MAJOR-1) — актуализация модели worktree-памяти в скиллах — SIMPLE, worker-implementer A

- Цель: тексты скиллов соответствуют фактическому поведению 2.16.0: linked worktree резолвит
  общий `.wolf/` main-чекоута (`src/adapters/fs/memory-root.ts:11,16-31`); записи по умолчанию
  `scope: worktree:<name>`; перенос в общую память — `wolf promote` (CHANGELOG 2.16.0, строки
  «Worktree memory (git common-dir)» и «Scope gating + `wolf promote <worktree>`»).
- Файлы (allowlist): `templates/base/skills/using-git-worktrees/SKILL.md` (строка 31; строка 25 —
  только если содержит то же устаревшее утверждение, минимальная согласующая правка),
  `templates/base/skills/wolf-sdd/SKILL.md` (строка 31).
- AC1: в using-git-worktrees нет утверждения «память task-local / worktree не видит общую
  `.wolf/` / состояние переносить через wolf-handoff» как модели по умолчанию; описана модель
  2.16.0 (общий `.wolf/`, scope `worktree:<name>`, `wolf promote`).
- AC2: в wolf-sdd та же модель; wolf-handoff упоминается только для незакоммиченного состояния
  сессии, не для шаринга памяти.
- AC3: стиль окружения сохранён (RU, императив, плотность формулировок); минимальный diff;
  EN-зеркал у шаблонов нет (проверено — не применимо).
- Проверка: `rg "task-local|не видит"` по двум файлам — устаревших формулировок нет;
  `npm run check` на итоговом состоянии волны.
- RESULT: DONE + diff + цитаты новых строк.

### [ ] T2 (W3, MINOR-4, решение владельца) — лестница приоритетов using-skills — SIMPLE, worker-implementer A

- Цель: `templates/base/skills/using-skills/SKILL.md:24` согласована с каноном onboarding
  (AGENTS.md: пользователь → память Wolf → догадки). Минимальная согласованная формулировка,
  НЕ новое правило: пользователь выше памяти Wolf; память Wolf = правила/решения/уроки;
  хвост (методика → дефолт) сохраняется.
- AC: порядок «пользователь → активная память Wolf» читается однозначно и не противоречит
  онбордингу; остальная строка без смысловых потерь (платформенные ограничения и методика
  остаются на местах).
- RESULT: DONE + diff.

### [ ] T3 (W4, MINOR-6, решение владельца) — исполнитель правки базовых шаблонов в writing-skills — SIMPLE, worker-implementer A

- Цель: `templates/base/skills/writing-skills/SKILL.md:17` назначает исполнителя правки
  `templates/base/skills/<name>/SKILL.md`. Владелец — **существующая роль L1**
  (проверено по рамке using-skills:20: L1 декомпозирует, управляет L2, интегрирует и выполняет
  разрешённые git-операции; Стюард мутирует память Wolf, не репо-файлы). Формулировка: правку
  базовых шаблонов ведёт L1 (сам или через назначенного L2), live face — через жалобу/Стюарда.
- AC: строка отвечает на вопрос «кто правит шаблон» без введения новой роли.
- RESULT: DONE + diff.

### [ ] T4 (W2, MINOR-3) — docs/README.md 18→19 — TRIVIAL, lead

- `docs/README.md:60`: «18 скиллов» → «19 скиллов».
- Живые упоминания числа скиллов: rg по docs/ + README.md + docs/site — единственное живое
  `docs/README.md:60`; остальные попадания — архивы (specs 2026-10-07, план волны 2.15,
  validation-report 2.15) — не трогать. Сайт: упоминаний «18 skills/скилл» нет.
- AC: правка внесена; архивы не тронуты.

### [ ] T5 (W5, продукт) — фикс detect-unaggregated-lessons.ts — SIMPLE, worker-implementer B

- Дефект (blocker `mem_20261011_produkt_detektor_neagregirovannykh_uroko_02f0ed`): субъект живого
  ребра aggregates (сам агрегат — объект типа lesson) попадает в список неагрегированных →
  баннер «вызовите Стюарда» не гаснет. Фикс в общем коде use-case
  `src/app/use-cases/detect-unaggregated-lessons.ts` (не в вызовах get-call-injections /
  generate-recap): субъект живого ребра aggregates не считается неагрегированным.
- Тесты (TDD, RED→GREEN; `tests/unit/use-cases/detect-unaggregated-lessons.test.ts`):
  1. агрегат с живым ребром — НЕ в списке;
  2. урок без ребра — остаётся в списке.
- Фактический прогон до/после на памяти проекта (read-only; `.wolf/` из worktree резолвится в
  общий main-чекоут): числа «до» (ожидаемо 29 по баннеру; разбор упоминал 31/28 агрегатов —
  зафиксировать фактические) и «после».
- AC1: два новых теста зелёные, на текущем коде — красные (RED evidence).
- AC2: фактические числа до/после в отчёте воркера.
- AC3: существующие тесты детектора и баннера зелёные
  (`detect-unaggregated-lessons.test.ts`, `call-banner-unaggregated.test.ts`).

### [ ] T6 (W6) — версия 2.16.1 + CHANGELOG + docs/site — TRIVIAL, lead (после T1–T5)

- `npm version 2.16.1 --no-git-tag-version` (package.json = единственный источник; БЕЗ тега).
- CHANGELOG.md: запись `[2.16.1] - 2026-10-11` — экспертный пакет скиллов (19 скиллов,
  плагин доставки, рамки, тесты), обязательные правки разбора (W1–W4), фикс детектора (W5).
- `npm run docs:build` — регенерация changelog-страницы сайта (синхрон с CHANGELOG.md), build-проверка.
- РЕЛИЗНЫЕ ДЕЙСТВИЯ ЗАПРЕЩЕНЫ: тег `v*`, `npm publish`, деплой сайта, `git push --force`.

### [ ] T7 — гейты волны — lead

1. `npm run check` → exit 0
2. `npx vitest run --maxWorkers=2 --minWorkers=1` → exit 0
3. `npx vitest run` → exit 0
4. `npm run e2e` → exit 0
   Все — в worktree на итоговом состоянии; после merge повтор на main (AC3).

### [ ] T8 — независимое ревью — worker-reviewer (два мандата, по порядку)

- Мандат 1 (соответствие): `git diff bec0f02..HEAD` — ровно 28 файлов патча + правки W1–W5
  - обвязка W6 (package.json, package-lock, CHANGELOG, docs/site changelog, план волны);
    ничего лишнего; соответствие вердиктам и рекомендациям разбора §5.
- Мандат 2 (качество): тексты W1–W4 (точность модели 2.16.0, стиль, зеркальность), тесты
  детектора (сила ассертов, RED-обоснованность).
- Правки циклом с finding IDs; вердикт APPROVED / CHANGES_REQUIRED / INCONCLUSIVE.

### [ ] T9 — интеграция — lead

- После зелёных гейтов и ревью: merge `wave-2.16.1` → main (ff возможен, main на базе `8baec9d`).
- Повтор гейтов на main (check + vitest ×2 + e2e), exit-коды в отчёт.
- Коммиты осмысленные, стиль истории репозитория.

## Документация и сайт

- `docs/README.md:60` — базовый набор 18→19 скиллов (T4).
- Сайт: страница Changelog синхронна CHANGELOG.md через `npm run docs:build` (T6, только build).
- Не трогать: исторические архивы (CHANGELOG ≤ 2.16.0, specs, планы/отчёты прошлых волн,
  `.external_experts_review`).

## Релизный чек-лист 2.16.1 (выполняется после приёмки владельцем, вне этой волны)

1. Критерии волны зелёные (юнит оба режима + e2e) — выполняется в волне.
2. `npm run check` зелёный в worktree и в чистом чекауте (main после merge).
3. Документация обновлена, `docs:build` собирается, changelog-страница сайта синхронна.
4. Контейнерный smoke — изменён seeding-путь (скиллы/плагин): прогнать при релизе.
5. Тег `v2.16.1` (в волне — только `npm version --no-git-tag-version`).
6. `npm publish` (CI Publish зелёный), GitHub Release с notes.
7. Push main + `--follow-tags`; docs/site деплой зелёный.
8. Dogfood: `wolf sync` в проектах-пользователях — штампы обновлены.
9. Память Wolf: решение релиза, обновление треда волны.

## Трассировка вердиктов разбора → задачи

| Finding     | Задача         | Примечание                                |
| ----------- | -------------- | ----------------------------------------- |
| MAJOR-1     | T1             | обязательно                               |
| MAJOR-2     | база `bec0f02` | мерж уже в базе                           |
| MINOR-3     | T4             |                                           |
| MINOR-4     | T2             | решение владельца                         |
| MINOR-5     | —              | формулировка, владелец не включил в объём |
| MINOR-6     | T3             | решение владельца                         |
| MINOR-7/8/9 | —              | разбор §5.4: сейчас не трогать            |

## Decomposition

| #     | Задача                    | Класс   | Исполнитель          |
| ----- | ------------------------- | ------- | -------------------- |
| T1–T3 | тексты скиллов            | SIMPLE  | worker-implementer A |
| T4    | docs/README 18→19         | TRIVIAL | lead                 |
| T5    | фикс детектора + тесты    | SIMPLE  | worker-implementer B |
| T6    | версия + CHANGELOG + сайт | TRIVIAL | lead                 |
| T7    | гейты                     | TRIVIAL | lead                 |
| T8    | ревью ×2 мандата          | REVIEW  | worker-reviewer      |
| T9    | merge в main              | TRIVIAL | lead                 |
