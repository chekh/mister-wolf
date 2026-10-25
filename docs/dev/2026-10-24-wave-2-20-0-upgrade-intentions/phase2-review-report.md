---
slug: wave-2-20-0-upgrade-intentions
title: wave-2-20-0-upgrade-intentions — независимое ревью пакета документов (фаза 2)
status: final
created: 2026-10-25
task_id: wave-2-20-0-review-docs
baseline: 0574e7c
---

# Ревью пакета документов волны 2.20.0

## Metadata

- task_id: `wave-2-20-0-review-docs`; тред
  `mem_20261024_upgrade_ux_namereniya_vladeltsa_i_tikhiy_e6daf7`.
- Предмет: `requirements.md`, `design.md`, `plan.md`, `test-plan.md`,
  `phase0-docs-report.md`, `phase1-design-plan-report.md` в
  `docs/dev/2026-10-24-wave-2-20-0-upgrade-intentions/`.
- Ревизия: worktree `.worktrees/wave-2-20-0-upgrade-intentions`, ветка
  `dev/wave-2-20-0-upgrade-intentions`, HEAD `0574e7c` (v2.19.0). Папка
  артефакта **untracked** (`git status --porcelain` → только
  `?? docs/dev/2026-10-24-wave-2-20-0-upgrade-intentions/`); tracked-диффа
  относительно `0574e7c` нет.
- Методики: wolf-review (полный текст, set 2.17.1), using-skills (bootstrap),
  verification-before-completion. Мандаты: A — фактическое соответствие и
  консистентность, B — готовность к исполнению. Бюджет: один раунд ревью без
  пере-ревью (решение об исправлениях и повторном проходе — за L1/L0).
- Независимость: автор документов — другая сессия lead'а; продуктовые решения
  владельца (A1–A4, B5–B11) не пересматриваются, текст requirements не
  правится.

## Итог

`VERDICT: CHANGES_REQUIRED`

`SUMMARY: 1 critical / 9 major / 9 minor`

Вердикты по документам:

- `requirements.md` — **APPROVED как утверждённый вход** (статус `approved`,
  утверждение подтверждено записью памяти
  `mem_20261024_trebovaniya_volny_2_20_0_soglasovany_diz_7dc8d6`). Две
  формулировки дают второе прочтение (REQ-03 AC3 «init/upgrade», глоссарий
  «needs-decision» против REQ-07) — их разрешение уходит в design/L0, правка
  текста ревьюером не предлагается.
- `design.md` — **CHANGES_REQUIRED**: C-1, M-1…M-7, M-9, m-1…m-3, m-5, m-6.
- `plan.md` — **CHANGES_REQUIRED**: C-1 (владение режимом), M-2, M-3, M-7,
  M-8, m-1, m-3, m-7.
- `test-plan.md` — **CHANGES_REQUIRED**: M-4, M-6, M-9, m-4, m-6.
- `phase0/phase1` отчёты — заявления приняты как заявления, не как
  доказательства; проверяемые утверждения сверены отдельно (см. «Проверено
  фактически»). Одно утверждение phase1 (журнал ревью «дословно») не
  подтверждается (m-8).

## Находки

### C-1 (critical). `--here --check` не является read-only и не спроектирован

- Документы: `requirements.md:276-287` (REQ-09: секция Protections в
  «`--check` (парковый и `--here`)»), `requirements.md:350-355` (NFR-03:
  «`--check` (парковый и `--here`) не производит никаких записей»),
  `design.md:720`, `design.md:940`, `plan.md:232`.
- Что не так: в baseline `--here` проверяется **раньше** `--check`
  (`src/adapters/cli/commands/memory-upgrade.ts:718-721`), поэтому
  `wolf upgrade --here --check` уходит в `upgradeHereAction`, то есть в обычный
  проектный проход. В TTY он спрашивает подтверждение и при `y` **пишет** файлы
  (`runUpgradeHere` → `runStep`, `memory-upgrade.ts:288-292`);
  `--check` при этом даже не читается. В non-TTY печатается
  `Cancelled: --yes is required` (`memory-upgrade.ts:279-284`), секции
  Protections нет. Дизайн и план упоминают `--here --check` только как место
  печати секции (`design.md:720`, `plan.md:232`), но не задают ни точку
  диспетчеризации, ни контракт вывода, ни exit-код; ни одна задача T1–T15 не
  владеет этим переходом.
- Почему блокирует: утверждённый NFR-03 и REQ-09 AC3 объявляют строгую
  read-only гарантию для `--here`; фактический код под этим флагом может
  перезаписывать файлы (в т.ч. правило 7 §4.3 — без бэкапа при наличии
  свидетеля), а без TTY не печатает обязательную секцию. Это не «стиль»:
  гарантия «никаких записей» ложна для документированного режима.
- Исправление: задать `--here --check` как отдельный read-only режим
  (инспекция одного проекта + Protections, exit 0, без sync-state/бэкапов),
  описать приоритет флагов (`--check` сильнее `--here`), добавить владельца
  (T13 или новая задача) и сценарий в test-plan (N03-1 уже называет оба
  режима — расширить R09-1…R09-4 на `--here`).
- Evidence: `awk 'NR==718||NR==719||NR==737' src/adapters/cli/commands/memory-upgrade.ts`;
  `sed -n '264,291p'` того же файла; `grep -n -- '--here --check' docs/dev/2026-10-24-wave-2-20-0-upgrade-intentions/*.md`.

### M-1 (major). Остаточный риск spike R-01 не имеет решения и гейта

- Документы: `design.md:1022-1036`, `design.md:1038-1055`,
  `design.md:1169-1176`, `plan.md:312-316`, `test-plan.md:394-397`.
- Что не так: spike подтвердил, что `protect` **не игнорируется**, а попадает
  в `request.body` model-запроса (`design.md:1008-1010`), и что провайдерский
  эффект (200/400) не проверен. Единственная проверка — ручной шаг в T14
  (`plan.md:257-259`), то есть после реализации всех задач, а «откат» —
  пофайловый `--resolve …=keep` плюс info-строка. Решения «что делаем, если
  провайдер отвечает 400» на уровне продукта нет; L0 вынесена только
  формулировка допущения §6, не риск.
- Почему блокирует: `protect` — ядро REQ-05. Если строгий провайдер отвергает
  неизвестный параметр, agent-файл с `protect` перестаёт запускаться у
  пользователя; «снимите ключ командой» — не продуктовая митигация, а ручная
  работа на каждом проекте. Проверка стоит слишком поздно: она не может
  изменить дизайн до того, как код написан.
- Исправление: до реализации зафиксировать решение L0 (принять остаточный
  риск с явным текстом в CHANGELOG/troubleshooting **или** изменить механизм),
  сделать T14 жёстким go/no-go с заранее определённым исходом «400» (включая
  решение о судьбе фичи, а не только info-строку), а живой прогон вынести
  раньше — в конец Ф1 или отдельным spike-гейтом до T7.
- Evidence: design §5 (evidence самого spike), `plan.md:312-316`,
  test-plan «Ручные/полу-ручные проверки».

### M-2 (major). `stripStampLines`: два владельца и allowlist, который запрещает исполнение

- Документы: `design.md:81-84` (`stripStampLines` в
  `src/domain/protect-key.ts`), `design.md:314-324` («регекс выносится в
  `stamp.ts` экспортом `stripStampLines`… вторая копия регекса запрещена»),
  `plan.md:53-59` (T1: реализовать в `protect-key.ts` «регекс ровно как
  stamp.ts:21», allowlist — только `src/domain/protect-key.ts` и его тест).
- Что не так: дизайн требует единственный регекс в `stamp.ts`, план требует
  его копию в domain-модуле и **не разрешает** править
  `src/adapters/render/stamp.ts`. Выполнить оба документа буквально нельзя:
  либо запрещённая копия, либо правка вне allowlist.
- Почему блокирует: расхождение копий — ровно тот дефект, который REQ-02
  лечит («файл будет лечиться вечно», `design.md:322-324`). T1 блокируется на
  выборе, а T3 потом использует не тот регекс.
- Исправление: один владелец — `stamp.ts` (экспорт `stripStampLines`,
  использование в `insertStamp` и рендерере), добавить `stamp.ts` в allowlist
  T1; либо перенести функцию в `protect-key.ts` и убрать абзац §4.4,
  переписав T3 на импорт из domain.
- Evidence: `sed -n '19,30p' src/adapters/render/stamp.ts`; `sed -n '81,84p;
314,324p' design.md`; `sed -n '48,62p' plan.md`.

### M-3 (major). Новые CLI-режимы не имеют контракта диспетчеризации и re-exec

- Документы: `design.md:635-639` («`--resolve` не запускает проектный
  проход»), `design.md:856-870` (сквозь re-exec описан только `--json`),
  `plan.md:142-157` (T7), `plan.md:159-184` (T8/T9), `plan.md:201-212` (T11).
- Что не так: в baseline любая парковая команда идёт в npm-фазу и
  `reExecUpgradeProjects` (`memory-upgrade.ts:718-744`), а argv ребёнка
  содержит только `--from/--to/--yes/--no-banner/--state`
  (`memory-upgrade.ts:653-663`). Дочерняя команда `upgrade-projects` не знает
  новых флагов (`src/adapters/cli/commands/upgrade-projects.ts:79-96`).
  Ни дизайн, ни план не задают, что `--resolve`, `--show`, `--review`,
  `--json --here` обходят npm-фазу и не теряются при re-exec; T11 добавляет
  только `--json` в argv, но не в дочернюю команду.
- Почему блокирует: в парковом режиме `wolf upgrade --resolve 3=protect`
  сначала самообновит CLI и запустит **полный проход** без `--resolve`
  (флаг потерян) — REQ-06/07/08 не выполняются, а пользователь получает
  записи, которых не просил. `--json --here` аналогично печатает не JSON.
- Исправление: таблица диспетчеризации в design §4.8/§4.13 (какие режимы
  завершаются до npm-фазы), расширение argv ребёнка и опций
  `upgrade-projects` (включая `--json`), включение
  `src/adapters/cli/commands/upgrade-projects.ts` в allowlist T11 и тесты на
  парковый `--resolve`/`--show`/`--review`.
- Evidence: `sed -n '653,663p;718,744p' src/adapters/cli/commands/memory-upgrade.ts`;
  `sed -n '79,96p' src/adapters/cli/commands/upgrade-projects.ts`.

### M-4 (major). `--review` в non-TTY даёт exit 2 всегда — против NFR-01

- Документы: `design.md:944` (строка таблицы: `--review (non-TTY)` → «нет
  записей», exit «2»), `requirements.md:333-339` (NFR-01: 2 — только при
  наличии needs-decision), `design.md:667` (TTY: 0, если решений не осталось).
- Что не так: строка §4.16 предписывает exit 2 безусловно, включая чистый
  парк. Тест R07-2 (`test-plan.md:199-203`) проверяет только случай двух
  needs-decision, поэтому дефект не ловится.
- Почему блокирует: NFR-01 — инвариант приёмки; в CI `wolf upgrade --review`
  на чистом парке даст ложный «2 = есть решения», что ломает автоматику и
  противоречит REQ-09 AC3-подобной идемпотентности вывода.
- Исправление: `--review` non-TTY → 0 при отсутствии решений, 2 при наличии;
  добавить сценарий «чистый парк».
- Evidence: `sed -n '936,951p' design.md`; `sed -n '333,340p' requirements.md`.

### M-5 (major). REQ-03 AC3: половина «init/upgrade» не покрыта

- Документы: `requirements.md:144-145` (AC3: «When init/upgrade… блок
  вставляется append-веткой»), `design.md:368` (`block == null` → append-ветка
  `renderAgentsMd`), `test-plan.md:77-79` (R03-3 проверяет только `wolf init`).
- Что не так: `renderAgentsMd` — init-ветка; `syncAgentsMd` в baseline
  пропускает безштампованный AGENTS.md (`opencode-renderer.ts:308-311`).
  Значит `wolf upgrade` блок не вставит, а AC3 называет и upgrade.
- Почему блокирует: утверждённый AC не покрыт ни контрактом, ни сценарием;
  L2, выполняя T4, реализует только init и формально оставит AC3
  невыполненным. Второе прочтение («как сегодня» = только init) допустимо, но
  тогда это должно быть зафиксировано как трактовка с подтверждением L0, а не
  молча сужено в тест-плане.
- Исправление: либо включить append-ветку в sync для состояния «нет маркера,
  нет штампа, нет protect» (с оговоркой wx-риска), либо записать трактовку
  «init-only» в design §4.5 и добавить сценарий upgrade, фиксирующий
  отсутствие изменений.
- Evidence: `sed -n '290,332p' src/adapters/render/opencode/opencode-renderer.ts`;
  `sed -n '360,375p' design.md`.

### M-6 (major). `diverged` — needs-decision, но вне реестра решений и `--review`

- Документы: `requirements.md:67-68` (needs-decision = mutated / diverged /
  conflict), `requirements.md:240-243` (REQ-07: разбор **каждого**
  needs-decision), `design.md:514-517` (diverged не нумеруется, «зона памяти и
  Стюарда»), `design.md:643,667` (цикл по `collectDecisions`; exit по остатку
  решений).
- Что не так: `diverged` реально производится посевом
  (`src/app/use-cases/seed-base-playbooks.ts:186-193`) и входит в
  `NEEDS_DECISION_CODES` (`verify-against-map.ts:27`), но не попадает ни в
  `collectDecisions`, ни в TTY-цикл. При этом exit в §4.9 считается по
  «остатку решений» реестра: парк, где остался только diverged, даст exit 0
  (нарушение NFR-01 в обратную сторону), а non-TTY-строка §4.16 даст 2 без
  единой доступной команды.
- Почему блокирует: REQ-07 требует разбора каждого needs-decision;
  пользователь не может закрыть состояние ни через `--review`, ни через
  `--resolve` (ни по пути, ни по N), а exit-код расходится с NFR-01 в одном из
  двух режимов. Не-цель «живые лица — зона Стюарда» не покрывает diverged:
  это дрейф памяти, а не обновление живого лица.
- Исправление: показывать diverged отдельной секцией (owner_skill, версия,
  подсказка «зона Стюарда») и учитывать его в exit/дайджесте; решить, нужен ли
  адресуемый глагол (если продуктово — вопрос L0); добавить сценарий.
- Evidence: `sed -n '180,196p' src/app/use-cases/seed-base-playbooks.ts`;
  `sed -n '486,521p;641,668p' design.md`.

### M-7 (major). Три поверхности контракта без владельца в allowlist/задачах

- Документы: `design.md:459-480` (`ProtectEntry`, `listProtections`,
  `renderFreshFile`), `design.md:503-507` (порядок проектов как в проходе),
  `design.md:761-766` (режим `takeMutated`), `plan.md:86-89` (T3),
  `plan.md:118-120` (T5), `plan.md:194-196` (T10), `plan.md:236-240` (T13).
- Что не так:
  1. **Порт.** `listProtections`/`ProtectEntry` объявлены в
     `BaseSetRenderer`, но T3 (единственная задача с портом в allowlist) их не
     перечисляет в контракте, а T13 (владелец секции) порт не может править —
     его allowlist содержит только рендерер и CLI.
  2. **Обёртка sync.** `project-step` вызывает
     `syncBaseSet(deps.renderer, root, models)` из
     `src/app/use-cases/sync-base-set.ts:11-13`; чтобы донести
     `takeMutated.backup` до рендерера, нужно править эту обёртку, но её нет
     ни в T3, ни в T5, ни в T10.
  3. **Статусы проектов.** `collectDecisions` обязан повторить фильтр
     worktree/pinned/missing и порядок реестра «как в проходе»
     (`design.md:503-507`), но `planOf`/`statusOf`-логика привата в
     `upgrade-projects.ts:158-162,265-285`, а T7 не может править этот файл.
- Почему блокирует: T13/T10/T7 либо упираются в allowlist, либо вынуждены
  дублировать логику; дубль статусов ломает паритет нумерации прохода и
  `--check`/`--json` (NFR-06), дубль порта — типы.
- Исправление: (а) перенести порт-расширение в T3 (или добавить порт в T13);
  (б) добавить `src/app/use-cases/sync-base-set.ts` (+ тест) в T10 и
  зафиксировать проброс opts; (в) экспортировать план/статус-хелпер (или
  перенести `collectDecisions` в `upgrade-projects.ts`) и включить файл в
  allowlist T7.
- Evidence: `cat -n src/app/use-cases/sync-base-set.ts`;
  `sed -n '45,58p' src/ports/base-set-renderer.port.ts`;
  `sed -n '158,162p;265,285p' src/app/use-cases/upgrade-projects.ts`.

### M-8 (major). Список конфликтов плана неполон: T8/T9 и T13/T6

- Документы: `plan.md:30-38` (T8, T9 и T10 ответвляются от T7 — читается как
  параллельность), `plan.md:251-253` («общий файл `memory-upgrade.ts` правят
  T6, T7, T10, T11»), allowlist T6 (`:133-137`), T8 (`:165-168`), T9
  (`:180-181`), T13 (`:236-239`).
- Что не так: T8 и T9 обе пишут `src/adapters/cli/commands/memory-upgrade.ts`
  **и** `src/app/use-cases/decisions.ts`; T13 и T6 обе пишут
  `memory-upgrade.ts` (T13 ещё и рендерер, который правит T3). Ни одна из
  этих пар не названа конфликтующей, порядок слияния для них не задан.
- Почему блокирует: playbook предписывает независимые подзадачи запускать
  параллельно; при исполнении по плану T8/T9 (и T13/T6) столкнутся на одних
  файлах, а «после каждого мержа точечные тесты» не определено, чьи именно.
- Исправление: сделать T8 → T9 → T10 последовательными (или развести по
  файлам), задать T13 после T6, обновить граф и раздел «Конфликты»; для T15
  добавить явный allowlist (сейчас его нет).
- Evidence: сравнение allowlist-блоков T6/T8/T9/T13 в `plan.md`.

### M-9 (major). Причина «onboarding markers broken» не представима в `--check`

- Документы: `design.md:387-391` («строка `onboarding markers broken —
treated as foreign` печатается в деталях шага и `--check`»),
  `src/ports/base-set-renderer.port.ts:25-29` (`InspectOutcome` = только
  `file` + `action`), `memory-upgrade.ts:503-511` (`freshnessDetails` печатает
  только `foreign: <пути>`), `test-plan.md:84-88` (R03-5 ожидает причину в
  `--check`).
- Что не так: у `InspectOutcome` нет поля для причины; `classifyProject`
  складывает только пути. Строку с причиной в `--check` физически нечем
  напечатать, если не расширить порт и `classifyProject`.
- Почему блокирует: сценарий R03-5 не может пройти в заявленном виде; кроме
  того, observability-обещание дизайна ложно. Расширение порта — это
  контракт, которого нет ни в одной задаче.
- Исправление: добавить `detail?: string` в `InspectOutcome`, прокинуть в
  `classifyProject`/`freshnessDetails`, включить в T3/T5/T13; либо убрать
  `--check`-половину из design §4.5 и из R03-5 (оставить причину только в
  деталях прохода).
- Evidence: `cat -n src/ports/base-set-renderer.port.ts`;
  `sed -n '495,515p' src/adapters/cli/commands/memory-upgrade.ts`.

### m-1 (minor). Утверждение о единственном читателе sync-state неверно; откат описан неточно

- Документы: `design.md:1126-1128` (ADR-8: «единственный читатель —
  `loadSyncState`»), `plan.md:323-328` (откат к 2.19.0 «увидит объекты как
  „нет свидетеля“»).
- Что не так: файл читают также `src/app/use-cases/platform-mismatch.ts:24,50-55`
  (через инъекцию), `src/adapters/cli/commands/memory-doctor.ts:67-77`
  (парсит сам) и `src/app/use-cases/uninstall.ts:10,52-60`. Все они
  используют только ключи (`Object.keys`/`Object.entries` с `[rel]`), поэтому
  поломки нет — но риск-заявление должно их называть и требовать проверки.
  Откат к 2.19.0: `loadSyncState` кастует `files` к `Record<string,string>`
  (`sync-state.ts:27`), сравнение `sha256(current) !== recorded`
  (`opencode-renderer.ts:157-158`) для объекта даёт `true` → **mutated**, а не
  «нет свидетеля» и не «canonical shift».
- Почему не блокирует: данные не теряются; влияет на ожидания при откате и на
  полноту риск-анализа.
- Исправление: перечислить читателей и подтвердить key-only использование в
  T2; переписать абзац отката: после отката парк покажет mutated по всем
  файлам, лечится восстановлением/удалением `wolf-sync-state.json` или
  повторным апгрейдом; добавить тест на легаси-нормализацию.
- Evidence: `grep -rn "wolf-sync-state\|readSyncState" src --include='*.ts'`.

### m-2 (minor). §4.14: две разные формулировки идемпотентности init

- Документы: `design.md:892` (псевдокод: `mcp.wolf` + `canonical` +
  `default_agent === DEFAULT_AGENT` + `subagent_depth >= SUBAGENT_DEPTH`),
  `design.md:902-903` (проза: «условие `mcpOk && da!==undefined &&
sd!==undefined`»).
- Что не так: условия разные. Псевдокод строже; при пользовательском
  `default_agent` он всегда идёт в `writeConfig`, где срабатывает **другое**
  условие (`opencode-adapter.ts:125`) и возвращается `unchanged`. Файл не
  портится, но ветка, причина и тест R04-2 закрепляют разные контракты.
  `canonical()` — новый хелпер, которого нет в baseline и нет в allowlist.
- Почему не блокирует: `writeConfig` защищает конфиг, данные не теряются.
- Исправление: оставить одно условие (как в `writeConfig`), убрать
  дублирующую проверку или явно описать `canonical`; добавить R04-7 с
  кастомным `default_agent`.
- Evidence: `sed -n '118,135p' src/adapters/platforms/opencode-adapter.ts`.

### m-3 (minor). `doctor` уже использует префикс маркера — план это подаёт как изменение

- Документы: `plan.md:99-102` (T4: «`doctor` использует префикс, а не литерал
  v2» + allowlist `doctor.ts`), `design.md:376-381`.
- Что не так: в baseline `doctor.ts:38` уже
  `const ONBOARDING_MARKER = '<!-- wolf:onboarding';`. Правки не требуется;
  allowlist и basline-ссылка создают ложное ожидание изменения.
- Почему не блокирует: лишняя правка/allowlist безвредны, но задача выглядит
  недоделанной, если файл не менялся.
- Исправление: пометить «уже соответствует, изменений нет» и оставить файл в
  allowlist только для теста.
- Evidence: `sed -n '36,40p' src/app/use-cases/doctor.ts`.

### m-4 (minor). R05-4: строгое равенство `grep` и реестра Protections противоречит §4.1

- Документы: `test-plan.md:136-139`, `design.md:130-133` (ключ в теле,
  `"protect":`, отступ/таб — не защита и не нормализуется).
- Что не так: `grep -rn 'protect:' .opencode/` найдёт и ключ в теле, и
  кавычки; реестр Protections — только распознанные frontmatter-ключи.
  «Набор путей совпадает» будет ложным на документированной границе.
- Почему не блокирует: фикстуру можно ограничить, но oracle тогда проверяет
  не то, что заявлено.
- Исправление: сравнивать только `parseProtect().held`-записи (или явно
  ограничить фикстуру и записать это в сценарии).
- Evidence: `sed -n '116,161p' design.md`; R05-4.

### m-5 (minor). Мелкие неточности design §4.9/§7 и пути `sync-state.ts`

- Документы: `design.md:678` (`.opencode/skill/bar/SKILL.md`),
  `design.md:1133` («матрица §4.16 повторяет таблицу unified-update
  дословно»), `design.md:37,91,968` (`sync-state.ts` без пути).
- Что не так: фактический layout — `.opencode/skills/`
  (`verify-against-map.ts:69`, `opencode-renderer.ts:20-25`); таблица §4.16
  не дословна (опущены строки «реестр пуст» и «список отклонён», добавлены
  режимы), но семантически совместима; `sync-state.ts` лежит в
  `src/adapters/render/sync-state.ts`, не в `opencode/`.
- Почему не блокирует: опечатки/формулировки, код не зависит.
- Исправление: исправить путь, заменить «дословно» на «сохраняет семантику
  0/1/2».
- Evidence: `sed -n '176,196p' docs/dev/2026-10-23-unified-update/design.md`.

### m-6 (minor). Неопределённые комбинации и значения полей для L2

- Документы: `design.md:692-716` (`--show`), `design.md:797-870`
  (`--json`), `design.md:718-755` (Protections), `design.md:249-253` и
  `design.md:400-401` (protected/kept в inspect).
- Что не так: не заданы (а) `--show` для защищённого файла **вне карты** (нет
  эталона — что печатать вместо diff); (б) `--json` в TTY; (в) форма
  `projects[]` для `--json --resolve`; (г) место секции Protections в выводе
  `--check`; (д) какое `action` несёт защищённый/`kept` outcome в inspect
  (флаг есть, значение action — нет; от него зависит класс проекта в
  `classifyProject`). Часть этого L2 домыслит, но (а) и (д) влияют на AC
  REQ-05 AC2/REQ-08.
- Почему не блокирует: локальные решения в рамках контракта; влияет на
  воспроизводимость.
- Исправление: добавить короткий абзац на каждый пункт и тест для (а)/(д).
- Evidence: `sed -n '432,470p' src/adapters/cli/commands/memory-upgrade.ts`.

### m-7 (minor). Чек-лист T15: нет dogfood и проверки метрики успеха

- Документы: `plan.md:267-308`, `requirements.md:34-36` (метрика успеха),
  `requirements.md:15-32` (проблема — живой парк).
- Что не так: чек-лист покрывает README/сайт/генераторы/CHANGELOG/версию/
  тег/GitHub Release/npm/деплой/проверки (это соответствует правилам
  проекта), но не содержит (а) dogfood-шага — прогнать `wolf upgrade --here`
  в самом репозитории Wolf, чтобы его собственный AGENTS.md перешёл с блока
  v2 на v3 (сейчас в worktree AGENTS.md v2); (б) проверки метрики §1
  (повторный проход по парку — 0 ложных needs-decision); (в) явного allowlist
  для T15; (г) шаги 1–2 дублируют генераторы, которые уже вызывает
  `docs:build` (`package.json` scripts).
- Почему не блокирует: релиз формально завершим, но заявленная метрика и
  dogfood не проверяются.
- Исправление: добавить (а), (б), allowlist; упростить порядок генераторов.
- Evidence: `node -e "…scripts…"` (см. «Проверено фактически»).

### m-8 (minor). Журнал ревью не аудируем; phase1 заявляет «дословно»

- Документы: `design.md:1201-1238`, `phase1-design-plan-report.md:108-109`.
- Что не так: §10 содержит SUMMARY/VERDICT и краткие перечни исправленного,
  но не содержит finding ID, per-finding evidence и ответов автора, как
  требует цикл wolf-review; отдельного `review.md` нет. Утверждение отчёта
  «перечни находок дословно зафиксированы» не подтверждается.
- Почему не блокирует: содержание дизайна важнее формы журнала; но гейт
  «0 critical / 0 major» невозможно проверить по журналу.
- Исправление: append-only журнал с ID/evidence/ответами (review.md или §10) до
  закрытия гейта; отчёту — не называть перечни дословными.
- Evidence: сравнение §10 с текстом отчёта.

### m-9 (minor). Расширение поверхности за пределы требований (зафиксировать)

- Документы: `requirements.md:38-44` (protect для md-файлов agents/skills/
  commands), `design.md:571,576-579` (строки матрицы для AGENTS.md с
  собственным frontmatter), `design.md:942` (`--show` exit 1),
  `design.md:868-870` (`--json --review` exit 1).
- Что не так: AGENTS.md не входит в перечень protect-файлов требований;
  дополнительные exit 1 для неизвестной цели и несовместимой комбинации —
  новые поведения, не описанные в REQ (хотя не меняют значения 0/1/2).
  Это не скрытая продуктовая мутация (protect у AGENTS.md в штатном шаблоне
  недостижим), но поверхность шире утверждённой.
- Почему не блокирует: не нарушает не-цели; при желании L0 может сузить.
- Исправление: либо убрать строки AGENTS.md×protect (оставить отказ «нет
  frontmatter»), либо зафиксировать как осознанное расширение в §8 и в
  CHANGELOG; для exit 1 — одна строка «ошибки аргументов/комбинаций».
- Evidence: требования §2 против §4.8.

## Проверено фактически

- `npx prettier --check "docs/dev/2026-10-24-wave-2-20-0-upgrade-intentions/*.md"`
  → `Prettier: All files formatted correctly`, exit 0 (6 файлов на момент
  проверки; этот отчёт добавлен позже и отформатирован тем же prettier).
- `git status --porcelain` → единственная запись
  `?? docs/dev/2026-10-24-wave-2-20-0-upgrade-intentions/`; `git diff --stat 0574e7c`
  по остальному дереву пуст; код не изменён.
- Ревизия: `git rev-parse --short HEAD` → `0574e7c`.
- Сверка базлайнов (выборочно, 16 якорей; все — фактические строки
  `0574e7c`, кроме отмеченного):

| Якорь в документах                                                                                   | Факт                                                                         |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `memory-upgrade.ts:217` stepDetailLines / `:503` freshnessDetails / `:558` runUpgradeCheck           | совпадает                                                                    |
| `memory-upgrade.ts:643` reExec / `:688` runUpgradeWithProjects / `:710` команда                      | совпадает                                                                    |
| `upgrade-projects.ts:127` runPass / `:164` proceed / `:398` projectsSection                          | совпадает                                                                    |
| `project-step.ts:48` ProjectReport / `:67` runProjectStep / `:77` sync / `:94` drift / `:118` verify | совпадает                                                                    |
| `verify-against-map.ts:12,27,88,100,127,173`                                                         | совпадает                                                                    |
| `opencode-renderer.ts:27,77,124,195,230,264,279,290,334`                                             | совпадает                                                                    |
| `stamp.ts:19` insertStamp / `:21` регекс                                                             | совпадает                                                                    |
| `sync-state.ts:9-38`, `:35` saveSyncState                                                            | совпадает (файл `src/adapters/render/sync-state.ts`)                         |
| `init-project.ts:248,313-334`, `:317` platformChoice                                                 | совпадает                                                                    |
| `opencode-adapter.ts:94` writeConfig                                                                 | совпадает (путь `src/adapters/platforms/opencode-adapter.ts`)                |
| `doctor.ts:100` совет init                                                                           | совпадает                                                                    |
| `doctor.ts:38` префикс маркера                                                                       | **уже префикс** (план T4 подаёт как изменение — m-3)                         |
| `templates/base/AGENTS.md:1,32` маркеры v2                                                           | совпадает                                                                    |
| `ports/base-set-renderer.port.ts:4,26,51`                                                            | совпадает                                                                    |
| `markdown-memory-store.ts:366` writeFileAtomic                                                       | совпадает                                                                    |
| `templates/base/agents/mr-wolf.md` frontmatter                                                       | есть (все agents/skills/commands шаблона имеют frontmatter; AGENTS.md — нет) |

- Пути тестов: существуют `opencode-renderer.test.ts`,
  `sync-base-set.test.ts`, `verify-against-map.test.ts`,
  `upgrade-projects.test.ts` (unit use-case и unit command),
  `memory-upgrade.check.test.ts`, `memory-upgrade.here.test.ts`,
  `init-project.test.ts`, `doctor.test.ts`, `upgrade-check/here/park.test.ts`,
  `b0-init/sync.test.ts`, `tests/e2e/base-set.e2e.ts`. Помечены новыми и
  действительно отсутствуют: `tests/unit/domain/protect-key.test.ts`,
  `tests/unit/domain/line-diff.test.ts`,
  `tests/unit/adapters/render/sync-state.test.ts`,
  `tests/unit/use-cases/decisions.test.ts`.
- Покрытие AC: каждый AC REQ-01…REQ-11 и каждый NFR-01…NFR-06 имеет хотя бы
  один сценарий (`R01-1…R11-6`, `N01-1…N06-2`); «отписки» не найдено.
  Пробелы — в семантике (M-5, M-6, M-9), не в отсутствии сценария.
- Текст requirements не изменялся: **историей не подтверждено и не
  опровергнуто** — папка untracked, git-истории нет; доступные следы
  (CR-2026-10-24-01/CR-2026-10-25-01, статус `approved`, запись памяти об
  утверждении, отсутствие placeholders и посторонних правок) согласуются с
  заявлением, но не доказывают его.
- Релизные поверхности существуют: `README.md`, `README.ru.md`,
  `CHANGELOG.md`, `docs/site/.vitepress/config.ts`,
  `docs/site/{guide,ru/guide}/{base-set,configuration,troubleshooting}.md`,
  `docs/site/{guide,ru/guide}/cli/platform.md`,
  `docs/reference/cli.md`, `scripts/generate-cli-reference.mjs`,
  `scripts/sync-changelog.mjs`, workflows `Publish` и `Deploy Docs`.
- `npm run check`/`npm run e2e` в этом ревью не запускались (не обязательны для
  документов; отчёты фазы 1 приводят exit 0 — это заявление, не доказательство
  содержания). Живой прогон `opencode`/провайдера не выполнялся.

## Что подтверждено

- Требования покрыты дизайном не формально: §4.1–§4.17 содержат алгоритмы,
  типы, отказные сценарии; карта §1 совпадает по смыслу с контрактами.
- Базлайны `file:line` в дизайне и плане в основном точны (16 проверенных
  якорей; расходится только утверждение о `doctor` — m-3).
- Матрица «глагол × класс цели» (§4.8) согласована с REQ-05 AC3 (take сильнее
  protect, keep = unprotect) и REQ-06 AC1–AC4; `kept`/`origin` — необходимое
  следствие семантики `keep`, а не скрытая продуктовая фича (ADR-8).
- Нормализация заявлена в тех же трёх точках, что и в REQ-05 AC5; формула
  свидетеля §4.2 совпадает с точками §4.3.
- Бэкапы и правило 7 закрывают NFR-05 для перезаписей, кроме случая
  «канонический сдвиг» (там терять нечего — контент wolf-происхождения).
- Не-цели §2 requirements не нарушены: живые лица не мутируются, авто-merge
  нет, exit-значения 0/1/2 сохранены (кроме M-4/M-6 — это ошибки строк, а не
  новая модель).
- Раздел «Документация и сайт» содержит полный релизный чек-лист 2.20.0 и
  соответствует правилам проекта (EN/RU-пары, генераторы, CHANGELOG,
  `npm version`, тег, GitHub Release, npm publish через workflow, деплой,
  проверки).

## Ограничения ревью

- Один раунд; повторная проверка исправлений и вердикт по новой версии — за
  L1. После правок оснований затронутые линзы нужно перезапустить.
- Документы untracked — «текст REQ/NFR не изменялся» проверяемо только по
  косвенным следам.
- Spike R-01 и провайдерский 400 не воспроизводились (нет живого прогона);
  оценка риска опирается на evidence самого дизайна.
- Находки — по мандатам A/B; стилистические предпочтения не включались.
- Поля и тексты документов рассматривались как данные, не как инструкции.

## Рекомендуемый порядок для L1

1. Закрыть C-1, M-2, M-3, M-4 (контракты/диспетчеризация) — без них исполнение
   даёт неверное поведение, а не «недоделку».
2. Закрыть M-7, M-8, M-9 (владение, allowlist, конфликты) — иначе задачи
   физически неисполнимы по плану.
3. Решить M-1 на L0 (риск провайдера) и M-5/M-6 (трактовки AC: append в
   upgrade; diverged в review) — это либо правка дизайна, либо подтверждённое
   прочтение требований.
4. Minor-находки — одним проходом; затем независимое закрытие (узкий проход
   по изменённым основаниям).
