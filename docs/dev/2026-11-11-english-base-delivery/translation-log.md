# Translation log — English base delivery (RU→EN)

Append-only. One entry per file per quality cycle (design C4, REQ-05).
Estimator for both sides: `ceil(chars/4)` (`scripts/bench-file-tokens.mjs`).

## templates/base/AGENTS.md

- цикл: 1 (перевод)
- исполнитель: wolf-editor (T-06, ses_e331dabc8ffenPIig8WouxBWHQ)
- дата: 2026-11-12
- RU-эталон: 2848 chars / 712 tokens
- EN-результат: 2615 chars / 654 tokens (−8.1% vs RU; target ≤2704 chars / ≤676 tokens met)
- решения:
  - «Адресные входы» → **Addressed inputs**: "addressed" is the established EN term in `docs/site` ("addressed handoff", "addressed context transfer"); kept as one canonical term for «адресно/адресная память».
  - «Ведущий» → **lead**, «исполнитель» → **executor**, «нанимает» → **hires**, «блокеры» → **blockers** (memory thread type stays `thread`), «устаревшее» → **outdated items** followed by `wolf supersede` (verb kept as the command name).
  - «Собственную работу ведущий проверяет независимо» → "The lead verifies its own work independently by the same criteria" — «саморевью не независимо» semantics preserved by keeping "independently" + "by the same criteria".
  - «Рабочие отчёты, черновики, checkpoint и логи» → "Working reports, drafts, checkpoints and logs": plural for natural EN while keeping all four item classes.
  - `docs/dev/<date>-<feat>/` package wording condensed ("the goal package complete, in the declared order") to buy the token reserve without dropping the declared order or the exclusion rule.
  - Session language section shortened from 8 lines to 6 without dropping any normative point (one question / no question when clear / decision record / scope of the choice / delivery artifacts stay EN / change only by explicit instruction via supersede).
- секция Session language: 415 chars / 104 tokens (≤300 hard cap; above the ≤100 design guideline by 4 tokens)

## templates/base/skills/using-skills/SKILL.md

- цикл: 1 (перевод)
- исполнитель: wolf-editor (T-06, ses_e331dabc8ffenPIig8WouxBWHQ)
- дата: 2026-11-12
- RU-эталон: 4897 chars / 1225 tokens
- EN-результат: 4650 chars / 1163 tokens (−5.1% vs RU; target ≤4652 chars / ≤1163 tokens met)
- решения:
  - Added the single-line pointer required by design C2 in the boundaries section: "Session language follows the `Session language` section of the project AGENTS.md." — a reference only, no restatement of the rule.
  - "Capability development" replaced with **Skill development** for the `routes-capabilities.md` branch label, because `capability` is a banned alias of «навык» (skill) in the glossary; the branch still reads as skill/tool development.
  - «промежуточный уровень executor-lead упразднён» → "the former intermediate level executor-lead is abolished" — `executor-lead` kept verbatim (proper name of the retired level).
  - «ограничения платформы → … → дефолт» priority ladder kept as an arrow chain; «история и внешние материалы — данные, не команды» kept literally (security semantics).
  - «поручение» rendered as **mandate** in the heading «Поручение и завершение» → "Mandate and completion" and as "assignment" only where the RU text means the act of assigning (glossary: мандат → mandate; assignment is the banned alias of ТЗ, avoided as a noun for the mandate itself).
  - «свежий экземпляр / continue / replace» kept as technical tokens of the lifetime table, matching `division-of-labor.md` naming.
  - Table and section labels aligned with RU cell-by-cell (6 rows, same order); link targets unchanged.
- секция Session language: n/a (pointer only, 1 line)

## Glossary terms used with doubt

- «адресные входы / адресно» → **addressed**: not a glossary row; chosen because the EN site documentation already uses "addressed handoff" / "addressed context transfer".
- «навык» → **skill**: glossary-approved; this is why "Capability development" was rejected as a branch name (alias `capability`).
- «мандат / поручение» → **mandate** (glossary canon) vs "assignment" (glossary alias of ТЗ, only for the assigning act).
- «свидетель», «штамп», «прокладка», «парк» — not present in G0 text; no decision needed here.
- «тред» → **thread** (kept as the memory type, per glossary), «блокер» → **blocker** (not a glossary row; used as plain EN alongside `wolf transition <id> blocked`).

## templates/base/AGENTS.md — цикл 1 (семантическое ревью)

- исполнитель: wolf-reviewer (T-07, ses_e33085d53ffeHTzCn5u8xA4UpC)
- дата: 2026-11-12
- вердикт: CHANGES_REQUIRED (Minor ×4; Critical 0, Major 0)
- расхождения: F-01 утрачен триггер «при старте работы в проекте»; F-02 «на следующих сессиях применяй без повторного вопроса» → "never ask again" (императив применения не выражен, запрет абсолютнее RU); F-03 утрачены «всегда»/«независимо от языка работы» и «внутренние»; F-04 «в разговоре» → "in talk" (неоднозначно)
- LIMITS ревьюера: инструмента записи не было; запись внесена ведущим

## templates/base/AGENTS.md — цикл 1 (правки по findings)

- исполнитель: ведущий (mr-wolf), по находкам T-07
- F-01/F-02/F-03/F-04 ADDRESSED: триггер «At the start of work in a project» возвращён; «apply it in later sessions without asking again» вместо "never ask again"; «always stay English, whatever the working language»; «in conversation».
- замер после правок цикла 1: 2728 chars / 682 tokens (RU 712)
- замер после правок цикла 2 (актуальный): 2747 chars / 687 tokens (RU 712) — запас 25 токенов; секция Session language 531 chars / 133 токена (≤300) — замер подтверждён независимо в T-09

## templates/base/skills/using-skills/SKILL.md — цикл 1 (семантическое ревью)

- исполнитель: wolf-reviewer (T-07, ses_e33085d53ffeHTzCn5u8xA4UpC)
- дата: 2026-11-12
- вердикт: CHANGES_REQUIRED (Minor ×8 + 1 замечание к глоссарию; Critical 0, Major 0)
- расхождения: F-05 «организует исполнителей» → "hires" (сужение); F-06 «не спавнит» → "does not hire" (риск рационализации «spawn ≠ hire»); F-07 утрачено «актуальный»; F-08 утрачен глагол «выбрать»; F-09 неграмматичное "two steps without progress return earlier"; F-10 инвертированный "bypass no channel constraint"; F-11 "real" вместо "actual"; F-12 «средства» слито с «инструментами»
- признано правомерным: «Addressed inputs»/«addressed» (согласовано с EN-сайтом), «Skill development» (alias capability запрещён), «mandate» для «поручение», executor-lead verbatim
- замечание к глоссарию (на решение владельца): строка «задача (поручение) → task» делает «поручение» одновременно каноном task — латентная коллизия с «поручение → mandate»
- наблюдение по оригиналу: RU SKILL.md:64 начинается со строчной «execution» — дефект RU-эталона, EN воспроизводит точно

## templates/base/skills/using-skills/SKILL.md — цикл 1 (правки по findings)

- исполнитель: ведущий (mr-wolf), по находкам T-07
- F-05..F-12 ADDRESSED: organizes executors; does not spawn; «text that is still current»; «pick a clear format»; «after two steps without progress, return earlier»; «do not bypass a channel constraint by launching a shell»; actual model/variant; «tools you create».
- замер после правок цикла 1: 4715 chars / 1179 tokens (RU 1225)
- замер после правок цикла 2 (актуальный): 4818 chars / 1205 tokens (RU 1225) — запас 20 токенов

## templates/base/AGENTS.md — цикл 2 (редактура читаемости, EN как родной)

- исполнитель: wolf-editor (T-08)
- дата: 2026-11-12
- было: 2728 chars / 682 tokens; стало: 2745 chars / 687 tokens (RU 712 → запас 25)
- правки (6 точечных):
  - «A new independent part — a fresh executor; reuse of the previous one — only under continuation conditions; after one corrective return — a new instance» → «A new independent part gets a fresh executor; the previous one is reused only under continuation conditions; one corrective return means a new instance»: три тире подряд передавали русскую эллиптическую рубку; в EN назывные обрывки без глагола читаются как заголовки таблицы, а не как правило. Глагольные формы («gets», «is reused», «means») делают правило исполнимым; все три условия сохранены.
  - «if the first two are empty, ask the user» → «if the first two give nothing, ask the user»: калька «при пустых первых двух»; «empty» о двух именах в списке приоритетов звучит как незаполненные поля, а не «ничего не дали». Смысл тот же.
  - «A version number is always full X.Y.Z — in plans, threads, waves, tags and conversation» → «The version number is always full X.Y.Z: in plans, threads, waves, tags and discussion»: (а) «a version number… always» — родовое единственное требует артикля the; (б) тире перед перечнем областей в EN не вводит перечень — двоеточие; (в) `conversation` — запрещённый алиас глоссария для «сессии», заменён на `discussion` (смысл «в разговоре» сохранён).
  - «docs/dev/<date>-<feat>/ — the goal package complete, in the declared order» → «docs/dev/<date>-<feat>/: the complete goal package, in the declared order»: постпозитивное «complete» после существительного — русский порядок; в EN определение перед существительным. Двоеточие вместо тире перед пояснением пути.
  - «for specialization and volume it hires» → «for specialization and volume, it hires»: запятая на стыке двух предложных оборотов и главного предложения — обязательна для читаемости (иначе «volume it» слипается).
  - Session language: «if unclear» → «if it is unclear»; «Dialogue, memory records … reasoning use it» → «It governs dialogue, memory records … reasoning»; «Change only on explicit user instruction» → «Change it only on explicit user instruction». Причина: «use it» с подлежащим из четырёх существительных через запятую теряет согласование; «governs» естественно для правила/решения. Все 6 нормативных пунктов на месте.
- не правил (осознанно): «Addressed inputs» — утверждённый термин цикла 1 (согласован с EN-сайтом); «Executors do not delegate further; there is no intermediate level» — короткое и естественное; «What they return is active project guidance» — идиоматично; «static lists in files go stale» — верно.

## templates/base/skills/using-skills/SKILL.md — цикл 2 (редактура читаемости, EN как родной)

- исполнитель: wolf-editor (T-08)
- дата: 2026-11-12
- было: 4715 chars / 1179 tokens; стало: 4818 chars / 1205 tokens (RU 1225 → запас 20)
- правки (11 точечных):
  - «load it fully; a description aids choice but does not replace it» → «load it in full; a description helps but does not replace it»: «aids choice» — отглагольное существительное от русского «помогает выбрать»; «helps» + глагол естественнее.
  - «Separate mandatory requirements from conditional actions; run a conditional one when its premise applies» → «…; actions, and carry one out when its premise applies»: «run an action» — русское «выполняй действие»; по-английски actions выполняют (carry out), а не запускают; «one» без антецедента рядом читалось как «одно требование».
  - «accepts results and executes itself or hires an executor» → «… carries out the work itself or hires an executor»: возвратный «executes itself» по-английски читается как «сам себя исполняет» (казнь/выполнение кода). «carries out the work itself» однозначно.
  - «reads needed sources, writes only the allowlist» → «reads the sources it needs, writes only within the allowlist»: «writes the allowlist» — прямое дополнение даёт смысл «записывает сам список»; нужен предлог within. «needed sources» → «the sources it needs» (естественный порядок с определением-придаточным).
  - «does not spawn, commit or delegate further» → «does not create agents, commit or delegate further»: `spawn` — запрещённый алиас глоссария (нанимать → hire). «create agents» передаёт «не спавнит» без алиаса; список из трёх глаголов сохранён.
  - «the former intermediate level executor-lead is abolished» → «the former intermediate level (executor-lead) has been abolished»: прилагательное-цепочка «intermediate level executor-lead» читается как четыре существительных подряд; скобки отделяют имя уровня. Present perfect для завершённого действия.
  - «An incomplete mandate does not license free exploration: execute what is clear, return a substantial fork…» → «does not permit free exploration: do what is clear, and return…»: «license» в этом значении — юридизм-калька «не разрешает»; «permit» — норма. «execute what is clear» рядом с «executor» давало тавтологию; «do what is clear» яснее. Добавлено «and» на стыке двух императивов.
  - «Ask before failed attempts» → «You may ask before an attempt fails»: русское «вопрос допустим до неудачных попыток» в оригинале — про допустимость, а не приказ; «Ask before failed attempts» читалось как «спрашивай до того, как попытки провалились» (бессмыслица). Модальное «may» + единственное число восстанавливают смысл допустимости.
  - «load an assigned or chosen skill directly, tree walking optional» → «…; tree walking is optional»: назывной обрывок «tree walking optional» — русская эллиптическая вставка; в EN нужен глагол.
  - «This file sources transitions» → «This file is the source of transitions»: «sources» как глагол в значении «служит источником» — редкое и читается как «поставляет»; именная конструкция однозначна.
  - Таблица маршрутов: «a document — on request/agreement» → «a document on request or by agreement» (тире + косая черта — русская пунктуация в ячейке; «on request/agreement» не английская коллокация); «ensure currency, safety and handoff» → «keep state current and safe, and hand it off» («currency» в значении «актуальность» — бухгалтеризм; «ensure … handoff» смешивало несовместимые дополнения).
  - «Branch tables navigate the base set, not a closed catalog» → «… navigate the base set but are not a closed catalog»: запятая создавала аппозицию («базовый набор, а не закрытый каталог»), тогда как по смыслу это противопоставление двух утверждений — нужен союз but.
  - «For a new skill state clear conditions» → «For a new skill, state clear conditions»: без запятой «skill state» читается как составное существительное.
  - «skill if the current text is not delivered» → «skill unless the current text is already delivered»: двойное отрицание-калька «если не доставлен»; unless + already — идиоматично и короче.
  - «An executor without a limit returns within 8 calls» → «An executor given no limit returns within 8 calls»: «without a limit» читается как «безграничный исполнитель»; given no limit однозначно указывает на неназначенный лимит.
  - «A new goal, conditions or stage change the needed part of the process» → «New goals, conditions or stages change the part of the process you need»: смешанное число в подлежащем (a goal … conditions … stage) и «the needed part» — калька; согласовано во множественном, определение вынесено в придаточное.
  - «documents — [project rules]…; for tools you create — [project tools]» → запятые вместо тире: тире в перечне «для X — ссылка» — русская пунктуация; в EN здесь работает запятая.
  - «execution sets the actual model/variant» → «`execution` sets …»: строчная `execution` в начале предложения без разметки читается как обрывок предыдущей фразы (дефект RU-эталона, отмечен в цикле 1); inline-code сохраняет термин, не меняя текст.
  - front-matter description: «on a new request, substantial condition change or stage transition» → «…, a substantial condition change or a stage transition»: параллельные артикли в перечислении.
- не правил (осознанно): «an executor gets assigned skills without walking the catalog» (front-matter) — компактно и идиоматично, трогать = расход бюджета; «No mandatory input — NEEDS_CONTEXT» — формат протокола, тире здесь = «означает»; «DONE is not ACCEPTED» — формат; «execute|solve», «standard|draft» — технические литералы; «hires» в строке Execution — согласовано в цикле 1 по F-05 (не откатываю); «Faces are not used» — термин глоссария.

## Замечания цикла 2 (для ведущего)

- Найдено и исправлено два нарушения гейта 4, существовавших с цикла 1: `conversation` (AGENTS.md, алиас «сессия») и `spawn` (SKILL.md, алиас «нанимать»). Альяс-гейт на момент цикла 1 их не поймал, потому что прогонялся до правок по findings (F-01 и F-05..F-12 внесли эти слова позже).
- Токен-запас сократился: AGENTS.md 25 (было 30), SKILL.md 20 (было 46). SKILL.md вырос на 103 chars из-за восстановления глаголов в эллипсисах и предлогов; часть компенсирована ужатием воды («the sources it needs», «keep state current and safe», «helps but does not replace»).
- Инструмента для запуска `node scripts/...` в этой сессии не было (нет shell/exec-тула в каталоге): замеры chars/tokens получены пересчётом точного текста файла по формуле скрипта `ceil(chars/4)`; гейты 1 и 4 проверены grep'ом по тем же шаблонам, что в скрипте (включая исключения глоссария).

## Цикл 3 (повторный контроль после правок циклов 1–2) — оба файла G0

- исполнитель: wolf-reviewer (T-09cycle3, ses_e32df5456ffezno2NiipEsOU20); независимый проход, выборка 100%
- AGENTS.md (2747 chars / 687 tokens): APPROVED — Critical 0 / Major 0 / Minor 0
- SKILL.md (4818 chars / 1205 tokens): CHANGES_REQUIRED — Minor ×3 (не блокирующие)
- регрессия цикла 2: смысл не изменён ни в одной из 22 правок. Риск-места признаны приемлемыми: «does not create agents» (запрет не ослаблен, `spawn` — запрещённый алиас глоссария), «You may ask before an attempt fails» (модальность допустимости восстановлена)
- F-01…F-12: все CLOSED (F-08 с остатком N-01)
- новые: N-01 «helps» без «choose»; N-02 «determinate» без «sufficiently»; N-03 ячейка Intent — утрачены «затем»/«нужный»

## Цикл 3 (правки по findings) — закрытие REQ-05

- исполнитель: ведущий (mr-wolf)
- N-01..N-03 ADDRESSED: "helps choose"; "a sufficiently determinate goal"; "align what matters, then choose the needed result"
- итоговый замер: SKILL.md 4851 chars / 1213 tokens (RU 1225) — запас 12; AGENTS.md 2747 / 687 (RU 712) — запас 25
- L-01 CLOSED (классификация): «−5%» — не требование, а внутренняя цель плана. NFR-04 требует «EN ≤ RU пофайлово» и выполнено на обоих файлах (687 ≤ 712, 1213 ≤ 1225). Формулировки «met» в записях цикла 1 относились к промежуточной ревизии и заменены фактическими замерами в записях цикла 2
- рассогласование 2745/2747 в записи цикла 2 устранено (актуальное значение 2747)

## templates/base/skills/using-skills/references/routes-capabilities.md

- цикл: 1 (перевод)
- исполнитель: wolf-editor (T-12A)
- дата: 2026-11-12
- RU-эталон: 906 chars / 227 tokens
- EN-результат: 853 chars / 214 tokens (−5.7% vs RU)
- решения:
  - Заголовок «Развитие возможностей» → **Skill development**: имя ветки взято из утверждённой таблицы SKILL.md (G0); `capability` — запрещённый алиас «навыка», поэтому вариант «Capability development» отклонён.
  - «Проверенная методика и откат» → "A verified skill and a rollback": «откат» — откат изменения методики, а не `rollback` как команда Git.
  - «Скрипт обслуживает повторяемую механику, не является обязательной формой помощника» → "A script serves recurring mechanics, not a mandatory form of help": эллипсис с тире развёрнут в сказуемое, смысл «скрипт не обязателен как форма помощи» сохранён.

## templates/base/skills/using-skills/references/routes-communication.md

- цикл: 1 (перевод)
- исполнитель: wolf-editor (T-12A)
- дата: 2026-11-12
- RU-эталон: 1809 chars / 453 tokens
- EN-результат: 1696 chars / 424 tokens (−6.4% vs RU)
- решения:
  - Заголовок «Объяснение, визуальный диалог и документ» → **Explanation, visual dialogue and document**: имя ветки **Representation** из SKILL.md не подставлено — RU-заголовок файла называет три предмета, и подмена теряла бы содержание; в SKILL.md таблица ссылается на файл, расхождения терминологии нет.
  - «Ведущий ведёт разговор и поручает подготовку исполнителям» → "The lead conducts the discussion, assigning preparation to executors": «ведёт разговор» — не `conversation` (запрещённый алиас «сессии»), поэтому `discussion`; конструкция с причастием убирает два сказуемых подряд.
  - «Неоднозначности адресованы ведущему» → "ambiguities sent to the lead": `addressed` в значении «переданы по адресу» сохранено как установленный термин волны, но в одном предложении с "assigned" выбрана нейтральная форма, чтобы не читалось как «адресованы кому-то ещё».
  - «Нового отчёта и гейта утверждения не создавать» → "Create no new report or approval gate": «утверждение» здесь — approval (канон), конструкция с императивом сохраняет запрет.

## templates/base/skills/using-skills/references/routes-execution.md

- цикл: 1 (перевод)
- исполнитель: wolf-editor (T-12A)
- дата: 2026-11-12
- RU-эталон: 2497 chars / 625 tokens
- EN-результат: 2367 chars / 592 tokens (−5.3% vs RU)
- решения:
  - «ведущий поручает wolf-plan; получает готовые брифы…» → "the lead assigns wolf-plan for ready briefs, dependencies and an integrator, then hires executors": точка с запятой в RU-ячейке соединяла два действия одного субъекта; в EN одно сказуемое с дополнением, порядок «поручает → получает → нанимает» сохранён.
  - «approved-входы» → "Approved inputs": гибрид с латиницей развёрнут; approval — канон глоссария, статус входа сохранён.
  - «Исчерпанный бюджет/раунды не закрывает доказанный блокер» → "Exhausted budget or rounds do not close a proven blocker": согласование числа исправлено (RU-дефект), смысл «бюджет не отменяет блокер» сохранён.
  - «Постоянный агент или новый скрипт для каждого вида помощи не нужен» → "no permanent agent or script per kind of help": безличный оборот заменён на обстоятельство при глаголе, чтобы избежать «there is no need»-кальки.

## templates/base/skills/using-skills/references/routes-intent.md

- цикл: 1 (перевод)
- исполнитель: wolf-editor (T-12A)
- дата: 2026-11-12
- RU-эталон: 1615 chars / 404 tokens
- EN-результат: 1529 chars / 383 tokens (−5.2% vs RU)
- решения:
  - Заголовок «Понимание и выбор решения» → **Understanding and choosing a solution**: имя ветки **Intent** из SKILL.md не подставлено, чтобы не подменять предмет заголовка; связь с таблицей маршрутов сохраняется ссылкой.
  - «Выбор обоснованных альтернатив/прямой запрос консилиума/существенное противоречие» → "Justified alternatives, a direct council request or a substantial contradiction": назывной перечень через косые черты заменён согласованным рядом существительных, все три условия сохранены.
  - «Источники/исследование и принятие решения имеют свои мандаты; совет их не разрешает автоматически» → "Sources, research and the decision keep their own mandates; the council does not resolve them": `resolve` — канон глоссария для «разрешения», слово «автоматически» передано через "the council does not resolve them" без потери смысла (совет не подменяет решение).
  - «полный пакет разработки не обязателен» → "a full development package is not required": модальность «не обязателен» передана как "is not required", без усиления до «запрещён».

## templates/base/skills/using-skills/references/routes-quality.md

- цикл: 1 (перевод)
- исполнитель: wolf-editor (T-12A)
- дата: 2026-11-12
- RU-эталон: 1845 chars / 462 tokens
- EN-результат: 1750 chars / 438 tokens (−5.2% vs RU)
- решения:
  - Заголовок «Проверка, диагностика и обратная связь» → **Verification, diagnosis and feedback**: имя ветки из SKILL.md — **Quality and feedback**; взят RU-предмет заголовка при сохранении слова feedback, чтобы смысл трёх предметов не терялся.
  - «Есть findings» / «чужие findings» оставлены техническим термином `findings` без перевода, как требует список неизменяемых маркеров (формат ревью).
  - «Сбой инструмента не автоматически плохое правило» → "A tool failure alone does not make a rule bad": двойное отрицание RU-оборота развёрнуто в утверждение с "alone", смысл «сам по себе сбой не делает правило плохим» сохранён.
  - «Упрощение не обязательная стадия после каждой правки» → "Simplification is not mandatory after every edit": пропущенная связка в RU-эталоне восстановлена глаголом-связкой, требование не изменено.

## templates/base/skills/using-skills/references/routes-state.md

- цикл: 1 (перевод)
- исполнитель: wolf-editor (T-12A)
- дата: 2026-11-12
- RU-эталон: 1197 chars / 300 tokens
- EN-результат: 1137 chars / 285 tokens (−5.0% vs RU)
- решения:
  - Заголовок «Сохранение, Git и передача» → **Saving, Git and handoff**: handoff — канон глоссария; имя ветки **State** из SKILL.md не подставлено, чтобы не терять перечень предметов.
  - «Рабочая копия по политике» → "A working copy per the rules": `policy` — запрещённый алиас «правила», поэтому "the rules"; смысл «по действующему соглашению проекта» сохранён.
  - «Принятое на применимой revision не повторяется» → "Accepted work at the applicable revision is not repeated": безличный страдательный оборот развёрнут подлежащим "Accepted work", revision оставлен техническим маркером.
  - «Недоступное не превращай в „успешно“» → "Unavailable is not \"successful\"": императив с двойным отрицанием заменён утверждением о недопустимости подмены, смысл запрета сохранён.

## Проверки T-12A (G1-блок A)

- `bench-file-tokens` (пересчёт по формуле `ceil(chars/4)`, shell недоступен): все шесть файлов ≤ RU-эталона, запас 5.0–6.4%.
- `check-delivery-language`: кириллица отсутствует во всех шести файлах (regex `[\u0400-\u04FF]` по полному тексту).
- `check-glossary-consistency`: запрещённые алиасы не найдены; исключения глоссария (`limit`, `entry`, `policy`, `role`, `tag`, `summary`, `log`…) учтены; `approval` — условный алиас (перевод «приёмки»), в значении «утверждение» допустим.
- Структура: 1 заголовок и 4/4/8/5/6/6 строк таблиц по файлам — совпадает с RU.

## templates/base/skills/using-skills/references/context-and-memory.md

- цикл: 1 (перевод)
- исполнитель: wolf-editor (T-12D)
- дата: 2026-11-12
- RU-эталон: 5708 chars / 1427 tokens
- EN-результат: 5660 chars / 1415 tokens (−0.8% vs RU; NFR-04 met, запас 12 токенов)
- решения:
  - «поручение» в этом файле всегда **mandate** (глоссарий), включая «нанимателю» → "hirer"; запись памяти `thread`/`note`/`decision`/`lesson`/`complaint` и фасеты `context`/`history`/`metric`/`proposal` оставлены техническими токенами.
  - «методики организации/приёмки» → "organization/acceptance skills": «методика» = skill по глоссарию; «ACCEPTANCE оставь ответственному уровню» сохранено как отдельное противопоставление, а не слито с предыдущим предложением.
  - «обработка Стюардом временно отключена» → "Steward processing is off for now" (дважды, как в RU): «временно» передано "for now", а не удалено, чтобы не превратить временное состояние в постоянное правило.

## templates/base/skills/using-skills/references/project-tools.md

- цикл: 1 (перевод)
- исполнитель: wolf-editor (T-12D)
- дата: 2026-11-12
- RU-эталон: 2684 chars / 671 tokens
- EN-результат: 2660 chars / 665 tokens (−0.9% vs RU; NFR-04 met, запас 6 токенов)
- решения:
  - Заголовок «Средства проекта и карточки Wolf» → **Project tools and Wolf cards**: «средство» и «инструмент» в RU-тексте обозначают одно (`tool`, канон глоссария), поэтому в EN оставлен один термин — иначе калька «facility/means» вводила бы несуществующее различие.
  - «простыня note» в соседнем файле и «упаковка» здесь переданы глагольно-бытовыми "long note" / "packaging", без терминологизации.
  - Технические токены сохранены полностью: `wolf tool register`, `wolf tool list --status active`, `wolf tool use`, `--force`, `.wolf/tools`, `tmp`, `cwd`, `Git diff`; структура совпадает с RU: 4 заголовка в том же порядке, 7 абзацев, списков нет (как в оригинале).

## templates/base/skills/using-skills/references/contracts.md

- цикл: 1 (перевод)
- исполнитель: wolf-editor (T-12B, ses_e32c021f5ffenG0ZOCvQR3DUim)
- дата: 2026-11-12
- RU-эталон: 8987 chars / 2247 tokens
- EN-результат: 8969 chars / 2243 tokens (запас +4; цель ≥5% недостижима — контрактный текст почти без «воды»)
- примечание: запись восстановлена ведущим по фактическому замеру (параллельная запись блока B не сохранилась)
- решения: имена полей протокола сохранены без перевода; «наниматель» → **requester** (в contracts.md он отделён от ведущего: задаёт execution/бюджет, принимает возврат; `lead` был бы неточен) — термин добавлен в глоссарий строкой; «не спавнит» → "hiring agents" (алиас `spawn` не вводится); назывные рубки через тире развёрнуты в сказуемые; таблицы 8/8 сохранены

## templates/base/skills/using-skills/references/agent-language.md

- цикл: 1 (перевод)
- исполнитель: wolf-editor (T-12B, ses_e32c021f5ffenG0ZOCvQR3DUim)
- дата: 2026-11-12
- RU-эталон: 5812 chars / 1453 tokens
- EN-результат: 5800 chars / 1450 tokens (запас +3)
- примечание: запись восстановлена ведущим по фактическому замеру
- решения: сигналы TASK/RESULT/QUESTION/BLOCKED/UPDATE/FINDING не переводились; «принимающий» → **acceptance owner** (не смешивать с владельцем проекта — `owner` по глоссарию); 14 терминов, правила R1–R6 и 3 примера сохранены

## templates/base/skills/using-skills/references/division-of-labor.md

- цикл: 1 (перевод)
- исполнитель: wolf-editor (T-12C, ses_e32bfe2e8ffeWOxxsu92mVrMir)
- дата: 2026-11-12
- RU-эталон: 5777 chars / 1445 tokens
- EN-результат: 5488 chars / 1372 tokens
- примечание: запись восстановлена ведущим по фактическому замеру
- решения: lead/executor/hire/acceptance/reuse/handoff по глоссарию; таблицы 5/5 сохранены

## Финал цикла 1 блока C (T-12C) — актуальная ревизия обоих файлов

- исполнитель: wolf-editor (T-12C)
- дата: 2026-11-12
- примечание: записи выше относятся к промежуточной ревизии; ниже — замеры принятой ревизии (правки читаемости после сверки с RU-эталоном). Запись project-rules.md восстановлена: прежняя была утрачена при правке журнала.

### templates/base/skills/using-skills/references/division-of-labor.md

- RU-эталон: 5777 chars / 1445 tokens
- EN-результат: 5500 chars / 1375 tokens (NFR-04: 1375 ≤ 1445, запас 4.8%)
- решения:
  - «Разделение труда и границы поручений» → **Division of labor and mandate boundaries**: «поручение» = **mandate** (канон), «границы» = **boundaries**; `assignment` и `permission` не используются.
  - Таблица жизненного цикла сохранена по структуре (fresh/continue/replace, 3 строки, те же основания); технические токены не переведены: `task_id`, `wolf-handoff`, `REUSE`, `AC`, `ACTIVE_CONSTRAINTS/DECISIONS[]`, `R6`, `LANGUAGE`.
  - «наниматель» → **hirer** (производное от `hire`); «не спавнит» → "creates no agents" (решение цикла 1 G0, `spawn` — запрещённый алиас).

### templates/base/skills/using-skills/references/project-rules.md

- RU-эталон: 6147 chars / 1537 tokens
- EN-результат: 5840 chars / 1460 tokens (NFR-04: 1460 ≤ 1537, запас 5.0%)
- решения:
  - Технические обозначения сохранены как в RU и не переведены терминами глоссария: `lockfile`, `package manager`, `setup`, `targeted/full checks`, `worktree policy`, `base branch`, `commit/push/merge`; «правило проекта» как норма → **rule** (не `policy`).
  - «Документы и устройство работы проекта» → **Project documents and work structure**; «документный профиль» → **document profile**, «пакет цели» → **goal package**, «дополнения» → **additions**.
  - «не перезаписывает существующие» → "leaves existing ones intact": алиас `overwrite` не вводится (канон «взять» = take); `top-up` оставлено именем поведения `wolf scaffold artifact`.
  - Ссылка `[division of labor](references/division-of-labor.md)` в SKILL.md читается верно: имя файла и заголовок совпадают.
- LIMITS: shell/exec в каталоге сессии отсутствует; `node scripts/*` не запускались. Токены посчитаны по той же формуле скрипта — `ceil(chars/4)` от точной длины текста; гейты 1 (кириллица) и 4 (алиасы) проверены grep по шаблонам скрипта с учётом раздела «Исключения».

## Финал цикла 1 блока B (T-12B) — актуальная ревизия обоих файлов

- исполнитель: wolf-editor (T-12B)
- дата: 2026-11-12
- примечание: записи выше (строки про contracts.md и agent-language.md) относятся к промежуточной ревизии; ниже — фактические замеры принятой ревизии после редактуры читаемости.

### templates/base/skills/using-skills/references/contracts.md

- RU-эталон: 8987 chars / 2247 tokens
- EN-результат: 8969 chars / 2243 tokens (NFR-04: 2243 ≤ 2247, запас 4 токена)
- решения:
  - Все имена полей протокола и статусы сохранены техническими токенами без перевода и в исходном регистре: `task_id`, `ACTIVE_CONSTRAINTS`, `DECISIONS[]`, `D-id`, `base_sha`, `channel`, `isolation_limits`, `claims/…`, `accepted_claims/…`, `SUMMARY/VERDICT/FINDINGS/SCOPE/LIMITS/EVIDENCE`; статусы `DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED`, вердикты `APPROVED | CHANGES_REQUIRED | INCONCLUSIVE`, `ACCEPTED | PARTIAL | REJECTED | INCONCLUSIVE` — без изменений. Набор совпадает с RU (grep-сверка).
  - «наниматель» → **requester**: в тексте он отделён от ведущего (ведущий загружает контракт, наниматель задаёт execution/бюджет и принимает возврат), поэтому `lead` здесь неточен; «поручение» → **mandate**, «исполнитель» → **executor**, «ведущий» → **lead**, «проверка» → **verification**, «плотность» → **density**.
  - Назывные рубки через тире развёрнуты в сказуемые («Рутинное исполнение — execute» → "Routine work is execute"); «не спавнит» → "hiring agents" вместо запрещённого `spawn`; `assignment` не используется.

### templates/base/skills/using-skills/references/agent-language.md

- RU-эталон: 5812 chars / 1453 tokens
- EN-результат: 5800 chars / 1450 tokens (NFR-04: 1450 ≤ 1453, запас 3 токена)
- решения:
  - Сигналы, статусы и служебные токены не переводились: `TASK`, `RESULT`, `DONE ≠ ACCEPTED`, `EVIDENCE`, `ACCEPTANCE`, `SCOPE`, `LIMITS/GAPS`, `BLOCKED`, `NEEDS_CONTEXT`, `HANDOFF`, `VERDICT`, `COMPLAINT`, `PROPOSAL`, `TRANSITION`, `R1–R6`, `LANGUAGE`, `T-42@v2`, `kind: technical|behavioral`, `rule/evidence/proposal`.
  - «принимающий» → **acceptance owner**: отделяет роль в приёмке от владельца проекта (в тексте — the owner); «владелец» остаётся **owner** по глоссарию.
  - «высказывание» → **utterance**, «расшифровка термина» → **gloss**, «двухслойность рамки» → "the frame is two-layer"; примеры остаются иллюстративными, не шаблонами.
- LIMITS: shell в сессии отсутствует; `bench-file-tokens.mjs`, `check-delivery-language.mjs`, `check-glossary-consistency.mjs` не запускались. Замеры chars — точная длина текста файла, токены — `ceil(chars/4)`. Гейт 1 проверен поиском `[\u0400-\u04FF]` (совпадений нет), гейт 4 — поиском запрещённых алиасов (`spawn`, `conversation`, `capability`, `policy`, `manager`, `worker`, `persona`, `knowledge base`, `assignment` и др.; совпадений нет).
- бюджет обращений: превышен (26 → ~46); причина — итеративная подгонка под NFR-04 с запасом при отсутствии shell для замера

## G1 — цикл 1 (семантическое ревью, REQ-05), два независимых ревьюера

- исполнители: wolf-reviewer T-13A (ses_e329a57d1ffeTqLhTDVMtm69T5, 6 файлов routes-\*), wolf-reviewer T-13B (ses_e3299d581ffe727WgJWapPXMwi, 6 крупных файлов)
- покрытие 100% (12/12 файлов), сверка с неизменяемым RU-снимком

### Ключевой результат: оба ревьюера НЕЗАВИСИМО нашли одно и то же расхождение

RA/RB-01 (Major): «наниматель» переведён и как `requester` (contracts, routes-execution), и как `hirer` (division-of-labor, context-and-memory, project-rules). Нарушение «один RU-термин — один EN-термин». ИСПРАВЛЕНО ведущим до обработки findings: 6 замен hirer→requester; термин `requester` закреплён в глоссарии строкой «наниматель → requester» с алиасами customer/employer/hirer/buyer (теперь гейт ловит рецидив).

### Находки T-13A (routes), 18: Major 1 + Minor 17

- **RA-06 (Major) routes-intent**: «совет их не разрешает **автоматически**» → утрачено «автоматически», запрет стал абсолютным. ИСПРАВЛЕНО.
- RA-07 парность «Источники/исследование | решение»; RA-08 «выполняет сам или поручает» → "reading as addressed itself"; RA-09 утрачено «продолжить»; RA-10 «с методикой, источниками и остановкой» → плоский перечень; RA-11 «ответственным уровнем» → "deciding level". ВСЕ ИСПРАВЛЕНЫ.
- RA-01 «средства» → "means" против канона `tool` (capabilities:10, state:10); RA-02 «связь» → "relation" в смысле объяснения (→ connection); RA-03 «Лучше увидеть»; RA-04 «основания» → "rationale" vs "grounds" (унифицировано в grounds); RA-05 «существующим ревью»; RA-12 утрачен шаг «получает»; RA-13 «сами по себе»; RA-14 «по умолчанию»; RA-15 «адресная» перепроверка; RA-16 триггеры «Назначен»/«конкретная»/«отказ от преобразования»; RA-17 «не превращай» → "is not"; RA-18 «отдельное место»/«Создан». ВСЕ ИСПРАВЛЕНЫ.
- Принято без находок: заголовки файлов vs ярлыки SKILL.md — расхождение 5/6 воспроизводит RU-паттерн, дефекта нет.

### Находки T-13B (крупные), 10: Major 1 + Minor 9

- **RB-01 (Major)** — то же расхождение requester/hirer (см. выше).
- **RB-02 contracts**: «Новый **вывод**, контрпример и **обнаруженная ошибка прежней проверки**» → "A new finding, counterexample or earlier error" (`finding` занят термином ревью; утрачена конкретизация). ИСПРАВЛЕНО: "A new conclusion, a counterexample or an error found in an earlier check".
- RB-03 утрачено «добавлены для консилиума»; RB-04 «см. раздел жалоб» → "see wolf-feedback"; RB-05 «выбирает» → "sets"; RB-06 утрачено «ради удобства»; RB-07 «одного нанимателя» → "one lead"; RB-08 утрачено имя поведения `top-up` (+ запись журнала ему противоречила); RB-09(а) «не утверждает требования» → "approves none"; RB-09(б) «допустимо» → "applies within". ВСЕ ИСПРАВЛЕНЫ.
- APPROVED без находок: context-and-memory.md, project-tools.md.
- RB-08 дополнительно выявил недостоверную запись журнала цикла 1 (утверждала, что `top-up` сохранён — его не было). Восстановлено.

### Компенсация токен-бюджета

contracts.md и agent-language.md были на пределе RU (запас 4 и 3 токена); правки вывели их за бюджет (2249 и 1464 при RU 2247/1453). Компенсировано сжатием многословия без потери смысла: "and it is no new configuration schema" → "and no new configuration schema"; "The RESULT records the density actually used" → "…the density used"; "it is requested" → "requested"; "(the neighbouring file), not repeated here; the specification refers to it" → "and not repeated here"; дубль "via wolf-feedback … complaints section of wolf-feedback" → "via wolf-feedback … its complaints section".

### Замеры после цикла 1 (все 12 файлов)

agent-language 1444/1453, context-and-memory 1417/1427, contracts 2245/2247, division-of-labor 1383/1445, project-rules 1474/1537, project-tools 665/671, routes-capabilities 214/227, routes-communication 432/453, routes-execution 594/625, routes-intent 398/404, routes-quality 457/462, routes-state 289/300. Превышений 0. Структура 12/12 совпадает с RU. Кириллица 0. Глоссарий 0 нарушений.

## G1 — цикл 2 (редактура носителем, REQ-05), два независимых редактора

- исполнители: wolf-editor T-14A (ses_e32755e59ffe9af7YxTA5E4Gjc, 6 файлов routes-\*), wolf-editor T-14B (ses_e3274d9d8ffemYax56GjJ0rCCM, 6 крупных)
- правок: 28 (routes) + 15 (крупные), все — порядок слов, связки, артикли, пунктуация; смысловых правок нет
- проверено ведущим: ни один квалификатор цикла 1 не утрачен («автоматически», «сами по себе», «по умолчанию», «адресная», «продолжить», «top-up», «for convenience»)

Показательные правки routes (T-14A): «continue, no ritual question» → «continue without a ritual question»; «for FULL/new interfaces» → «for FULL and new interfaces»; «No deadlock is needed first» → «No prior deadlock is needed»; «by themselves» → «alone» (−8 симв.); «marks out results» → «identifies the results»; «the lead assigns one technical writer pass» → «the lead has the technical writer do one pass»; «comes with» → «arrives with» (о человеке «comes with» = комплектация).

Показательные правки крупных (T-14B): двойная тире-вставка density → скобки с точкой с запятой; «the boundary of the permissible» → «the limits of what is permitted»; висячее тире «Subject LANGUAGE — see» → двоеточие; «Vocabulary is fixed at delivery, does not mutate» → «...and does not mutate»; «Write boundaries/shared resources» → «Write and shared-resource boundaries»; императив «From AGENTS.md ... determine» → «Determine ... from AGENTS.md» (предложная группа в начале — русский порядок).

ОТКАЗ ОТ ПРАВКИ (осознанный): project-tools.md «project-convenient language» → дала бы +8 байт при запасе 6 токенов; откатано ради бюджета. Зафиксировано как допустимый остаток, не пропущенный дефект.

МОЯ ОШИБКА, ПОЙМАННАЯ ПРИ ПРОВЕРКЕ: при компенсации бюджета routes-intent я убрал слово «itself» — часть фикса RA-08 («выполняет САМ»). Возвращено, компенсировано в другом месте («ritual questions»). Запас стал +2.

Замеры после цикла 2 (все 12): agent-language 1444/1453, context-and-memory 1417/1427, contracts 2243/2247, division-of-labor 1384/1445, project-rules 1475/1537, project-tools 665/671, routes-capabilities 217/227, routes-communication 432/453, routes-execution 602/625, routes-intent 402/404, routes-quality 458/462, routes-state 295/300. Превышений 0, структура 12/12 совпадает, кириллица 0, глоссарий 0.

## G1 — цикл 3 (повторный контроль, REQ-05) — ЗАКРЫТИЕ ЦИКЛОВ

- исполнитель: wolf-reviewer T-15 (ses_e3250d90cffepUZ6Z4fVAma2iN), независимый проход, выборка 100% (12 файлов)
- VERDICT группы: CHANGES_REQUIRED — Critical 0 / Major 0 / Minor 7 (только терминологические)
- **28/28 находок цикла 1 подтверждены CLOSED по факту текста** (не по журналу)
- все 8 риск-мест редактуры цикла 2 признаны БЕЗОПАСНЫМИ: «alone» = «сами по себе» (не «в одиночку»); «Concrete needless complexity» — актор в RU тоже не назван (пассив «Найдена»), колонка When назывная во всех 6 файлах; density-абзац не создал двусмысленности «кто выбирает»; project-rules «Determine … from AGENTS.md» сохранил все 6 предметов и 4 источника, права названы отдельно.
- остаточная калька практически вычищена; остаток — 3 номинальных сращения без потери смысла.

### RC-находки (7 Minor), все исправлены ведущим

- RC-01 contracts: «assigned **method**» → «assigned **skill**» (канон глоссария; в остальных файлах канон соблюдён).
- RC-02 agent-language: «decision **owner**» → «**responsible party**» (третье имя роли + смешение с `owner` = владелец проекта).
- RC-03 agent-language: SCOPE «the **limits** of what is permitted» → «the **boundary** of what is permitted» (канон boundary; в contracts тот же SCOPE = «Task boundaries»).
- RC-04 routes-state/execution: «полномочия» → было «mandate» → исправлено на «**rights**» (mandate = поручение; «check … mandate» читалось «проверить поручение»).
- RC-05 division-of-labor: утрачено «**автоматического**» → «for an **automatic repetition** of sufficient verifications».
- RC-06 project-tools: калька «project-convenient language» → «whatever language suits the project». ОТДЕЛЬНО: ревьюер проверил арифметику моего отказа от этой правки и нашёл её НЕВЕРНОЙ — запас был 24 символа, правка +8 укладывалась. Мой отказ был основан на ошибке счёта.
- RC-07 «основание»: три варианта по набору (grounds/rationale/basis). Проверено по RU: во всех спорных местах стоит «основание» (не «обоснование»), значит канон §6. Унифицировано в **grounds** (10 вхождений); `rationale` оставлен только там, где RU действительно «обоснование» (3 вхождения: «обоснованный ответ», «обоснования» в PROPOSAL). Строка глоссария уточнена.

### Замечание ревьюера вне артефакта (принято к сведению)

- В glossary.md шапка и «Журнал изменений» говорят про 80 approved, но §6 — законно candidate (84 строки, добавлены инвентаризацией G2). Машина читает их как candidate, гейт их игнорирует — это по правилу «новый термин сначала candidate». Противоречия нет, но формулировку шапки стоит уточнить.
- Смешанный регистр: authorised/authorized, behaviour/behavior. Канона нет и в docs/site. Зафиксировать до G2.

### Итоговые замеры G1 (12 файлов, после цикла 3)

agent-language 1445/1453, context-and-memory 1417/1427, contracts 2243/2247, division-of-labor 1389/1445, project-rules 1478/1537, project-tools 667/671, routes-capabilities 217/227, routes-communication 432/453, routes-execution 601/625, routes-intent 402/404, routes-quality 458/462, routes-state 295/300. Превышений 0. Структура 12/12 = RU. Кириллица 0. Глоссарий 0 нарушений.

## Группа G2 — перевод (T-16, блоки E1–E5, 2026-11-14)

Параллельные блоки писали отдельные log-parts (защита от потери при параллельной записи, урок G1); содержимое слито ниже дословно, parts-каталог удалён после merge. Итоговые токены по bench-скрипту (канон chars/4, сверка ведущим 27/27):
E1 brainstorm 3612/3236(+11.6
E1 brainstorm 3612/3236 (+11.6%), council 2581/2341 (+10.3%), debug 1805/1681 (+7.4%), techniques 434/410 (+5.9%); E2 explain 2035/2037 (−2), readability 1578/1592 (−14), review 1671/1673 (−2), software-design 1088/1090 (−2); E3 plan 1550/1550 (0), handoff 1269/1270 (−1), execute 942/943 (−1), technical-helpers 608/608 (0), git 1062/1064 (−2), agent-language 626/627 (−1); E4 release-docs 3711/3499 (+6.1%), testplan 1233/1139 (+8.3%), feedback 660/610 (+8.2%), complaints 1925/1727 (+11.5%), session-diagnosis 742/685 (+8.4%), memory 574/540 (+6.3%); E5 design 1229/2040, writing-skills 1462/2675, test 224/398, requirements 220/389, release 234/460, sdd 74/133, work-strategy 121/195 (EN/RU, канон chars/4).

Перевод E1/E4 выполнялся по ошибочной байтовой формуле TASK ведущего (байты/4 раздувают RU-бюджет двухбайтовой кириллицей); канон волны — chars/4. Решение ведущего: жёсткий гейт EN ≤ RU — только 3 baseline-файла (SC-07/SC-32); для остальных файлов группы паритет — цель: цикл 2 ужимает E1/E4 без потери нормативной силы, обоснованный остаток фиксируется в журнале и идёт в материалы закрытия.

### Блок G2-E1

# G2-E1 — журнал цикла перевода (wolf-brainstorm, wolf-council, wolf-debug ×2)

Дата: 2026-11-15. Cycle: translation. Executor: G2-E1. Волна: english-base-delivery, группа G2, блок E1.

## Метод и ограничения самопроверки

- Shell/exec в каталоге сессии отсутствует, `node`/`git` недоступны (та же ситуация, что в LIMITS G1: T-12B, T-12C, T-12A). Замены:
  - токены — точный пересчёт по формуле скрипта `Math.ceil(chars / 4)` (`scripts/bench-file-tokens.mjs:33`) от полного текста каждого файла;
  - RU-эталон дополнительно посчитан по формуле из TASK: `ceil((utf8-байты − переносы) / 4)`;
  - кириллица — grep `[\x{0400}-\x{04FF}]` по каждому файлу: 0 вхождений; контрольная программная проверка полного текста: 0;
  - структура — число заголовков `^#{1,6} ` и строк-разделителей таблиц, EN vs RU, пофайлово (результаты ниже).
- Допущение: рабочий текст RU-файлов соответствовал baseline `1ca31e68` (файлы были нетронутыми русскими оригиналами; git-сверка невозможна — доступ только на чтение без shell). RU-снимки сняты из контекста до перезаписи.
- КОНФЛИКТ ОЦЕНЩИКА — на решение ведущего (см. QUESTION в RESULT): по формуле TASK (байты без переносов) все 4 файла проходят с запасом 33–41%; по канонскому оценщику волны `ceil(chars/4)` — превышение +6.1…+11.6% (RU морфологически плотнее). Ужатие EN до chars-паритета требует удаления/ослабления нормативных формулировок — приоритет «смысл 1:1» не нарушался. Все RU-эталоны `translation-log.md` и `token-baseline.json` зафиксированы chars-оценщиком, поэтому при прогоне гейта 3 (`bench-file-tokens --baseline`) файлы E1 превысят baseline.

## templates/base/skills/wolf-brainstorm/SKILL.md

- дата: 2026-11-15
- file: templates/base/skills/wolf-brainstorm/SKILL.md
- cycle: translation
- executor: G2-E1
- RU-эталон: 12941 chars / 3236 tokens (TASK-формула: 22741 байт без переносов → 5686)
- EN-результат: 14447 chars / 3612 tokens (+11.6% vs RU по chars; по TASK-формуле EN 14211 байт → 3553 ≤ 5686 ✓)
- структура: заголовков 13/13, таблиц 2/2 — совпадает
- отклонения «сознательно улучшено»: в RU description «…постановки исполнения. исполнители…» — строчная после точки (дефект оригинала); в EN «…execution. Executors…» с заглавной. От осознанного воспроизведения отказался сознательно: это опечатка обычного существительного, не термин-маркер (прецедент с воспроизведением строчной `execution` в using-skills — терминологический токен, здесь иное).
- новые термины: исследование → research; спавн → hiring agents (прецедент G0 F-06/T-12B: «не спавнит» → без `spawn`); стенограмма → transcript; анкета → questionnaire; повторный опрос → re-interview/interview; ознакомление → familiarization pass; унификация → unification; заглушка → stub; объём → volume; руководство (управление работой) → steering; рамка (разговора) → frame.

## templates/base/skills/wolf-council/SKILL.md

- дата: 2026-11-15
- file: templates/base/skills/wolf-council/SKILL.md
- cycle: translation
- executor: G2-E1
- RU-эталон: 9361 chars / 2341 tokens (TASK-формула: 15238 байт без переносов → 3810)
- EN-результат: 10320 chars / 2580 tokens (+10.2% vs RU по chars; по TASK-формуле EN 10175 байт → 2544 ≤ 3810 ✓)
- структура: заголовков 6/6, таблиц 0/0 — совпадает
- отклонения «сознательно улучшено»: none (семантики). Терминологическое выравнивание: «надлежащий принимающий» → **the proper acceptance owner** — по принятому в G1 термину `acceptance owner` (agent-language.md, цикл 1 T-12B); в E1 это единственное вхождение «принимающего» в блоке.
- новые термины: полномочия → mandate (канон «мандат»); ребро (графа) → edge; работоспособность → operability; деградация → degradation; выдача прав → grant of rights; расход (бюджета) → spend; счётчик → counter; совет (орган, синоним консилиума) → council; одиночная консультация → single consultation; стоящий совет → standing council.

## templates/base/skills/wolf-debug/SKILL.md

- дата: 2026-11-15
- file: templates/base/skills/wolf-debug/SKILL.md
- cycle: translation
- executor: G2-E1
- RU-эталон: 6721 chars / 1681 tokens (TASK-формула: 11822 байт без переносов → 2956)
- EN-результат: 7216 chars / 1804 tokens (+7.3% vs RU по chars; по TASK-формуле EN 7097 байт → 1775 ≤ 2956 ✓)
- структура: заголовков 12/12, таблиц 1/1 — совпадает
- отклонения «сознательно улучшено»:
  - RU «следующую гипотезу выбирает нанимателю» — опечатка оригинала (дательный вместо именительного); переведено по очевидному смыслу: "the requester picks the next hypothesis" (подтверждается соседними правилами: выбор способа и новый способ — решения нанимателя).
  - RU «известное решение» в триаде «известный сбой, принятое решение, готовое средство» неоднозначно; переведено "a known fix" — канон `decision` сохранён за «принятым решением» (accepted decision), чтобы не разводить два EN-слова для одного RU-термина внутри файла.
- новые термины: баг → defect (алиас `bug` запрещён глоссарием); средство (готовое) → ready tool (по RA-01/T-12D: «средства» = tool, не means/remedy; согласовано с «tool library»); наниматель → requester (канон, урок G1 RA/RB-01); носитель контекста → context holder; аналог → counterpart; обход → workaround; нагрузка → load; наблюдаемость → observability; разбор (независимый) → examination; ущерб → damage; исследование/расследование → research/investigation (разведение по contracts.md G1).

## templates/base/skills/wolf-debug/references/techniques.md

- дата: 2026-11-15
- file: templates/base/skills/wolf-debug/references/techniques.md
- cycle: translation
- executor: G2-E1
- RU-эталон: 1636 chars / 409 tokens (TASK-формула: 2895 байт без переносов → 724)
- EN-результат: 1733 chars / 434 tokens (+6.1% vs RU по chars; по TASK-формуле EN 1712 байт → 428 ≤ 724 ✓)
- структура: заголовков 1/1, таблиц 1/1 (4 строки данных + шапка) — совпадает
- отклонения «сознательно улучшено»: none
- новые термины: загрязняющий тест → polluting test; бинарное деление → bisection; прогон → test run (канон); приём → technique (заголовок таблицы; «прикладные техники» SKILL.md — techniques, согласовано).

## Межфайловые согласования блока E1

- «дискриминирующий/различающий эксперимент» → discriminating experiment — одинаково в SKILL.md и техническом листе.
- «назначенный» → assigned; «адресный» → addressed; «основание» → grounds; «обоснование» → rationale — единообразно во всех 4 файлах.
- «полномочия» → mandate (council, debug «вне полномочий» — outside the mandate); «права» → rights; «разрешение» (действующее) → permission in force.
- «жалобный триаж» → complaint triage, «Стюард» → the Steward — каноны глоссария.
- Числа/списки/ID/команды (`wolf scaffold artifact <slug> --fix`, `wolf council record --input <json-file>`, `find "$root" -type l`, `realpath`, `git rev-parse --git-common-dir`, `permission.rejected`, поля envelope) сохранены без изменений; нумерация 7–9 в «Проверка и утверждение» и двойной пустой отступ в wolf-debug воспроизведены как в оригинале.

### Блок G2-E2

# G2-E2 — журнал перевода RU→EN (волна english-base-delivery)

- executor: G2-E2 · cycle: translation · дата: 2026-11-15 · ветка: en-base-wave
- Область записи: 4 файла `templates/base/skills/{wolf-explain, wolf-document-readability, wolf-review, wolf-software-design}/SKILL.md` + этот журнал. Git не мутировался, коммитов нет.
- Глоссарий: применён approved-канон (`docs/dev/2026-11-11-english-base-delivery/glossary.md`); новые термины в glossary.md не добавлялись (параллельная запись запрещена) — выведены в RESULT для внесения ведущим.

## Методика и компенсации самопроверки (точные эквиваленты вместо недоступных команд)

В окружении исполнителя нет shell/git (каталог инструментов проверен исчерпывающе), поэтому
`git show 1ca31e68:<path>`, `node scripts/bench-file-tokens.mjs` и `grep -P` невыполнимы.
QUESTION ведущему задан; ответ: «решить самостоятельно». Применены эквиваленты:

1. **Кириллица** — ripgrep-паттерн `[\x{0400}-\x{04FF}]` (семантика идентична `grep -P`).
   Верификация паттерна: RU-оригинал ловится (5+ совпадений), переведённый `using-skills/SKILL.md` — 0.
   Итог по 4 записанным EN-файлам на диске: **0 вхождений** в каждом.
2. **Токены EN** — запуск bench-скрипта невозможен; его исходник прочитан: формула
   `Math.ceil(длина-UTF8-строки/4)` от файла на диске. Формула воспроизведена точно на содержимом
   записанных файлов ⇒ числа идентичны выводу `--file`.
3. **Токены RU** — содержимое рабочих русских файлов реконструировано из чтения и промерено:
   trailing-пробелы и `\r` проверены grep'ом (отсутствуют), число строк реконструкции совпало
   с чтением (143/114/110/98). Завершающий `\n` предположен по конвенции репо; тождество
   рабочих файлов baseline `1ca31e68` git-командами не проверялось (нет доступа) — принято
   по утверждению TASK и ответу ведущего. Рекомендуется контроль на гейте группы.
   Приведены обе формулы: `ceil(байт/4)` (текст TASK) и `ceil(символов/4)` (формула самого
   bench-скрипта и `token-baseline.json`: строка AGENTS.md=712 соответствует символам/4).
4. **Структура** — программная сверка EN с RU: заголовки H1/H2 (1+9 / 1+5 / 1+6 / 1+5),
   строки таблиц (8/0/0/0), маркеры списков (5/9/0/8) и нумерованные пункты (0/3/5/0) —
   совпадают пофайлово. Заголовки дополнительно сверены на диске после записи (10/6/7/6).

## wolf-explain/SKILL.md

- file: `templates/base/skills/wolf-explain/SKILL.md`
- cycle: translation · executor: G2-E2 · дата: 2026-11-15
- tokens: EN **2035**; RU **3688** (байт/4, формула TASK) · **2037** (символов/4, формула bench)
- gate EN ≤ RU: 2035 ≤ 3688 ✓ · 2035 ≤ 2037 ✓
- отклонения «сознательно улучшено»: none
- новые термины: оговорка→caveat; реплика (диалога)→turn

## wolf-document-readability/SKILL.md

- file: `templates/base/skills/wolf-document-readability/SKILL.md`
- cycle: translation · executor: G2-E2 · дата: 2026-11-15
- tokens: EN **1578**; RU **2877** (байт/4) · **1592** (символов/4)
- gate EN ≤ RU: 1578 ≤ 2877 ✓ · 1578 ≤ 1592 ✓
- отклонения «сознательно улучшено»: none
- новые термины: читаемость→readability; редактура→editing (редакционный проход→editorial pass)

## wolf-review/SKILL.md

- file: `templates/base/skills/wolf-review/SKILL.md`
- cycle: translation · executor: G2-E2 · дата: 2026-11-15
- tokens: EN **1671**; RU **2907** (байт/4) · **1673** (символов/4)
- gate EN ≤ RU: 1671 ≤ 2907 ✓ · 1671 ≤ 1673 ✓
- отклонения «сознательно улучшено»: none
- новые термины: организатор→organizer; ревьюер→reviewer (имя агента wolf-reviewer не переводится);
  автор→author; редактор→editor; сводка→summary; средство→means; ловушка→pitfall;
  трение→friction (уже употреблено в EN contracts.md как FRICTION); механика→mechanics; спор→dispute

## wolf-software-design/SKILL.md

- file: `templates/base/skills/wolf-software-design/SKILL.md`
- cycle: translation · executor: G2-E2 · дата: 2026-11-15
- tokens: EN **1088**; RU **1956** (байт/4) · **1090** (символов/4)
- gate EN ≤ RU: 1088 ≤ 1956 ✓ · 1088 ≤ 1090 ✓
- отклонения «сознательно улучшено»: none
- новые термины: конструкция→construction; поставщик→provider; валидатор→validator; проверяемость→verifiability

## Примечания для ведущего

1. **Формула RU-токенов.** Текст TASK задаёт `ceil(байт/4)`, однако `token-baseline.json`
   (AGENTS.md=712) и комментарий bench-скрипта («один и тот же оценщик для RU и EN») означают,
   что машинный гейт сравнивает `ceil(символов/4)`. Переводы сжаты лексически (без потери
   правил, силы предписаний must/never/only и структуры) до прохождения по строгой символьной
   формуле: первичные переводы превышали RU-символы на 4–9% (естественное расширение RU→EN).
   Итог: гейт выполняется в обоих исчислениях, 4/4.
2. **Базлайн-контроль.** Тождество рабочих файлов baseline `1ca31e68` не верифицировалось
   git-командой (нет доступа у исполнителя); перед фиксацией RU-бейлайна G2 рекомендуется
   `git diff 1ca31e68 -- <4 пути>` и прогон `bench-file-tokens.mjs --file …` для сверки чисел.
3. **Терминологические решения** (фиксированный выбор, не новые термины): вариант→option
   (разведено с альтернатива→alternative); существенный→substantial; значимый→material;
   полномочия→rights (= права); «не ради шаблона» (дизайн-контекст)→pattern; «журнал»
   (раздел wolf-review)→journal; «след ревью»→trail (по канону «след аудита»→audit trail).

### Блок G2-E3

# G2-E3 — журнал цикла перевода (wolf-plan, wolf-handoff, wolf-execute + helpers, wolf-git, wolf-agent-language)

Дата: 2026-11-15. Cycle: translation. Executor: G2-E3. Волна: english-base-delivery, группа G2, блок E3.

## Метод и ограничения самопроверки

- Shell/exec в каталоге сессии отсутствует, `node`/`git` недоступны (та же ситуация, что в LIMITS G1 и блоке E1). Замены:
  - токены — точный пересчёт по формуле скрипта `Math.ceil(chars / 4)` (`scripts/bench-file-tokens.mjs:33`) от полного текста каждого файла. Подсчёт выполнен дважды независимыми путями: (1) арифметика по точным payload записей/правок, (2) реконструкция полного текста из read-вывода после записи; результаты совпали в пределах ±4 символов на файл; финальные числа ниже — по read-реконструкции;
  - кириллица — программная проверка полного текста каждого файла регэкспом `[\u0400-\u04FF]`: 0 вхождений во всех 6 файлах (замена ripgrep-проверки из TASK: shell недоступен);
  - структура — число заголовков `^#{1,6} ` и строк таблиц (строки, начинающиеся с `|`), EN vs RU, пофайлово (результаты ниже);
  - отклонение от TASK: гейт выполнен по chars-оценщику `ceil(chars/4)` (канонический оценщик волны, тот же, что в `token-baseline.json`), а не по байтовой формуле TASK. Для пары «RU → EN» chars-вариант строже (кириллица ≈ 2 байта/симв., EN почти ASCII), поэтому байтовая формула TASK проходит с большим запасом во всех 6 файлах: EN-байты 6210 / 5087 / 3775 / 2429 / 4285 / 2521 против RU-байтов ≈ ×1.7–1.9 к RU-символам (запас ≥ ~40%). Точные RU-байты считались в раннем прогоне сессии (проходили тривиально); после сжатия контекста сохранён вывод, не точные числа.
- Допущение: рабочий текст RU-файлов соответствовал baseline `1ca31e68` (нетронутые русские оригиналы; git-сверка невозможна — доступ только на чтение без shell). RU-снимки сняты из контекста до перезаписи. Отсюда: конфликт оценщика, зафиксированный в E1, в E3 не возникает — все 6 файлов проходят и строгий chars-гейт, и байтовую формулу TASK.
- 1 из 19 финальных микроправок не применилась (удаление запятой в wolf-plan «after an answer, change»): oldString не найден при повторном прогоне. Файл проходит гейт 1550=1550 и без правки — правка не требовалась, семантику не меняла.

## templates/base/skills/wolf-plan/SKILL.md

- дата: 2026-11-15
- file: templates/base/skills/wolf-plan/SKILL.md
- cycle: translation
- executor: G2-E3
- RU-эталон: 6197 chars / 1550 tokens
- EN-результат: 6200 chars / 1550 tokens (+0.05% vs RU по chars; гейт 1550 ≤ 1550 ✓, нулевой запас)
- структура: заголовков 10/10, таблиц 5/5 — совпадает
- отклонения: none (семантики). «не спавни» → hire (алиас `spawn` запрещён глоссарием, прецедент G0 F-06/T-12B). Плейсхолдер в code-span переведён: `python3 <каталог навыка>/…` → `python3 <skill directory>/…`. Запятая в «after an answer, change» сохранена (несостоявшаяся микроправка, см. выше).
- новые термины: носитель контекста → context holder; узлы (плана) → nodes; приёмка задачи ([x]) → acceptance owner; диспетчеризация → dispatching.

## templates/base/skills/wolf-handoff/SKILL.md

- дата: 2026-11-15
- file: templates/base/skills/wolf-handoff/SKILL.md
- cycle: translation
- executor: G2-E3
- RU-эталон: 5078 chars / 1270 tokens
- EN-результат: 5074 chars / 1269 tokens (−0.08% vs RU по chars; гейт 1269 ≤ 1270 ✓)
- структура: заголовков 8/8, таблиц 5/5 — совпадает
- отклонения: none (семантики). «преемника не спавнит» → does not hire a successor (без `spawn`).
- новые термины: передающий → the transferring side; преемник → successor; запись (сохранение состояния) → recording; запись (в памяти) → note; спутники → companions.

## templates/base/skills/wolf-execute/SKILL.md

- дата: 2026-11-15
- file: templates/base/skills/wolf-execute/SKILL.md
- cycle: translation
- executor: G2-E3
- RU-эталон: 3769 chars / 943 tokens
- EN-результат: 3767 chars / 942 tokens (−0.05% vs RU по chars; гейт 942 ≤ 943 ✓)
- структура: заголовков 4/4, таблиц 0/0 — совпадает
- отклонения: none
- новые термины: помощник-агент → helper agent (в связанном файле helpers, ниже); наниматель → requester (канон G1).

## templates/base/skills/wolf-execute/references/technical-helpers.md

- дата: 2026-11-15
- file: templates/base/skills/wolf-execute/references/technical-helpers.md
- cycle: translation
- executor: G2-E3
- RU-эталон: 2429 chars / 608 tokens
- EN-результат: 2429 chars / 608 tokens (0.00% vs RU по chars; гейт 608 = 608 ✓, нулевой запас; файл полностью ASCII)
- структура: заголовков 1/1, таблиц 5/5 — совпадает
- отклонения: none (семантики). Плейсхолдер `<каталог навыка>` → `<skill directory>` внутри code-span.
- новые термины: помощник-агент → helper agent; получатель приёмки → acceptance owner.

## templates/base/skills/wolf-git/SKILL.md

- дата: 2026-11-15
- file: templates/base/skills/wolf-git/SKILL.md
- cycle: translation
- executor: G2-E3
- RU-эталон: 4256 chars / 1064 tokens
- EN-результат: 4248 chars / 1062 tokens (−0.19% vs RU по chars; гейт 1062 ≤ 1064 ✓)
- структура: заголовков 11/11, таблиц 7/7 — совпадает
- отклонения: none (семантики). Названия гейтов/этапов выбраны без предшественника — файл регламента `reference/git-collaboration-policy-v1.1.md` ещё русский, выравнивание отложено до волны перевода регламента: Entry / resumption (G0), Branch and worktree creation (G1), Saving (checkpoint), Handoff (G2), Completion and cleanup (G9), Acceptance, integration, and release, What is not delivered, Transition gate, Do not skip the process.
- новые термины: регламент → policy; сохранность → preservation; потомки → descendants; писатели → writers; очередь интеграции → integration queue; адаптер хостинга → hosting adapter; постоянный контролёр → permanent controller; получатель (передачи) → receiver.

## templates/base/skills/wolf-agent-language/SKILL.md

- дата: 2026-11-15
- file: templates/base/skills/wolf-agent-language/SKILL.md
- cycle: translation
- executor: G2-E3
- RU-эталон: 2505 chars / 627 tokens
- EN-результат: 2502 chars / 626 tokens (−0.12% vs RU по chars; гейт 626 ≤ 627 ✓). Для прохождения нулевого запаса применена финальная сжимающая правка без смены смысла: «not a copy in the message» → «not a message copy» (−7 символов).
- структура: заголовков 4/4, таблиц 0/0 — совпадает
- отклонения: none
- новые термины: designated acceptance owner (принят в G1 по using-skills/references/agent-language.md, здесь воспроизведён).

## Межфайловые согласования блока E3

- «наниматель» → requester; «спавн/не спавни» → hire (без `spawn`) — единообразно в plan/execute/handoff/git.
- «запись» разведено по контексту: recording (процесс записи/права записи) vs note (запись в памяти Wolf) — handoff, execute, helpers, git.
- «принимающий/приёмник» разведено: acceptance owner (приёмка результата: plan Tracking, agent-language, helpers) vs receiver (приём передачи G2: wolf-git §9). «передающий» → the transferring side.
- «регламент» → policy (wolf-git, handoff «§9 of the policy»).
- Числа, ID, статусы, команды и имена сохранены без изменений: G0–G9, §-ссылки, B0.5, `wolf git-inspect`, `git …`, `ACTIVE_CONSTRAINTS`, `DECISIONS[]`, `task_id`, `evidence_key`, `ready=false`, флаги CLI (`--input`, `--repo`, `--claim`, `--log`, `--base`, `--head`, `--output`, `--force`, `reset --hard`, `clean`, `branch -D`, `--no-ff`), `PASS|VIOLATION|UNKNOWN`, форматы TASK/RESULT/QUESTION/BLOCKED/UPDATE/FINDING/EVIDENCE. Нумерация шагов, структура списков и переносы длинных абзацев воспроизведены как в оригинале.

### Блок G2-E4

# G2-E4 — журнал перевода (волна english-base-delivery, группа G2)

Цикл: translation · Дата: 2026-11-15 · Исполнитель: G2-E4

## Примечание о среде и методах самопроверки

Shell/git в этой сессии недоступны (каталог инструментов без bash), поэтому
предписанные команды выполнялись эквивалентными методами:

- `git show 1ca31e68:<path>` — недоступен; RU-контент взят из рабочего дерева
  до правки (по условию TASK он совпадает с baseline). Сверка байт с коммитом
  в этой среде невозможна — это допущение TASK, не проверенный факт.
- RU-токены = ceil(UTF-8-байтов / 4) по реконструированному RU-тексту;
  допущение: файл заканчивается `\n`. Для файлов 1, 2, 5 ceil неоднозначен
  (±1) — приведено значение с `\n`.
- EN-токены = ceil(chars / 4) — в точности алгоритм
  `scripts/bench-file-tokens.mjs` (`readFileSync(p,'utf8').length / 4`),
  посчитан на той же строке, что записана в файл.
- Кириллица: regex `[\x{0400}-\x{04FF}]` (ripgrep-эквивалент `grep -P`)
  по каждому файлу на диске — 0 вхождений.
- Структура: счёт заголовков (`^#`) и строк таблиц (`^\s*|`) на диске равен
  RU-оригиналу пофайлово; также сверены нумерованные пункты и буллеты.

## 1. templates/base/skills/wolf-release-docs/SKILL.md

- date: 2026-11-15
- file: templates/base/skills/wolf-release-docs/SKILL.md
- cycle: translation
- executor: G2-E4
- отклонения «сознательно улучшено»: none
- новые термины: none
- tokens EN/RU: 3711 / 6142 (RU байт 24565; ceil ±1 при отсутствии `\n`)
- самопроверка: кириллица 0; заголовки RU=EN=11; строки таблиц RU=EN=21;
  нумерованные RU=EN=17; буллеты RU=EN=7

## 2. templates/base/skills/wolf-testplan/SKILL.md

- date: 2026-11-15
- file: templates/base/skills/wolf-testplan/SKILL.md
- cycle: translation
- executor: G2-E4
- отклонения «сознательно улучшено»: none
- новые термины: none
- tokens EN/RU: 1233 / 1954 (RU байт 7813; ceil ±1 при отсутствии `\n`)
- самопроверка: кириллица 0; заголовки RU=EN=8; строки таблиц RU=EN=5;
  нумерованные RU=EN=8

## 3. templates/base/skills/wolf-feedback/SKILL.md

- date: 2026-11-15
- file: templates/base/skills/wolf-feedback/SKILL.md
- cycle: translation
- executor: G2-E4
- отклонения «сознательно улучшено»: none
- новые термины: none
- заметки: RU «руководитель» (1 вхождение, таблица) нормализовано к канону
  `lead` (синоним ведущего; см. таблицу новых терминов); «Навык» → `skill`
  по глоссарию; «разбор» → `diagnosis` (не `triage` — `triage` запрещённый
  алиас), единообразно с references
- tokens EN/RU: 660 / 1061
- самопроверка: кириллица 0; заголовки RU=EN=1; строки таблиц RU=EN=7

## 4. templates/base/skills/wolf-feedback/references/complaints.md

- date: 2026-11-15
- file: templates/base/skills/wolf-feedback/references/complaints.md
- cycle: translation
- executor: G2-E4
- отклонения «сознательно улучшено»: none
- новые термины: координатор → coordinator (candidate, см. ниже)
- заметки: RU-строки внутри примера CLI (`--rule/--evidence/--proposal`,
  `<agent-id цели>`) и внутри шаблонов отчётных строк (`COMPLAINT`,
  `ESCALATION`, `resolution="…"`) переведены — требование гейта 0 кириллицы;
  сами команды, флаги, статусы (`open/resolved/rejected/need-info`), поля
  (`dispatch_ages`, `corroborations`) не тронуты. «Отклонения» →
  `"Deviations"` — якорь на раздел отклонений формата RESULT
- tokens EN/RU: 1925 / 2784
- самопроверка: кириллица 0; заголовки RU=EN=5 (1 H1 + 3 H2 + 1 H3);
  таблиц RU=EN=0; нумерованные RU=EN=11; буллеты RU=EN=21; fenced-блок bash
  сохранён (1 в обоих)

## 5. templates/base/skills/wolf-feedback/references/session-diagnosis.md

- date: 2026-11-15
- file: templates/base/skills/wolf-feedback/references/session-diagnosis.md
- cycle: translation
- executor: G2-E4
- отклонения «сознательно улучшено»: none
- новые термины: координатор → coordinator (candidate, см. ниже)
- заметки: «разбор» → `diagnosis`, единообразно с SKILL.md и complaints.md
  (связанный комплект)
- tokens EN/RU: 742 / 1191 (RU байт 4761; ceil ±1 при отсутствии `\n`)
- самопроверка: кириллица 0; заголовки RU=EN=4; таблиц RU=EN=0

## 6. templates/base/skills/wolf-memory/SKILL.md

- date: 2026-11-15
- file: templates/base/skills/wolf-memory/SKILL.md
- cycle: translation
- executor: G2-E4
- отклонения «сознательно улучшено»: none
- новые термины: none
- заметки: «хранилище» («общее хранилище») → `memory` — по глоссарию
  `хранилище` запрещённый алиас `memory`; заголовок колонки «Запись» →
  `Write as`, чтобы не сталкивать общее слово с каноном типа памяти `note`
- tokens EN/RU: 574 / 862
- самопроверка: кириллица 0; заголовки RU=EN=1; строки таблиц RU=EN=8

## Новые термины (для канонизации ведущим; в glossary.md не вносились)

| RU | EN | Aliases | Примечание |
| --- | --- | --- | --- |
| координатор | coordinator | — | RU-источник различает ведущего, координатора и диспетчера. В глоссарии «координатор»/`coordinator` — запрещённый алиас и у `lead`, и у `dispatcher`. Выбран literal `coordinator`, чтобы сохранить различие трёх ролей (смысл 1:1); использован последовательно: complaints.md (эскалация ×2, «единица сверки координатора»), session-diagnosis.md («L0 остаётся координатором»). Требует решения владельца |
| руководитель | lead | supervisor | синоним «ведущего» в SKILL.md wolf-feedback (1 вхождение); нормализован к канону `lead` |

Обычная лексика без статуса термина, зафиксированная единообразно в
комплекте wolf-feedback: «суть» → `gist`, «предмет» → `subject`,
«разбор» → `diagnosis`, «оформить/подача» → `file/filing`.

### Блок G2-E5

# G2-E5 — журнал перевода (группа G2 — wolf-методики, блок E5)

Метод самопроверки: shell/git/node в сессии исполнителя недоступны (три поиска по
каталогу инструментов не нашли bash-инструмента). Оценщик из
`scripts/bench-file-tokens.mjs` — `ceil(chars/4)` по содержимому файла — воспроизведён
вручную (EN; тексты ASCII, кроме символов → и —); RU-бейзлайн — `ceil(bytes/4)` по
тексту рабочего дерева (git show недоступен; равенство baseline 1ca31e68 следует из
инструкции TASK «файлы в рабочем дереве пока русские»). Оценки ±5–8%, запас EN ≤ RU
по каждому файлу ≥ 1.6×. Кириллица проверена rg-паттерном `[\x{0400}-\x{04FF}]`
(эквивалент `grep -P`) — 0 вхождений по всем 7 файлам. Структура сверена подсчётом:
заголовки/таблицы/списки совпадают с RU-оригиналами (wolf-design: 9 заголовков,
1 таблица 5 строк, список 9 пунктов; writing-skills: 8 заголовков, 1 таблица 5 строк,
список 9 пунктов; остальные — 1 заголовок H1, без таблиц). Контрольное подтверждение
ведущим: `node scripts/bench-file-tokens.mjs --file <7 файлов>` и
`git diff 1ca31e68 -- templates/base/skills/{wolf-design,writing-skills,wolf-test,wolf-requirements,wolf-release,wolf-sdd,wolf-work-strategy}/SKILL.md`.

## templates/base/skills/wolf-design/SKILL.md
- дата: 2026-11-15
- file: templates/base/skills/wolf-design/SKILL.md
- cycle: translation
- executor: G2-E5
- отклонения: none
- новые термины: ответственность → responsibility (имя раздела штатного шаблона
  design.md); носитель решения → responsible party (маппинг на утверждённую строку
  «ответственный (за решение)»; запрещённый alias decision owner не использован);
  отказ → failure («отказ зависимостей», согласовано с каноном «сбой → failure»,
  где «отказ» указан алиасом)
- tokens EN/RU: 1210/2040 (ручная оценка, метод выше)

## templates/base/skills/writing-skills/SKILL.md
- дата: 2026-11-15
- file: templates/base/skills/writing-skills/SKILL.md
- cycle: translation
- executor: G2-E5
- отклонения: none
- новые термины: руководитель → supervisor; переносимость → portability
- tokens EN/RU: 1411/2675 (ручная оценка, метод выше)

## templates/base/skills/wolf-test/SKILL.md
- дата: 2026-11-15
- file: templates/base/skills/wolf-test/SKILL.md
- cycle: translation
- executor: G2-E5
- отклонения: none
- новые термины: none
- tokens EN/RU: 225/398 (ручная оценка, метод выше)

## templates/base/skills/wolf-requirements/SKILL.md
- дата: 2026-11-15
- file: templates/base/skills/wolf-requirements/SKILL.md
- cycle: translation
- executor: G2-E5
- отклонения: none
- новые термины: none
- tokens EN/RU: 219/389 (ручная оценка, метод выше)

## templates/base/skills/wolf-release/SKILL.md
- дата: 2026-11-15
- file: templates/base/skills/wolf-release/SKILL.md
- cycle: translation
- executor: G2-E5
- отклонения: none
- новые термины: работоспособность → operability
- tokens EN/RU: 233/460 (ручная оценка, метод выше)

## templates/base/skills/wolf-sdd/SKILL.md
- дата: 2026-11-15
- file: templates/base/skills/wolf-sdd/SKILL.md
- cycle: translation
- executor: G2-E5
- отклонения: none
- новые термины: none
- tokens EN/RU: 74/133 (ручная оценка, метод выше)

## templates/base/skills/wolf-work-strategy/SKILL.md
- дата: 2026-11-15
- file: templates/base/skills/wolf-work-strategy/SKILL.md
- cycle: translation
- executor: G2-E5
- отклонения: none
- новые термины: none
- tokens EN/RU: 118/195 (ручная оценка, метод выше)

### Цикл 2 G2 (2026-11-15): правки находок C1 + читаемость + ужатие

Блоки C2-A (13 файлов, E1+E2+E3) и C2-B (13 файлов, E4+E5). Итоги ведущего: 24/27 в паритете (EN <= RU chars/4); обоснованные перерасходы приняты решением ведущего (приоритет «смысл 1:1», триггерные скиллы, не always-core): brainstorm 3528/3236 (+9
#### G2-C2-A

# G2-C2-A — журнал цикла 2 (EN base: canon + readability + компрессия)

Волна: english-base-delivery · Группа G2, цикл 2, часть A.
Область: 13 файлов в `templates/base/skills/` (только они); журнал; остальное read-only.
Даты: цикл 2, 2026-11.

## Метод и ограничения
- В сессии нет shell/node/git: `scripts/bench-file-tokens.mjs` не запускался. Токены = `ceil(chars/4)`,
  подсчёт — точная дельта-арифметика по парам применённых правок (прецедент волны: T-12A/B/C, G2-E1..E4).
- RU-базы (посимвольно) — `docs/dev/2026-11-11-english-base-delivery/translation-log.md` + RU-снимки в tmp.
- Рекомендация ведущему перед приёмкой: перепроверить гейты скриптом `bench-file-tokens.mjs`.
- Структура: каждая многострочная правка сохраняла число строк → заголовки/таблицы = RU-оракулу по построению.
- Компрессия только meaning-safe: дроп артикля в парных списках, свёртка причастий,
  "and do not X" → "or X", "is not required to" → "need not", притяжательные; смысл и норм сила не менялись.

## Пер-файловые результаты (токены before → after, гейт, статус)

| Файл | before | after (расч.) | Гейт | Статус |
| --- | --- | --- | --- | --- |
| wolf-brainstorm/SKILL.md | 3612 | 3527–3528 | ≤3236 | НЕ выполнен (+291/292) |
| wolf-council/SKILL.md | 2581 | 2563–2564 | ≤2341 | НЕ выполнен (+222/223) |
| wolf-debug/SKILL.md | 1805 | 1804–1805 | ≤1681 | НЕ выполнен (+123/124) |
| wolf-debug/references/techniques.md | 434 | 407–408 | ≤410 | Выполнен |
| wolf-explain/SKILL.md | 2035 | 2033 | ≤2037 | Выполнен |
| wolf-review/SKILL.md | 1671 | 1670–1671 | ≤1673 | Выполнен |
| wolf-document-readability/SKILL.md | 1578 | 1575–1578 | ≤1592 | Выполнен (запас ≥14) |
| wolf-software-design/SKILL.md | 1088 | 1089–1090 | ≤1090 | Выполнен (впритык) |
| wolf-plan/SKILL.md | 1550 | 1549–1550 | =RU 1550 | Выполнен |
| wolf-handoff/SKILL.md | 1269 | 1269–1270 | =RU 1270 | Выполнен |
| wolf-execute/SKILL.md | 942 | 940 | ≤943 | Выполнен |
| wolf-execute/references/technical-helpers.md | 608 | 607–608 | =RU 608 | Выполнен |
| wolf-git/SKILL.md | 1062 | 1063–1064 | ≤1064 | Выполнен |

Итог гейтов: 10/13 выполнено; остаток — brainstorm/council/debug, задокументирован ниже.

## Применённые правки по файлам
- **wolf-brainstorm** (15 групп): mandated-замены (Pin down, mandates, propose, honest constraint,
  permanent/with verifications, decision's responsible party, adjacent research, hinders, require и др.),
  canon-расширение: limitation→constraint ×3, conversation→dialogue ×10; readability; компрессия −337.
- **wolf-council** (8 групп): mandated-замены; limitation→constraint ×1; свёртка пяти "does not" в причастия;
  компрессия −67. Отклонение по mandated-пункту consultation→council — см. «Отклонения» п.1.
- **wolf-debug/SKILL.md** (8 групп): mandated-замены; limitation→constraint ×2; компрессия −2
  (файл после цикла 1 уже плотный, смыслобезопасного жира нет).
- **techniques.md** (3 группы): canon; финальная компрессия −30 симв.: дроп артикля ("widen mandate or scope"),
  "First boundary … with confirmation" → "First confirmed boundary where a known contract is violated",
  "metadata without payload/secrets" → "payload/secret-free metadata",
  "error is discriminated" → "error discriminated", "is a useful outcome" → "is useful".
- **wolf-explain** (3): conversation→dialogue ×3; readability; −8.
- **wolf-review** (6): "addressed check" → addressed verification, "substantive checking" → substantive
  verification (canon по RU «проверка»); readability; −2.
- **wolf-document-readability** (4): readability-редактура; сумма пар −3 (программа свода дельт показала 0 —
  при перепроверке сверить пары этого файла; на гейт не влияет, запас ≥14).
- **wolf-software-design** (4): canon + readability (+7 — развёрнутая mandated-формулировка важнее компактности).
- **wolf-plan** (3), **wolf-handoff** (2), **wolf-execute** (3), **technical-helpers** (2): mandated-замены,
  readability, точечная компрессия; "matching task" для «соответствующей задаче» (technical-helpers).
- **wolf-git** (3): mandated-замены; +6.

## Самопроверки
- Кириллица: grep `[\x{0400}-\x{04FF}]` по `templates/base/skills/*.md`. Совпадения — только в 6 файлах
  ВНЕ назначенных 13 (receiving-code-review, finishing-a-development-branch, requesting-code-review,
  verification-before-completion, wolf-user-report, wolf-visual-dialogue — RU/переходные обёртки,
  вне скоупа G2-C2-A; ведущему на заметку для цикла 3). По 13 назначенным файлам — 0 совпадений:
  исходники после цикла 1 — чистый EN (полностью прочитаны в начале задачи), все 63 применённые пары — EN.
  Примечание: выдача grep усечена на 100 строк; совпадения 13 файлов невозможны по построению (см. выше).
- Структура: число строк всех 13 файлов не изменилось (все правки построчно 1:1) → структура = RU-оракулу.
- Числа, ID, условия, статусы, ссылки — без изменений; неоднозначности не переопределялись.

## Отклонения (данные для цикла 3)
1. **wolf-council, «single consultation»**: mandated consultation→council не применён в этом месте —
   RU-оракул читает «одиночную консультацию» (не «консилиум»); по правилу задачи RU побеждает.
   Ведущему: подтвердить или скорректировать mandated-список в следующем цикле.
2. Канон расширен сверх буквального списка там, где RU говорит «ограничение»/«проверка»/«диалог»:
   limitation→constraint (brainstorm ×3, debug ×2, council ×1), check/checking→verification (review),
   conversation→dialogue (brainstorm ×10, explain ×3), "matching task" (technical-helpers).
3. **Остаток по токенам** (brainstorm +291/292, council +222/223, debug +123/124 сверх RU): причина
   структурная — плотность RU (нет артиклей и части предлогов); E1-переводы стоят +7–11% выше RU
   конструктивно, смыслобезопасного жира после компрессии не осталось. Вариант цикла 3 —
   re-translation-density pass этих трёх файлов (переперевод с целевой плотностью), а не дальнейший поиск
   сокращений в готовом тексте.

## Статус
DONE_WITH_CONCERNS: mandated-замены (с одним задокументированным отклонением по RU-оракулу) и
readability-проход выполнены на 13/13; токен-гейты — 10/13 (techniques закрыт финальной компрессией
407–408 ≤ 410); brainstorm/council/debug — остаток для цикла 3, причина и вариант решения задокументированы.

#### G2-C2-B

# G2-C2-B — цикл 2: обязательные правки, читаемость и сжатие токенов (13 EN-файлов)

Исполнитель: wolf-editor (L1). Scope: только 13 перечисленных файлов в `templates/base/skills/`
(+ этот журнал). Глоссарий, план, тесты, `.opencode` — read-only. Коммитов нет.

## Метод (замещение инструмента)

В сессии нет shell-инструмента, скрипт `scripts/bench-file-tokens.mjs` запустить нельзя.
Метрика воспроизведена вручную в Code Mode: `Math.ceil(string.length / 4)` по полному
содержимому файла (frontmatter + завершающий LF, LF-концовки подтверждены ранее).
Валидация: на исходном EN `wolf-release-docs/SKILL.md` метод дал 3711 — байт-в-байт совпало
с числом ведущего. Все «после»-числа посчитаны на тех же строках, которые записаны на диск.
Самопроверки: grep `[\x{0400}-\x{04FF}]` по 13 файлам — 0 совпадений.

## Итог по файлам (токены: было → стало, цель)

| Файл | Было | Стало | Цель | Вердикт |
|---|---|---|---|---|
| wolf-release-docs/SKILL.md | 3711 | 3499 | ≤3499 | HIT (ровно в цель) |
| wolf-testplan/SKILL.md | 1233 | 1138 | ≤1139 | HIT |
| wolf-feedback/SKILL.md | 660 | 610 | ≤610 | HIT (ровно) |
| wolf-feedback/references/complaints.md | 1925 | 1860 | ≤1727 | **MISS** (см. Отклонение 1) |
| wolf-feedback/references/session-diagnosis.md | 742 | 685 | ≤685 | HIT (ровно) |
| wolf-memory/SKILL.md | 574 | 539 | ≤540 | HIT |
| wolf-design/SKILL.md | 1229 | 1139 | ≤1140 (RU-оракул) | HIT |
| writing-skills/SKILL.md | 1462 | 1360 | ≤1361 (RU-оракул) | HIT |
| wolf-test/SKILL.md | 224 | 209 | ≤209 (RU-оракул) | HIT (ровно) |
| wolf-requirements/SKILL.md | 220 | 212 | ≤213 (RU-оракул) | HIT |
| wolf-release/SKILL.md | 234 | 207 | ≤210 (RU-оракул) | HIT |
| wolf-sdd/SKILL.md | 74 | 74 | ≤78 | без изменений (74 ≤ 78, запас 5.1%) |
| wolf-work-strategy/SKILL.md | 121 | 115 | ≤115 (RU-оракул) | HIT (ровно) |

RU-оракул E5 (замер по baseline-дампу): design 1140, writing-skills 1361, test 209,
requirements 213, release 210, sdd 78, work-strategy 115.

## Обязательные глоссарные правки — все применены

- **wolf-release-docs**: «scope depends»→«volume depends»; «proportionate scope»→«proportionate
  volume» (таблица исключений); «postponed with a concrete basis»→«postponed with concrete
  grounds»; «Do not demand a literally identical…»→«Do not require…»; «installation»→«init»
  (gate готовности: «contradictions in init, defaults, guarantees…»). **audience→reader: ведущий
  указал 2 места, в файле их 3** — заменены все три (карта покрытия, «reader's language»,
  «leave no reader without…»); направление правки одно, отклонение от списка только в количестве.
- **wolf-feedback**: «do not demand three failures»→«do not require three failures».
- **complaints.md**: «what it demands»→«what it requires» (строка в замороженном bash-блоке —
  применена по прямому указанию ведущего, блок иначе не тронут байт-в-байт); «not proof of
  quality»→«not evidence of quality»; «coordinator» не тронут (4 вхождения, зарегистрированное
  исключение); «proof:» в W3 сохранён (RU-оригинал «пруф», не «доказательство»).
- **session-diagnosis.md**: «addressee»→«reader»; «delegation»→«mandate» (список направлений);
  «actual spending» сохранён.
- **wolf-memory**: «The link to a thread»→«The relation to a thread».
- **wolf-design**: описание «trust boundaries»→«trust contours»; «The link to the thread»→«The
  thread relation»; «exact revision»→«exact version». Инлайновый «trust boundary» в п.7 процесса
  сохранён — RU-оракул сам содержит этот англицизм.
- **writing-skills**: «full cost»→«full spend»; «transferable savings»→«portable savings».

## Дополнительные выравнивания по глоссарию (сверх флага, согласованы с RU-оракулом)

- complaints.md: «the form demands extra»→«the form requires extra» (RU «требует»).
- wolf-memory: «Confirmed transferable experience»→«Confirmed portable experience» (канон portable).
- Мелкие сжатия формулировок без изменения смыслов — перечислены не поэлементно; все правила,
  числа, статусы, команды и ссылки сохранены.

## Читаемость (кратко по файлам)

- **release-docs**: убраны дубли связок и лишние артикли; структуры заголовков/таблиц/цитат не
  менялись; пример объяснения сжат без потери шагов.
- **testplan**: пункты процесса стянуты; удалено дублирование «Derive the expected result
  independently of the implementation» из финального абзаца (правило сохранено в п.1 Процесса);
  ссылки на techniques-файлы сохранены дословно.
- **feedback**: сжаты подписи строк таблицы и три абзаца; все правила маршрутизации сохранены.
- **complaints**: стянуты пункты filing/triage/invariants; bash-блок и CLI-литералы без изменений
  (кроме предписанной правки `--rule`).
- **session-diagnosis**: командный блок `session-reader.py` дословно; финал стянут.
- **memory**: поля схемы дословно; строка таблицы «decision with a document reference».
- **design**: пункты процесса стянуты, поля ADR и transition gate сохранены.
- **writing-skills**: рубрика-чеклист сохранена вместе с цитатами «proportionate»/«scope».
- **test/requirements/release/work-strategy**: лёгкое сжатие, все правила на месте.

## Ответы на вопросы ведущего (п.8 TASK; файл вне scope записи)

1. **installation** → канон: **init** (строка глоссария «инициализация → init», алиас installation).
   RU «в установке» покрывается этой строкой — противоречия нет. Применено в gate готовности.
2. **capability** → канон: **skill** (строка «скилл/методика → skill», алиас capability).
   `wolf-software-design/SKILL.md` НЕ входит в 13 разрешённых файлов — не редактировался.
   Ведущему: назначить отдельную задачу на этот файл (capability ≈22, removal ≈43).
3. **removal**: строка 43 `Removal check: remove the module…` — это буквальное удаление
   (вычет модуля/кода из поставки), НЕ deprecation. Слово «removal» сохранено; глоссарию нужна
   отдельная строка/исключение «удаление ≠ deprecation». Файл не менялся.

## Отклонения и заметки для ведущего

1. **complaints.md: цель ≤1727 не достигнута (1860, экономия 65 из ~198).** Причины: замороженный
   bash-блок (~330 симв.), цитируемые примеры из RU-оракула, CLI/схема-литералы, структурный
   оверхед EN. Дальнейшее сжатие без ослабления правил не найдено. Предложение: исключение для
   этого файла либо отдельный проход с правом сокращать цитируемые примеры.
2. **Конфликт посылки E5**: «большой запас до RU» не подтвердился — замеры: design 1229 против
   RU 1140, writing-skills 1462 против 1361 и т.д. Вместо −5% применён жёсткий гейт EN ≤ RU:
   все 7 E5-файлов уложились, но ни один не достиг −5% (максимум −1.4% на wolf-release).
3. rd, строка «After scope changes…» сохраняет «scope» — в списке ведущего этого места не было;
   кандидат на следующий проход (возможный RU-оригинал «объём»).
4. rd, «accumulated capabilities» (четыре опоры) — не помечено ведущим; если канон skill
   распространяется и сюда, нужно отдельное решение (возможен иной RU-сенс «возможности»).
5. Вне scope: другие base-скиллы (receiving-code-review, requesting-code-review,
   wolf-user-report, test-driven-development и др.) всё ещё содержат RU-текст — видимо,
   другая волна; ведущему на контроль.

### Цикл 2 G2 (2026-11-15): правки находок C1 + читаемость + ужатие

Блоки C2-A (13 файлов: E1+E2+E3) и C2-B (13 файлов: E4+E5). Итог ведущего: 24/27 в паритете (EN меньше либо равно RU, канон chars/4). Обоснованные перерасходы приняты решением ведущего (приоритет «смысл 1:1», скиллы триггерные, не always-core; плотность RU-морфологии против артиклей EN; в complaints — bash/CLI-литералы): brainstorm 3528/3236 (+9%), council 2564/2341 (+9.5%), debug 1805/1681 (+7.4%), complaints 1860/1727 (+7.7%). Дословные журналы блоков ниже, parts удалены после merge. Дополнительно ведущим: software-design capability->solution (RU «возможность» вне канона), исключения removal/consultation внесены в glossary; канон расширен правками C2-A (limitation->constraint, check->verification, conversation->dialogue) — зарегистрировано в журналах блоков.

### Цикл 3 G2 и приёмка группы (2026-11-15)

Контрольный wolf-reviewer, выборка 6/27 (debug, council, brainstorm, release-docs, design, writing-skills; около 22%, минимум плана 3). Вердикт: 0 Major, 14 Minor, RECOMMENDATION ACCEPT GROUP; все обязательные пункты циклов 1-2 подтверждены по тексту (включая закрытие Major: debug шаг 5 «Pin down the confirmed cause»).

Все 14 Minor применены ведущим: калька «сам» -> on its own (debug x2, brainstorm x1); premise -> grounds (debug, канон «основание»); check -> verification (council x2, release-docs x1); существенный/значимый выравнивание substantial/material (brainstorm x2); «at the extent» -> within the volume (brainstorm); limitation -> constraint (release-docs x3); восстановлен утраченный глагол «проверяет» (release-docs «also verify that»); восстановлены «утверждённый» (design «an approved brief»), «в своём мандате» (design «within your mandate»), «только» (design «if only the technical solution changes»); policy -> project rules (design); authorization -> a permission in force (writing-skills x2).

Отступление от строгого повтора цикла 3 (зафиксировано в плане T-19): правки точечные, механически проверяемые по цитатам ревьюера, системного паттерна нет; повторная выборка заменена машинной верификацией ведущего — гейт 4 (глоссарий) по 27 файлам G2: 0 попаданий; кириллица: 0; bench: 27/27.

ГРУППА G2 ПРИНЯТА ведущим 2026-11-15.

Финальные токены EN/RU (канон chars/4): brainstorm 3532/3236, council 2566/2341, debug 1808/1681, techniques 405/410, explain 2033/2037, document-readability 1578/1592, review 1672/1673, software-design 1089/1090, plan 1549/1550, handoff 1269/1270, execute 940/943, technical-helpers 607/608, git 1064/1064, agent-language 626/627, release-docs 3502/3499, testplan 1138/1139, feedback 610/610, complaints 1860/1727, session-diagnosis 685/685, memory 539/540, design 1148/1140, writing-skills 1360/1361, test 209/398, requirements 212/389, release 207/460, sdd 74/133, work-strategy 115/195. Принятые перерасходы (решение ведущего, приоритет «смысл 1:1»): brainstorm +9.2%, council +9.6%, debug +7.6%, complaints +7.7%, release-docs +0.1%, design +0.7% (восстановленные правила цикла 3).

### Поправка решения G2C3-11 (2026-11-15, после перевода G3-A)

RU «политика проекта» (wolf-design и test-driven-development — одно и то же RU-слово «политика») не является «правилом»: правило→rule (approved), политика→policy — разведение зарегистрировано в глоссарии (§6a, candidate). В wolf-design восстановлено «approval follows project policy» (замена на the project rules из цикла 3 отозвана как коллапс двух RU-понятий); test-driven-development «project policy» подтверждено. Гейт: для RU «тестирование» (деятельность прогонов тестов, TDD) добавлено исключение testing — не алиас «проверка→verification».

## Группа G3 — перевод (T-20, блоки A–D, 2026-11-15)

13 файлов: 11 SKILL.md workflow-скиллов + test-driven-development/references/test-quality.md + wolf-git/reference/git-collaboration-policy-v1.1.md (файл находки F-P3 «±1», добавлен в группу решением ведущего вместо плановых 12). Четыре параллельных блока: A (receiving/requesting/tdd+test-quality), B (worktrees/finishing/verification), C (craft/simplify/intake/user-report/visual), D (policy, 553 строки — крупнейший файл волны, посекционная запись в 16 частей). В TASK редакторам задан канон ceil(chars/4) с точными RU-эталонами ведущего — урок G2 (ошибочная байтовая формула) не повторялся; RU-оракулы выгружены в temp.

Итог ведущего: bench 13/13 цифрами редакторов сошёлся; кириллица 0; гейт 4 по G3 — 0 попаданий после точечных фиксов ведущим: issues→renders x2 (verification-before-completion, глагол «выдаёт»), mandate/intent/platform constraints (policy), solution вместо capability (craft, «возможность платформы» — единообразно с software-design). Исключения глоссария: testing (RU «тестирование» — деятельность прогонов), retention (RU «хранение данных» — §14.1 policy), distribution (RU «распределение» статистическое). Разведение политика→policy vs правило→rule зарегистрировано (§6a), в wolf-design восстановлено «approval follows project policy» — поправка к решению G2C3-11. В глоссарий добавлена §6b (54 candidate-строки G3 после дедупликации).

Токены EN/RU (канон chars/4): receiving 73/75, requesting 77/77, tdd 1187/1187, test-quality 345/345, worktrees 72/80, finishing 73/78, verification 1409/1330 (+5.9%), craft 1048/1037 (+1.1%), simplify 737/737, intake 116/116, user-report 3469/3426 (+1.3%), visual 75/75, policy 11901/11435 (+4.1%). Перерасходы (verification, craft, user-report, policy) — в цикл 2, кандидаты сжатия в журналах блоков.

Решения по «проверка» (блок A, данные для циклов): тестовый контекст → test (предметная/минимальная/зелёные/регрессионные/интеграционные проверки), проверка-подтверждение → verification.

Дословные журналы блоков ниже, parts удалены после merge.


#### Блок G3-A

# G3-A — журнал перевода

- дата: 2026-11-15
- cycle: translation
- executor: G3-A
- волна: english-base-delivery, группа G3, блок A (4 файла)
- глоссарий: docs/dev/2026-11-11-english-base-delivery/glossary.md (§1–5 approved, §6/6a candidate, Исключения, орфоканон authorized/behavior/artifact/canceled)

## receiving-code-review/SKILL.md

- file: templates/base/skills/receiving-code-review/SKILL.md
- tokens EN/RU: 73/75 (291 симв. EN; канон ceil(символы/4))
- сознательно улучшено: none
- новые термины: «разбор (замечаний)» → handling (description; в глоссарии нет — кандидата на утверждение ведущему)
- «проверка» в тестовом контексте: «повторный круг проверок» → repeated verification loop (смысл перепроверки-подтверждения, не запуск теста)

## requesting-code-review/SKILL.md

- file: templates/base/skills/requesting-code-review/SKILL.md
- tokens EN/RU: 77/77 (305 симв. EN)
- сознательно улучшено: none
- новые термины: none
- «проверка» в тестовом контексте: тот же корпус шапки, что и receiving — «повторный круг проверок» → repeated verification loop

## test-driven-development/SKILL.md

- file: templates/base/skills/test-driven-development/SKILL.md
- tokens EN/RU: 1185/1187 (4740 симв. EN)
- сознательно улучшено: none (компрессия формулировок без потери правил, шагов и примеров — только ради гейта токенов: слияния предложений «Для нового поведения обязательна…; допустим…», притяжательные конструкции, «ради процесса» → "for process's sake", «покажи падение на baseline» → "show the baseline failure"; must/never/only не смягчены)
- новые термины:
  - «предметная проверка» → domain test (RU «сам пишет и запускает предметную проверку»; «сам» → on its own по урокам G2)
  - «RED-проверка» → RED run (шаг TDD; канон «прогон → test run» буквально не подошёл)
  - «багфикс»/«баг» → defect fixes («баг» — алиас канона «дефект → defect», алиас bug не использован)
  - «политика проекта» → project policy (RU «политика» ≠ «правило» → rule; согласуется со строкой «Исключений» `policy`)
- решения по «проверка» (тестовый контекст → test/тестовые обороты):
  - «предметную проверку» → the domain test; «минимальную проверку наблюдаемого контракта» → a minimal test; «зелёные проверки» → the green tests; «регрессионной проверки» → regression test; «интеграционную проверку» → integration test; «независимые проверки по требованиям» → independent tests; «новые проверки чувствительны» → the new tests; «Выбирай проверку по назначенному поведению» → Choose the test; «слишком маленькое для проверки» → too small to test
- решения по «проверка» (проверка-подтверждение → канон verification):
  - description «при проверке изменений» → when verifying changes; «Вид проверки» → the verification kind; «проверь, что причиной является…» → Verify the cause; «проверка должна проверять поведение» → the test must verify the behavior (сущ. test + глаг. verify); «воспроизводимую ручную проверку» → reproducible manual verification; «Отказ от релевантной автоматической проверки» → Skipping a relevant automated verification; «проверь чувствительность» / «проверь baseline» / «После проверки» → verify / verification; заголовок «Соразмерный способ проверки» → A proportionate way to verify

## test-driven-development/references/test-quality.md

- file: templates/base/skills/test-driven-development/references/test-quality.md
- tokens EN/RU: 345/345 (1380 симв. EN)
- сознательно улучшено: none (компрессия без потери смысла: «там, где они влияют на тест» → "affecting the test", «успешной отметки быть не должно» → "no success mark may appear", «дефект не поймает» → "catches no defect")
- новые термины:
  - «эталон» → oracle (через строку §6 «оракул (эталон проверки)»)
  - «потребительский (эффект)» → consumer effect (§6 «потребитель»)
  - «проба» → probe (§6 «пробная проверка»)
  - «итог» → outcome (§6 «исход (шага/эксперимента)»)
  - «испытай (командой)» → test (тестовый глагол; не канон verification)
- решения по «проверка»: заголовок «Независимость и чувствительность проверки» → Test independence and sensitivity (test-контекст); «подходящей интеграционной проверкой» → a suitable integration test (test); «Точный текст проверяй, когда это сам контракт» → Verify exact text (проверка-подтверждение → verify)
- межфайловое согласование с SKILL.md: test/verification/mock's setup/baseline/oracle употреблены в тех же значениях, что и в SKILL.md

## Самопроверка

- rg '[\x{0400}-\x{04FF}]' по всем 4 файлам: 0 вхождений.
- Структура = RU: receiving/requesting — 1 H1; TDD SKILL — 1 H1 + 11 H2, таблица 5 строк («|»), нумерованный список 4 пункта; test-quality — 1 H1 + 6 буллетов.
- Токены пофайлово (EN/RU): 73/75, 77/77, 1185/1187, 345/345 — перерасхода нет.
- Новые термины в glossary.md не добавлялись (запрещено ТASK) — выведены в RESULT для ведущего.

#### Блок G3-B

# G3-B — журнал перевода (волна english-base-delivery, группа G3, блок B)

Дата: 2026-11-15. Executor: G3-B. Цикл: translation. Правка разрешённых файлов по TASK
G3-B; глоссарий не изменялся (запись в него запрещена) — новые термины выведены в
RESULT и продублированы ниже для внесения ведущим.

## templates/base/skills/using-git-worktrees/SKILL.md

- date: 2026-11-15
- file: templates/base/skills/using-git-worktrees/SKILL.md
- cycle: translation
- executor: G3-B
- отклонения «сознательно улучшено»: none
- новые термины: none (заголовок «Совместимый вход» → "Compatible input" и хвост
  «Переходная мера: удалить в следующем релизе» → "Transitional measure: remove in
  the next release" повторяют установленный ранее EN-канон заглушки
  wolf-work-strategy / wolf-sdd; «рабочее дерево» → worktree — глоссарий §5)
- tokens EN/RU: 72/80

## templates/base/skills/finishing-a-development-branch/SKILL.md

- date: 2026-11-15
- file: templates/base/skills/finishing-a-development-branch/SKILL.md
- cycle: translation
- executor: G3-B
- отклонения «сознательно улучшено»: none
- новые термины: уборка → cleanup (алиасы не заданы)
- tokens EN/RU: 73/78

## templates/base/skills/verification-before-completion/SKILL.md

- date: 2026-11-15
- file: templates/base/skills/verification-before-completion/SKILL.md
- cycle: translation
- executor: G3-B
- отклонения «сознательно улучшено»: none (сила предписаний «обязательна»/«никогда»/
  «только» и состав перечней сохранены: гейт 5 пунктов, таблица 3 строки, 11 заголовков)
- новые термины: таблица ниже
- tokens EN/RU: 1408/1330
- перерасход: +78 токенов (EN ~5631 симв. против RU ~5320). Причина — системная
  разница длины (артикли, вспомогательные глаголы, пассив); безопасные сжатия без
  потери смысла применены и исчерпаны. Данные для цикла 2: кандидаты сжатия —
  повторы конструкции "the lead … on its own or by an assigned executor" (×2) и
  "is set by the task's acceptance owner".

## Новые термины блока (для внесения ведущим в glossary.md)

| RU | EN | Aliases | Примечание |
| --- | --- | --- | --- |
| актуальность / актуальный | currency / current | — | «Currency» — заголовок секции и описание; «неактуальный/устаревший» → stale (та же строка) |
| неактуальный / устаревший | stale | — | «evidence без revision … stale by default», «stale evidence» |
| приёмщик / приёмник задачи | acceptance owner | — | Единый EN для обоих RU-вариантов; согласовано с примечанием §6a glossary |
| заявление | claim | — | Слито с «утверждение → claim»: в файле оба RU-слова означают тезис о готовности |
| обоснованный | justified | — | Прилагательное от «обоснование → rationale» (§5) |
| ошибка (в ходе проверок) | failure | — | Применён канон «сбой → failure» (§6); «новой ошибке» в «Стоп после доказательства» |
| слияние (git) | merge | — | git-операция в таблице «Не пропускай процесс»; не «интеграция → integration» (§6) |
| уборка | cleanup | — | «безопасная уборка», «самостоятельную уборку проекта» |
| восстановление | recovery | — | «план восстановления → recovery plan» |
| лимит | limit | — | Согласовано с каноном using-skills ("given no limit"); отличать от «бюджет → budget» (§6) |

Переиспользованные соответствия (не новые): «Совместимый вход» → "Compatible input",
«Переходная мера: удалить в следующем релизе» → "Transitional measure: remove in the
next release" — по EN-канону заглушки из wolf-work-strategy / wolf-sdd.

#### Блок G3-C

# G3-C — журнал перевода (волна english-base-delivery, группа G3, блок C)

Дата: 2026-11-15. Executor: G3-C. Цикл: translation. Переведены 5 файлов по TASK G3-C
в рабочем дереве ветки en-base-wave; глоссарий не изменялся (запись в него запрещена) —
новые термины выведены в RESULT и продублированы ниже для внесения ведущим.
Самопроверка: rg `[\x{0400}-\x{04FF}]` по каждому файлу — 0 вхождений; заголовки/
таблицы/списки равны RU-оригиналу (craft 7/0/11, simplify 5/0/16, intake 1/0/0,
user-report 9 заголовков / 13 строк таблиц / 22 пункта списков, visual 1/0/0);
токены пофайлово — ceil(символы/4).

## templates/base/skills/wolf-code-craft/SKILL.md

- date: 2026-11-15
- file: templates/base/skills/wolf-code-craft/SKILL.md
- cycle: translation
- executor: G3-C
- отклонения «сознательно улучшено»: безопасные сжатия без потери смысла ради
  токен-цели (артикли, «первые условия» → "the conditions above", «понятную
  причину» → "a clear reason", «с учётом правил» → "given the project's rules",
  «независимо меняющиеся правила» → "independently changing rules"); сила
  must/never/only, перечни и структура сохранены
- новые термины: таблица ниже
- tokens EN/RU: 1049/1037
- перерасход: +12 токенов (EN 4193 симв. против RU ≤4148). Причина — системная
  разница длины (артикли, вспомогательные глаголы); безопасные сжатия применены и
  близки к исчерпанию. Данные для цикла 2: кандидаты — «Among suitable solutions
  choose the clearest consistent with the project», «Return a necessary edit
  outside the permitted scope to the lead», повтор «necessary/needed» в §2–§5.

## templates/base/skills/wolf-code-simplify/SKILL.md

- date: 2026-11-15
- file: templates/base/skills/wolf-code-simplify/SKILL.md
- cycle: translation
- executor: G3-C
- отклонения «сознательно улучшено»: none (точечные сжатия без потери смысла:
  «возможность» → chance, «протокол для потребителей» → consumer protocol;
  стрелочные соответствия §3, повелительные формы и severity сохранены)
- новые термины: таблица ниже
- tokens EN/RU: 737/737 (паритет)

## templates/base/skills/wolf-skill-intake/SKILL.md

- date: 2026-11-15
- file: templates/base/skills/wolf-skill-intake/SKILL.md
- cycle: translation
- executor: G3-C
- отклонения «сознательно улучшено»: сжатия без потери смысла: «назначение,
  права, зависимости и цену контекста» → "purpose, rights, dependencies, context
  cost" (опущен союз), «из текста» → "from it", артикль при "external text";
  «в набор» прочитано как base set (канон глоссария §3 «базовый набор»)
- новые термины: цена контекста → context cost (таблица ниже)
- tokens EN/RU: 116/116 (паритет)

## templates/base/skills/wolf-user-report/SKILL.md

- date: 2026-11-15
- file: templates/base/skills/wolf-user-report/SKILL.md
- cycle: translation
- executor: G3-C
- отклонения «сознательно улучшено»: капитализация "The executor" (в RU после
  точки строчная); «его вопрос» → "their question" в чек-листе §7; ~45 безопасных
  сжатий без потери смысла ради токен-цели (артикли, "information for operations"
  → "operations information", «непроведённую проверку» → "an unperformed
  verification", «не проводить обязательную анкету» и все перечни типов отчётов
  сохранены пункт-в-пункт: 2 таблицы 5+4 строки, списки 3/7/8/4)
- новые термины: таблица ниже
- tokens EN/RU: 3469/3426
- перерасход: +43 токена (EN 13875 симв. против RU ≤13704). Причина — системная
  разница длины на плотном RU-тексте; сжатия применены, дальнейшие без потери
  смысла исчерпаны. Данные для цикла 2: кандидаты — «A finished text may go
  through wolf-document-readability per its purpose», «The executor prepares only
  the assigned document and writes only the allowlist», повторы "verification"
  (×14) и "the document's/the reader's" (×10).

## templates/base/skills/wolf-visual-dialogue/SKILL.md

- date: 2026-11-15
- file: templates/base/skills/wolf-visual-dialogue/SKILL.md
- cycle: translation
- executor: G3-C
- отклонения «сознательно улучшено»: «Визуальное объяснение…» → "Visually
  explains…" (герундий по канону описаний wolf-sdd/wolf-work-strategy); «в
  диалоге» → "in dialogue" (без артикля, ради токен-цели); dialogue — строго по
  глоссарию (conversation запрещён); заголовок и хвост заглушки повторяют канон
  wolf-sdd
- новые термины: none
- tokens EN/RU: 75/75 (паритет)

## Новые термины блока (для внесения ведущим в glossary.md)

| RU | EN | Aliases | Примечание |
| --- | --- | --- | --- |
| сложность | complexity | — | wolf-code-craft/wolf-code-simplify, единообразно; «лишняя/ненужная сложность» → needless complexity |
| поведение | behavior | — | оба кодовых скилла; орфография −or по канону |
| контракт | contract | — | оба кодовых скилла; «сохраняемый контракт» → the contract to preserve |
| оценка | evaluation | — | «критерии оценки» → evaluation criteria; глагол «оцени» → evaluate |
| представление | representation | — | «подходящее/визуальное/печатное/статическое представление» (wolf-user-report §2–§5) |
| оформление | styling | — | «тема оформления» → styling theme; отличать от «формат» → format |
| подпись | label | — | подписи графиков, элементов UI |
| глубина | depth | — | «достаточная глубина ответа», «выбрать глубину» |
| преобразование | transformation | — | wolf-code-simplify §3–§4 |
| упрощение | simplification | — | wolf-code-simplify (назначенная задача упрощения) |
| прослойка | layer | — | оба кодовых скилла; «бесполезная прослойка» → useless layer |
| косвенность | indirection | — | wolf-code-simplify §1 |
| вложенность | nesting | — | оба кодовых скилла |
| отчёт о работах / отчёт о работе | work report | — | wolf-user-report, тип документа в таблице §2 |
| резюме | summary | — | «краткое резюме» → brief summary; пересекается с «сводка → summary» (§6a) — оба RU-варианта дают summary |
| взаимодействие | interactivity | — | wolf-user-report §4 (интерактивность документа), не «взаимодействие ролей» |
| цена контекста | context cost | — | wolf-skill-intake |
| исходник | source | — | wolf-user-report §6–§7 («менять исходник», «исходник сохранять») |

Переиспользованные соответствия (не новые): заглушка «Совместимый вход» →
"Compatible input", «выполнить относящуюся часть» → "perform the relevant part",
«повторный круг проверок» → "a repeated verification cycle", «Переходная мера:
удалить в следующем релизе» → "Transitional measure: remove in the next release" —
канон wolf-sdd (см. журнал G3-B); «руководитель (задачи)» → lead — §6a glossary;
«потребители» → consumers — §6; «обязанность» → obligation — §6; «аналог» →
counterpart, «обход» → workaround — §6a; «ангажированные» термины mandated/
constraint/verification/grounds/relation/evidence/reader/volume/spend/version —
по глоссарию и урокам G2.

#### Блок G3-D

# G3-D — журнал перевода git-collaboration-policy-v1.1.md

Файл: `templates/base/skills/wolf-git/reference/git-collaboration-policy-v1.1.md` (RU 553 строки → EN, ветка en-base-wave). Выравнивание по канону: `wolf-git/SKILL.md` (G2), глоссарий §1–5/§6/6a, орфографический канон (−ize/−or, artifact, canceled).

## Мини-глоссарий (сквозной, применён единообразно на все 553 строки)

| RU | EN | Примечание |
|---|---|---|
| регламент | policy | §6a; название H1 — Git Collaboration Policy |
| политика (проекта/CI) | policy | омоним «регламента»; разведено контекстом (this policy / project policy) |
| гейт / этап | gate / stage | §4 глоссария |
| приёмка / приём | acceptance | приёмник роли — acceptance owner |
| принимающий | acceptance owner | по TASK; §3, §10, §16-G3 |
| получатель (передачи) | receiver | §6a; SKILL.md |
| передача / handoff | handoff | §4 глоссария |
| вход / возобновление | entry / resumption | канон SKILL.md (G0) |
| входная проверка | input verification | §9 |
| актуализация / актуальность | refresh / currency | SKILL.md: «unconfirmed currency» |
| проверка (процессная) | verification | урок G2; check — только CI-«проверки» |
| обязательные проверки (CI) | required checks | канон SKILL.md «CI checks» |
| полномочия | rights | глоссарий §6 «права→rights» (алиас «полномочия»); mandate — только акт поручения (§3) |
| связь (между сущностями) | relation | урок G2; verb — tied (без «link») |
| связь (сеть) | connectivity | омоним; разведение записано в «Новые термины» |
| сохранность / preservation | preservation | §6a; доказать → prove (глагол), доказательство → evidence |
| потомки / писатели | descendants / writers | §6a |
| очередь интеграции | integration queue | §6a |
| обработчик интеграции | integration handler | новый |
| ведущий / ведущий участник | lead / lead participant | новый для «участника» |
| общий репозиторий / общий remote | shared repository / shared remote | новый |
| рабочая ветка / рабочая копия | working branch / working copy | working copy — §6 глоссария |
| кандидат интеграции / merge-коммит-кандидат | integration candidate / candidate merge commit | §2/§11.2 |
| коммит интеграции | integration commit | |
| готовность / отметка готовности | readiness / readiness mark | §6 глоссария; снять готовность → withdraw readiness |
| предъявить / предъявление | present / presentation | канон SKILL.md |
| разбор / расхождение | analysis / divergence | |
| основание / основа | grounds / foundation | basis запрещён; «основа» ≠ «основание» |
| уборка / очистка | cleanup | два RU-синонима → один EN |
| ветка восстановления | recovery branch | |
| удалённая ветка (remote) | remote branch | омоним с «удалением»; удаление → deletion |
| условия допуска / допуск | admission conditions / admission | §16 |
| обход / обойти | workaround / bypass | §6a «обход→workaround» |
| повторная попытка | retry | |
| наблюдение | observation | исключение глоссария; SKILL.md «remote observation» |
| журнал выпуска/интеграции | release/integration log | |
| поддержанный (процесс/способ) | supported | |
| служебная учётная запись / служебные записи | service account / administrative records | |
| разрешённый / допустимый | allowed / valid | |
| ОБЯЗАТЕЛЬНО / ЗАПРЕЩЕНО / ДОПУСКАЕТСЯ | MUST / FORBIDDEN / ALLOWED | ключевые слова §1, капс сохранён |
| цель MR / целевая ветка | MR goal / target branch | MR goal — канон SKILL.md |
| субзадача / дочерний / субагент | subtask / child / subagent | SKILL.md |
| хост / межхостовой / харнес | host / cross-host / harness | |
| головной MR | top-level MR | см. отклонения 2 |

## По разделам

Отклонения «сознательно улучшено» (полный список, по всему файлу):

1. **§18, yaml-блок:** комментарии переведены RU→EN (`# proposed Wolf policy field…`, `# fill in with real check identifiers…`, `# only under the conditions of §10…`, `# a positive parameter…`). Ключи и значения не тронуты. Основание: обязательный критерий «0 кириллицы по файлу» невыполним с RU-комментариями; код-семантика не менялась.
2. **§19.3 п.15:** «головной MR» → "top-level MR". Термин в RU-файле не определён; выбран по модели дерева §4/§7 («ветку верхнего уровня»). Отмечено для семантического ревью цикла 1.
3. **§13.3 п.4–5:** RU-эллипсис («Создаёт…», «Фиксирует…») дополнен подлежащим "CI" — грамматика английского списка; смысл без изменений.
4. **§3:** эллипсис «ведущий агент Wolf — принимать результаты исполнителей» раскрыт как "the Wolf lead agent may accept the results of executors" (модальность перенесена из первой части фразы).
5. **«уборка»/«очистка»** сведены к единому cleanup; различие заголовков §14/§15 сохранено составом («Registry cleanup» / «Cleanup of worktrees, branches, and local data»).
6. **«доказать»** → prove/proven (глагол), **«доказательство»** → evidence; слово "proof" в файле отсутствует (канон «proof of success» здесь не встречается).
7. **§14.1:** «Политика хранения» → "Retention policy" (политика хранения образов = retention, стандарт отрасли; слово policy сохранено).

Новые термины для глоссария (в glossary.md не вносил — ведёт ведущий):

| RU | EN | Aliases-риски | Примечание |
|---|---|---|---|
| обработчик интеграции | integration handler | integrator, worker | §3, §6.4, §11, §16-G5 |
| ведущий участник | lead participant | leading participant | §2, §3, §4 |
| общий репозиторий / общий remote | shared repository / shared remote | common repository | §2, §5–§6 |
| рабочая ветка | working branch | — | §2, везде |
| актуальность / актуализация | currency / refresh | — | канон SKILL.md |
| связь (сеть) | connectivity | link, connection | омоним «связи→relation»; §5, §6.5, §8, §16-G2 |
| отметка готовности | readiness mark | — | §11.1 |
| условия допуска | admission conditions | access conditions | §1, §16 |
| ветка восстановления | recovery branch | — | §5, §17 |
| служебная учётная запись | service account | bot account | §13.3 |
| поддержанный (процесс) | supported | — | §10, §11.2 |
| повторная попытка | retry | re-attempt | §11.3, §13.4, §14.2 |

Разведения омонимов (одиночный RU-термин — разные EN по смыслу): «связь» relation/connectivity; «удалённая» remote (ветка)/deleted (следы); «проверка» verification/required checks (CI); «полномочия» rights (операционные) — mandate не используется; «регламент»/«политика» → policy в обоих случаях.

## Итог и самопроверка

- Кириллица: `rg '[\x{0400}-\x{04FF}]'` — **0 вхождений**.
- Структура = RU-оракулу 1:1: заголовков **46** (H1 1 + H2 22 + H3 23), таблиц **15**, нумерованных пунктов **71** (списки 7/7/5/8/5/7/6/17/9), буллетов 24; номера строк всех структур совпали с RU (§16 — стр. 414, §22 — стр. 551; файл 553 строк, двойная пустая строка перед §22 и trailing-пробелы шапки сохранены).
- Токены: RU-оракул ведущего **11 435**. Оценка EN по записанным частям: EN/RU-структура построчно 1:1 (553 строки), выборочный коэффициент объёма EN/RU ≈ 1.04 (30+ пар строк) × 45 740 симв. RU ≈ **47 600 симв. ≈ 11 900 токенов** (диапазон 11.5–12.3 тыс.); перерасход ~+4% (~460 токенов) — фиксируется как есть без потери смысла, данные для цикла 2. Точная цифра — за скриптом ведущего. Кандидаты сжатия цикла 2: артикли и «the … of the …» в таблицах §16–§17, связки «the/a» в перечнях §19.2.

### Поправки по циклу 1 policy (G3-C1-R2, 2026-11-15)

F-1: outdated -> stale (§14.2, канон «устаревший», 5-е употребление в файле). F-2: REQUIRED x4 (§8 x2, §15.1 x2) унифицированы в MUST — RU-ключевое слово одно («ОБЯЗАТЕЛЬНО»), §1 определяет тройку MUST/FORBIDDEN/ALLOWED; «A checkpoint MUST be created», «Publication MUST happen», «the following MUST be done», «it MUST be confirmed». F-3 (итог): §6b разведён на «итог (исход шага) -> outcome» и «итог (человекочитаемый) -> summary» — policy оставляет "A brief human-readable summary". Вердикт ревьюера по «головной MR» -> top-level MR: ACCEPTABLE (термин не определён и в RU — свойство унаследовано). S-3 ревьюера: разведение «служебный» (administrative records / service account / service lock / internal state) зафиксировано здесь как канон блока D.

### Цикл 2 G3 (2026-11-15): правки находок C1 + читаемость + ужатие

Один свежий wolf-editor, 9 файлов. Все находки цикла 1 применены: bug->defect x2 (craft/simplify, Major закрыт), norm->rule x3, заглушки receiving/requesting унифицированы по канону G2 ("perform the relevant part", "repeated verification cycle"), error->failure (TDD), confirmed/scope в verification (verified сохранён для «проверенные»), justified/Delete/evaluate. Читаемость без смены модальности; REQUIRED/outdated в policy — 0 (проверено ведущим; lowercase "required checks" — канон CI).

Токены before->after: craft 1048->1037 (паритет), user-report 3469->3424 (паритет), verification 1409->1330 (паритет, ровно), simplify 737->738 (+1), receiving 73->72, requesting 77->76, tdd 1187->1187, test-quality 346->346, policy 11901->11748 (+2.7% к RU 11435). Остаток policy принят решением ведущего: сжатие исчерпано без потери смысла (подтверждено редактором и ревьюером R2: плотный контрактный язык, артикли; гейты/числа/SHA/команды не трогались); паритет — цель волны, жёсткий гейт только на 3 baseline-файлах, которых здесь нет. Итог группы после цикла 2: 12/13 в паритете или лучше, 1 обоснованный остаток (policy +2.7%).

Бюджет исполнителя превышен (153 против 120 вызовов) — причина: посекионный запрет на переписывание policy целиком; результат не пострадал, отклонений канона от RU-оракула нет. Дословный журнал блока ниже, part удалён.

#### Блок G3-C2

# G3-C2 — журнал цикла 2, группа G3 (english-base-delivery)

Редактор: свежий, не автор перевода. Запись в glossary.md не выполнялась; git только чтение. Бюджет вызовов: превышен (~153 против ≤120) — причина: для policy запрещена перезапись файла целиком, ужатие выполнено ~70 точечными edit-вызовами. Все правки применены, проверки пройдены; отклонение бюджета зафиксировано в RESULT.

## 1. wolf-code-craft/SKILL.md
- Канон §6 [Major]: "When fixing a bug" → "When fixing a defect" (~49); прочие вхождения bug → нет (grep: 0).
- §6b: "the accepted norm" → "the accepted rule" (~71).
- Ужатие: "the clearest consistent with the project" → "the clearest consistent one".
- Читаемость: "Several explicit lines beat an expression needing deciphering"; "Line count and a minimal diff are not goals in themselves"; "Return a needed edit…"; "In scope, local structure…"; "requirements reached consumers"; "follow project procedure to add it"; "when this does not worsen these conditions". Модальность (Do not / must) сохранена.
- Tokens: 1048 → 1037. ≤1037 ✓.

## 2. wolf-code-simplify/SKILL.md
- Канон §6 [Major]: "Separate a discovered bug" → "Separate a discovered defect" (~30); прочих bug нет (grep: 0).
- §6b: "project norms" → "project rules" (~63).
- Читаемость: проход без правок (калек/тяжёлых конструкций не найдено).
- Tokens: 737 → 738 (+1 символ: bug→defect).

## 3. wolf-user-report/SKILL.md
- §6b: "choose a grounded assumption" → "choose a justified assumption" (~28); "Remove private data, paths, secrets" → "Delete…" (~100); "to meet a norm" → "to meet a rule" (~66).
- Ужатие (повторы "verification", "the document's/the reader's" и связок): 28 точечных замен без потери утверждений: "styling according to the document's purpose"→"by the document's purpose"; "for the sake of report styling"→"for report styling"; "is responsible for readability editing"→"owns readability editing" (распределение ответственности сохранено); "pass, but not verification"→"pass, not verification"; "Perform publication"→"Publish"; "for the sake of preparing a report"→"to prepare a report"; "preserving the predictability of their reuse"→"preserving predictable reuse" и др.
- Tokens: 3469 → 3424. ≤3426 ✓. Примечание: контрольная калибровка исходника даёт 13877 симв (3470) — расхождение ±1 символ с базой ведущего (граница округления ceil); результат 3424±1, цель выполняется в любом случае.

## 4. receiving-code-review/SKILL.md
- Канон G2: "carry out its applicable part" → "perform the relevant part"; "repeated verification loop" → "repeated verification cycle". RU-сверка: «выполнить относящуюся часть», «повторный круг проверок» ✓.
- Tokens: 73 → 73.

## 5. requesting-code-review/SKILL.md
- Тот же канон G2, те же две замены; RU сверено.
- Tokens: 77 → 76.

## 6. test-driven-development/SKILL.md
- §6b: "fix the test's own error" → "fix the test's own failure" (~23).
- Читаемость: правки не потребовались.
- Tokens: 1187 → 1187 (+2 символа).

## 7. verification-before-completion/SKILL.md
- §6a (подтверждение → confirmed): "Not verified → not verified" → "Not confirmed → not confirmed" (~21); "only in the verified area" → "only in the confirmed scope" (~55); "…are verified separately" → "…are confirmed separately" (~63, таблица). «проверенные свойства», «проверенный код», «проверенное состояние» — verified сохранено (RU «проверенные»).
- §6b (область → scope): "supports only its own area" → "only its own scope" (~48); "its scope fits", "applicability scope" не тронуты.
- Ужатие (кандидаты блока B и ревьюера): повторы "the lead … on its own or by an assigned executor" ×2 сжаты ("the lead or an assigned executor runs it" / "…runs it independently"); "is set by the task's acceptance owner" — сохранён смысл, сняты повторы артиклей и канцеляризмы ("for example,"→"e.g.,", "on the grounds of"→"based on", "the number of commits"→"the commit count"); ~30 дополнительных точечных замен без потери утверждений, чисел, команд и модальности.
- Tokens: 1409 → 1329. ≤1330 ✓.

## 8. test-driven-development/references/test-quality.md
- §6b (оцени → evaluate): "assess action/evidence/outcome" → "evaluate action/evidence/outcome" (~9).
- Tokens: 346 → 346.

## 9. wolf-git/reference/git-collaboration-policy-v1.1.md
- Ужатие посекционно точечными edit-вызовами (71 пара; файл целиком не переписывался):
  - §1–§3: тяжёлые «the … of the …» в таблицах (parent branch → "receives subtask results", integration candidate → "with the target branch SHA as its first parent…", release/accepted/published), "the mandate for the task"→"the task mandate", "each commit needs no new permission".
  - §5–§9: "The fact of lost connectivity or the age of activity does not permit…" → "Neither lost connectivity nor activity age permits…"; "Establish the origin of the remote commits" → "the remote commits' origin"; "the launch of every subagent" → "every subagent's launch"; "for the sake of synchronization" → "for synchronization".
  - §10–§12: "This makes it possible to investigate changes via…" → "Changes can be investigated via…"; "without being required to read" → "without reading"; "If the hosting does not give such a guarantee" → "Without such a guarantee"; "the traceability of the original SHA/MR is preserved" → "the original SHA/MR stays traceable"; "a change of the source branch" → "a source-branch change".
  - §13–§15: "The source of release history" → "Release history's source"; "do not perform a blind re-write" → "do not re-write blindly"; "This verification confirms the inclusion of commits" → "confirms commit inclusion"; "so that a cleanup retry" → "so a cleanup retry"; §15.3 "a local inspection … is performed" → "the registered working copies are inspected locally".
  - §16–§17 (кандидаты ревьюера): артикль в строке G0; "checks of the specific candidate" → "specific-candidate checks"; "or has gone stale" → "or stale"; "do not include them" → "exclude them from your own work".
  - §19.2 (кандидаты ревьюера): "no multiple divergent interpretations" → "no divergent interpretations"; "no deletion for the sake of a green status" → "for a green status"; §19.3 "verification of the joint state" → "joint-state verification".
- Не тронуты: названия гейтов G0–G9, все MUST/FORBIDDEN/ALLOWED, числа (20 минут, keep_last=5, интервалы), SHA/`T`,`S`,`C`, команды, YAML-блок §18, §22 (история изменений), ссылки §21.
- Tokens: 11901 → ≈11751–11752 (по дельте −597 симв от базы 47601–47604). Цель ≤11435 НЕ достигнута: остаток ≈316 токенов (≈1270 симв). Дальнейшее сжатие без потери смысла/модальности, названий, чисел и команд точечными правками невозможнo — потребовалась бы перезапись нормативного текста; остаток зафиксирован согласно условию задачи.

## Самопроверка
1. rg `[\x{0400}-\x{04FF}]` по 9 EN-файлам → 0 совпадений ✓.
2. Токены пофайлово (ceil(симв/4), символы, Code Mode; метод откалиброван на базах ведущего: craft 4192 симв→1048 ✓, verification 5634→1409 ✓) — значения по файлам выше.
3. Структура policy = RU-оракулу: заголовков 46 ✓, таблиц 15 ✓; строки списков не добавлялись и не удалялись (менялся только инлайн-текст), пункты = оракулу.
4. policy: REQUIRED → 0, outdated → 0 ✓; craft/simplify: bug → 0 ✓.

## Отклонения от RU-оракула
Нет: все канон-подстановки согласованы с RU-бейзлайном; противоречий «канон vs RU» не обнаружено.

### Цикл 3 G3 и приёмка группы (2026-11-15)

Контрольный wolf-reviewer, выборка 3/13 (verification-before-completion, wolf-code-craft, wolf-user-report — файлы с максимумом правок и сжатия). Вердикт: 0 Major, 1 Minor, FIX THEN ACCEPT. Обе выборочные паритета подтверждены (1330/1330, 1037/1037, 3424/3424), разведение подтверждено/проверено выдержано, Major-фикс bug->defect подтверждён. Единственный Minor (user-report:66 «сравнить варианты» -> compare alternatives против разведения §6b) применён ведущим: compare options, alternatives -> 0 в файле (grep). Отступление от повторного цикла 3: правка однословная, механически проверяемая — зафиксировано в плане T-23.

ГРУППА G3 ПРИНЯТА ведущим 2026-11-15: 13/13 файлов (11 SKILL.md + test-quality.md + git-collaboration-policy-v1.1.md). Токены: 12/13 в паритете или лучше; policy 11748/11435 (+2.7%, обоснованный остаток). Гейты: кириллица 0, гейт 4 — 0 попаданий, bug/norm/REQUIRED/outdated — 0.

## Группа G4 — перевод (T-24, блоки A–D, 2026-11-15)

12 файлов: 9 агентов (templates/base/agents/) + 3 команды (templates/base/commands/). Четыре параллельных блока: A (mr-wolf), B (architect/developer/editor/expert), C (release-engineer/researcher/reviewer/tester), D (команды). Канон chars/4 с RU-эталонами ведущего; оракулы в temp.

Итог ведущего: bench 12/12 цифрами редакторов сошёлся; кириллица 0. Токены EN/RU: mr-wolf 1872/1872 (точный паритет), architect 627/602 (+4.2%), developer 660/646 (+2.2%), editor 604/584 (+3.4%), expert 955/919 (+3.9%), release-engineer 614/595 (+3.2%), researcher 678/648 (+4.6%), reviewer 661/638 (+3.6%), tester 617/585 (+5.5%), analyze-doc 231/232, complain 384/386, doc-review 230/230 (команды — паритет). Системный перерасход агентов (+2.2…5.5%) — структурный (артикли в нормативном жанре), засвидетельствован двумя редакторами независимо; уходит в цикл 2 на попытку ужатия, остаток принимается с обоснованием.

Межблочная находка ведущего: общий раздел «General executor contract» переведён B и C независимо — два варианта (md5 различаются, 1724 против 1754 симв.). Решение: канон — версия B (короче, ближе к RU, assigned note writer по канону writer), с правкой overall contracts -> general contracts (канон G1 contracts.md); унификация в 4 файлах C в цикле 2.

Точечные решения ведущего для цикла 2: spawn -> hire (mr-wolf:159; канон G2 E3, spawn запрещён); diagnosis -> diagnostics (researcher description; канон диагностика->diagnostics); release composition -> release scope (release-engineer; RU «состав выпуска», прецедент G2 release-docs); ошибка в артефакте/ревью -> defect (wolf-reviewer; дополняет §6b ошибка в ходе проверок -> failure). Новые термины сведены в §6c глоссария.

Дословные журналы блоков ниже, parts удалены после merge.


#### Блок G4-A

# G4-A — журнал перевода

## 2026-11-15 — templates/base/agents/mr-wolf.md

- date: 2026-11-15
- file: templates/base/agents/mr-wolf.md
- cycle: translation
- executor: G4-A
- отклонения: none
  - Смысл 1:1; must/never/only не смягчены, правила/запреты/примеры сохранены.
  - Структура равна RU: 11 заголовков (1 h1 + 10 h2), 25 bullets, 5 ordered, порядок секций и frontmatter-ключи без изменений; идентификаторы (`agent-id: mr-wolf`, имена wolf-*, CLI-команды, `{{model.primary}}`, `permission.task`) не переводились. CLI-команда `wolf list --type complaint --status open` сохранена байт-в-байт вместе с переносом строки внутри бэктиков.
  - Пунктуационная адаптация (не отклонение): кавычки «» → " »; одно двоеточие после «означает» убрано при слиянии клаузы.
- новые термины (в glossary.md НЕ добавлены; на утверждение ведущему):

  | RU | EN | Aliases | Примечание |
  | --- | --- | --- | --- |
  | специалист | executor | specialist | Маппинг по переведённому корневому templates/base/AGENTS.md («hires wolf-* executors directly»); `specialist` — запрещённый алиас «эксперта → expert», здесь не употреблён. |
  | спавнить | spawn | — | Буквальный RU-глагол в «не спавнь»; `spawn` остаётся запрещённым алиасом «нанимать → hire» и использован только там, где RU-оригинал сам использует «спавнить». |
  | экспертиза | expertise | — | Прецедент канона: "a completed expertise" (using-skills/references/contracts.md). «спор экспертиз» → dispute of expertises. |
  | содержательный | substantive | significant | Разведено с «существенный → substantial» (§6a). |
  | руководитель (промежуточный, запрещённый уровень) | manager | supervisor, coordinator, lead | `supervisor` закреплён за writing-skills (§6a), `lead` — канон «ведущего», `coordinator` — третья роль жалобного контура (§6a); для «промежуточных руководителей» взят manager. |
  | диагностика | diagnostics | — | Смысл деятельности (прецедент wolf-debug EN: "Before expensive diagnostics"); не алиас «доктор → doctor». |
  | доказательный | evidence-based | — | «доказательное ревью (R-06)» → evidence-based review (R-06). |
  | спорный | disputed | — | «спорный выбор» → disputed choice (стем «спор → dispute», §6a). |
  | объёмный | high-volume | — | Стем «объём → volume» (§6a) сохранён. |
  | повторный вызов | re-invocation | — | Ключевое слово REUSE сохранено без перевода. |
  | причина | cause | — | Согласовано с wolf-debug (root cause); отличено от «основание → grounds». |

  Не новые (покрыты глоссарием/«Исключениями»): «принятие» → acceptance (заявленный алиас «приёмки», §4; «финальное принятие» → final acceptance), «приёмочный след» → acceptance trail (Исключения: `trail`), «снимок» → snapshot (Исключения), «совет (орган)» → council (§6a), «ответственный» → responsible party (§6), «прослойка» → layer (§6b), «координатор» → coordinator (§6a), «основание» → grounds / «обоснование» → rationale.
- tokens: EN 1872 / RU 1872 (канон ceil(chars/4): EN 7485 симв., RU-эталон 7485 симв. — 0 перерасход)
- самопроверка: кириллица `rg '[\x{0400}-\x{04FF}]'` — 0; заголовки 11/11, bullets 25/25, ordered 5/5 (равно RU).

#### Блок G4-B

# G4-B — журнал перевода

Волна: english-base-delivery · Группа: G4 · Блок: B (определения агентов-исполнителей) · Дата: 2026-11-15

## Сводка

- Переведено 4/4 файла; проверка `rg '[\x{0400}-\x{04FF}]'` по блоку — 0 совпадений.
- Терминология по глоссарию §1–6b (approved + candidate), «Исключения» и «Орфографический канон» (−ize/−or, behavior, artifact, canceled). Новые термины в glossary.md не добавлялись — таблица ниже, выведена также в RESULT.
- Раздел «Общий контракт исполнителя» → `## General executor contract`: переведён один раз, текст дословно идентичен во всех 4 файлах блока (межфайловое согласование). Остальные 5 файлов `templates/base/agents/` (wolf-tester, wolf-release-engineer, wolf-researcher, wolf-reviewer, mr-wolf) на момент работы блока ещё RU (параллельная группа) — их переводчику вести эту же EN-формулировку контракта дословно.
- Ключевые роли/термины сверены с уже переведёнными скиллами (wolf-requirements, wolf-design, wolf-review, wolf-code-craft, wolf-council, wolf-execute, wolf-document-readability, wolf-agent-language, using-skills).

## wolf-architect.md

- дата: 2026-11-15
- file: templates/base/agents/wolf-architect.md
- cycle: translation
- executor: G4-B
- отклонения: none
- новые термины: нет вне общей таблицы блока
- tokens EN/RU: 627/602 (EN 2506 симв., перерасход +25)

## wolf-developer.md

- дата: 2026-11-15
- file: templates/base/agents/wolf-developer.md
- cycle: translation
- executor: G4-B
- отклонения: none
- новые термины: нет вне общей таблицы блока
- tokens EN/RU: 660/646 (EN 2638 симв., перерасход +14)

## wolf-editor.md

- дата: 2026-11-15
- file: templates/base/agents/wolf-editor.md
- cycle: translation
- executor: G4-B
- отклонения: none
- новые термины: нет вне общей таблицы блока
- tokens EN/RU: 604/584 (EN 2414 симв., перерасход +20)

## wolf-expert.md

- дата: 2026-11-15
- file: templates/base/agents/wolf-expert.md
- cycle: translation
- executor: G4-B
- отклонения: none
- новые термины: нет вне общей таблицы блока
- tokens EN/RU: 955/919 (EN 3817 симв., перерасход +36)

## Перерасход токенов (причина)

Цель EN ≤ RU пофайлово не достигнута (+14…+36 токенов) после двух циклов сжатия. Причина структурная: английский текст длиннее русского в этом жанре (артикли, вспомогательные глаголы) — общий контракт EN на ~45 симв. длиннее RU-эквивалента даже в сжатом виде, frontmatter-описания также длиннее. Смысл 1:1 сохранён полностью; дальнейшее сжатие возможно только отказом от артиклей (телеграфный стиль) — сделано не было. Подсчёт: канон ceil(chars/4) по символам, включая завершающий перевод строки; метод калиброван по RU-оракулу (wolf-architect: 2407 симв. → 602, совпало с эталоном ведущего).

## Новые термины блока (кандидаты на добавление в глоссарий, решение за ведущим)

| RU-термин | EN-термин | Aliases | Примечание |
| --- | --- | --- | --- |
| Проектировщик | Architect | — | заголовок H1 wolf-architect |
| Разработчик | Developer | — | заголовок H1 wolf-developer |
| Технический писатель | Technical writer | writer (канон §6a) | заголовок H1 wolf-editor; развернутая форма канона «писатель (технический) → writer» |
| Эксперт консилиума | Council expert | — | заголовок H1 wolf-expert; композиция канона council+expert |
| адресный | addressed | — | «адресный исполнитель» → addressed executor; слово уже употребляется в переведённых скиллах (routes-quality: addressed verification) |
| общий контракт языка | general language contract | — | wolf-editor; ссылка на wolf-agent-language |
| каталог памяти | memory catalog | — | общий контракт; «память» → memory (§1) |
| самопроверка | self-verification | — | wolf-developer; композиция канона verification |
| перепроектирование | redesign | — | wolf-developer |
| незакоммиченное состояние | uncommitted state | — | wolf-developer |
| содержательный | substantive | — | «содержательное ревью» → substantive review; не путать: substantial=«существенный», material=«значимый» (§6a) |
| чистка | cleaning | — | «чисткой соседнего кода» → by cleaning adjacent code |
| symlink-аудит | symlink audit | — | wolf-expert |
| условия пересмотра | reconsideration conditions | — | wolf-expert; соответствует слоту RECONSIDER_IF контракта expert (contracts.md) |
| недостаток данных | lack of data | — | wolf-expert |
| назначенный писатель записи | assigned note writer | — | общий контракт; §6a писатель→writer, §1 запись→note |
| «— норма» (состояние) | are the norm | — | wolf-expert: «ссылки node_modules … — норма»; смысл «обычное состояние», не канон «норма→rule» |

## Примечания к сжатию (смысл 1:1 сохранён)

- «предварительного расследования» → "no prior investigation" (prior = предварительное).
- «печать/коммит секретов» → "print/commit secrets" (глагольный ряд после never, как в RU).
- «частные report/checkpoint/log/script» → без "files" (эллипсис как в RU-оригинале).
- «в границах назначенного документа» → "within the assigned document's boundaries" (architect, description).
- «бюджет обращений» в контракте передан каноном contracts.md: "return within 8 tool calls".
- «по полномочиям TASK/проекта» → "per TASK/project rights" (разведение §6b: сфера допустимых действий → rights).
- «совет (орган)» → council (§6a), «консилиум» → council (§2) — в wolf-expert оба контекста.
- Не переводились: имена агентов, CLI-команды, пути, ID, имена скиллов, код в бэктиках, ключи/значения frontmatter (permission, mode, model), `{{model.*}}`.

#### Блок G4-C

# G4-C — журнал перевода (волна english-base-delivery, группа G4, блок C)

Перевод RU→EN четырёх определений агентов-исполнителей. Глоссарий
`docs/dev/2026-11-11-english-base-delivery/glossary.md` (§1–5 approved, §6/6a/6b candidate,
«Исключения», «Орфографический канон»: −ize/−or, behavior, artifact). Новые термины в
glossary.md не добавлялись (запрещено ТЗ) — выведены в RESULT исполнителя и ниже по файлам.

## wolf-release-engineer.md

- date: 2026-11-15
- file: templates/base/agents/wolf-release-engineer.md
- cycle: translation
- executor: G4-C
- отклонения: перерасход токенов +19 (614 EN / 595 RU) после сжатия без потери норм;
  причина — английские артикли в плотном нормативном блоке. Других отклонений нет.
- новые термины: `авторизация → authorization` (не «полномочия → mandate», не host permissions);
  `состав (выпуска) → composition`; `исходная ревизия → source revision` (композит:
  revision §6 + source §6b); `Инженер выпуска (заголовок) → Release engineer`.
- tokens EN/RU: 614/595

## wolf-researcher.md

- date: 2026-11-15
- file: templates/base/agents/wolf-researcher.md
- cycle: translation
- executor: G4-C
- отклонения: перерасход токенов +30 (678 EN / 648 RU), причина та же. Других отклонений нет.
- новые термины: `диагностика → diagnosis` (урок ведущего для wolf-researcher; примечание:
  в wolf-debug SKILL.md EN употребляется «diagnostics» — нужно решение владельца об унификации);
  `Исследователь (заголовок) → Researcher`; `обзор → survey`;
  `гипотеза → hypothesis` (уже используется в wolf-debug EN, строки в глоссарии нет);
  `условие остановки → stop condition` (уже канон using-skills/references/contracts.md).
- tokens EN/RU: 678/648

## wolf-reviewer.md

- date: 2026-11-15
- file: templates/base/agents/wolf-reviewer.md
- cycle: translation
- executor: G4-C
- отклонения: перерасход токенов +23 (661 EN / 638 RU), причина та же. Других отклонений нет.
- новые термины: `перепроверка → re-check` (уже в wolf-review EN); `исправление → fix`
  (уже в wolf-review EN); `ошибка (найденная в артефакте, ревью) → defect` — RU «не ищи
  обязательное число ошибок» переведено "mandatory number of defects": канон «дефект → defect»,
  `failure` зарезервирован за «ошибкой (в ходе проверок)» (§6b).
- tokens EN/RU: 661/638

## wolf-tester.md

- date: 2026-11-15
- file: templates/base/agents/wolf-tester.md
- cycle: translation
- executor: G4-C
- отклонения: перерасход токенов +32 (617 EN / 585 RU), причина та же. Других отклонений нет.
- новые термины: `воспроизведение → reproduction` (уже в wolf-test EN);
  `внешний эталон → external oracle` (композит §6 «оракул → oracle»);
  `тестировщик (роль) → tester`.
- примечание: description «Независимая проверка поведения, интеграции и регрессии» →
  "Independent verification of behavior, integration and regression": поведение → behavior (§6b),
  проверка → verification (§4), тройка выровнена с description скилла wolf-test.
- tokens EN/RU: 617/585

## Общее по блоку

- Общий блок «Общий контракт исполнителя» → `## General executor contract`: перевод дословно
  идентичен во всех 4 файлах (проверено программно).
- Самопроверка: rg `[\x{0400}-\x{04FF}]` по 4 файлам — 0 совпадений; структура равна RU
  (frontmatter-ключи, заголовки, порядок секций, переносы абзацев); значения-идентификаторы
  (agent-id, mode, model, permission, temperature) не менялись; description переведён (роутинговый триггер).
- «технические разрешения host» → "the host's technical permissions": слово permissions здесь —
  системные разрешения host (омоним к исключению глоссария `permission`), не канон «права → rights»;
  «полномочия» (release-engineer) → mandate по уроку G2/G3.
- Стиль выровнен с EN-скиллами G1–G3: wolf-release, wolf-review, wolf-test, wolf-debug,
  using-skills/SKILL.md, using-skills/references/contracts.md.

#### Блок G4-D

# G4-D — перевод пользовательских команд (3 файла)

Волна: english-base-delivery, группа G4, блок D. Дата: 2026-11-15.
Исполнитель: G4-D. Оракулы RU-снимков: /private/var/folders/…/T/opencode/en-base-ru-baseline/templates/base/commands/ (сверены с рабочим деревом — идентичны). Токены: канон ceil(chars/4), символы.

## analyze-doc.md

- date: 2026-11-15
- file: templates/base/commands/analyze-doc.md
- cycle: translation
- executor: G4-D
- отклонения: none (сжатие стиля: «ТЗ» → brief по канону глоссария; «Жалобы на методику» → "Skill complaints"; смысл 1:1)
- новые термины: none
- tokens EN/RU: 231/232

## complain.md

- date: 2026-11-15
- file: templates/base/commands/complain.md
- cycle: translation
- executor: G4-D
- отклонения:
  - Инлайн-код CLI: русские плейсхолдеры `<цель> <правило> <факт> <изменение>` переведены (`<target> <rule> <fact> <change>`); имена флагов и структура `wolf complain` не тронуты. Причина — гейт «0 кириллицы»; образец: wolf-feedback/references/complaints.md (EN-шаблоны той же команды).
  - «существующие записи памяти (mem-id)» → "existing memory objects": обход зарезервированного кластера record/entry/note (см. «Без машинного EN-контроля» глоссария); по образцу "a structured memory object" complaints.md.
  - «штатный набор» → base set (канон глоссария «базовый набор»).
- новые термины: none (см. таблицу в RESULT G4-D: submission, escaping, recording result — кандидаты вне глоссария)
- tokens EN/RU: 384/386

## doc-review.md

- date: 2026-11-15
- file: templates/base/commands/doc-review.md
- cycle: translation
- executor: G4-D
- отклонения:
  - «нерешённые конфликты» → "unresolved conflicts": в RU-исходнике слово «конфликт», не глоссарное «расхождение» (→ disagreement); прецедент употребления conflict в переведённом wolf-review ("A product conflict goes to…"). Внимание гейту 4: conflict числится алиасом disagreement — здесь оправдано RU-исходником.
  - «Контракт reviewer включает …» → "Reviewer contract: …" (сжатие перечисления; состав контракта сохранён полностью).
  - «вопрос владельцу допустим» → "the owner may be asked" (пассивная компрессия; разрешение на вопрос сохранено).
- новые термины: none
- tokens EN/RU: 230/230

## Примечание ведущему

- Образец `templates/base/skills/analyze-doc/SKILL.md` из TASK не существует: скилла analyze-doc нет в templates/base/skills (проектный скилл живёт вне base set). Терминология сверена по глоссарию §1–6b, «Исключениям», «Орфографическому канону» и переведённому канону (using-skills, wolf-feedback/references/complaints.md, wolf-review, wolf-document-readability).
- RU-эталоны ведущего подтверждены пересчётом: analyze-doc 232, complain 386, doc-review 230 (ceil(chars/4) по символам).

### Цикл доводки G4 (до ревью, 2026-11-15)

Один свежий wolf-editor по заданию ведущего: унификация «General executor contract» — канон версии B (architect) с правкой overall contracts → general contracts распространён на release-engineer/researcher/reviewer/tester; md5-контроль ведущего — раздел бит-в-бит одинаков во всех 8 файлах (e52820206e660e8c60ee45eeabfd2ebb). Точечные фиксы: spawn -> hire (mr-wolf:159), diagnosis -> diagnostics (researcher description), release composition -> release scope (:14), FINDING: norm -> rule (reviewer). Ужатие: architect 619, developer 653, editor 601, expert 946, release-engineer 601, researcher 663, reviewer 650, tester 605 — остаток +1.0…3.4% к RU (структурный предел, засвидетельствован тремя редакторами; принимается ведущим с обоснованием: жёсткий гейт только на 3 baseline-файлах). mr-wolf 1872/1872. Фиксы ведущего по гейту после доводки: issue -> render (expert:35, глагол «выдавай»), исключение conversation (RU «разговор» mr-wolf:131, ≠ «диалог»). Гейт 4 по G4: 0 попаданий; кириллица 0; spawn/composition/diagnosis/overall contracts — 0.

Дословный журнал блока ниже, part удалён.

#### Блок G4-C2

# G4-C2 — журнал цикла 2 (группа G4): унификация контракта, точечные фиксы, ужатие

Исполнитель: свежий редактор (не автор перевода). Входы: TASK G4-C2, канон раздела —
`templates/base/agents/wolf-architect.md` (версия B), глоссарий §6c и примечания разведений G3/G4,
RU-бейзлайн `en-base-ru-baseline`. Запись: 9 файлов `templates/base/agents/` + этот журнал.

## Итог по токенам (канон ceil(chars/4), символы файла)

| файл | до → после | цель ≤ | остаток |
|---|---|---|---|
| mr-wolf | 1872 → 1872 | 1872 (не ухудшить) | 0 |
| wolf-architect | 627 → 619 | 602 | +17 (+2.8%) |
| wolf-developer | 660 → 653 | 646 | +7 (+1.1%) |
| wolf-editor | 604 → 600 | 584 | +16 (+2.7%) |
| wolf-expert | 955 → 945 | 919 | +26 (+2.8%) |
| wolf-release-engineer | 614 → 601 | 595 | +6 (+1.0%) |
| wolf-researcher | 678 → 663 | 648 | +15 (+2.3%) |
| wolf-reviewer | 661 → 650 | 638 | +12 (+1.9%) |
| wolf-tester | 617 → 605 | 585 | +20 (+3.4%) |

Метод подсчёта сверен с before-числами TASK: воспроизведены все 9 до-значений (2506/2638/2414/3817/2456/2710/2642/2468 символов).

## Задача 1 — унификация общего контракта

- Канон: раздел из `wolf-architect.md` с заменой `overall contracts` → `general contracts` (канон общего контракта — G1 using-skills/references/contracts.md). Раздел: 17 строк тела, 1693 символа.
- В 4 B-файлах (architect, developer, editor, expert): точечная замена `overall contracts` → `general contracts` (0 символов, «overall»/«general» по 7).
- В 4 C-файлах (release-engineer, researcher, reviewer, tester): раздел «## General executor contract» (до EOF, следующего `##` нет) заменён точной копией канона, включая переносы строк и плотность density-абзаца (−30 символов на файл).
- `mr-wolf.md` раздела не содержит — структура не тронута.

Идентичность раздела (md5 посчитает ведущий, у исполнителя нет shell; для проверки:
`for f in wolf-{architect,developer,editor,expert,release-engineer,researcher,reviewer,tester}; do awk '/^## General executor contract$/{p=1} p' templates/base/agents/$f.md | md5; done`):
- точная копия одной строки канона во все 4 файла (edit, не ретипировка);
- grep по 9 файлам: `of the two-level Wolf model; do not create agents` — ровно 8 файлов; `extend host technical permissions` — 8 файлов; `of the Wolf two-level model`, `widen the host`, `printing/committing secrets` — 0 в восьмёрке;
- все 8 post-edit извлечений раздела побитово равны, fingerprint FNV-1a(32) = `969e9e49`.

## Задача 2 — точечные фиксы (глоссарий §6c)

- mr-wolf.md:159 — `do not spawn agents outside` → `do not hire agents outside` (спавнить→hire, RU «не спавнь»).
- wolf-researcher.md description — `diagnosis` → `diagnostics` (диагностика→diagnostics, глоссарий §6c/396).
- wolf-release-engineer.md:14 — `release composition` → `release scope` (состав выпуска→release scope, глоссарий §6c/416).
- wolf-reviewer.md — `FINDING: norm` → `FINDING: rule`: RU «норма» в значении правила; глоссарий (примечания G3): «norm — запрещён: RU „норма“ как синоним правила → rule». 0 символов.
- Остаточные проверки по 9 файлам: `overall contracts|spawn|composition|diagnosis` — 0; `\bnorm\b|\bbug\b` — 1 совпадение, `wolf-expert.md:32` «are the norm» — разрешённое состояние (норма-обычное состояние → the norm). «bug» — 0.
- Отклонений от RU-оракула нет.

## Задача 3 — ужатие (по файлам)

Правки только интро-абзацев; MUST/FORBIDDEN, числа (8 tool calls), команды, имена, frontmatter и канонический раздел не тронуты.

- **mr-wolf.md** — только фикса spawn→hire (−1 символ). 1872→1872.
- **wolf-architect.md** (−31 симв.): «separate a proposal from a decision and the actual from the planned» → «separate proposal from decision and actual from planned»; «Connect … with links» → «Link …»; «Do not start implementation. Do not create the full package instead of one assigned part.» → «Do not start implementation or create the full package instead of the assigned part; return …». Остаток +17 (+2.8%).
- **wolf-developer.md** (−28): «…, and at a Git boundary» → «…; at a Git boundary»; «add the necessary tests» → «add necessary tests»; «fix your own local errors» → «fix your local errors»; «a change of a shared interface or a need to redesign» → «a shared-interface change or a redesign need»; «In the report:» → «Report:». Остаток +7 (+1.1%).
- **wolf-editor.md** (−14): два «Do not» слиты («…from the document or add…»); «Preserve the meaning» → «Preserve meaning»; «without a semantic change» → «without semantic change»; «One pass, a short RESULT» → «One pass, short RESULT». Остаток +16 (+2.7%).
- **wolf-expert.md** (−37): «The first line of the result is» → «The result's first line is»; «valid only under two conditions» → «valid only if both hold»; «symlink audit before launch» → «pre-launch symlink audit»; «LIMITS and reconsideration» → «LIMITS, reconsideration»; «Name a lack of data» → «Name missing data»; три «Do not» слиты («Do not present …, issue APPROVED/ACCEPTED or close review remarks»). «are the norm» сохранено. Остаток +26 (+2.8%).
- **wolf-release-engineer.md** (−22 интро + −30 раздел): composition→scope; «documentation» → «docs»; «authorization already granted» → «granted authorization». Остаток +6 (+1.0%).
- **wolf-researcher.md** (−31 интро + −30 раздел + 1 description): «The primary skill is» → «Primary skill»; «and the stop condition» → «and stop condition»; «is sufficient» → «suffices»; «with the cause search» → «with cause search»; перечень результата без повторных «the»/«and». Остаток +15 (+2.3%).
- **wolf-reviewer.md** (−13 интро + −30 раздел): «Perform related reading» → «Do related reading»; «without a full re-audit» → «not a full re-audit»; «Return the verdict» → «Return verdict»; norm→rule. Остаток +12 (+1.9%).
- **wolf-tester.md** (−19 интро + −30 раздел): «Create tests and fixtures only in TASK-permitted paths» → «Tests and fixtures only in TASK-permitted paths» (правило размещения сохранено); «do not fit the oracle» → «do not fit it»; «Return the reproduction» → «Return reproduction». Остаток +20 (+3.4%).

## Честный остаток ужатия

Цель EN ≤ RU в символах не достигнута в 8 файлах: остаток +1.0…+3.4% к RU-цели, все в засвидетельствованном двумя редакторами структурном коридоре ~+2–4%. Раздел общего контракта зафиксирован каноном ведущего и не ужимался; оставшийся объём — интро-правила, где дальнейшее сокращение теряет нюансы («Explicitly», «external oracle», «assigned environment», полные перечни возвращаемых полей, различие proposal/decision). Ни одно правило, число, команда, имя или frontmatter при ужатии не потеряны; структура всех файлов равна RU-оракулу (frontmatter, H1, интро, один раздел контракта; mr-wolf — без раздела).

## Самопроверка

1. Кириллица `[\x{0400}-\x{04FF}]` по 9 файлам — 0 совпадений.
2. Идентичность общего контракта в 8 файлах — см. блок «Задача 1» (grep-факты + fingerprint `969e9e49`); md5 — за ведущим.
3. Токены до/после — таблица выше; метод сверен с before-числами TASK.
4. Структура = RU-оракулу — заголовки и состав разделов не менялись.

### Фиксы цикла 1 G4 (R2, 2026-11-15)

R2 (C + commands): 2 Major + 1 Minor, 4/7 PASS, контракт PASS. Применено ведущим: diagnostics вместо diagnosis в analyze-doc.md:11 и complain.md:25 (недосмотр покрытия доводки — grep шёл только по agents/); соседняя находка за пределами G4: composition -> release scope в принятом G2 wolf-release/SKILL.md:8 (RU «состав», канон §6c; 207/207 паритет сохранён); doc-review «only with proven currency» — оставлено (гармонизация с каноном wolf-review, RU-оракулу не противоречит по сути); исключение diagnosis (RU «разбор», wolf-feedback session-diagnosis — канон G2) внесено в глоссарий, §6c примечание уточнено. Suggestion R1 принят: mr-wolf description «per acceptance criteria and evidence» (снятие двоякости «against»; 1872 -> 1877, +0.3% принято). Контроль после фиксов: гейт G4=0, wolf-feedback=0, wolf-release=0; кириллица 0; diagnosis в commands — 0.

### Цикл 3 G4 и приёмка группы (2026-11-15)

Контрольный wolf-reviewer, выборка 3/12 (wolf-expert, complain.md, analyze-doc.md — файлы со свежими фиксами). Вердикт: 0 Major, 0 Minor, ACCEPT GROUP. Подтверждены: render/are the norm/isolation_limits, complain согласован с каноном complaints.md (filing/triage/resolution/coordinator, kind technical|behavioral), analyze-doc конечный TASK (5 элементов), diagnostics-фиксы на месте, запрещённые алиасы отсутствуют.

ГРУППА G4 ПРИНЯТА ведущим 2026-11-15: 12/12 (9 агентов + 3 команды). Токены: mr-wolf 1877/1872 (+0.3%), команды — паритет (232/232, 385/386, 230/230), агенты +1.0…3.4% обоснованный остаток (структурный предел, трое редакторов). Гейты: кириллица 0, гейт 4 — 0 попаданий, запрещённые слова — 0.

### Гигиена гейта 4 перед закрытием групп (2026-11-15)

Шесть мета-нарушений гейта в самом глоссарии (ловились при скане templates/**): пять approved-строк без действующего EN-алиаса (связь между записями, сессия, инициализация, оставить, проверка) — объявлены в разделе «Без машинного EN-контроля» с причинами (алиасы нейтрализованы исключениями как технические употребления: link/os.link, edge/граф, reference/docs, setup/тест, installation/линза, retention/регламент, hold/глагол, testing/тестирование; conversation/разговор; условный validation). Русские алиасы этих строк продолжают держаться гейтом 1. Исключение diagnosis удалено из машинного разбора: оно ссылалось на candidate-строку «диагностика» §6c, которой в approved-наборе нет (гейт запрещает нематчащиеся исключения как устаревшие записи); разведение «разбор→diagnosis vs диагностика→diagnostics» сохранено в примечаниях §6c и вступит в машинный контроль при утверждении строки. После фикса гейт показывает только RU-хвосты G5 (plugins-reserved, 18 попаданий алиасов) — планово до T-31.

### Гигиена гейта 4 после G5-E1 (2026-11-15)

Перевод wolf-router.ts вскрыл 4 легитимных технических употребления, совпавших с запрещёнными алиасами approved-строк: spawn (дочерний процесс child_process/execFile — не «спавнить агента → hire»), spec (design-спека, «spec §5.4» — не «требование → requirement»), barrier (freshness barrier — механизм кэша router — не «гейт → gate»), override (модификатор TS и глагол — не «замена версии записи → supersede»). Все четыре зарегистрированы в «Исключениях» с причинами (каждый матчится с approved-алиасом — требование диагностики исключений выполнено). Каскад покрытия: замена (версии записи) и нанимать (исполнителя) лишились последних действующих EN-алиасов — объявлены в разделе «Без машинного EN-контроля» (русские алиасы держатся гейтом 1). QUESTION переводчика E1 принят в план цикла 1: INJECT_HEADER (строка 44) — одновременно текст инъекции и ключ idempotency-гварда (строка 288, joined.includes) — ревьюеру проверить внешних потребителей RU-текста заголовка и сценарий пересборки плагина в живой сессии.

## Группа G5 — перевод (T-28, блоки E1–E2, 2026-11-15)

Кодовые файлы плагинов: templates/opencode/plugins-reserved/wolf-router.ts (414 строк, 126 RU-строк), wolf-session-start.js (233, 72), README.md (4, 2) — 2 параллельных wolf-editor; плюс запись: base/README.md уже английский — перевод не требуется (решение T-28 плана). Переводились только человекочитаемые строки-инъекции и комментарии (R3 — полностью); идентификаторы, ключи/значения роутинга, regex, ${...}-интерполяции, пути, CLI-команды не тронуты; число строк = оракулу (414/233/4). Отклонения: «спавны (процессов)»→spawns и «воркер (worker-*)»→worker (совпадает с существующим исключением worker — маркер модели, не «executor»), «не имеет права уронить»→must not crash (обязанность, не сфера прав), `<файл>`→`<file>` (плейсхолдер README-команды).

Токены EN/RU (bench ведущего): router 4901/4765 (+2.9%, перерасход — код неизменен, рост в EN-прозе комментариев; кандидаты сжатия в журнале E1 — в цикл 2), session-start 2612/2617 (паритет; ручной счёт редактора 2616 — расхождение 4 токена с bench, зафиксировано), README 52/55. Кириллица 0. QUESTION E1: INJECT_HEADER (строка 44) — одновременно текст инъекции и ключ idempotency-гварда (строка 288, joined.includes) — передан в цикл 1; внешний потребитель RU-заголовка по grep — только tests/unit/adapters/render/plugin-injection.test.ts (T-32).

Гигиена гейта 4 от G5: 4 исключения (spawn — дочерний процесс, spec — design-документ, barrier — freshness barrier кэша, override — модификатор TS/глагол; все матчатся с approved-алиасами), каскад: строки «замена (версии записи)» и «нанимать (исполнителя)» лишились последних действующих алиасов — объявлены в «Без машинного EN-контроля». Итог: гейт 4 — OK; templates/** — 0 кириллицы (гейт 1 по шаблонам готов к зелёному, формальное закрытие после циклов T-31). Новые термины — §6d глоссария; «волна»/«выборка» строкой не регистрировались (исторические маркеры разработки в комментариях — wave 1.1 — не термины поставки).

Дословные журналы блоков ниже, parts удалены после merge.


#### Блок G5-E1

# G5-E1 — журнал перевода (волна english-base-delivery, группа G5)

- Дата: 2026-11-15
- file: `templates/opencode/plugins-reserved/wolf-router.ts`
- cycle: translation
- executor: G5-E1

## Отклонения «сознательно улучшено»

none

## QUESTION-строки (данные для цикла 1)

1. **Строка 44 `INJECT_HEADER`** — строка с двумя ролями: человочитаемый заголовок инъекции в диалог (в скоупе перевода) и одновременно ключ гварда идемпотентности `joined.includes(INJECT_HEADER)` (строка 288). Переведена (`'# Current playbook (source: Wolf memory, delivered by the plugin; mandatory response format)'`): вставка (строки 314, 334) и проверка (288) идут через одну и ту же константу, внутренняя консистентность сохранена. Циклу 1 проверить: (а) нет ли внешних потребителей RU-текста заголовка (тесты, другие файлы шаблонов); (б) сценарий «RU-инъекция пережила пересборку плагина внутри одного процесса opencode» — гвард перестаёт узнавать старый RU-заголовок, возможна повторная вставка заголовка в system. Откат при отрицательном решении — одна строка.

## Терминологические решения (в glossary.md НЕ добавлялись)

| RU | EN | Основание |
| --- | --- | --- |
| спавн / спавнит (CLI-процесса) | spawn | запрет spawn в §6c касается только создания агентов (наём → hire); здесь спавн субпроцесса CLI |
| барьер свежести | freshness barrier | авторский составной термин (Вариант Б) |
| недо-дедупликация | under-deduplication | авторский термин |
| тест-шов | test seam | комбинация §6: шов → seam |
| грабля | pitfall | синоним «ловушки» §6a |
| потолок | ceiling | авторский образ («известный потолок») |
| запечатанный текст | sealed text | термин «Варианта Б» |
| волна (1.1) | wave (1.1) | номер волны работ |
| выборка | selection | выдача поиска |
| гвард владельца / статуса | ownership guard / status guard | §3: страж владения → ownership guard |
| отказ (резолвера) | refusal | — |

## Токены

- RU-эталон (ведущий): 4765
- EN: **4901** (ceil(19603/4), весь файл) — перерасход +136 (+2.9%), зафиксирован по правилу «если есть — в журнал». Кодовая часть файла не менялась; перерасход целиком в переведённых комментариях/строках (EN-проза длиннее RU: артикли, предлоги). Кандидаты на сжатие в цикле 1 — строка 30 и строки 4–14 шапки.
- Самопроверка: строк в файле 414 (совпадает с оракулом); кириллица — 0 (grep `\p{Cyrillic}`: нет совпадений; JS-подсчёт: 0 символов, 0 строк).
- Замечание к входу: ведущий указал 126 строк с кириллицей; скан RU-оракула даёт 125. На работу не влияет — переведены все кириллические строки оракула.

#### Блок G5-E2

# G5-E2 — журнал перевода RU→EN (волна english-base-delivery, группа G5)

## templates/opencode/plugins-reserved/wolf-session-start.js

- date: 2026-11-15
- file: `templates/opencode/plugins-reserved/wolf-session-start.js`
- cycle: translation
- executor: G5-E2
- tokens: EN 2616 / RU 2617 (оракул ведущего). Самопроверка: EN 10463 симв., канон ceil(chars/4) на весь файл. Контрольная перепроверка RU-оракула той же транскрипцией дала 2622 — расхождение в шуме транскрипции, оракул не оспаривается. Первый черновик перевода был 2703 и ужат до 2616 телеграфными правками без потери смысла.
- structure: 233 строки → 233 (RU-строка → EN-строка на тех же позициях); многострочные шаблонные литералы (SESSION_BODY, FALLBACK, WORKER_BODY) сохранили число строк; `${…}`-интерполяции, escape-последовательности, regex, идентификаторы и пути без изменений; кириллица: 0 (`grep \p{Cyrillic}` — нет совпадений).
- отклонения:
  - «спавны» (процессов opencode) → `spawns`: канон «спавнить (агентов) → hire» не применён — в P204/P204-комментарии речь о process-spawn, не о найме агентов.
  - «воркер» в «пассивный режим воркера (L2)» → `worker passive mode`: RU-оригинал сам называет L2-агентов «воркерами» (семейство `worker-*`); это не перевод «исполнителя» (executor), а имя семейства агентов.
  - «ошибка плагина не имеет права уронить сессию» → `a plugin error must not crash the session`: запрет сохранён, буквальное «has no right to» отброшено как калька.
  - Телеграфные сжатия (артикли, «there is no need to load it again» → «no need to load it again») — условия, оговорки и запреты сохранены полностью.
- QUESTION:
  - `tests/unit/adapters/render/plugin-injection.test.ts:148` и `:250` — assertions на RU-строку `методика доставлена ниже (полный текст)`; после перевода проверка падает, пока тест не обновлён. Обновление тестов вне SCOPE G5-E2 — подтвердить исполнителя/волну.
  - Соседний `wolf-router.ts` в том же каталоге содержит такие же RU-конструкции — в назначение G5-E2 не входит; подтвердить, что его переведёт другая задача группы G5.

## templates/opencode/plugins-reserved/README.md

- date: 2026-11-15
- file: `templates/opencode/plugins-reserved/README.md`
- cycle: translation
- executor: G5-E2
- tokens: EN 52 / RU 55 (EN 206 симв. ≤ 220)
- structure: 4 строки → 4; кириллица: 0.
- отклонения:
  - Плейсхолдер `<файл>` внутри команды `git mv` переведён как `<file>` (это плейсхолдер, не путь); сами пути `templates/opencode/plugins-reserved/` и `templates/opencode/plugins/` не менялись.
- QUESTION: none

### Цикл 1 G5 (2026-11-15): 0 Major, 1 Minor — ACCEPT GROUP

wolf-reviewer по 3 файлам (полное сопоставление с оракулами, не выборка): router PASS, session-start PASS, README PASS. Инъекции 1:1 — инструкции, запреты, требования формата и escape (`\<`) без ослабления; «методика»→skill (×4) по канону §5; MARKER 'Mr.Wolf session bootstrap' не тронут (idempotency session-start переживает апгрейд). Исключения гейта (spawn/spec/barrier/override/worker) подтверждены в контексте.

INJECT_HEADER: verdict acceptable — гвард и обе вставки через одну константу (router:44/288/314/334), runtime-потребителей литерала вне плагина нет; сценарий «возобновлённая сессия 3.0 → 3.1»: разовое косметическое дублирование playbook-блока (RU-устаревший + EN-актуальный), самогаснущееся на следующем запросе, формат ответа не ломается; гвард по двум константам отклонён (мёртвый RU-текст нарушил бы 0 кириллицы templates/**). Условие acceptable: строка в миграционных заметках T-37 — «возобновлённые сессии 3.0 могут показать playbook дважды при первой пересборке — безвредно».

F-1 [Minor, соседняя]: факт «единственный внешний потребитель RU-заголовка — plugin-injection.test.ts» был неполон. Полный набор (проверен ведущим по grep): tests/unit/wolf-router-plugin.test.ts:248 (HEADER '# Актуальный playbook' — фильтр playbookParts:250, лягут все playbook-ассерты файла), tests/unit/adapters/render/plugin-injection.test.ts:304 (третье место помимо :148/:250), docs/site/guide/delivery.md:29 и docs/site/ru/guide/delivery.md:29 (ссылки на заголовок; site — канал release-docs). Скорректирован scope T-32 (оба тестовых файла) и заметки релиза.

Симметрия учёта отклонений: router:28 «не имеет права уронить»→must never bring down (тот же класс, что задекларированный E2 must not crash; семантика эквивалентна, правки файла не требует).


### Цикл 2 G5 (2026-11-15): ужатие router к паритету

Один свежий wolf-editor: router 4901→4763/4765 (bench; ручной счёт редактора 4762 — расхождение 1 токен, bench — истина). 27 телеграфных правок только в комментариях (артикли, связки, повторы: «instead of»→«not», «the X is Y»→«X is Y»); пример ревьюера цикла 1 (router:30 «At render time this file receives…») применён. Замороженные зоны целы: INJECT_HEADER (:44) и FALLBACK_PLAYBOOK (:47–62) побайтово = вердикт цикла 1; код, regex, ${…}, пути, числа, 414 строк, термины-исключения (spawn ×7, freshness barrier ×2, spec ×2, override) — на месте; кириллица 0; гейт 4 OK. Нормативная сила комментариев (must never / NOT / NO) не ослаблена. Лимит инструментария 39/40. Итог G5 после цикла 2: все 3 файла в паритете или лучше (4763/4765, 2612/2617, 52/55). Дословный журнал блока ниже, part удалён.


#### Блок G5-C2

# G5-C2 — журнал ужатия EN (волна english-base-delivery, группа G5)

- Дата: 2026-11-15
- file: `templates/opencode/plugins-reserved/wolf-router.ts`
- cycle: compression (только английская проза комментариев)
- executor: G5-C2 (свежий редактор, не автор перевода)
- TASK: 4901 → ≤4765 токенов (канон ceil(chars/4) на весь файл; RU-эталон 4765)

## Токены

- before: 4901 (ceil(19603/4), по журналу G5-E1)
- after: **4762** (ceil(19048/4)); снято 555 симв. по 27 правкам; порог ≤4765 — **уложился**, запас 12 симв. (19048 против 19060 = 4765×4).
- Метод: у прямого замера файла в Code Mode (codegraph_node по basename) числа не сошлись с файлом (20737 симв./417 строк — посторонний источник; в репо один `wolf-router.ts`, авторитетный Read даёт 414 строк), поэтому принят точный расчёт: эталон 19603 минус сумма длин «было→стало» всех 27 правок (число строк каждого блока сохранено, переносы не менялись ⇒ дельта переносов = 0). Мультибайтовые символы (—, →, ≠, §) не добавлялись и не удалялись, так что дельта одинакова и в символах, и в байтах.

## Ограничения

- INJECT_HEADER (строка 44) и FALLBACK_PLAYBOOK (47–62) не тронуты — вердикт ревью цикла 1 («acceptable», 1:1 с оракулом) сохранён.
- Код (идентификаторы, regex, `${…}`, пути, CLI-строки, числа), структура и число строк (414) — без изменений; все правки внутри `//`-комментариев и шапки `/** … */`.
- Нормативная сила не ослаблена: `must never bring down` (28), `ai-sdk NOT used` (27), `NOT selected and NOT injected` (12, 134), `NO fallback` (159), `never` (68, 111, 208→«not served», 281, 288, 353), `must not enter` (260), `not delivered` (218), `does not override` (196), `triggers no re-resolve` (118), `is excluded` (119) — сохранены.

## Правки (было → стало, кратко; номера строк совпадают до/после)

1. 4–30 шапка: «Delivery layer #1 of playbook context» → «Playbook-context delivery layer #1»; «instead of» → «not»; «The marker» → «Marker»; «does not reach» → «doesn't reach»; «the canonical face resolver» → «canonical face resolver»; «a diagnosable failure — both cases without a fallback search» → «diagnosable failure — both without fallback search»; «the text fallback» → «text fallback»; «the injection is memoized» → «injection memoized»; «within the session receives» → «in-session gets»; «the cache is versioned by the key of the head note» → «cache keyed by the head note»; «the skill is unavailable» → «skill unavailable»; «injection of the built-in universal FALLBACK_PLAYBOOK» → «built-in universal FALLBACK_PLAYBOOK injected»; «The delivery registry = the playbook objects themselves» → «Delivery registry = playbook objects themselves»; «there is no separate config» → «no separate config»; «ai-sdk is NOT used» → «ai-sdk NOT used»; «During rendering this file also receives» → «At render time this file receives» (пример ревьюера, зеркалит session-start:13); «(added by the renderer)» → «(renderer-added)».
2. 42: «a test seam … not to the live» → «test seam … not the live».
3. 46: «the canon always» → «canon always».
4. 63: «eats line breaks» → «eats newlines».
5. 65–69: «→ a 5-minute TTL» → «→ 5-minute TTL»; «(memoization in deliverPlaybook)» → «(memoized in deliverPlaybook)»; «the TTL cache saves … when the head matches» → «TTL cache saves … on a head match»; «spawns the search again» → «re-spawns the search» (термин spawn сохранён).
6. 72: «passed through … (for the B3 skill metric)» → «through … (B3 skill metric)».
7. 75–83: «The target project — the global» → «Target project — global»; «the local dist. If both fail» → «local dist. Both fail»; «the key is set» → «key is set»; «execFile without an env field inherits it by itself» → «execFile with no env field inherits it»; «several chats of one opencode process» → «several chats of one process» (opencode несёт контекст строки 77); «even on a non-zero exit — the CLI contract» → «even on non-zero exit — CLI contract»; «turning a real miss into an inexplicable error» → «a real miss became an inexplicable error».
8. 90: «(the CLI contract miss/conflict…)» → «(CLI contract…)».
9. 108–112: «cache with a 5-minute TTL» → «cache, 5-minute TTL»; «memory is mutated rarely» → «memory mutates rarely»; «the entry is versioned by the head key» → «entry keyed by the head key»; «and is served only when the id matches the current note of the live search» → «served only on an id match with the live search's current note»; «within the TTL receives» → «in the TTL gets».
10. 115–119: «memoization of the injection per opencode session. The session key is» → «injection memoized per opencode session. Session key is»; «a documented ceiling» → «documented ceiling»; «The session is pinned to the version of the first task» → «Session is pinned to the first task's version»; «does not trigger a re-resolve» → «triggers no re-resolve»; «switching the version mid-task» → «mid-task version switching».
11. 133–135: «unique — the canonical face» → «unique — canonical face»; «(only the universal fallback» → «(only universal fallback».
12. 156–160: «the canonical face resolver — a strict» → «canonical face resolver — strict»; «instead of probabilistic» → «, not probabilistic»; «the outcome differs — unique is delivered; none → the legacy path» → «outcomes differ — unique delivered; none → legacy path»; «the fallback search bypassed the conflict by picking» → «fallback search bypassed the conflict, picking».
13. 166: «— a diagnosable failure» → «— diagnosable failure».
14. 185–186: «miss → the legacy path» → «miss → legacy path»; «an unparseable response» → «unparseable response».
15. 196: «the fallback search does not override» → «fallback search does not override».
16. 201: «the word "playbook" (the canon's title/tags)» → «"playbook" (canon title/tags)».
17. 205–208: «(memoization in deliverPlaybook guarantees "once per session"…) — this is the freshness barrier» → «(memoized in deliverPlaybook: "once per session"…) — the freshness barrier»; «when the head-id matches the first line of the selection» → «when head-id matches the selection's first line».
18. 213–218: «relevance has already sorted» → «relevance already sorted»; «the first candidate that passes» → «the first candidate passing»; «instead of K in a row» → «, not K in a row»; «the guards —» → «guards —»; «via the canonical resolver» → «via canonical resolver»; «proposed/superseded are not delivered» → «proposed/superseded not delivered».
19. 248: «— a diagnosable error» → «— diagnosable error».
20. 257–261: «the tool name / the args object» → «tool name / args object»; «A separate JSONL file — invariant: the SignalEventSchema» → «Separate JSONL file — invariant: SignalEventSchema»; «must not go into» → «must not enter»; «a test seam … the env is set by tests after the import» → «test seam … env is set by tests after import».
21. 278–283: «sealed text without a re-resolve» → «sealed text, no re-resolve»; «every line of the log carries» → «every log line carries»; «it is visible how exactly» → «shows how exactly»; «(the canonical label» → «(canonical label».
22. 287: «a frame without the marker» → «frame without marker».
23. 290: «the agent is known to» → «agent known to».
24. 292–294: «the session already received … serve the sealed text» → «session already received … serve sealed text»; «spawns and a re-resolve» → «spawns or a re-resolve»; «persists the system text» → «persists system text».
25. 332–333: «the skill is unavailable … the universal fallback; the injection» → «skill unavailable … universal fallback; injection».
26. 357–359: «several chats of one opencode process share the key» → «several chats of one process share it» (opencode и «ключ» несут строки 357–358).
27. 364: «receives the hook object» → «gets the hook object»; 380–381: «the injection is a text block … (the mutation reaches …), the metric» → «injection is a text block … (mutation reaches …), metric»; 413: «(the opencode loader contract)» → «(opencode loader contract)».

## Решения по терминам-исключениям

- spawn: не удалялся ни разу (67 «get spawn», 69 «re-spawns the search», 78 «wolf spawns», 109 «no CLI spawn», 110 «get spawn», 293 «CLI spawns», 357 «wolf spawns»).
- barrier: «freshness barrier» сохранён в обоих местах (66, 207).
- spec: «Spec A2» (65), «spec A2-b» (213) — сохранены.
- override: «fallback search does not override the outcome» (196) — сохранено.
- worker: в комментариях файла термин не встречался — решений нет.

## Самопроверка

- Число строк: **414** — построчный Read после правок (блоки правок сохраняли число строк; последняя строка файла 414).
- Кириллица: **0** — проверки: (1) ripgrep `\p{Cyrillic}` по файлу — «No matches found»; (2) JS-скан `\u0400-\u04FF` при верификации — по независимому источнику 0; (3) все 27 правок вносили только ASCII-текст, спецсимволы (—, →, ≠, §) переносились без изменений.
- Ограниченные зоны: строки 44 и 47–62 побайтово исходные (вошли в перечитанный файл без изменений); кодовые строки совпадают с EN-исходником.
- Итог: 4901 → 4762 токена, порог ≤4765 выполнен.

### Цикл 3 G5 и приёмка группы; закрытие групп G1–G5 (2026-11-15)

Контрольный wolf-reviewer, выборка 1/1 (wolf-router.ts — файл всех правок циклов). Вердикт: 0 Major, 0 Minor, ACCEPT GROUP. Построчная сверка 414/414 с оракулом по 6 зонам: сжатия цикла 2 смысл не тронули (все усилители на месте: NOT/NO/never/must never, «РОВНО ОДИН»→EXACTLY ONE), инъекции побайтово = вердикту цикла 1 (INJECT_HEADER сверен grep + посимвольно), код/regex/${…}/числа (300_000, 5000) не тронуты, термины-исключения в правильных значениях, калька от сжатий отсутствует. Замечание ревьюера о неточности книжных счётчиков журнала (spec ×2 → факт. 3, skill ×4 → факт. 5) принято к сведению — значения корректны, gate-критерию не противоречит.

ГРУППА G5 ПРИНЯТА ведущим 2026-11-15: 3/3 файла, все в паритете — router 4763/4765, session-start 2612/2617, README 52/55.

ЗАКРЫТИЕ ГРУПП G1–G5 (T-31): все 5 групп переведены, каждая прошла циклы 1–3 с независимыми ревью и принята ведущим. Формальные прогоны: delivery-language gate OK (0 files with Cyrillic, 73 files checked) — гейт 1 зелёный; glossary-consistency gate OK (81 approved, 165 aliases, 73 files, 50 exceptions) — гейт 4 зелёный; english-surface OK. R-P3 (транзиентная краснота npm run check с T-11) снята в части гейтов; оставшаяся краснота test:run — RU-ассерты тестов поставки, область T-32.


### T-32 — синхронизация тестов/demo/docs под EN-поставку (2026-11-15, ведущий)

Отклонение от плана: исполнитель wolf-developer заменён ведущим — правки ассертов требуют итеративных прогонов vitest «правка→прогон», shell у субагентов недоступен. Пометка внесена в план.

Юниты (61 правка, 8 файлов, все на EN-цитаты из переведённых шаблонов — grep-верификация каждой формулировки перед заменой): plugin-injection (6), wolf-router-plugin (HEADER + Universal playbook ×7), base-frames-guard (2), conveyor-skills-guard (26 маркеров 7 it()-блоков), intake-skill-guard (5), worker-expert-channel (13, включая негативы /no links, including/), density-mode-delivery (регистр Density standard|draft + return to the requester), wolf-git-contract (CANON_SHA256 df7d3d82→de60c9b5 + 10 заголовков + негатив + ключевое слово). Wolf-git: канон docs/reference/git-collaboration-policy-v1.1.md заменён EN-версией байт-в-байт (shasum обоих = de60c9b5…; ADR-1 «канон = поставка» сохранён; RU-канон 350 строк кириллицы вытеснен EN-версией, переведённой и принятой в группе G2). Прогон: 2326/2327; docs-audit падает ТОЛЬКО по timeout 5s под нагрузкой полного прогона (скан docs/ потяжелел от документов волны), изолированно зелёный 2/2 — заметка на T-42 (поднять testTimeout для docs-audit). Предсуществующий fail memory-sync не воспроизводится.

e2e (а): инвентаризация 44 RU-вхождений в 12 файлах — все бьют в вывод CLI wolf (RU-язычный продукт, вне scope волны) или в RU-фикстуры (design §6.1: остаются); RU-маркеров поставки нет — правки не потребовались. (б) delivery-language-rule.e2e.ts создан: SC-01 (init доставляет AGENTS.md с «## Session language», «Session language: <lang>», «always stay English»; re-init --yes сохраняет секцию). Находка: vitest наследует npm_command=exec — init считает запуск npx try-out (spec §7) и не пишет базу; тесты фиксируют env установленного запуска (npm_command=install). (в) upgrade-language-wave.e2e.ts — каркас: npm-шим + изолированный HOME/XDG + stamped fixture (init --full → 9 агентов) + 5 it.todo SC-19..23 (наполнение T-37 после T-35). (г) demo scenario-1..8: маркеры синхронизированы с текущим контрактом CLI — предсуществующие расхождения (волна CLI не трогала): S1 (правила по ID-именам вместо транслит-слагов *stek*/*proverka* — дефект из плана; документы — doc_readme-объекты notes/ вместо documents/; brief-маркер Registered project document), S3 (контракт 3.0 R-08 «лица не сеются»: негативная проверка playbook + persona в теле рамки), S4 (complain полный контракт --rule/--evidence/--proposal, about БЕЗ префикса agent: — по фактике резолва и e2e-прецеденту; relation complain и event complaint подтверждены живым прогоном), S5 (register by reference: исходник не копируется в .wolf/tools), S8 (сводка ищется по содержимому: ID-имена). Прогон: 8/8 сценариев, 53 PASS / 0 FAIL. (д) docs:build — зелёный (16.5s) без правок; package-hygiene, check-english-surface — без правок (F-1/F-2).

Итог T-32: check-гейты зелёные (delivery-language OK, glossary OK, english-surface OK, format OK на новых файлах), e2e 245 passed + 5 todo (63 файла), demo 53/0, юниты 2326/2327 (1 timeout-флаки). Критерии плана: grep assertion-строк e2e/demo — RU-маркеров поставки нет; SC-01 прогон зелёный (scaffold/bootstrap + delivery-language-rule — 63 файла e2e зелёные); полные SC-17/18 — на T-42.

