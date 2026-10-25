---
slug: wave-2-20-0-upgrade-intentions
title: wave-2-20-0-upgrade-intentions — ревью Ф1 (ядро, T1–T6)
status: complete
created: 2026-10-25
task: wave-2-20-0-review-f1
thread: mem_20261024_upgrade_ux_namereniya_vladeltsa_i_tikhiy_e6daf7
branch: dev/wave-2-20-0-upgrade-intentions
reviewed_range: 6b7682e..47abbfa
base_code: 0574e7c
---

# Ф1 — независимое ревью кода (T1–T6)

VERDICT: CHANGES_REQUIRED
SUMMARY: 0 critical / 1 major / 9 minor

## Metadata

- task_id: `wave-2-20-0-review-f1`; мандат: независимое ревью кода против
  утверждённого дизайна (design §4.1–§4.6, §4.15, §4.16, §9),
  requirements REQ-01..05/REQ-10/NFR-01..06, test-plan R01–R05/N01–N04/N06.
- Проверенная ревизия: `47abbfa` (HEAD ветки), диапазон `6b7682e..47abbfa`,
  база-код `0574e7c`. Worktree:
  `/Users/chekh/Development/mister-wolf/.worktrees/wave-2-20-0-upgrade-intentions`.
- Методики: requesting-code-review (мандат), wolf-review (формат/вердикт),
  verification-before-completion (evidence). Автор — другая сессия,
  self-оценка автора (`phase4-impl-f1-report.md`) как ожидаемый вывод не
  использовалась.
- Ничего не правил и не коммитил; единственный записанный файл — этот вердикт.

## Вердикт и основание

`CHANGES_REQUIRED` из-за **одной major-находки** (M-1): `wolf init` 2.20.0 на
проекте, инициализированном 2.19.0, оставляет `AGENTS.md` со старым штампом и
рассинхронизированным свидетелем, после чего проход и `--check` показывают
`mutated` (needs-decision). Это регресс относительно 2.19.0 (там файл
пропускался) и ломает основной путь обновления парка. Данные при этом не
теряются (блок — зона wolf, текст вне блока сохраняется), поэтому не critical.

Остальные 9 находок — minor: не блокируют приёмку, но часть требует решения L0
до Ф2 (M-2, m-4, m-5) и учёта в задачах T10/T13.

Все заявленные автором проверки воспроизведены: точечные прогоны, `tsc`,
полный `npm run check` — см. Evidence. Все ранее заявленные риски потери
данных (нормализация `protect` в трёх точках, `keep` не отменяется проходом,
`takeMutated` без `BackupHook`, исцеление не съедает правки, целостность
frontmatter) — проверены и **подтверждены**.

## Находки

### M-1 (major). `wolf init` на штампованном `AGENTS.md`: блок обновляется, штамп и свидетель остаются старыми → ложный `mutated`

- Location: `src/adapters/render/opencode/opencode-renderer.ts:491-494`
  (`renderAgentsMd`: `if (findOnboardingBlock(current) !== null) return [await
this.syncAgentsBlock(paths.target, current, content)]`) → запись в
  `:329` (`syncAgentsBlock`), свидетель не пишется (`:319-331`).
- Нарушает: design §4.5 «**Whole-file (штампованный) AGENTS.md — поведение
  2.19.0 без изменения**» (штампованный файл — зона `syncAgentsMd`, не
  блок-ветки); REQ-03 AC4 (R03-4: init не оставляет блок в неконсистентном
  состоянии), NFR-02 (повторный проход не должен давать ложное расхождение).
- Сценарий (воспроизведён, Evidence E7): проект после `wolf init` 2.19.0 имеет
  `AGENTS.md = <!-- wolf:rendered ... set=2.19.0 --> + блок v2` (шаблон 2.19.0
  целиком является блоком — `git show 6b7682e:templates/base/AGENTS.md`,
  строка 1 `<!-- wolf:onboarding v2 -->`). Запуск `init` 2.20.0: ветка
  `renderAgentsMd` находит маркеры → `syncAgentsBlock` меняет только
  `[start,end)` на v3 → файл = `set=2.19.0` + блок v3, свидетель не обновлён.
  Следующий `sync`/`upgrade`: `fresh !== current`, хэш свидетеля ≠
  `sha256(current)` → правило 6 → `skipped mutated`; `inspect` → `mutated`;
  `--check` → needs-decision. Повторный `init` это не чинит (блок уже v3 →
  `identical`).
- Проверено фактически: `node probe4.mjs` на **реальных** шаблонах репозитория
  (`templates/base/AGENTS.md` = v3) и реальном тексте 2.19.0:
  `init → updated "onboarding block 2 → 3"`, штамп `set=2.19.0`,
  `sync → skipped mutated`, `inspect → mutated`, `witness.hash !== sha256(file)`.
  То же в синтетическом probe3.
- Impact: для каждого проекта парка, где после релиза выполняется `wolf init`
  (документированный сценарий, dogfooding), `AGENTS.md` уходит в
  needs-decision, `wolf upgrade` его больше не обновляет, exit парка → 2.
  Содержимое пользователя вне блока не теряется; блок v3 записывается.
- Не покрыто тестами: b0-init покрывает только «чужой текст без штампа»
  (append) и «блок v2 **без** штампа» → ни один тест не берёт штампованный
  файл с блоком (см. m-8).
- Рекомендация: в `renderAgentsMd` проверять `parseStamp(current) !== null`
  раньше маркеров и вести такой файл как whole-file (записать `fresh` со
  штампом текущей версии + `record(...)`, как в `syncAgentsMd`) либо
  пропускать (2.19.0-поведение) — тогда консистентность восстановит ближайший
  проход. Тест: «init на 2.19.0-проекте (штамп + блок v2) → файл = эталон со
  штампом 2.20.0, свидетель = hash(fresh), следующий `sync` → `skipped`
  identical».

### m-1 (minor). Дублирование строки `faces: … diverged` в деталях проекта

- Location: `src/app/use-cases/upgrade-projects.ts:453-456` (строка
  `faces:` из `r.seed`) и `:468` → `verifyNameLines` (`:433`, тот же текст,
  источник `report.seed`, отклонение №7 отчёта); то же в
  `src/adapters/cli/commands/memory-upgrade.ts:238-241` и `:253`.
- Нарушает: design §4.15 «лица печатаются **отдельной строкой** … из одного
  `collectDecisions().diverged`» — сейчас для одного `diverged`-лица в выводе
  две почти идентичные строки (`faces: executor-lead diverged` дважды).
- Evidence: код-путь детерминирован; unit-тест
  `upgrade-projects.test.ts` (R01.1) на fake-шаге с `seed.kind='diverged'`
  проходит через оба места. Визуально не поймано, т.к. тест проверяет
  `toContain`, а не количество.
- Impact: косметика вывода, данные/exit не затронуты.
- Рекомендация: оставить одного владельца строки; при переходе T7 на
  `collectDecisions().diverged` убрать seed-строку (либо в F1 не добавлять
  новую). Тест: `text.match(/faces:/g).length === 1`.

### m-2 (minor). Ветка `AGENTS.md` не получает `SyncBaseSetOptions`: правило 6′ и бэкап правила 7 к ней неприменимы — и недостижимы в allowlist T10

- Location: `src/adapters/render/opencode/opencode-renderer.ts:289`
  (`syncAgentsMd(baseDir, ctx, state)` — `opts` не передаются), `:504-549`
  (перезапись в правиле 7 без `backup`), `src/app/use-cases/sync-base-set.ts:11-13`.
- Нарушает/противоречит: отчёт (Changes, T3) заявляет «AGENTS.md whole-file
  получил правила 6/6.5/7» — фактически есть 6 и 6.5, а бэкап правила 7 и
  режим take (6′) недоступны; design §4.12 (`--yes` → take с бэкапом, «механизм
  один») и §4.8 (матрица: `take` на штампованном `AGENTS.md` ✅) не исключают
  AGENTS.md, §4.5 говорит «поведение 2.19.0 без изменения».
- Evidence: `grep -rn takeMutated src/` → только рендерер + порт (в
  production-пути не включается: `sync-base-set.ts` не пробрасывает `opts`);
  allowlist T10 (`plan.md`, раздел T10) правит `sync-base-set.ts`, но **не**
  `opencode-renderer.ts`.
- Impact: сейчас — ноль (хук в production ещё не подключён, T10). В Ф2 T10 не
  сможет включить take для mutated `AGENTS.md`, не выходя из своего allowlist.
- Рекомендация: решение L0 — либо зафиксировать «`--yes` не берёт mutated
  AGENTS.md» (тогда поправить claim в отчёте и §4.12/матрицу §4.8), либо
  расширить allowlist T10 (или вернуть правку в T14) на проброс `opts` в
  `syncAgentsMd` + бэкап правила 7. Тест на pass-through обязателен.

### m-3 (minor). Вторая таблица путей карты (`MAP_KINDS`) рядом с `projectPath`

- Location: `src/app/use-cases/upgrade-projects.ts:404-417`
  (`MAP_KINDS` = копия `SOURCE_ROOT` из
  `src/app/use-cases/verify-against-map.ts:77-82`).
- Нарушает: комментарий рядом («второй таблицы нет») и design §4.15
  («пути карты переводятся тем же `projectPath`»); при добавлении нового
  `FileKind` префикс не попадёт в таблицу → в выводе останется путь карты
  (`base/…`) вместо проектного, тихо.
- Evidence: чтение кода; `projectPath` вызывается, но `kind` берётся из
  локальной таблицы, а не из `map.files`.
- Impact: будущая регрессия имени файла в выводе (REQ-01), сейчас корректно.
- Рекомендация: экспортировать `SOURCE_ROOT`/`TARGET_ROOT` из
  `verify-against-map.ts` или передавать `map` в `verifyNameLines` и брать
  `kind` из `FileEntry`.

### m-4 (minor). Фаза removals не проверяет `protect`: защищённый файл, объявленный `removed` и подтверждённый, удаляется без бэкапа

- Location: `src/app/use-cases/project-step.ts:86-93` (цикл удаления по
  `orphaned` + `removedTargets` + `confirmedRemovals`; `parseProtect` не
  вызывается).
- Нарушает: design §4.3 «**Независимо от карты `protect` уважается**» (в
  редакции — про перезапись) против матрицы §4.8, где класс
  `protected × removed` не описан вообще; REQ-05 («держать локальный контент
  навсегда») vs REQ-02 (явное подтверждение списка удалений).
- Evidence: чтение кода; `orphanOutcome` (`:149-180`) protect проверяет, а
  фаза удаления — нет; удаление требует непустого `confirmedRemovals`, т.е.
  сейчас (F1) недостижимо — `confirmedRemovals` начнут формировать T7/T10.
- Impact: потенциальная потеря локального контента в Ф2, если подтверждённый
  список включает защищённый путь.
- Рекомендация: решение L0 до T7/T10 — protect блокирует удаление (файл
  остаётся `protected`) либо `confirmedRemovals` сильнее protect, но только с
  обязательным бэкапом. Прописать в матрице §4.8 и покрыть сценарием.

### m-5 (minor, наблюдение). Исцеление штампа сильнее `keep`: принятый локальный контент, отличающийся только строкой штампа, перезаписывается и теряет `origin:'keep'`

- Location: `src/adapters/render/opencode/opencode-renderer.ts:561-565`
  (правило 5 до 6.5).
- Соответствует design §4.3 буквально (правило 5 выше 6.5) — то есть это **не**
  дефект кода; фиксирую как последствие, которое стоит подтвердить владельцу.
- Evidence: probe B — файл с `witness {origin:'keep'}` и отличием только
  `set=9.9.9` → `updated "stamp drift healed (base 9.9.9)"`, свидетель стал
  `{origin:'render', base:'9.9.9'}`, содержимое = эталон (изменена одна строка
  штампа).
- Impact: «принято владельцем» тихо снимается; повторный дрейф после этого даст
  `mutated`, а не `kept`. Контент пользователя не теряется (кроме строки
  штампа, которая зона wolf).
- Рекомендация: подтвердить порядок правил (design) и добавить тест-фиксацию
  этого поведения, чтобы оно не менялось случайно; либо в §4.3 сделать 6.5
  выше 5 для `origin:'keep'` (решение L0, не правка ревьюера).

### m-6 (minor). Потребители свидетеля объявляют `Record<string, string>`, тогда как значения уже объекты

- Location: `src/adapters/cli/commands/memory-doctor.ts:67-77`,
  `src/adapters/cli/commands/memory-uninstall.ts:16-19`,
  `src/app/use-cases/uninstall.ts:22`, `src/app/use-cases/platform-mismatch.ts:24`,
  `src/app/use-cases/repair-platform.ts:14`.
- Нарушает: ADR-8/design §4.2 в части честности контракта (не поведения):
  типы врут о форме данных.
- Evidence: чтение кода — все пять потребителей используют **только ключи**
  (`Object.keys`/`Object.entries`), поэтому объектная форма их не ломает
  (совпадает с заявлением отчёта). Но тест
  `tests/unit/adapters/render/sync-state.test.ts:113-149` подаёт в них
  **нормализованные** записи через `as unknown as Record<string,string>`, а не
  сырой JSON, который читают production-пути (`loadSyncStateFiles`/
  `memory-uninstall`), — реальный путь не покрыт, только эквивалентный.
- Impact: сейчас нулевой; первый же потребитель, который сравнит `hash`,
  сломается молча (в `--check`/doctor это выглядело бы как «файл изменён»).
- Рекомендация: тип `Record<string, string | SyncEntry>` + ключевое чтение
  оставить, добавить тест на сырой JSON-файл (без `loadSyncState`).

### m-7 (minor). Замена блока в CRLF-файле съедает `\r` закрывающего маркера → смешанные EOL

- Location: `src/adapters/render/opencode/opencode-renderer.ts:58-60`
  (`end = offset + line.length`, где `line.length` включает `\r`), запись
  `:329`.
- Нарушает: §4.5/§4.1 в узком смысле «байт-в-байт вне блока» — сам `\r`
  принадлежит строке закрывающего маркера, т.е. блоку, поэтому формально
  допущение держится; но результат — файл 2.19.0 в CRLF получает LF-блок и
  LF-перевод после закрывающего маркера.
- Evidence: probe5 (CRLF-файл с блоком v2, шаблон v3):
  `out = "top1\r\ntop2\r\n<!-- wolf:onboarding v3 -->\n…2.16.2).\n<!-- /wolf:onboarding -->\ntail1\r\ntail2\r\n"`.
  Строки выше/ниже блока сохранены байт-в-байт (проверено `startsWith`/
  `endsWith`), повторный проход — `skipped`, файл не изменён.
- Impact: косметика (git может показать переписанные строки блока), данные целы.
- Рекомендация: либо конвертировать блок в EOL файла при записи, либо
  документировать как известное ограничение в `docs/site/guide/upgrade.md`.

### m-8 (minor). Пробелы тестового покрытия Ф1

- Location/пробелы:
  1. `AGENTS.md` в режиме `kept` (правило 6.5) — нет ни одного теста
     (`syncAgentsMd:536-545`, `inspectAgentsMd:439-440`). Поведение верно —
     подтверждено probe2 (kept держится, `inspect → kept`, `keepBase`
     проброшен), но не зафиксировано.
  2. `init` на **штампованном** `AGENTS.md` с блоком — нет теста; именно он
     ловит M-1 (`plan.md` T4: allowlist ограничен b0-init/b0-sync/doctor).
  3. R05-1/R05-2/R05-3(--check-часть)/R05-4 из test-plan не реализованы в Ф1
     (end-to-end «парк с `protect` → `protected (intentional)`, проект
     `current`, реестр Protections = `parseProtect().held`»). Маппинг R05-2
     указывает на `tests/integration/upgrade-check.test.ts` — файл в allowlist
     T6, но кейса нет; фактически покрытие уезжает в T13/T14. Unit-покрытие
     `classifyProject.protected` + `freshnessDetails` есть
     (`memory-upgrade.check.test.ts`).
  4. N01-2 (exit не меняется при `protected`/`kept`/исцелении) подтверждён
     только на уровне `needsDecision=0` в `verify-against-map.test.ts`; нет
     end-to-end проверки exit-кода пары прогонов.
- Impact: M-1 прошёл из-за (2); остальное — риск незамеченной регрессии в Ф2.
- Рекомендация: добавить (1),(2) в Ф1; (3),(4) — явной строкой в приёмку
  T13/T14 (не «уже покрыто»).

### m-9 (minor). Промежуточный коммит `db40309` (T2) красный — гигиена bisect

- Evidence (фактически, отдельный worktree на `db40309`, `node_modules`
  слинкован): `tsc --noEmit` → exit 0; `vitest run
tests/unit/adapters/render/opencode-renderer.test.ts
tests/unit/adapters/render/sync-state.test.ts` → **exit 1**, 4 failed
  (diff-ветка renderBaseSet, AGENTS.md sync, T010 mutated-skip, атомарные
  записи N01.1). То есть гейт T2 по плану (`sync-state.test` + `tsc`) был
  зелёным, красным стал **чужой** файл — как и написано в отчёте
  (Отклонения №1).
- Impact: `git bisect` по волне даст `db40309` как «первый плохой» для любого
  дефекта, который на самом деле введён позже; ручной bisect внутри Ф1
  придётся вести с пропуском этого коммита.
- Рекомендация: историю не переписывать без санкции L0. В Ф2 (до merge в
  `main`): либо `git rebase --interactive` склеить Ф1 в один коммит по санкции
  L0, либо оставить как есть и добавить в `plan.md`/отчёт строку
  «db40309 — known-red, bisect: skip» (уже есть в отчёте; продублировать в
  плане как место, куда смотрит bisect).

## Что проверено по приоритетам брифа

1. **Риск потери/порчи данных — подтверждено.** Нормализация `protect` во всех
   трёх точках: сравнение `classify:560`, проверка свидетеля `:564`, запись
   `record:571` (+ `inspectAgentsMd:437`, `syncAgentsMd:532`) — точки, где ключ
   остался в сравнении, нет. `keep` не отменяется следующим проходом (правило
   6.5, тесты renderer «kept (6.5)» + probe2 для AGENTS.md). `takeMutated` без
   `BackupHook` → `skipped mutated` (`:252-256`), тест take — бэкап-хук
   вызывается **до** записи, свидетель `origin:'render'`. Исцеление не съедает
   правки (R02-3 + `stripStampLines`-равенство). `insertProtect`/
   `removeProtect`: CRLF, комментарии, порядок ключей, дубли, пустой блок,
   отсутствие/незакрытый frontmatter — тесты + probe A (EOF-fence, BOM,
   не-грамматика → отказ). Ни одной новой точки потери данных в
   закоммиченном коде не нашёл.
2. **Порядок правил §4.3 — буквально.** `classify:554-567`: missing →
   protect → unstamped → identical → heal → mutated → kept → rewrite; 6′ и 7 в
   `syncBaseSet:218-287`; `inspectBaseSet:338-380` не пишет ни в одной ветке
   (NFR-03, снапшот-тест + собственный `treeSnapshot`).
3. **Идемпотентность.** Повтор после heal/kept/created/take/appended/блочного
   обновления — покрыт тестами (R02-1, kept res2, b0-init R03-4, b0-sync
   повтор, renderer «повтор — skipped»). Пробел — повтор после **init на
   штампованном AGENTS.md** (это и есть M-1) и отсутствие теста на
   `AGENTS.md kept` (m-8.1).
4. **Свидетель.** Легаси-строка → `{hash, origin:'render', base:<stamp|0.0.0>}`
   без перезаписи файла (`sync-state.ts:32-44`, тест «чтение не переписывает»);
   атомарная запись tmp+rename без `*.tmp` (тест). Key-only потребители не
   сломаны (platform-mismatch/doctor/uninstall/repair) — см. m-6 о типах.
5. **Onboarding v3.** Обновляется только `[start,end)`; текст выше/ниже
   байт-в-байт (b0-sync, probe5); детект agnostic (`:33`, литерала `v2` в коде
   нет); сломанные маркеры → `foreign`/`skipped` + `detail` (R03-5, тесты
   renderer/`upgrade-check`); append-ветка только в `init` (R03-7); текст после
   блока больше не `differs` (сравнение только блока `:326`, `inspectAgentsMd:450`).
   Дефект — маршрутизация штампованного файла в блок-ветку (M-1).
6. **Verify-коды.** `protected`/`kept` вне `NEEDS_DECISION_CODES` (тест
   фиксирует набор из трёх); `syncFact`/`fileVerdict`/хвост вне карты —
   `verify-against-map.ts:92-110,184-192`; `exitKind` считается только по
   `needsDecision` (`project-step.ts:127-128`), семантика exit не изменилась;
   `detail` доходит до `--check` (`classifyProject:464-466` →
   `freshnessDetails`/`projectCheckLines`), тест на строку
   `detail: onboarding markers broken — treated as foreign (AGENTS.md)`.
7. **Качество тестов.** Тесты проверяют поведение (файл на диске, свидетель,
   исходы), а не реализацию; тестов, закрепляющих дефект, не нашёл. Изменённое
   ожидание `upgrade-check` (`3 differ` → `2 differ: .opencode/agents/mr-wolf.md,
AGENTS.md`) — **усиление**: названы оба пути и добавлен запрет `3 differ`;
   причина (файл отличается только штампом → inspect `identical`) соответствует
   §4.4. Пробелы — m-8.
8. **Красный `db40309`** — m-9 (evidence фактический, не по отчёту).
9. **Scope.** Все правки `src/`/`templates/` попадают в allowlist T1–T6
   (`plan.md:49-162`); вне allowlist — только `plan.md` (чекбоксы + строки
   «Сделано», 12+/6−, содержательных правок нет) и сам отчёт фазы. Тесты — в
   allowlist соответствующих задач. `ProjectReport.backups` опционален:
   `runProjectStep` заполняет его всегда (`:130-141`), потребителей в Ф1 нет
   кроме теста, литералы в тестах вне allowlist T5 не ломаются — дыры контракта
   сейчас нет, но поле стоит сделать обязательным, когда T11 соберёт `--json`
   (иначе `undefined` в схеме).

## Ограничения ревью

- Реальный CLI (`wolf init`/`wolf upgrade` end-to-end) не запускал, чтобы не
  писать в глобальный реестр проектов площадки: поведение M-1 воспроизведено
  на самом классе рендерера (`dist/`, собран из проверяемой ревизии) с
  реальными шаблонами репозитория и реальным текстом шаблона 2.19.0.
- `--resolve`/`--review`/`--yes`/`--json` не проверялись — их нет в Ф1 (T7–T11).
- Security-линза: изменений границ доверия/секретов нет (кроме чтения путей
  из state — те же, что в 2.19.0), отдельную линзу не запускал.

## Требуются решения L0 (не правки ревьюера)

1. M-2: должен ли `--yes` брать mutated `AGENTS.md` (§4.12 vs §4.5) и,
   соответственно, чей allowlist правит рендерер (T10/T14).
2. m-4: `protect` × `removed` — блокирует удаление или подтверждение сильнее
   (с обязательным бэкапом); дописать матрицу §4.8.
3. m-5: подтвердить порядок «исцеление выше `keep`» или поднять 6.5 выше 5.
4. m-9: санкция на сквош Ф1 перед merge в `main` (история не переписана
   ревьюером).

## Evidence

| #   | Claim                                                                               | Command / procedure                                                                                                                                                                                       | cwd           | revision         | exit / result                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Диапазон ревью и состав коммитов                                                    | `git log --oneline 6b7682e..47abbfa`                                                                                                                                                                      | worktree      | `47abbfa`        | 7 коммитов: `fcbb36e`, `db40309`, `5d58de6`, `55c8cbb`, `a6a3649`, `94e1c59`, `47abbfa`                                                                           |
| E2  | Рабочее дерево: только pre-existing `.opencode/skills/**` + untracked `wolf-draft/` | `git status --short`                                                                                                                                                                                      | worktree      | `47abbfa`        | 3 modified + 1 untracked, в коммиты не входят                                                                                                                     |
| E3  | Точечные тесты Ф1 зелёные                                                           | `npx vitest run` (12 файлов: protect-key, sync-state, opencode-renderer, stamp, sync-base-set, verify-against-map, upgrade-projects, memory-upgrade.check, upgrade-check, upgrade-park, b0-sync, b0-init) | worktree      | `47abbfa`        | exit 0, 12 файлов / **187 passed**                                                                                                                                |
| E4  | Типы                                                                                | `npx tsc --noEmit`                                                                                                                                                                                        | worktree      | `47abbfa`        | exit 0                                                                                                                                                            |
| E5  | Полный гейт                                                                         | `npm run check` (english-surface → prettier → tsc → build → vitest)                                                                                                                                       | worktree      | `47abbfa`        | **CHECK_EXIT=0**, 212 файлов / **1780 passed** (совпадает с отчётом)                                                                                              |
| E6  | `db40309` красный на чужом тесте                                                    | `git worktree add … db40309`; `tsc --noEmit`; `vitest run opencode-renderer.test.ts sync-state.test.ts`                                                                                                   | temp worktree | `db40309`        | tsc exit 0; vitest **exit 1**, 4 failed (renderBaseSet diff, AGENTS.md sync, T010, N01.1)                                                                         |
| E7  | M-1: init на 2.19.0-проекте → `mutated`                                             | `node probe4.mjs` (реальные `templates/base` + текст шаблона `6b7682e:templates/base/AGENTS.md`)                                                                                                          | temp          | `47abbfa` (dist) | `init → updated "block 2 → 3"`, штамп `set=2.19.0`; `sync → skipped mutated`; `inspect → mutated`; `witness.hash === sha256(file)` → **false**                    |
| E8  | Краевые случаи `protect`                                                            | `node probe.mjs` (A1–A5: EOF-fence, BOM, ключ-последняя-строка, дубль `false`/`true`, не-грамматика)                                                                                                      | temp          | `47abbfa` (dist) | EOF-fence вставка ок + `normalize`-обратимость; BOM → не защищён; дубль → первый `false`; `insertProtect(…,'yes')` → `frontmatter-unparsable`, контент не изменён |
| E9  | `kept` для `AGENTS.md` (6.5)                                                        | `node probe2.mjs`                                                                                                                                                                                         | temp          | `47abbfa` (dist) | `kept` держится на повторе, `inspect → kept`, `keepBase: 1.0.0`                                                                                                   |
| E10 | CRLF-блок: байты вне блока сохранены, EOL после маркера — LF                        | `node probe5.mjs`                                                                                                                                                                                         | temp          | `47abbfa` (dist) | `startsWith`/`endsWith` true; хвост `<!-- /wolf:onboarding -->\ntail1\r\ntail2\r\n` (m-7)                                                                         |
| E11 | `keep` + только штамп-дрейф → heal снимает `keep`                                   | `node probe.mjs` (B)                                                                                                                                                                                      | temp          | `47abbfa` (dist) | `updated "stamp drift healed"`, свидетель `{origin:'render', base:'9.9.9'}` (m-5)                                                                                 |
| E12 | `takeMutated` в production-пути не включается                                       | `grep -rn takeMutated src/ tests/`; чтение `sync-base-set.ts:11-13`; allowlist T10 в `plan.md`                                                                                                            | worktree      | `47abbfa`        | только рендерер + порт + 2 теста; use-case `opts` не пробрасывает (m-2)                                                                                           |
| E13 | Регекс штампа один, `doctor` на префиксе                                            | чтение `stamp.ts:22-27`, `doctor.ts:38`; `grep -rn "wolf:rendered" src`                                                                                                                                   | worktree      | `47abbfa`        | одна копия регекса; `doctor` использует `<!-- wolf:onboarding`                                                                                                    |
| E14 | `NEEDS_DECISION_CODES` не расширялся                                                | чтение `verify-against-map.ts:31` + тест `verify-against-map.test.ts` («набор из трёх»)                                                                                                                   | worktree      | `47abbfa`        | `['conflict','diverged','skipped-mutated']`                                                                                                                       |

Временные файлы probe/логи — в системном tmp
(`/private/var/folders/…/T/opencode/`), репозиторий не менялся.

## Follow-up для Ф2 (сводка)

1. Исправить M-1 в рендерере (+тест «init на 2.19.0-проекте»), затем повторное
   ревью затронутой области (T4/рендерер) — вердикт по новой ревизии.
2. Решения L0 по M-2 / m-4 / m-5 / m-9 — до старта T10/T7 соответственно.
3. m-1/m-3/m-6/m-8 — в T7/T11/T13/T14 как явные пункты, не «уже покрыто».

## Обработка находок (F1-fix, 2026-10-25)

Решения L0 внесены как есть; продуктовые развилки не перепроектировались.
Исполнитель — L1 (диспетчеризация воркеров недоступна: лимит глубины
субагентов, см. «Отклонения»).

| Находка            | Исход                                    | Сделано                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Evidence                                                                                                                                                             |
| ------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M-1** (major)    | ACCEPTED, исправлено                     | `renderAgentsMd` → `syncAgentsBlock` для штампованной цели: после замены блока штамп приводится к текущей базе (`stripStampLines` + `renderStamp`, без второго регекса §4.4), свидетель пишется по нормализованному контенту, когда файл совпал с эталоном. Повторный `init` — no-op, проход и `--check` — `current`/`identical`. Guard: локальный текст вне блока не получает свидетель (иначе правило 7 молча перезаписало бы его) — файл честно остаётся `mutated` | probe before/after (E15/E16); `opencode-renderer.test.ts` «M-1», «M-1 heal», «M-1 guard»; `b0-init.test.ts` «M-1: init на проекте 2.19.0»                            |
| **m-1**            | DEFERRED → T7                            | Дубль `faces:` закрывается переходом на `collectDecisions().diverged`; строка и тест `match(/faces:/g).length === 1` вписаны в `plan.md` T7                                                                                                                                                                                                                                                                                                                           | `plan.md` T7                                                                                                                                                         |
| **m-2**            | ACCEPTED, исправлено                     | `syncBaseSet` use-case пробрасывает `SyncBaseSetOptions` → `syncAgentsMd`: mutated `AGENTS.md` берётся режимом 6′ (бэкап → эталон → свидетель) и правилом 7 (бэкап при отсутствии свидетеля); без хука — прежний `skipped mutated`. design §4.5/§4.12 и allowlist T10 (`opencode-renderer.ts` + его тесты) обновлены                                                                                                                                                  | `opencode-renderer.test.ts` «m-2 take/без хука/правило 7»; `sync-base-set.test.ts` «pass-through §4.12»; `npx vitest run …` exit 0                                   |
| **m-3**            | DEFERRED → T7                            | `MAP_KINDS` удаляется, `kind` из `map.files` (`FileEntry`); строка в `plan.md` T7                                                                                                                                                                                                                                                                                                                                                                                     | `plan.md` T7                                                                                                                                                         |
| **m-4**            | ACCEPTED, исправлено                     | Фаза removals: `protect` блокирует удаление (исход `protected`, подсказка `--resolve <путь>=keep`, сверка даёт `protected`, а не `error`/`removed`); **любое** удаление removed-цели идёт через `backupLocalFile` (§4.12: `.wolf/backup/upgrade/<date>/<rel>`, коллизия → `base-2.ext`) до `unlink`, путь — в `ProjectReport.backups`. design §4.3/§4.8 (нов. строка матрицы)/§4.12 обновлены                                                                         | `project-step.test.ts` «protect блокирует/удаление с бэкапом/идемпотентность/коллизия»; `verify-against-map.test.ts` «removed + protected» + «fail-safe не ослаблен» |
| **m-5**            | ACCEPTED (порядок подтверждён), фиксация | Правила не менялись; добавлена строка в design §4.3 (исцеление выше 6.5 объяснено: отличие только в строке штампа, контент пользователя не теряется) и тест «m-5: исцеление выше keep»                                                                                                                                                                                                                                                                                | `opencode-renderer.test.ts` «m-5»; design §4.3                                                                                                                       |
| **m-6**            | DEFERRED → T14                           | Тип `Record<string, string \| SyncEntry>` у пяти потребителей + тест на **сырой** JSON (без `loadSyncState`); строка в `plan.md` T14                                                                                                                                                                                                                                                                                                                                  | `plan.md` T14                                                                                                                                                        |
| **m-7**            | ACCEPTED, исправлено                     | Блок получает EOL файла (CRLF-файл: строки блока и завершающий `\r` закрывающего маркера), текст выше/ниже — байт-в-байт; сравнение на «identical» EOL-агностично, повторный проход — `skipped`. design §4.5                                                                                                                                                                                                                                                          | `opencode-renderer.test.ts` «m-7»                                                                                                                                    |
| **m-8 п.1**        | ACCEPTED, закрыто                        | Тесты `AGENTS.md` в режиме `kept` для `syncBaseSet` и `inspectBaseSet`                                                                                                                                                                                                                                                                                                                                                                                                | `opencode-renderer.test.ts` «m-8.1»; test-plan R03-8                                                                                                                 |
| **m-8 п.2**        | ACCEPTED, закрыто                        | Тест «init на штампованном `AGENTS.md` с блоком» — unit (renderer) + integration (реальный CLI, фикстура 2.19.0)                                                                                                                                                                                                                                                                                                                                                      | см. M-1                                                                                                                                                              |
| **m-8 п.3, п.4**   | DEFERRED → T13/T14                       | R05-1..4 (кроме unit) и end-to-end exit-код пары прогонов остаются за T13/T14 — уже явные строки приёмки в плане; в test-plan добавлены R05-8/R03-8/R03-9 по закрытым здесь сценариям                                                                                                                                                                                                                                                                                 | `plan.md`, `test-plan.md`                                                                                                                                            |
| **m-9**            | ACCEPTED (без переписывания истории)     | В `plan.md` — «`db40309` — known-red (T2), `git bisect`: skip» + требование «в Ф2 и далее каждый коммит зелёный по своим тестам и `tsc`»                                                                                                                                                                                                                                                                                                                              | `plan.md` (раздел «Фазы и зависимости», T2)                                                                                                                          |
| Claim отчёта (m-2) | ACCEPTED, исправлено                     | «AGENTS.md whole-file получил правила 6/6.5/7» → фактическое: правила 6/6.5/7 **и** take/бэкап 6′/7 (F1-ревью m-2), хук доходит из `syncBaseSet`                                                                                                                                                                                                                                                                                                                      | `phase4-impl-f1-report.md` (строка T3 + раздел «Обработка ревью»)                                                                                                    |

### Отклонения

1. **Воркеры недоступны** (`subagent` → «Subagent depth limit reached (1)»):
   подзадачи MEDIUM выполнены L1 в рамках тех же allowlist'ов, с RED/GREEN
   на каждое новое поведение. Декомпозиция и границы — в отчёте фазы.
2. **`backupLocalFile` реализована в `project-step.ts`** (F1), а не в
   `decisions.ts` (T7): удаления фазы 2 уже выполняются в production-пути, и
   NFR-05 нельзя оставить «до T10». `plan.md` T7 фиксирует переиспользование,
   design §4.12 — место функции; второй копии формата нет.
3. **Правило 7 «нет свидетеля → бэкап»** остаётся условным (`!entry && hook`):
   до T10 хук в проход не передаётся (это остаток T10), но `AGENTS.md` больше
   не является исключением — проброс проверен тестом.

### Evidence (F1-fix)

| #   | Claim                                 | Command / procedure                                                                                                                                                                                                                                                                      | revision        | exit / result                                                                                                  |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------- |
| E15 | M-1 воспроизведён на исходной ревизии | `node probe-m1.mjs <wt@47abbfa>` (dist собран из `47abbfa`, реальные `templates/base`)                                                                                                                                                                                                   | `47abbfa`       | `init: onboarding block 2 → 3`, штамп `2.19.0`, `witness ok: false`, pass `skipped mutated`, inspect `mutated` |
| E16 | M-1 закрыт                            | тот же probe на текущей ветке                                                                                                                                                                                                                                                            | `HEAD` (F1-fix) | штамп `2.20.0`, `witness ok: true`, pass `skipped identical`, inspect `identical`                              |
| E17 | Точечные тесты затронутых файлов      | `npm run test:run -- tests/unit/adapters/render/opencode-renderer.test.ts tests/unit/use-cases/sync-base-set.test.ts tests/unit/use-cases/project-step.test.ts tests/unit/use-cases/verify-against-map.test.ts tests/integration/b0-init.test.ts tests/integration/project-step.test.ts` | `HEAD`          | exit 0, 6 файлов / **126 тестов**                                                                              |
| E18 | Типы                                  | `npm run lint` (`tsc --noEmit`)                                                                                                                                                                                                                                                          | `HEAD`          | exit 0                                                                                                         |
| E19 | Полный гейт                           | `npm run check` (english-surface → prettier → tsc → build → vitest)                                                                                                                                                                                                                      | `HEAD`          | **exit 0**, 212 файлов / **1797 passed** (+17 к Ф1)                                                            |
| E20 | Рабочее дерево                        | `git status --short`                                                                                                                                                                                                                                                                     | `HEAD`          | только pre-existing `.opencode/skills/**`                                                                      |
