---
slug: unified-update
title: unified-update — план
status: draft
created: 2026-10-23
---

# unified-update — план

Волна 2.19.0. Входы: requirements.md (approved, 15 REQ / 4 NFR, CR ×7),
design.md (approved; ревью APPROVED + N-1..N-3 — b40f542; логотип A,
журнал design). Baseline: main `b40f542`. Единственный источник контрактов
— design.md; план не дублирует его, а ссылается на разделы (§) и
path:symbol базлайна. Тред: mem_20260824…15b75a →
mem_20261023_volna_2_19_0_unified_update_odno_obnovle_15b75a.

## Рабочая среда и правила исполнения

- Worktree: `.worktrees/unified-update-2-19-0`, ветка `dev/unified-update-2-19-0`
  от main@`b40f542` (trunk-based; main = истина, влития только зелёными).
- Параллельные исполнители — строго дизъюнктные allowlist (см. задачи);
  check/commit/push и разрешение конфликтов — только у lead.
- Гейты: ревью lead после каждой фазы; перед каждым влитием в main —
  полный `npm run check` + полный `npm run e2e` (таймаут ≥ 1200 с; правило
  памяти: полный E2E — гейт каждого влития).
- Конвейер после этого плана: wolf-testplan (сверка plan ↔ test-plan —
  гейт старта исполнения), затем wolf-sdd диспетчеризация волн.
- Исполнительский класс — по таксономии lead (TRIVIAL/SIMPLE — сам;
  MEDIUM/COMPLEX — воркеры, ≤5 на сессию, параллельные волны ≤4).

## Фазы и зависимости

```
Ф1  T1 карта (фундамент контрактов)
Ф2  T2 seed+atomic ┃ T3 renderer ┃ T4 pinned+гварды ┃ T5 сверка   (4 парал., дизъюнкт)
Ф3  T6 проектный шаг (после T2,T5) ┃ T11 sync-депрекация ┃ T12 scan-unregistered
Ф4  T7 оркестратор (после T3,T4,T6) ┃ T9 --here (после T6) → T10 --check (после T5)
    T9→T10→T8 — общий файл memory-upgrade.ts, строго последовательно
Ф5  T8 CLI-транспорт/re-exec/exit (после T7) → T14 cli-reference (после T8)
Ф6  T13 интеграция/влития/e2e → T15 документация и сайт → релизный чек-лист
```

Точки интеграции: после Ф2 (контракты outcomes/карты зафиксированы),
после Ф4 (проход целиком на фикстурах), Ф5→Ф6 (CLI-поверхность готова —
снимок cli.md). Чекпоинты внутри длинных задач — в задачах.

## Задачи

### Ф1 — фундамент

- [ ] T1: Карта обновления — схема, генератор, guard. Цель:
      `update-map.json` полного инвентаря в корне пакета + zod-валидация +
      генератор скелета + CI-guard согласованности с templates/. Входы:
      REQ-10/12, ADR-1, design §«Карта», §вопрос 1 (wire-формат — здесь).
      Allowlist: `src/adapters/fs/update-map.ts` (новый),
      `scripts/generate-update-map.mjs` (новый), `update-map.json` (корень,
      генерируется), tests/unit/adapters/update-map.test.ts + guard-тест
      (прецедент cli-reference-guard). Правку `package.json` (`files`) делает
      lead на интеграции. Проверки: юнит zod-схемы; guard «карта покрывает
      все цели синка + removed существует в prev / отсутствует в templates/»;
      dry-run генератора prev=2.18.5. Класс: MEDIUM → воркер. Готовность:
      guard зелёный в CI, скелет карты закоммичен, RESULT с примером
      сгенерированного файла.

### Ф2 — параллельные компоненты (дизъюнктные allowlist)

- [ ] T2: seed-missing-only + атомарные записи. Цель: режим
      `seedBasePlaybooks(root, { mode: 'seed-missing-only' })` — посев только
      недостающих; legacy-absorbed только для legacy-head без живого лица;
      initiator-триггер: тело ≠ шаблону при initiator = seed|migration →
      skipped-live, иной initiator → diverged; перевод записей base-set в
      syncBaseSet на tmp+rename (writeFileAtomic). Входы: REQ-03 AC2, REQ-07,
      ADR-3, design §«Проектный шаг» шаги 1/3 (коммиты b40f542). Allowlist:
      `src/app/use-cases/seed-base-playbooks.ts`,
      `src/app/use-cases/sync-base-set.ts`, их тесты. Проверки: юнит исходов
      посева (seeded/skipped-live/legacy-absorbed/diverged), существующие
      тесты sync зелёные, тест атомарности (нет полу-записи при сбое).
      Класс: MEDIUM → воркер.
- [ ] T3: Renderer + логотип A + палитра + деградация. Цель: чистый
      модуль `renderReport(ReportNode, TermEnv) → styled|plain` по контракту
      design; логотип A (блочный WOLF, решение владельца); палитра маркеров
      ●/▲/✖ со всеми строками таблицы (вкл. skipped-live, migrated,
      legacy-absorbed, refused, linked-refusal, local-newer); деградация
      truecolor→256→16→моно; NO_COLOR/не-TTY → plain; spinner TTY-only.
      Входы: REQ-15, ADR-6, design §«Терминальный вывод» (контракт, палитра,
      логотип, матрица, тест-влияние; вопрос 5 — ширина 60/80/120
      snapshot-тестами). Allowlist: `src/adapters/cli/report-renderer.ts`
      (новый), tests/unit/adapters/report-renderer.test.ts (snapshot plain —
      оракул; TermEnv-фейки). Проверки: snapshot трёх поверхностей, тесты
      матрицы деградации, моно-различимость статусов. Класс: MEDIUM →
      воркер.
- [ ] T4: pinned + гварды. Цель: поле `pinned` в RegisteredProject
      (yaml), guard-тест «самолечение P331 не перезаписывает pinned»;
      различение «реестр пуст» vs «реестр нечитаем» (нечитаем = error,
      тест на битый yaml); lock-файл параллельного upgrade с TTL; realpath-
      дедуп списков проектов. Входы: REQ-13, REQ-01/06, design §«pinned»,
      §«Гварды прохода». Allowlist: `src/adapters/fs/projects-registry.ts`
      (расширить), `src/adapters/fs/upgrade-lock.ts` (новый), их тесты.
      Проверки: юнит pinned/битый-yaml/lock TTL/дедуп. Класс: MEDIUM →
      воркер.
- [ ] T5: Движок сверки. Цель: `verifyAgainstMap(map, outcomes)` со
      структурными кодами исходов (обновленный перечень — design §«Сверка»),
      ожиданиями по категориям, conflict/diverged → «требует решения»,
      отсутствие статуса → error; сводка проекта счётчиками. Входы: REQ-11,
      design §«Сверка», глоссарий. Allowlist:
      `src/app/use-cases/verify-against-map.ts` (новый), его тесты (типы
      карты из T1 — после Ф1). Проверки: табличные юнит-кейсы всех кодов.
      Класс: MEDIUM → воркер.

### Ф3

- [ ] T6: Проектный шаг. Цель: `runProjectStep` — композиция sync →
      removals (orphaned ∩ removed; ∖ removed → «требует решения») →
      seed-missing-only → миграция → сверка; пофазная атомарная фиксация;
      wall-time замер шага (NFR-03); события посева без изменений формата
      (NFR-04). Входы: REQ-03/07/11, ADR-3/4, design §«Проектный шаг»;
      зависимости T2, T5. Allowlist: `src/app/use-cases/project-step.ts`
      (новый), tests/unit/use-cases/project-step.test.ts (фикстуры проекта:
      ok / mutated / diverged / removal). Проверки: юнит сценариев; повторный
      запуск = идемпотентность (NFR-02, exit 0). Класс: MEDIUM → воркер.
- [ ] T11: sync → deprecated-алиас. Цель: строка DEPRECATED +
      redirect на `wolf upgrade --here` в выводе memory-sync; задел удаления
      2.20.0 (removed-commands, прецедент 2.13 §10.4 — только заметка в
      CHANGELOG, код удаления не пишем). Входы: REQ-07, design §«Депрекация
      sync». Allowlist: `src/adapters/cli/commands/memory-sync.ts`, его
      тест. Проверки: юнит вывода; инвариант REQ-07 AC1 — множество id
      объектов памяти неизменно при выполнении алиаса. Класс: TRIVIAL →
      сам (lead, на интеграции Ф3).
- [ ] T12: scan-unregistered. Цель: пост-отчётный ограниченный скан
      незарегистрированных (maxdepth 4, топ-5, ≤5 с) → подсказка. Входы:
      REQ-09, design таблица компонентов. Allowlist:
      `src/app/use-cases/scan-unregistered.ts` (новый), его тест. Проверки:
      юнит на фикстурном дереве + бюджет времени. Класс: SIMPLE → воркер
      (волна Ф3).

### Ф4

- [ ] T7: Оркестратор прохода. Цель: `upgrade-projects` use-case — планы
      из реестра + карты с полями-контрактом REQ-02 (имя, realpath, состав+
      штамп, цель, категории числами, pinned, worktree/missing); одно
      подтверждение списка; realpath-дедуп (T4); изоляция сбоев per-project
      try/catch; парковые счётчики; exit 0/1/2 по таблице исходов; рендер
      через T3 (ReportNode); вызов scan-unregistered (T12) после сводного
      отчёта (REQ-09) — ошибки скана ≠ ошибки прохода. Входы: REQ-02/05/
      06/09, design §«Фазы», §«Список подтверждения», §«Exit-модель»;
      зависимости T3, T4, T6, T12. Allowlist:
      `src/app/use-cases/upgrade-projects.ts` (новый), его тесты. Проверки:
      юнит планов/подтверждения/счётчиков/exit; сценарий «отклонено → 0,
      Cancelled»; не-TTY без --yes → пропуск, exit 0 (REQ-02 AC3); пустой
      реестр → exit 0 (REQ-01 AC2). Класс: MEDIUM → воркер.
- [ ] T9: `--here`. Цель: прямой вызов runProjectStep из текущего
      бинарника без npm/re-exec/реестра; guard «нет .wolf/memory → run wolf
      init first», exit 1; отчёт одного проекта. Входы: REQ-14, design
      §«--here»; зависимость T6. Allowlist: расширение
      `src/adapters/cli/commands/memory-upgrade.ts` (--here ветка; файл
      делит с T8 — сериализовать: T9 раньше T8) + тест. Проверки: юнит
      guard/шага; подтверждение одиночного плана — --yes/не-TTY,
      наследование правил REQ-02. Класс: SIMPLE → воркер (после T6, до
      T10/T8).
- [ ] T10: `--check` по составу. Цель: read-only классификация парка
      (актуальный/отстаёт/требует решения/unknown-вне-покрытия) контентным
      сравнением целей карты vs рендер templates/; деградация без карты CLI
      (npm view + штампы с пометкой недостоверности). Входы: REQ-08, design
      §«--check»; зависимости T1; источник контент-diff — рендер-сравнение
      из syncBaseSet/templates (НЕ T5: verifyAgainstMap работает с
      outcomes прохода, а не с файлами). Allowlist: расширение
      `src/adapters/cli/commands/memory-upgrade.ts` (--check ветка; тот же
      файл — сериализовать: после T9, до T8) + тест. Проверки: юнит
      классификации на фикстурах. Класс: MEDIUM → воркер.

### Ф5

- [ ] T8: CLI-транспорт: re-exec + контракт spawn + exit-модель.
      Цель: hidden `upgrade-projects` в COMMANDS (cli-entry.ts); spawn
      `<npmPrefix>/bin/wolf upgrade-projects --no-banner --state tmp.json`
      (stdio inherit, env: process.env, exit=exit; сбой spawn → UserFacingError
      «CLI обновлён; проекты не тронуты — повтори wolf upgrade», exit 1);
      up-to-date → сразу проектный проход; финальные строки exit-таблицы;
      склейка фаз (шапка только фаза 1). Входы: REQ-01/04, ADR-2/5, design
      §«Фазы», §«Контракт spawn», §«Склейка фаз re-exec»; зависимости T7,
      T9, T10 (общий файл). Allowlist: `src/adapters/cli/commands/
upgrade-projects.ts` (новый), `src/adapters/cli/commands/
memory-upgrade.ts`, `src/adapters/cli/cli-entry.ts`, тесты (вкл.
      фикстуру «spawn фейкового бинарника»). Проверки: юнит spawn-контракта,
      exit-проксирования, up-to-date-пути; e2e-паттерн — в test-plan.
      Класс: MEDIUM → воркер.
- [ ] T14: cli-reference регенерация. Цель: прогон
      `scripts/generate-cli-reference.mjs` — docs/reference/cli.md
      актуален: upgrade (новые флаги --here/--check поведение), sync
      (deprecation-строка), hidden `upgrade-projects` попадёт в справочник
      (генератор берёт весь реестр; ADR-5/D-m4). Входы: ADR-5, design
      «Вне дизайна» (downstream), урок «cli-reference-guard drift».
      Allowlist: docs/reference/cli.md (generated — только генератором),
      при необходимости scripts/generate-cli-reference.mjs. Проверки:
      `npm run check` (guard зелёный). Класс: SIMPLE → lead (запуск
      генератора после T8). Зависимость: T8.

### Ф6 — интеграция, документация, релиз

- [ ] T13: Интеграционная задача (lead). Порядок: влитие волн Ф1→Ф5 в
      `dev/unified-update-2-19-0` (rebase-free, конфликты решает lead);
      перед каждым влитием в main: полный `npm run check` + `npm run e2e`
      (≥1200 с); сквозной сценарий на фикстурном парке (см. test-plan):
      upgrade по парку с mutated/diverged/pinned/worktree — exit-модель 0/1/2,
      повторный запуск идемпотентен (NFR-01 слепки, NFR-02 повтор, NFR-03
      тайминги); package.json `files` + карта в пакете (REQ-12); чекпоинты
      после каждого влития. Реальный парк владельца — НЕ здесь:
      пост-релизный шаг чек-листа (требует глобальной установки 2.19.0).
      AC: e2e зелёный на финальном дереве; артефакт приёмки со слепками.
- [ ] T15: Документация и сайт (раздел ниже) + релизный чек-лист.
      Класс: MEDIUM → lead + воркеры на страницы (один владелец записи на
      README-пару и сайт-навигацию).

## Трассировка REQ/NFR → задачи

| ID     | Задачи              | ID     | Задачи                                    |
| ------ | ------------------- | ------ | ----------------------------------------- |
| REQ-01 | T7, T8              | REQ-09 | T12, T7 (wiring)                          |
| REQ-02 | T7, T8, T9          | REQ-10 | T1                                        |
| REQ-03 | T2, T6              | REQ-11 | T5, T6                                    |
| REQ-04 | T8                  | REQ-12 | T1 (guard) + T13 (карта в пакете) + релиз |
| REQ-05 | T7 (+T3 рендер)     | REQ-13 | T4                                        |
| REQ-06 | T7, T4 (гварды)     | REQ-14 | T9                                        |
| REQ-07 | T2 (инвариант), T11 | REQ-15 | T3 (+T8 --no-banner склейка)              |
| REQ-08 | T10                 | NFR-01 | T2 (атомарность), T13 (слепки)            |
| NFR-02 | T6, T13             | NFR-03 | T6, T13                                   |
| NFR-04 | T2, T6              |        |                                           |

## Документация и сайт (T15; по wolf-release-docs)

### Карта покрытия

| Возможность/утверждение                                    | Страницы                                                                                                              | Источник                   | Проверка                                               |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------ |
| «Одна команда обновляет всё» (upgrade проход по парку)     | README.md + README.ru.md (пара, установка/обновление), docs/site getting-started + upgrade-страница                   | design §«Фазы», T7/T8      | пример на фикстурном парке; вывод помечать «ожидаемый» |
| `wolf upgrade --here` (преемник sync)                      | те же README-пары + upgrade-страница                                                                                  | REQ-14, T9                 | сценарий cwd-проекта                                   |
| deprecated `wolf sync` → upgrade                           | README-пары, CHANGELOG (upgrade notes), cli.md (generated)                                                            | REQ-07, T11, T14           | ссылка на заметку о будущем удалении 2.20.0            |
| Карта обновления (update-map) — «почему сверка по составу» | docs/site upgrade-страница (кратко); docs/concept — оценить: без изменений канона, только пояснение при необходимости | ADR-1, инвентаризация §3.4 | фича-пояснение без изменения концепции                 |
| Стандарт терминального вывода (логотип A, рамки, маркеры)  | README-пары (ожидаемый ASCII-блок, не скриншот), docs/site главная/upgrade                                            | REQ-15, ADR-6, T3          | plain-совместимость примера                            |
| Changelog 2.19.0                                           | CHANGELOG.md → site changelog-страница (синхронно docs:build, sync-changelog.mjs — руками не править)                 | волна целиком              | docs:build зелёный                                     |
| CLI-справочник                                             | docs/reference/cli.md (generated: upgrade/sync/hidden upgrade-projects)                                               | T14                        | cli-reference-guard в npm run check                    |

Требования к примерам: воспроизводимый сценарий `wolf upgrade` на
тестовом парке из фикстур (2–3 проекта: чистый, mutated, pinned);
команды, ожидаемый вывод (помечен «ожидаемый»), наблюдаемые статусы
exit 0/2; отдельный пограничный сценарий — «требует решения» и как
выйти из него. Не выдавать иллюстративный вывод за фактический trace.

### Релизный чек-лист волны 2.19.0

1. Все задачи плана [x] с evidence; ветка влита, `npm run check` + полный
   `npm run e2e` зелёные на main.
2. CHANGELOG.md: пользовательский эффект + upgrade notes (sync→upgrade).
3. `npm version 2.19.0` (package.json — единственный источник, полный
   номер X.Y.Z) — maintainer-шаг.
4. Генерация update-map.json для 2.19.0: version — из package.json после
   bump, prev = 2.18.5; генератор T1 + КУРИРОВАНИЕ состава (категории,
   seed-инструкции) + guard-самопроверка; коммит ДО тега —
   **REQ-12: без карты релиз не выходит**.
5. Тег `v2.19.0`, push с тегом.
6. GitHub Release (объект, не только тег) — автопубликация: github, npm
   publish (OIDC), docs.
7. Сайт: `docs:build` → deploy-docs из main; changelog-страница синхронна.
8. Пост-верификация: `npm view mister-wolf@2.19.0`, `gh release list`,
   сайт обновлён, update-map.json в опубликованном пакете
   (`npm pack --dry-run` или распаковка tarball).
9. Приёмка на реальном парке владельца: один `wolf upgrade` —
   соответствие карте/штампы/лица, тайминг по NFR-03 AC, слепки в
   артефакт приёмки (метрика успеха §1 requirements).
10. wolf brief владельцу: релизная сводка.

## Открытые вопросы плана

1. Паттерн e2e для re-exec (spawn бинарника в тестах): фикстура
   «фейковый bin/wolf» vs реальный dist — фиксируется в wolf-testplan до
   старта Ф5.
2. Входит ли ASCII-блок вывода в README EN/RU оба или только EN с
   ссылкой — решение в T15 по правилу пар (смысл совпадает; объём может
   отличаться).

## Риски и откаты

- syncBaseSet → tmp+rename (T2): риск регрессии синка — существующие
  тесты outcomes + новый атомарность-тест; откат — точечный revert
  обвязки, режим seed-missing-only не зависит от способа записи.
- Общий файл memory-upgrade.ts (T9/T10/T8): сериализация задач, дифф
  конфликтов мал; при конфликте — резолв lead по design-контракту.
- Re-exec на старых платформах (spawn/env): тест фикстурой в T8; риск
  низкий (Node-контракт).
- Сеть push (SSL_ERROR_SYSCALL): повтор с паузой 15–60 с (известный
  паттерн сессии).
- Расширение scope воркерами: allowlist строг; выход за пределы →
  NEEDS_CONTEXT, не самодеятельность.

## Журнал

- 2026-10-23: Ревью плана (0 critical / 2 major / 4 minor) — применено
  P1–P6: T7 +T12 wiring (REQ-09) и сценарии REQ-02 AC3 / REQ-01 AC2;
  пост-релизная приёмка на реальном парке (чек-лист п.9, пометка в T13);
  Ф4 — T9→T10→T8 строго последовательно (общий файл); чек-лист —
  npm version до генерации карты (version из package.json), карта
  курируется и коммитится до тега; T10 → MEDIUM и источник контент-diff
  syncBaseSet/templates (не T5); трассировки REQ-09/REQ-02 уточнены.
  Статус: draft.
