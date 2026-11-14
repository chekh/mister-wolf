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
