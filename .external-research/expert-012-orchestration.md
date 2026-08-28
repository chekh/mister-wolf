# expert-012: Оркестрация контура самообучения (QO.1–QO.2)

> От: Внешний эксперт (ВА)
> Кому: Координатор Mr.Wolf
> Дата: 2026-08-28
> Очередь: каноническая (wolf-006/wolf-009), последняя тематическая тема перед финальным брифом
> Закрытие: QO.1 (уровни оркестрации L0/L1/L2 — где и когда исполняется контур), QO.2 (границы дозволенного изменения — кто и что может менять)

---

## 0. Приёмка задачи

Принимаю без оговорок:
- Работаю строго по канонической очереди: это **последняя тематическая порция** (003–012 закрыты после этой), дальше только `expert-013-recommendations-brief.md` (финальный DoD-артефакт).
- Вне-программные темы (tool hallucination, ReasoningBank) — не трогаю.
- Формат: механики шагами, числа с цитатами, маппинг на Wolf в каждой секции, классификация чисел, источники с URL.

Ключевой вопрос порции: **контур самообучения — это тоже агентская работа. Кто её оркестрирует, в каком процессе она живёт, и что защищает систему от того, что контур обучения сломает сам себя?** Литература 2025–2026 даёт на это конкретные ответы.

---

## 1. Якорный источник: Lilian Weng, «Harness Engineering for Self-Improvement» (июль 2026)

Это центральный обзор темы на текущий момент (39 источников, покрывает все основные системы). Определение, которое принимается как рабочее:

> «A **harness** is the system surrounding a base model that orchestrates execution and decides how the model thinks and plans, calls tools and acts, perceives and manages context, stores artifacts, and evaluates results.»
> — https://lilianweng.github.io/posts/2026-07-04-harness/

**Mr.Wolf — это и есть harness** (память + оркестрация + доставка знаний + приёмка). Контур Ф20–25 — это механизм, которым harness улучшает сам себя. Обзор фиксирует прогресс объекта оптимизации:

> «The progression in the object being optimized in the harness system is roughly: instruction prompts → structured context → workflow → harness code → optimizer code.»

Wolf v1 сознательно останавливается на первых трёх ступенях (параметры → шаблоны → ограниченно workflow). Это согласуется с предупреждением обзора о более глубоких уровнях (см. §4).

Три паттерна проектирования harness из обзора — все три уже есть в Wolf:

| Паттерн (Weng) | Реализация в Wolf |
| --- | --- |
| **Pattern 1: Workflow Automation** — goal-oriented loop plan→execute→observe/test→improve | оркестрация coordinator → executor → workers + rejected-циклы |
| **Pattern 2: File System as Persistent Memory** — durable state в файлах, не в контексте | files as source of truth (markdown + frontmatter), SQLite/vector — derived |
| **Pattern 3: Sub-agent and Backend Jobs** — параллельные субагенты + процесс-менеджер | воркеры; «make parallelism explicit and inspectable... stored as files, logs, and status records» — наши отчёты и events.jsonl |

Ключевая цитата по Pattern 3 (прямо про наши отчёты):

> «If subagent outputs only live in a transient chat context, they quickly become obsolete and hidden. If they are stored as files, logs, and status records, the model can recover after interruptions and reason over its own execution history.»

**Вывод для Wolf:** архитектура проекта — не самобытная конструкция, а совпадение с консенсусными паттернами 2026 года. Это снижает архитектурный риск.

---

## 2. QO.1: Где и когда исполняется контур обучения (уровни L0/L1/L2)

### 2.1 Три паттерна размещения в литературе

**Паттерн A — Online/inline: адаптация прямо во время исполнения.**
*Continual Harness* (Karten et al., arXiv:2605.09998, май 2026):

> «Continual Harness removes the human fully from this loop: a reset-free self-improving harness... the agent alternates between acting and refining its own prompt, sub-agents, skills, and memory, drawing on any past trajectory data. Prompt-optimization methods require episode resets; Continual Harness adapts online within a single run.»
> — https://arxiv.org/abs/2605.09998

Результаты: на Pokemon Red/Emerald «substantially reduces button-press cost relative to the minimalist baseline and recovers a majority of the gap to a hand-engineered expert harness». Важно: в исходной системе (Gemini Plays Pokemon) самообучение началось **спонтанно** у агента внутри длинного прогона — «the agent itself began iterating on its strategy through long-context memory, surfacing emergent self-improvement signals» — а Continual Harness лишь формализовал и автоматизировал это.

**Паттерн B — Ролевое разделение внутри цикла (без смены процесса).**
*ACE — Agentic Context Engineering* (Zhang et al., arXiv:2510.04618, ICLR 2026) разделяет контур на три роли:

> «It has three components to maintain one context playbook of bullet points, each with an identifier and a description. 1. *Generator*: produces task trajectories, with reference to bullet points. 2. *Reflector*: distills insights from successful and failed trajectories. 3. *Curator*: updates the structured context with incremental, itemized entries.»
> — цит. по обзору Weng

Критически важная деталь защиты от деградации:

> «To prevent context collapse and brevity bias during iterative rewrites, one key design choice in ACE is that the curator does not rewrite a full prompt blob. It instead outputs a collection of structured, itemized bullets in the form of (identifier, description), and these bullets are merged into a structured context logbook with deterministic logic.»

*SiriuS* (Zhao et al., NeurIPS 2025, arXiv:2502.04780) — общая **experience library** поверх нескольких агентов: «agents solve problems sequentially, storing correct responses for fine-tuning and augmenting incorrect ones through feedback, regeneration, and rephrasing»; прирост 2.86%–21.88% на reasoning и biomedical QA. **Ограничение для Wolf:** SiriuS замыкает цикл через SFT (fine-tuning) — это не weightless-обучение; переносима только идея общей библиотеки опыта (у Wolf она уже есть — типизированная память).

**Паттерн C — Offline/between-episodes: обучение между прогонами, на накопленных трейсах.**
GEPA (expert-011), Self-Harness (см. §3), AFlow (ICLR 2025), ADAS (ICLR 2025). Все они требуют сначала **собрать и оценить трейсы**, потом предложить изменение. Это и есть контур Ф20–25.

### 2.2 Ключевой конфликт: online vs offline — и почему Wolf выбрал правильно

Прямое противопоставление из альфа-обзора Continual Harness:

> «The paper emphasizes that prompt-optimization methods like GEPA require complete episode resets between updates, whereas Continual Harness adapts online within a single run, which is a core contribution.»
> — https://www.alphaxiv.org/abs/2605.09998

Аргументы за **офлайн-размещение** (паттерн C) для кодинг-агента:

1. **Сессия кодинг-агента — естественная граница эпизода.** В отличие от игры без пауз, между сессиями есть точка коммита/приёмки — идеальный момент для сверки «до/после».
2. **Инвариант «запись без LLM»** (решение ревизии 27.08): горячий путь не должен ждать рефлексию. Online-адаптация его нарушает по построению.
3. **Принцип «адаптирующий ≠ исполняющий»** (спец. контура): при inline-адаптации агент одновременно решает задачу и меняет себе правила — конфликт интересов, который литература квалифицирует как источник reward hacking (§4).
4. **Цена ошибки:** изменение конфигурации посреди сессии может сломать текущую задачу; изменение между сессиями откатывается одним `wolf supersede`.

**Что взять из паттерна A (не перенимая его целиком):** идею *триггера* — если сигнал критический (например, инструмент упал ≥3 раз в одной сессии), контур может пометить его как `hot-signal` для приоритетной обработки в следующем офлайн-цикле. Не адаптировать на лету — эскалировать приоритет. **Предложение ВА, калибровка обязательна.**

### 2.3 Уровни L0/L1/L2 — формализация для спеки

На базе паттернов литературы и принципов Wolf:

| Уровень | Определение | Где живёт в литературе | Статус в Wolf |
| --- | --- | --- | --- |
| **L0 — inline** | Исполняющий агент сам адаптирует свою конфигурацию в той же сессии | Continual Harness (частично), спонтанное самообучение GPP | **Запрещён** принципом «адаптирующий ≠ исполняющий». Единственное исключение — запись сигналов (Ф20), это наблюдение, а не адаптация |
| **L1 — отдельная оркестрационная сессия** | Контур исполняется как отдельная оркестрация с ролями (Analyzer-Worker, Куратор), через те же механизмы coordinator→executor→workers | ACE (роли), Self-Harness (propose-evaluate-accept), Autodata (challenger/solver/verifier) | **Целевой уровень v1.** Все роли Ф22–25 — роли оркестрационной сессии обучения |
| **L2 — фоновый процесс/демон** | Контур работает автономно между сессиями, без запуска пользователем | Pattern 3 у Weng: «the parent agent then needs a small process manager: launch jobs, inspect logs, cancel failed runs, and merge results back» | **Не в v1.** Требует процесс-менеджера (у opencode есть примитивы backend-джобов); триггеры — пороговые из Ф21 |

**Критерий перехода L1 → L2** (предложение ВА): не раньше чем контур на L1 даст 90 дней стабильных метрик (по критериям staged autonomy из expert-010) и появится процесс-менеджер с инспекцией логов. Аналогия: тот же путь прошёл Gemini Plays Pokemon — от human-in-the-loop refinement к автоматизации (цитата из §2.1).

### 2.4 Требования к процесс-менеджеру (если/когда L2)

Из Pattern 3 (Weng): «launch jobs, inspect logs, cancel failed runs, and merge results back into the main agent thread». Перевод на инфраструктуру Wolf:
- **launch** — запуск оркестрации обучения как отдельной сессии с собственным `session_id` и `session-metrics.jsonl` (схема из expert-007 уже покрывает);
- **inspect logs** — `wolf learn status` (expert-010) как точка инспекции;
- **cancel failed runs** — таймаут на Analyzer-Worker (параметр, класс «параметры»);
- **merge results back** — draft-правила в очередь `.wolf/queue/` (expert-009), дайджест Куратору.

---

## 3. QO.2: Границы дозволенного изменения (кто и что может менять)

### 3.1 Self-Harness: bounded proposal context — четыре обязательных элемента

*Self-Harness* (Zhang et al., arXiv:2606.09498, 2026; GitHub: qzzqzzb/Self-Harness) — самый прямой аналог контура Wolf. Цикл из трёх стадий (шагами):

1. **Weakness mining**: текущий harness `h_t` прогоняется на задачах, собираются трейсы; ошибки кластеризуются в **verifier-grounded failure patterns**. Важная деталь: «two runs can share the same verifier outcome in the error logs on the surface, such as timeout or missing artifact, while having different causal mechanisms» — поэтому запись ошибки обязана нести три слоя: терминальную причину, каузальный статус поведения агента, абстрактный механизм. **Прямое подтверждение** нашего решения из expert-006: ключ однотипности ≠ сырой текст ошибки; нужен каузальный слой (`error_class_id` + контекст).
2. **Harness proposal**: та же модель под `h_t` предлагает правки, получая **bounded proposal context** из четырёх элементов:
   > «(1) the editable surfaces of the current harness, (2) the verifier-grounded failure patterns from the evaluation system, (3) records of passing behaviors that should be preserved, and (4) summaries of previously attempted edits.»
3. **Proposal validation**: кандидаты проверяются регрессионными тестами на **held-in** (закрыта ли слабость) и **held-out** (не сломано ли другое) сплитах;
   > «Candidates are accepted only if they have no regression on both held-in and held-out data. Accepted candidates are merged to update the harness to h_{t+1}, while rejected candidates are logged without changing the active harness.»

Результат: на 9 комбинациях модель×бенчмарк (MiniMax M2.5, Qwen3.5-35B-A3B, GLM-5 × Terminal-Bench-2.0, SWE-bench Verified, AppWorld) «every final harness improves both held-in and held-out pass rates, with overall relative gains of up to 132%» (https://arxiv.org/abs/2606.09498).

**Поэлементный маппинг bounded proposal context на Wolf:**

| Элемент Self-Harness | Эквивалент в Wolf | Статус |
| --- | --- | --- |
| (1) editable surfaces | классы адаптации из спеки (§3): параметры/шаблоны/структура + явный запрет на core pack | есть в спеке; **нужен явный список editable surfaces в контракте Analyzer-Worker** |
| (2) failure patterns | кластеры Ф21 с `error_class_id` | есть (Ф21) |
| (3) passing behaviors to preserve | E2E-сьют + green-сценарии pressure-тестов (Ф23) | есть частично; **нужен явный «золотой набор» сценариев** |
| (4) summaries of previously attempted edits | `lesson` с `feedback_type: negative` + `rejection_reason` (expert-008) | есть (Ф22) |

**Кандидат правки спеки:** контракт Analyzer-Worker (Ф22) обязан включать все 4 элемента — сейчас в спеке явно перечислены только (2) и (4).

### 3.2 AHE: read-only зоны как защита от reward hacking

*Agentic Harness Engineering* (Lin et al., arXiv:2604.25850, 2026) строит контур вокруг трёх столпов наблюдаемости:

1. **Component observability** — каждый редактируемый компонент имеет представление в файловой системе. Таксономия из 7 компонентов: **system prompt, tool description, tool implementation, middleware, skill, sub-agent configuration, long-term memory**. Каждый паттерн ошибок мапится ровно на один компонент.
2. **Experience observability** — иерархия доказательств: «Agent debugger» пишет пер-задачный отчёт о корневой причине; отчёты агрегируются в benchmark overview; сырые трейсы доступны при необходимости. Цитата: «This layered access structure is more token efficient.»
3. **Decision observability** — каждая правка сопровождается **предсказанием для следующего раунда** и записью-манифестом: «the failure evidence's name, the inferred root cause, the targeted fix, and a predicted impact comprising both expected fixes and at-risk regressions».

И главное — механизм защиты от взлома награды:

> «Edits are only applied to the harness workspace. The runs directory, tracer, verifier, and LLM configuration are read-only, which disables a set of reward hacking (e.g disabling the verifier, swapping the model, or raising the reasoning budget) and thus it can keep every recorded gain attributable to harness edits.»

Результат: на Terminal-Bench-2 AHE превзошёл человеческие harness'ы (OpenCode, Terminus-2, Codex), кроме Hard tier; эволюционированный harness переносится на SWE-bench-verified без дообучения.

**Маппинг на Wolf:**

| Зона | Статус в Wolf |
| --- | --- |
| Harness workspace (редактируемо) | `.wolf/config.yaml` (project types, параметры), шаблоны брифов, `rule`/`lesson` |
| Read-only: verifier | **STOP-гейт (Ф23) и приёмка по критериям не должны быть редактируемы контуром** — сейчас это не зафиксировано явно |
| Read-only: runs/traces | `events.jsonl`, `session-metrics.jsonl`, `relations.jsonl` — append-only, уже защищены архитектурой |
| Read-only: LLM configuration | модель и её параметры вне контура — инвариант «весов не трогаем» |

**Кандидат правки спеки:** явно зафиксировать список **read-only зон контура**: (а) код гейтов (Ф23, приёмка), (б) сигнальный лог и события, (в) сама таксономия типов ядра (уже есть в Ф8, но не прописана как ограничение контура обучения). Без этого контур теоретически может «улучшить» себе критерии приёмки.

**Механика манифеста правки** (перенос в Ф22): каждый `draft-rule` несёт: ссылку на evidence-кластер (имя), вывод о корневой причине, целевое исправление, **предсказание эффекта** (что должно исправиться) и **список рисков регрессии** (что может сломаться). После активации предсказание сверяется с фактом по сигнальному логу — это и есть decision observability. **Предложение ВА.**

### 3.3 Явная разметка редактируемых поверхностей (паттерн AlphaEvolve)

*AlphaEvolve* (Novikov et al., arXiv:2506.13131, 2025, DeepMind):

> «The coding agent has access to the full repo, but code regions for improvement are explicitly marked with `# EVOLVE-BLOCK-START` and `# EVOLVE-BLOCK-END`.»
> — цит. по обзору Weng

Дополнительно: «Meta-prompt co-evolves with instructions and context as suggested by LLM» — мета-промпт эволюционирует вместе с решениями.

Перенос на Wolf: в шаблонах и конфигах, которые контур имеет право менять, редактируемые секции помечаются маркерами (например, `<!-- WOLF-EDITABLE-START: brief-objective -->`). Analyzer-Worker не имеет права предлагать правки вне маркеров; валидатор отклоняет такие кандидаты механически (без LLM). **Предложение ВА** — дешёвый детерминированный барьер, согласуется с инвариантом «запись/валидация без LLM».

### 3.4 Оценка и разрешение — вне контура

Обобщение от Weng (раздел Future Challenges, п.5):

> «The evaluator and permission control should likely sit outside the loop that evolves harness, with held-out tests, trace audits, and human review at decision points that matter.»

Wolf уже удовлетворяет этому: приёмка по критериям — независимая роль; `wolf supersede` и lifecycle — вне контура обучения; гейт человека (автономия B) — human review at decision points. **Подтверждение корректности архитектуры, правка не требуется.**

### 3.5 Итоговая матрица «кто что меняет» (синтез для спеки)

| Субъект | Параметры (конфиг) | Шаблоны | Правила (rule/lesson) | Структура (роли/скиллы) | Гейты/верификаторы | Сигнальный лог |
| --- | --- | --- | --- | --- | --- | --- |
| Исполняющий агент (сессия задачи) | запись сигналов (наблюдение) | — | — | — | — | — |
| Analyzer-Worker (L1) | черновики предложений | кандидаты | черновики с манифестом | — | — | — |
| Куратор (роль, действует от имени пользователя) | — | одобрение | принятие/отклонение, `supersede` | — | — | — |
| Пользователь | утверждение | утверждение | создание активных `rule` | любые изменения | изменения только человеком | — |
| Контур в целом | **не может менять**: гейты, приёмку, сигнальный лог, события, core pack, модель | | | | | |

---

## 4. Оркестрационные режимы отказа (что литература говорит про сам контур)

### 4.1 Предупреждение STOP: рекурсивная структура сама по себе не работает

> «A cautionary result in Zelikman et al. (2023)'s findings is that STOP improved mean downstream performance across iterations with GPT-4 but degraded with weaker models like GPT-3.5 and Mixtral. Recursive structure alone is not enough. The base model must be capable enough to improve the mechanism.»
> — обзор Weng

Следствие для Wolf: ** Analyzer-Worker обязан работать на фронтирной модели** (через адаптер `opencode run`). Это уже согласовано в expert-011 для GEPA-рефлектора; распространяю требование на Analyzer-Worker (Ф22). Экономия на модели-улучшателе — ложная экономия: слабая модель деградирует контур.

### 4.2 Разделение способностей: обновлять harness ≠ извлекать из него пользу

*Lin et al. 2026* (arXiv:2605.30621, «Harness Updating Is Not Harness Benefit»):

> «A range of models of different sizes and core intelligence, from Qwen3.5-9B to Claude Opus 4.6, were observed in their experiments to show similar harness updating capability; the 9B harness proposer/evolver is able to write a skill procedurally isomorphic to Opus.»

При этом **harness-benefit** (способность извлечь пользу из обновлённого harness'а) **немонотонна**: больше всего выигрывают модели среднего уровня.

Следствие для Wolf:
- На *генерации* черновиков правил (механическая работа) теоретически допустима более дешёвая модель — но только после эмпирической проверки изоморфности на наших данных; до неё действует правило §4.1 (фронтир). **Не менять в v1 без данных.**
- На *исполнении* правил важна способность исполняющей модели следовать доставленным `rule` — это аргумент в пользу `delivery_event`-метрик (Ф20, expert-005): если правила пишутся хорошо, но не меняют поведение, проблема в harness-benefit исполнителя, а не в контуре.

### 4.3 Шесть режимов отказа долгих агентных проектов

Из *Trehan & Chopra 2026* (arXiv:2601.03315), цит. по обзору Weng — применимо к контуру обучения как к долгому проекту:

| Режим отказа | Риск для контура Wolf | Защита |
| --- | --- | --- |
| Bias toward training-data defaults | Analyzer-Worker предложит «стандартное» правило, не основанное на наших сигналах | манифест правки обязан ссылаться на evidence-кластер (Ф22), без ссылки — отклонение |
| Implementation drift | черновик правила дрейфует от найденного паттерна к общему месту | holdout-валидация (Ф22) + гейт Куратора |
| Memory and context degradation | длинный контур теряет детали ранних сигналов | файлы как артефакты (наш Pattern 2), evidence-ссылки |
| Over-optimism | контур рапортует об улучшении при шуме | «over-optimism... models can introduce 'numerical duct tape' and declare victory when signals are still noise» — защита: порог N≥3 + проспективное сравнение до/после (Ф20) |
| Insufficient domain intelligence | контур не понимает, что правка бесполезна | гейт Куратора-человека |
| Weak scientific taste | оптимизируется не та метрика | целевая функция тройная (качество/стоимость/время), зафиксирована в спеке |

### 4.4 Три структурных риска эволюционных контуров

Из Future Challenges (Weng):

1. **Diversity collapse** — «Evolutionary and RL loops tend to exploit known high-reward patterns. We need mechanisms to prevent the population from collapsing into variants of the same solution.» Для Wolf: в очереди дайджеста (expert-009) не должно быть 10 вариантов одного правила; дедупликация кандидатов по `candidate_hash` (expert-008) — уже наш механизм против этого.
2. **Отрицательные результаты должны сохраняться** — «a research harness should make failed attempts easy to preserve, as learning from failure is the best way to trim down the task search space». Подтверждает `lesson` с `feedback_type: negative` как обязательный, а не опциональный элемент таксономии.
3. **Слабые и размытые evaluator'ы** — «Current self-improvement loops work best for tasks when evaluation metrics are measurable and objective». Подтверждает ограничение из expert-011: GEPA и автономные адаптации только там, где есть детерминированная μ.

---

## 5. Что это меняет в Wolf (кандидаты правок спеки)

Нумерация сквозная для финального брифа:

1. **[Ф-концепция] Фиксация уровней L0/L1/L2** в спеке контура: L0 запрещён (кроме записи сигналов), v1 работает на L1, L2 — условный, по критериям (§2.3). *(Основание: паттерны A/B/C из §2.1, принцип «адаптирующий ≠ исполняющий».)*
2. **[Ф20] Механизм hot-signal**: критические внутри-сессионные сигналы помечаются приоритетными для следующего офлайн-цикла; онлайн-адаптация по-прежнему запрещена. *(Предложение ВА, калибровка.)*
3. **[Ф22] Контракт Analyzer-Worker включает 4 элемента bounded proposal context**: editable surfaces + failure patterns + passing behaviors + ранее отклонённые правки. *(Основание: Self-Harness §3.1.)*
4. **[Ф22] Манифест правки**: каждый draft-rule несёт предсказание эффекта и список рисков регрессии; после активации — сверка предсказания с фактом по сигнальному логу (decision observability). *(Основание: AHE §3.2. Предложение ВА.)*
5. **[Ф23/общее] Явный список read-only зон контура**: код гейтов и приёмки, events.jsonl, session-metrics.jsonl, relations.jsonl, core pack типов, конфигурация модели. Analyzer-Worker не может предлагать правки этих зон; валидатор отклоняет механически. *(Основание: AHE §3.2, Weng Future Challenges п.5.)*
6. **[Ф24/шаблоны] Маркеры редактируемых секций** в шаблонах (`WOLF-EDITABLE-START/END`); правки вне маркеров отклоняются детерминированным валидатором. *(Основание: AlphaEvolve §3.3. Предложение ВА.)*
7. **[Ф23] «Золотой набор» проходящих сценариев** как обязательный элемент bounded context (passing behaviors to preserve) — пополняется из green-сценариев pressure-тестов. *(Основание: Self-Harness §3.1.)*
8. **[Роли] Требование фронтирной модели для Analyzer-Worker** распространяется за пределы Ф24. *(Основание: предупреждение STOP §4.1.)*
9. **[Ф20/доставка] Диагностика разрыва «правило хорошее, но не работает»** через призму harness-benefit (§4.2): если `rule_utilization` низкий при хорошем `delivery_recall` — проблема в исполнении, а не в генерации; контур не должен «лечить» это новыми правилами. *(Основание: Lin et al. 2026.)*
10. **[Таксономия] `feedback_type: negative` — обязательное поле** для отклонённых кандидатов (не опция): сохранение отрицательных результатов — условие эффективности поиска. *(Основание: Weng Future Challenges п.3.)*

---

## 6. Классификация чисел и утверждений

| Утверждение | Статус | Источник |
| --- | --- | --- |
| «up to 132%» относительного прироста на 9 комбинациях модель×бенчмарк | подтверждено цитатой (абстракт) | arXiv:2606.09498 |
| 4 элемента bounded proposal context | подтверждено цитатой | arXiv:2606.09498 v1 §3.3 |
| «no regression on both held-in and held-out» как условие принятия | подтверждено цитатой | arXiv:2606.09498 v1 §3.3 |
| 3 столпа наблюдаваемости AHE; read-only зоны; манифест правки | подтверждено цитатами | обзор Weng со ссылкой на arXiv:2604.25850 |
| 7 компонентов harness (system prompt, tool description, tool implementation, middleware, skill, sub-agent configuration, long-term memory) | подтверждено цитатой | обзор Weng (AHE) |
| harness-updating плоский от 9B до Opus; harness-benefit немонотонен | подтверждено цитатой | обзор Weng со ссылкой на arXiv:2605.30621 |
| STOP деградирует на слабых моделях (предупреждение) | подтверждено цитатой | обзор Weng со ссылкой на arXiv:2310.02304 |
| SiriuS +2.86%–21.88% | подтверждено (абстракт/постер) | NeurIPS 2025, arXiv:2502.04780; **но цикл через SFT — не переносится** |
| Continual Harness «recovers a majority of the gap to a hand-engineered expert harness» | подтверждено цитатой (абстракт) | arXiv:2605.09998 |
| ACE: curator не переписывает промпт-блоб, itemized bullets + детерминированный мерж | подтверждено цитатой | обзор Weng со ссылкой на arXiv:2510.04618 |
| EVOLVE-BLOCK маркеры в AlphaEvolve | подтверждено цитатой | обзор Weng со ссылкой на arXiv:2506.13131 |
| 6 режимов отказа Trehan & Chopra | подтверждено цитатой | обзор Weng со ссылкой на arXiv:2601.03315 |
| hot-signal (§2.2), L2-критерии (§2.3), манифест-сверка (§5.4), маркеры для Wolf-шаблонов (§5.6) | **предложения ВА** (калибровка обязательна) | — |
| «золотой набор» сценариев как обязательный элемент | **предложение ВА** (на базе цитаты о «passing behaviors») | — |

**Ограничения верифицируемости (честно):**
- Обзор Weng — авторитетный вторичный источник, но механики AHE, MCE, Meta-Harness, Lin et al. передаются им, а не первоисточниками; при включении в спеку деталей глубже процитированных — сверить с первоисточниками (указаны в списке литературы обзора).
- Детали алгоритма SiriuS взяты из абстракта/постера и README репозитория (zou-group/sirius); полная механика experience library не проверялась по телу статьи.
- 132% — верхняя граница («up to»), а не медиана; медианные значения в абстракте не приведены.

---

## 7. Источники

1. **Weng, Lilian. «Harness Engineering for Self-Improvement».** Lil'Log, июль 2026.
   https://lilianweng.github.io/posts/2026-07-04-harness/ — *якорный обзор порции (полный текст прочитан)*
2. **Zhang et al. «Self-Harness: Harnesses That Improve Themselves».** arXiv:2606.09498, 2026.
   https://arxiv.org/abs/2606.09498 · репо: https://github.com/qzzqzzb/Self-Harness
3. **Karten et al. «Continual Harness: Online Adaptation for Self-Improving Foundation Agents».** arXiv:2605.09998, май 2026.
   https://arxiv.org/abs/2605.09998 · сайт: https://sethkarten.ai/continual-harness/ · репо: https://github.com/sethkarten/continual-harness
4. **Zhao et al. «SiriuS: Self-improving Multi-agent Systems via Bootstrapped Reasoning».** NeurIPS 2025, arXiv:2502.04780.
   https://neurips.cc/virtual/2025/poster/118834 · репо: https://github.com/zou-group/sirius
5. **Zhang et al. «Agentic Context Engineering (ACE)».** ICLR 2026, arXiv:2510.04618. *(через обзор [1])*
6. **Lin et al. «Agentic Harness Engineering (AHE)».** arXiv:2604.25850, 2026. *(через обзор [1])*
7. **Lin et al. «Harness Updating Is Not Harness Benefit».** arXiv:2605.30621, 2026. *(через обзор [1])*
8. **Novikov et al. «AlphaEvolve».** arXiv:2506.13131, 2025. *(через обзор [1])*
9. **Zelikman et al. «Self-Taught Optimizer (STOP)».** COLM 2024, arXiv:2310.02304. *(предупреждение о деградации — через обзор [1])*
10. **Trehan & Chopra. «Why LLMs Aren't Scientists Yet».** arXiv:2601.03315, 2026. *(6 режимов отказа — через обзор [1])*
11. **Ye et al. «Meta Context Engineering (MCE)».** arXiv:2601.21557, 2026. *(упомянуто, не разбиралось глубоко)*
12. **Lee et al. «Meta-Harness».** arXiv:2603.28052, 2026. *(упомянуто, не разбиралось глубоко)*
13. **Hu et al. «ADAS».** ICLR 2025, arXiv:2408.08435; **Zhang et al. «AFlow».** ICLR 2025, arXiv:2410.10762. *(паттерн C, уже разобраны в ранних порциях)*

---

## 8. Следующий шаг

Программа тематических порций **завершена** (003–012, 10 файлов):
- 003 — surveys (таксономия, evaluation protocol)
- 004 — sandbox-гейт (Q22.1–Q22.2)
- 005 — decay/TTL (Q26.1–Q26.2)
- 006 — кластеризация трейсов (Q21.x)
- 007 — логирование/нормализация (Q20.x + переработка по замечанию)
- 008 — negative constraints + глоссарий + writer-матрица (Q22.3)
- 009 — HITL fatigue (QH.1–QH.2)
- 010 — мета-метрики и staged autonomy (QM.1)
- 011 — GEPA для шаблонов (Q24.1–Q24.2)
- 012 — оркестрация контура (QO.1–QO.2) ← этот файл

Жду вердикта. После приёмки готовлю **`expert-013-recommendations-brief.md`** — финальный DoD-артефакт: консолидация всех кандидатов правок (~60), приоритизация, глоссарий, единый список источников.
