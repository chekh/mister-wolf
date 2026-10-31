# Dialogue with external expert: self-learning research (2026-08-31)

Topic: deep research on Mr. Wolf self-learning mechanisms (see decision mem_20260828_programma_issledovaniya_s_vneshnim_agent_8686d3).

---

(Dialogue content goes below this line)

Zorg: https://github.com/chekh/mister-wolf/tree/main изучи репозиторий и дай мне подробный анализ продукта его достоинств недостатков и сравни с аналогами то есть найди его место на современном рынке

ChatGPT:
Я изучил текущую ветку `main`, каноническую концепцию v3 от 29 августа 2026, roadmap v3, self-learning design, UX-сценарии, аудит собственной памяти, effectiveness-панель и структуру исходников. Дополнительно сравнил Mr. Wolf с актуальным рынком agent memory / coding-agent infrastructure: Mem0, Zep/Graphiti, Letta, Cognee, специализированными MCP-memory решениями и современным направлением harness engineering.

Мой основной вывод:

> **Mr. Wolf имеет право на отдельную продуктовую категорию. Но не как “ещё одна память для агентов”.**
>
> Самое перспективное его позиционирование — **Project Intelligence Harness / Project Learning Harness для coding agents**: слой над агентом, который превращает историю работы над проектом в накапливаемое, проверяемое и повторно используемое производственное знание.

Именно здесь у проекта есть шанс быть действительно отличным от Mem0/Cognee/Graphiti.

---

# 1. Что на самом деле представляет собой Mr. Wolf сейчас

README пока описывает его как:

> “Local-first Project Semantic Memory layer for AI coding agents. Not another agent. A memory substrate for agents.” ([GitHub][1])

Но это описание уже **устарело относительно собственной концепции v3**.

В концепции от 29 августа прямо зафиксирован переход:

> Wolf — не «память с дополнениями», а процессы и новая организация работы агентов, опирающиеся на единую память проекта. ([GitHub][2])

Это очень важное изменение.

Архитектурно сейчас Wolf состоит уже из четырех взаимосвязанных уровней:

| Слой      | Что делает                                                                 |
| --------- | -------------------------------------------------------------------------- |
| Memory    | знания проекта, решения, уроки, документы, правила, версии, связи          |
| Processes | bootstrap, call, brief, complain, checkpoint, wrap-up, knowledge lifecycle |
| Agents    | тонкие роли + playbooks                                                    |
| Tools     | CLI/MCP и будущая накопительная библиотека инструментов                    |

Причем концепция правильно формулирует их как цикл:

**agents → processes → memory → tools → results → memory**. ([GitHub][2])

Это уже существенно больше, чем memory database.

---

# 2. Главная идея продукта

Если убрать команды, форматы Markdown и реализацию SQLite, Wolf решает более фундаментальную проблему:

### Современный coding agent почти не становится лучше от работы над проектом.

Он:

1. исследовал архитектуру;
2. нашёл ограничение;
3. написал диагностический скрипт;
4. обнаружил причину бага;
5. принял архитектурное решение;
6. научился правильно выполнять специфическую операцию;

а через несколько сессий значительная часть этого интеллектуального капитала снова исчезает.

Обычная memory-system говорит:

> «Я сохраню несколько фактов, чтобы агент мог найти их позже».

Wolf пытается сказать:

> **«Я превращу результаты работы агента в долговременные производственные активы проекта».**

Это гораздо интереснее.

И активы здесь могут быть разных видов:

```text
fact
decision
lesson
constraint
playbook
process
tool
rule
routing policy
failed approach
verified procedure
```

То есть Wolf постепенно строит не просто память, а:

# Project Operating Knowledge

---

# 3. Самая сильная сторона Wolf

На мой взгляд, главная идея проекта находится даже не в `memory`.

Она вот здесь:

```text
work
 ↓
experience
 ↓
structured artifact
 ↓
validation
 ↓
canonical knowledge
 ↓
delivery to future agent
 ↓
reuse
 ↓
new evidence
 ↓
update
```

Это **closed-loop knowledge lifecycle**.

И именно этого очень мало у большинства конкурентов.

---

# 4. Почему рынок для этого сейчас благоприятный

Это особенно интересно потому, что индустрия сама приходит примерно к той же проблеме.

OpenAI недавно описывала собственный опыт harness engineering: огромный `AGENTS.md` оказался плохим решением, потому что он разрастается, засоряет контекст, устаревает и плохо проверяется. Вместо этого repository knowledge должен становиться структурированной системой навигации и источником истины. ([OpenAI][3])

Это практически непосредственная валидация проблемы, на которую нацелен Wolf.

Похожая ситуация в Claude Code: проектная память существует, но в основном через `CLAUDE.md` и связанные Markdown-файлы; документация сама рекомендует регулярно пересматривать их, потому что знания устаревают. ([Claude Platform Docs][4])

Другими словами:

**проблема уже признана всеми крупными coding-agent платформами.**

Но универсального project-knowledge lifecycle пока нет.

---

# 5. Где находится рынок сегодня

Я бы разделил его на несколько слоев.

## Уровень 1 — статическая проектная память

Примеры:

```text
AGENTS.md
CLAUDE.md
.cursorrules
project instructions
skills
```

Это просто сохранённый контекст.

Плюсы:

* почти бесплатно;
* прозрачно;
* Git-friendly.

Минусы:

* быстро устаревает;
* нет lifecycle;
* нет conflict resolution;
* нет provenance;
* нет usage metrics;
* нет автоматической актуализации.

Wolf значительно выше этого уровня.

---

# 6. Уровень 2 — generic agent memory

Главные представители:

### Mem0

Mem0 остаётся наиболее понятным примером «memory as API».

Основная модель:

```text
interaction
 ↓
memory extraction
 ↓
vector/graph storage
 ↓
retrieval
```

Сильнейшая сторона — простота интеграции.

Новая версия Mem0 заявляет очень высокие собственные результаты на LoCoMo/LongMemEval, хотя сама документация подчёркивает, что лучшие показатели относятся к managed platform, а не идентичному open-source implementation. ([GitHub][5])

Mem0 оптимален для:

* персонализации;
* assistant history;
* пользовательских предпочтений;
* conversational agents.

### Но Wolf решает другую задачу.

Wolf хранит не столько:

> «Zorg предпочитает X».

Сколько:

> «Мы пытались реализовать X способом A. Он нарушил invariant Y. Решение B прошло проверку Z. Теперь для задач этого класса действует playbook C».

Это качественно другой объект памяти.

---

# 7. Zep / Graphiti

Graphiti — очень сильный технологический конкурент в одном конкретном измерении:

# temporal knowledge

Он умеет хранить, когда факт был действителен и когда перестал быть действителен, строя temporal knowledge graph. ([GitHub][6])

Например:

```text
service A uses Redis
       ↓
2025-10..2026-04

service A uses Valkey
       ↓
2026-04..
```

Для Wolf это важный референс.

Wolf сейчас использует:

```text
supersede
status
actor
relations
```

Это хороший фундамент.

Но Graphiti значительно глубже в **temporal semantics**.

Поэтому:

**Wolf не должен пытаться победить Graphiti как knowledge graph.**

Это ненужная битва.

---

# 8. Cognee — самый опасный концептуальный конкурент

Из крупных проектов Cognee сегодня ближе всех к формулировке Wolf.

Они сами называют продукт:

> “Memory control plane for AI Agents”

и предлагают:

```text
remember
recall
forget
improve
```

с embeddings + graph + ingestion + context engineering. ([GitHub][7])

Есть MCP, local deployment, shared memory, graph representation, traceability. ([GitHub][8])

Если Wolf позиционировать как:

> “memory control plane”

то он практически сразу попадает в прямое сравнение с Cognee.

И там Wolf сегодня проигрывает:

* ecosystem;
* embeddings;
* semantic retrieval;
* graph;
* multimodal ingestion;
* integrations;
* maturity;
* community.

Поэтому я бы **вообще ушёл от этого позиционирования**.

---

# 9. Letta

Letta делает другой архитектурный выбор:

> agent и memory становятся частью одного runtime.

Современная Letta позиционируется как agent platform, где память, self-improvement, skills и subagents являются частью жизненного цикла самого агента. ([GitHub][9])

В некотором смысле:

```text
Letta
Agent owns memory
```

а Wolf:

```text
Project owns memory
Agents consume it
```

И это очень важное различие.

Я считаю подход Wolf **лучше именно для software projects**.

Почему?

Потому что знания:

```text
architecture
decisions
constraints
procedures
tools
```

принадлежат проекту, а не конкретному агенту.

Агентов можно менять:

```text
OpenCode
Codex
Claude Code
Gemini
future agent
```

Проектное знание должно оставаться.

Это хорошая фундаментальная ставка Wolf.

---

# 10. Новые специализированные coding-memory проекты

Здесь конкуренция уже становится гораздо прямее.

Например Agent Memory Engine позиционируется как:

> local-first persistent memory and project knowledge runtime for coding agents.

У него есть:

* persistent memory tree;
* architecture;
* constraints;
* decisions;
* incidents;
* procedures;
* source evidence;
* MCP. ([GitHub][10])

Есть и `agentmemory`, который уже предлагает:

* OpenCode;
* Claude Code;
* Codex;
* Cursor;
* Gemini;
* MCP;
* hooks;
* hybrid search;
* knowledge graph;
* lifecycle;
* confidence;
* benchmarking. ([GitHub][11])

Это означает важную вещь:

# «Persistent memory for coding agents» уже перестаёт быть уникальной идеей.

Если Wolf останется только этим — рынок его быстро догонит или уже догнал.

---

# 11. Где Wolf действительно отличается

А вот теперь самое интересное.

Я вижу четыре сильных дифференциатора.

---

## 11.1 Knowledge lifecycle

Wolf прямо утверждает:

> накопление → периодическая обработка → обновлённое знание. ([GitHub][2])

Это намного важнее простого retrieval.

Особенно правильна мысль:

> «Память ≠ свалка».

Концепция прямо говорит:

> запись без обработки есть технический долг знания. ([GitHub][2])

Я считаю эту формулировку одной из лучших идей проекта.

Большинство memory-frameworks великолепно умеют:

```text
ADD
SEARCH
```

Но существенно хуже:

```text
IS THIS STILL TRUE?
WHY DO WE KNOW IT?
SHOULD THIS BE MERGED?
HAS THIS BECOME OBSOLETE?
HAS ANYONE USED IT?
SHOULD WE FORGET IT?
```

Wolf движется именно сюда.

---

# 12. Steward — очень правильная архитектурная идея

Стюард мне нравится гораздо больше, чем обычный «memory agent».

Потому что он не выступает свободным автономным агентом.

Концепция задаёт важный invariant:

> вызов Стюарда всегда является исполнением правила, записанного в памяти, а не свободной инициативой LLM. ([GitHub][2])

То есть:

```text
signal
 ↓
deterministic trigger
 ↓
Steward role
 ↓
draft
 ↓
validation
 ↓
activation
```

Это намного безопаснее, чем:

```text
LLM periodically thinks about memory
```

И гораздо ближе к production architecture.

---

# 13. Особенно удачная идея — лица Steward

Вместо армии отдельных агентов:

```text
mentor-agent
archivist-agent
tool-agent
```

используется одна рамка + разные playbooks:

```text
Steward
 ├─ Mentor
 ├─ Librarian
 └─ Archivist
```

Причём лицо определяется как:

```text
playbook
+ trigger
+ activation pipeline
```

а не отдельный hardcoded agent. ([GitHub][2])

Это хорошая абстракция.

Она позволяет системе эволюционировать через **данные**, а не постоянно через код.

---

# 14. Второй уникальный элемент — Tools as accumulated reasoning

На мой взгляд, это потенциально **самая оригинальная часть Wolf**.

Концепция говорит:

> удачное рассуждение-скрипт кристаллизуется в постоянный инструмент. ([GitHub][2])

То есть:

```text
agent writes diagnostic script
 ↓
script proves useful
 ↓
Wolf recognizes repeated value
 ↓
tool object
 ↓
validation
 ↓
SKILL exposure
 ↓
future agent reuses it
```

Это уже не memory.

Это:

# Computational Experience

или

# Executable Memory

И здесь я вижу очень большой потенциал.

Потому что повторно использовать:

```text
“мы выяснили, что dependency graph проверяется так”
```

хуже, чем повторно использовать:

```text
check_dependency_graph()
```

То есть knowledge переходит:

```text
text → executable capability
```

Это сильная идея.

---

# 15. Search-before-write

Очень простой, но правильный principle:

> прежде чем агент пишет новый скрипт — проверить, не существует ли уже инструмент. ([GitHub][2])

По сути Wolf хочет создать аналог:

```text
DRY principle
```

но для reasoning artifacts агентов.

Сегодня coding agents регулярно создают:

```text
tmp_check.py
analyze.py
debug.py
test2.py
```

через десять сессий практически одинаковые.

Wolf потенциально превращает их в библиотеку накопленного проектного интеллекта.

Это действительно ценно.

---

# 16. Третий сильный элемент — activation pipeline

Очень удачна схема:

```text
draft
 ↓
Sandbox Replay
 ↓
activation
 ↓
owner post-audit
 ↓
delivery
```

Она решает фундаментальную проблему self-learning systems:

**если агент может непосредственно изменять собственные инструкции, ошибка становится самоподдерживающейся.**

Wolf вставляет validation boundary между:

```text
learning
```

и

```text
behavior modification
```

Это правильное архитектурное решение. ([GitHub][2])

---

# 17. Четвёртый сильный элемент — measured memory

Это неожиданно зрелая часть продукта.

Команда:

```bash
wolf effectiveness
```

собирает реальные эксплуатационные данные без LLM. ([GitHub][12])

Например:

```text
rules
tools
delivery
noise
routing
```

Особенно нравится принцип:

> если данных недостаточно — выводить `n/a`, а не придумывать метрику. ([GitHub][12])

Это важная инженерная культура.

---

# 18. И собственный dogfooding уже обнаружил проблему

Аудит от 29 августа показывает:

```text
369 memory objects
~504 KB
```

При этом:

```text
document-ref       33%
session-summary    15%
```

вместе почти половина памяти. ([GitHub][13])

80% объектов имеют `active` status. ([GitHub][13])

И самое показательное:

```text
312 / 369 ≈ 85%
```

не имеют relations или событий взаимодействия кроме создания. ([GitHub][13])

Авторы правильно оговариваются, что read-path ещё не полностью логируется, поэтому нельзя буквально говорить «85% никогда не читалось».

Но сигнал очевидный:

# память растёт быстрее, чем система успевает превращать её в полезное знание.

И это буквально подтверждает собственную гипотезу Wolf:

> накопление само по себе недостаточно.

Очень хороший dogfooding result.

---

# 19. Слабость №1 — сейчас существует разрыв между vision и product

Это, на мой взгляд, главный риск.

Концепция v3 уже говорит о:

```text
Project Learning System
```

но публичный README по-прежнему продаёт:

```text
semantic memory
```

и показывает команды:

```bash
wolf add
wolf list
wolf search
wolf scan
wolf brief
```

То есть новый пользователь видит:

# «очередной CLI для заметок агента».

А настоящий продукт скрыт глубоко в документации.

Это необходимо исправлять почти немедленно.

Roadmap сам это признаёт: в Phase B есть отдельная задача `README + docs rewrite под концепт v3`. ([GitHub][14])

Она критическая.

---

# 20. Слабость №2 — слишком широкая концептуальная поверхность

В проекте одновременно появляются:

```text
memory
agents
playbooks
skills
tools
routing
governance
self-learning
Steward
complain
council
bootstrap
decay
GEPA
AFlow
STOP
Ariadne
```

Это очень легко превратить в «всё для агентов».

И тогда исчезнет product identity.

Я бы держал чрезвычайно строгую формулу:

> **Wolf makes project knowledge compound across agent sessions.**

Всё остальное должно обслуживать именно эту цель.

---

# 21. Слабость №3 — терминология

Сейчас много внутренних терминов:

```text
Wolf
Steward
Mentor
Librarian
Archivist
Ariadne
faces
threads
council
call
complain
```

Для человека, участвующего в разработке, эта модель понятна.

Для внешнего пользователя возникает дополнительная cognitive load.

Например:

```bash
wolf complain
```

внутренне отличный механизм.

Но продуктово его смысл:

```text
report bad agent behavior
→ improve project playbook
```

И именно это должно быть главным объяснением.

---

# 22. Слабость №4 — retrieval пока технологически простой

Текущий фундамент:

```text
Markdown
SQLite
FTS5
filters
relations
```

очень хорош для local-first и transparency.

Но семантический retrieval здесь значительно слабее:

* Mem0;
* Cognee;
* Graphiti;
* специализированных hybrid search systems.

Сам Wolf осознаёт это и оставляет A-MEM / более сложный recall на будущий trigger. ([GitHub][14])

Я считаю это правильным.

**Не нужно сейчас бросаться внедрять embeddings.**

Пока важнее доказать, что lifecycle работает.

---

# 23. Почему FTS5 сейчас скорее достоинство

Парадоксально, но отсутствие vector infrastructure мне сейчас нравится.

Потому что Wolf остаётся:

```text
local
cheap
deterministic
inspectable
git-friendly
```

Для project knowledge это очень хороший starting point.

Embeddings можно добавить позже как retrieval adapter.

Не нужно делать их архитектурным фундаментом.

---

# 24. Слабость №5 — taxonomy начинает разрастаться

Аудит показывает уже 24 core memory types, из которых используется 21. ([GitHub][13])

Есть:

```text
lesson
decision
observation
article
playbook
task-brief
work-thread
report
blocker
call-injection
council-opinion
...
```

Это начинает напоминать предметную БД.

Опасность:

```text
new use case
 → new type
 → new command
 → new state machine
```

Так продукт постепенно становится сложным.

Я бы постепенно переходил к более универсальной модели:

```text
Artifact
 ├─ type
 ├─ lifecycle
 ├─ evidence
 ├─ relations
 ├─ actor
 ├─ validity
 ├─ usage
 └─ payload schema
```

То есть типы должны быть schema extensions, а не архитектурными сущностями.

---

# 25. Слабость №6 — temporal model пока недостаточно сильная

`supersede` — правильный механизм.

Но для настоящего Project Knowledge System скоро появятся вопросы:

```text
когда это стало известно?
когда это было верно?
когда перестало быть верно?
какая версия использовалась в task X?
```

Здесь Graphiti имеет очень сильную модель с temporal relations. ([GitHub][6])

Я бы не копировал Graphiti, но добавил хотя бы:

```text
valid_from
valid_until
observed_at
superseded_at
```

Особенно для:

```text
architecture
dependencies
constraints
procedures
```

---

# 26. Слабость №7 — evidence model нужно сделать центральной

Wolf уже имеет attribution и relations.

Но следующий уровень должен быть:

```text
claim
 ↓
evidence
```

Например:

```text
Lesson:
"OpenCode plugin receives system prompt after X stage"

Evidence:
- test run
- commit
- source file
- output
```

Тогда агент сможет задавать:

> Почему Wolf считает это истинным?

Это огромное преимущество для coding agents.

Agent Memory Engine уже явно использует evidence-backed memory как ключевое позиционирование. ([GitHub][10])

Wolf не должен здесь отставать.

---

# 27. Слабость №8 — пока мало externally reproducible benchmarks

Внутренние PoC и dogfooding полезны.

Но внешнему пользователю нужны очень простые доказательства:

### Baseline

```text
OpenCode
```

против

```text
OpenCode + Wolf
```

на серии повторяющихся project tasks.

Например:

| Metric                        | Vanilla |  Wolf |
| ----------------------------- | ------: | ----: |
| project discovery tokens      |     18k |    4k |
| repeated mistake rate         |     23% |    5% |
| duplicated diagnostic scripts |      17 |     4 |
| architecture violations       |       8 |     1 |
| time to resume task           |   7 min | 1 min |
| stale knowledge injection     |     12% |    3% |

Вот это будет продавать Wolf гораздо лучше тысячи строк concept docs.

---

# 28. Особенно нужен benchmark накопительной эффективности

Большинство memory benchmarks измеряют:

```text
recall accuracy
```

Но Wolf интереснее измерять по другой оси:

# compounding productivity

Например:

```text
task 1
task 10
task 30
task 100
```

И смотреть:

```text
cost per task
repeated discoveries
tool reuse
mistake recurrence
context tokens
human corrections
```

Главный вопрос:

> **Становится ли агент объективно эффективнее по мере работы над одним проектом?**

Если Wolf сможет доказать это — это будет сильнейший differentiator.

---

# 29. Сравнение в одной таблице

| System      | Основной объект                 |       Lifecycle | Project-specific | Executable knowledge | Self-improvement | Local-first |
| ----------- | ------------------------------- | --------------: | ---------------: | -------------------: | ---------------: | ----------: |
| AGENTS.md   | instructions                    |               ❌ |                ✅ |                    ❌ |                ❌ |           ✅ |
| Mem0        | memories                        |        частично |                ⚠ |                    ❌ |                ⚠ |           ✅ |
| Graphiti    | temporal facts/graph            |               ✅ |                ⚠ |                    ❌ |                ❌ |           ✅ |
| Cognee      | knowledge graph / context       |               ✅ |                ⚠ |                    ❌ |                ✅ |           ✅ |
| Letta       | agent memory                    |               ✅ |                ⚠ |               skills |                ✅ |           ✅ |
| AgentMemory | coding memory                   |               ✅ |                ✅ |             частично |         частично |           ✅ |
| **Wolf**    | **project operating knowledge** | **✅ core idea** |       **✅ core** | **✅ core direction** |   **✅ governed** |       **✅** |

Но эту таблицу Wolf выигрывает только если реализует Phase B/C/D.

Сегодня часть клеток пока — vision, а не mature implementation.

---

# 30. Где я бы разместил Wolf на карте рынка

Не здесь:

```text
               Agent Memory
                    |
      Mem0 — Zep — Cognee — Wolf
```

А здесь:

```text
                         AI AGENT INFRASTRUCTURE

 Memory systems                            Agent runtimes
      │                                         │
      │                                         │
 Mem0 / Graphiti                            Letta
 Cognee                                     OpenCode
      │                                         │
      └──────────────┐             ┌────────────┘
                     │             │
                     ▼             ▼

               PROJECT HARNESS LAYER
                       │
                       │
                  ┌────┴────┐
                  │  WOLF   │
                  └────┬────┘
                       │
        ┌──────────────┼───────────────┐
        ▼              ▼               ▼
     Memory        Processes         Tools
        │              │               │
        └──────────────┴───────────────┘
                       │
                  Project learning
```

Вот это, на мой взгляд, правильное место.

---

# 31. Как я бы называл категорию

Есть несколько вариантов.

Лучший:

# Project Learning Harness

Потому что здесь есть оба ключевых свойства:

**Project** — знания принадлежат проекту.

**Learning** — работа накапливается и улучшает будущую работу.

**Harness** — Wolf не заменяет агента, а формирует среду, в которой он работает.

Альтернативы:

```text
Project Intelligence Harness
Agent Learning Harness
Project Knowledge Runtime
Persistent Project Intelligence
Coding Agent Experience Layer
```

`Memory Control Plane` я бы избегал — Cognee уже практически занял эту формулировку. ([GitHub][7])

---

# 32. Возможная новая формулировка продукта

Я бы вообще перестал открывать README словом memory.

Например:

> **Mr. Wolf is a local-first learning harness for coding agents.**
>
> It turns decisions, lessons, workflows and successful tools produced during development into persistent project knowledge that future agents can verify, reuse and improve.
>
> Your agent changes. Your project keeps what it learned.

Вот это уже заметно отличается от Mem0.

---

# 33. Самый сильный потенциальный UX

Наиболее мощный сценарий Wolf выглядит не так:

```bash
wolf add
wolf search
```

А так:

```text
Developer works normally with OpenCode

              ↓

Wolf observes:
decision
failure
correction
successful procedure
useful script

              ↓

creates structured candidates

              ↓

Steward validates / consolidates

              ↓

project learns

              ↓

next OpenCode session automatically receives:
relevant constraints
known decisions
proven playbook
existing tools

              ↓

agent avoids rediscovery
```

То есть идеальный Wolf почти невидим.

---

# 34. `wolf complain` может стать killer feature

Эта команда кажется маленькой, но концептуально очень сильна.

Представим:

```text
Agent again modified generated files directly.
```

Пользователь:

```bash
wolf complain "agent edited generated files directly"
```

Дальше:

```text
complaint
 ↓
existing playbook identified
 ↓
failure analyzed
 ↓
new playbook draft
 ↓
replay
 ↓
activation
```

И следующий агент **уже работает иначе**.

Это можно объяснить одной фразой:

# Correct your agent once.

Если это заработает надёжно, это очень хороший продуктовый differentiator.

---

# 35. Tools могут стать вторым killer feature

Второй сценарий:

```text
Agent writes migration checker.
```

Wolf замечает повторное использование.

```text
temporary script
 ↓
tool candidate
 ↓
validation
 ↓
tool registry
 ↓
skill
```

Теперь следующие агенты используют:

```bash
wolf tool run migration-check
```

вместо того чтобы каждый раз писать всё снова.

И это:

# Teach your project once.

Получается очень сильная пара:

```text
Correct once.
Build once.
Reuse indefinitely.
```

---

# 36. Roadmap v3 выбран правильно

Особенно мне нравится изменение приоритетов.

Roadmap теперь:

```text
A — fixes/audit
B — agents/processes as product
C — tools as memory
D — self-learning
E — ecosystem
```

а не бросается сразу в сложный self-learning. ([GitHub][14])

Это правильный выбор.

Сначала нужно доказать:

```text
capture → delivery → reuse
```

и только потом:

```text
autonomous learning
```

---

# 37. Я бы даже ещё сильнее отложил сложное самообучение

GEPA, AFlow, automated routing calibration и подобные механизмы интересны.

Но сегодня продукт погибнет не от отсутствия GEPA.

Он может погибнуть от того, что новый пользователь не поймёт за 60 секунд:

> «Зачем мне Wolf?»

Поэтому я бы поставил абсолютный приоритет на один идеальный loop:

```text
install Wolf
 ↓
work
 ↓
learn something
 ↓
next session automatically benefits
```

Если этот цикл вызывает эффект:

> «О, он реально помнит работу проекта»

— продукт уже имеет ценность.

---

# 38. Что я считаю наиболее ценным в архитектуре исходников

Структура:

```text
src/
  adapters
  app/use-cases
  bootstrap
  domain
  ports
```

показывает правильное стремление отделить domain logic от adapters. ([GitHub][15])

Для Wolf это особенно важно, потому что OpenCode должен оставаться только первым adapter.

Концепция тоже фиксирует однонаправленную зависимость:

```text
platform adapter → Wolf
```

а не наоборот. ([GitHub][2])

Это архитектурно правильное решение.

---

# 39. OpenCode-only сейчас — тоже правильное решение

Roadmap сознательно говорит:

> фазы A–D — OpenCode only; мультиплатформенность — принцип архитектуры, но не текущая задача. ([GitHub][14])

Полностью согласен.

Плохой путь:

```text
Claude
Codex
Cursor
OpenCode
Gemini
```

по чуть-чуть.

Хороший путь:

```text
OpenCode:
excellent integration
excellent lifecycle
excellent benchmarks

↓ затем

adapters
```

---

# 40. Основная рыночная угроза

Главная угроза Wolf — не Mem0.

Не Zep.

Не даже Cognee.

А то, что coding platforms сами начнут реализовывать:

```text
persistent project context
auto-memory
skills
background agents
project knowledge
```

И это уже происходит.

Поэтому moat Wolf не может быть:

```text
“we remember project context”
```

Это станет commodity.

Moat должен быть:

```text
governed learning
+ project-owned knowledge
+ evidence
+ executable accumulated tools
+ lifecycle
+ cross-agent portability
```

Вот это значительно сложнее встроить в обычный coding agent.

---

# 41. Где у Wolf может появиться настоящий moat

Я вижу четыре потенциальных.

### 1. Project Knowledge Graph of Work

Не graph кода.

А graph:

```text
decision
  ↓ based-on
experiment
  ↓ produced
lesson
  ↓ changed
playbook
  ↓ used-by
task
  ↓ generated
tool
```

Это чрезвычайно ценный объект.

---

### 2. Agent behavioral learning

История:

```text
agent mistake
→ correction
→ rule/playbook
→ validation
→ future prevention
```

---

### 3. Executable experience

```text
reasoning → script → reusable tool
```

---

### 4. Agent-independent project brain

Сегодня OpenCode.

Завтра Codex.

Послезавтра другой агент.

Но:

```text
.wolf/
```

остаётся knowledge system проекта.

---

# 42. Чего я бы НЕ делал

Я бы не превращал Wolf в:

### ❌ vector database

рынок переполнен.

### ❌ general RAG framework

Cognee/Graphiti значительно впереди.

### ❌ general agent orchestrator

слишком широкий рынок и потеря фокуса.

### ❌ workflow engine

Temporal, LangGraph и десятки других проектов.

### ❌ универсальную multi-agent платформу

Letta/OpenAI/Anthropic и множество orchestration frameworks.

---

# 43. Что я бы усилил немедленно

В порядке приоритета:

### P0 — Product story

README должен объяснять:

```text
project learns from agent work
```

а не:

```text
semantic memory CLI
```

---

### P0 — one magical demo

Например:

```text
Session 1:
agent makes mistake
wolf complain

Session 2:
new agent automatically avoids mistake
```

10–15 секунд terminal recording.

---

### P0 — measurable improvement

Показывать:

```text
before Wolf
after 20 Wolf sessions
```

---

### P1 — Evidence

У каждого значимого knowledge artifact:

```text
source
evidence
verified_by
validity
```

---

### P1 — memory lifecycle

Довести до рабочего состояния:

```text
usage
decay
merge
supersede
consolidation
```

---

### P1 — tools

Phase C я считаю стратегически важнее многих sophisticated self-learning mechanisms.

---

# 44. Как выглядит конкурентное преимущество сейчас

Если оценивать **идею**, а не количество stars:

| Направление                         | Оценка Wolf |
| ----------------------------------- | ----------: |
| Local-first                         |        9/10 |
| Transparency                        |        9/10 |
| Project orientation                 |       10/10 |
| Knowledge lifecycle concept         |        9/10 |
| Governance                          |        9/10 |
| Agent portability architecture      |        8/10 |
| Retrieval sophistication            |        5/10 |
| Knowledge graph                     |        5/10 |
| Current UX                          |        6/10 |
| Product clarity                     |        5/10 |
| Ecosystem                           |        2/10 |
| External validation                 |        4/10 |
| Originality of tools-as-memory      |        9/10 |
| Long-term differentiation potential |    **9/10** |

---

# 45. Текущее состояние продукта я бы охарактеризовал так

Не:

> готовый конкурент Mem0.

И не:

> экспериментальная игрушка.

А:

# **Technically substantial pre-product / early-product system with a genuinely interesting thesis.**

271 commit и наличие unit/integration/e2e структуры показывают, что это уже не просто концептуальная документация. ([GitHub][1])

Но рынок пока увидит гораздо меньше ценности, чем реально заложено внутри.

---

# 46. Самый важный вывод

Изначальная идея:

> «дать агенту память»

сейчас уже недостаточно интересна.

Но проект эволюционировал в значительно более сильную идею:

> **сделать так, чтобы работа AI-агентов создавала накапливаемый интеллектуальный капитал проекта.**

Вот это уже действительно перспективно.

Разница фундаментальная:

### Memory system

```text
Agent remembers.
```

### Mr. Wolf

```text
Project learns.
```

Я бы построил вокруг этих двух слов практически всё позиционирование.

---

# 47. Место Wolf на рынке

Если представить рынок через 1–2 года, я вижу такой стек:

```text
┌─────────────────────────────────────────┐
│ Coding Agent                            │
│ OpenCode / Codex / Claude Code / ...    │
├─────────────────────────────────────────┤
│                                         │
│ PROJECT LEARNING HARNESS                │
│                                         │
│              MR. WOLF                   │
│                                         │
│ Knowledge lifecycle                     │
│ Playbooks                               │
│ Decisions                               │
│ Lessons                                 │
│ Governance                              │
│ Tool accumulation                       │
│ Experience                              │
│ Evidence                                │
│ Context delivery                        │
│                                         │
├─────────────────────────────────────────┤
│ Storage / Retrieval                     │
│ SQLite / FTS / vectors / graph adapters │
├─────────────────────────────────────────┤
│ Repository / Git / Tests / CI / MCP     │
└─────────────────────────────────────────┘
```

И если держаться этой границы, Wolf **не конкурирует напрямую ни с OpenCode, ни с Letta, ни с Cognee, ни с Graphiti**.

Он может использовать их.

---

# 48. Моя итоговая оценка

### Как существующая memory-система:

**6.5–7/10**

Потому что retrieval и ecosystem пока заметно уступают зрелым конкурентам.

### Как концепция Project Learning Harness:

**9/10**

Здесь идея намного интереснее рынка generic memory.

### Как готовый продукт:

**6/10**

Vision значительно опережает onboarding, presentation и завершённость ключевых loops.

### Потенциал:

**очень высокий**, при одном условии:

> не расширять Wolf в «операционную систему для всего AI», а удержать фокус на превращении выполненной агентами работы в проверяемое, актуальное и повторно используемое знание проекта.

---

## Если свести всё к одной стратегической формуле

Я бы развивал Mr. Wolf вокруг трёх обещаний:

```text
YOUR PROJECT REMEMBERS
Что было выяснено и почему.

YOUR PROJECT LEARNS
Исправления и успешные методики меняют будущую работу.

YOUR PROJECT ACCUMULATES CAPABILITIES
Успешные способы решения становятся инструментами.
```

И тогда отличие от основной массы memory-продуктов становится очень ясным:

> **Mem0 remembers users.
> Graphiti remembers changing facts.
> Cognee remembers connected knowledge.
> Letta builds agents that remember.
> Mr. Wolf should make software projects learn.**

На мой взгляд, именно это и есть его наиболее перспективное место на современном рынке. ([GitHub][5])

[1]: https://github.com/chekh/mister-wolf/tree/main "https://github.com/chekh/mister-wolf/tree/main"
[2]: https://github.com/chekh/mister-wolf/blob/main/docs/concept/concept.md "https://github.com/chekh/mister-wolf/blob/main/docs/concept/concept.md"
[3]: https://openai.com/index/harness-engineering/ "https://openai.com/index/harness-engineering/"
[4]: https://docs.anthropic.com/zh-CN/docs/claude-code/memory "https://docs.anthropic.com/zh-CN/docs/claude-code/memory"
[5]: https://github.com/mem0ai/mem0/blob/main/README.md "https://github.com/mem0ai/mem0/blob/main/README.md"
[6]: https://github.com/getzep/zep/blob/main/README.md "https://github.com/getzep/zep/blob/main/README.md"
[7]: https://github.com/topoteretes/cognee "https://github.com/topoteretes/cognee"
[8]: https://github.com/topoteretes/cognee/blob/main/cognee-mcp/README.md "https://github.com/topoteretes/cognee/blob/main/cognee-mcp/README.md"
[9]: https://github.com/letta-ai/letta/blob/main/README.md "https://github.com/letta-ai/letta/blob/main/README.md"
[10]: https://github.com/uudam42/agent-memory-engine "https://github.com/uudam42/agent-memory-engine"
[11]: https://github.com/adamaragon/Agent-Memory "https://github.com/adamaragon/Agent-Memory"
[12]: https://github.com/chekh/mister-wolf/blob/main/docs/guide/effectiveness.md "https://github.com/chekh/mister-wolf/blob/main/docs/guide/effectiveness.md"
[13]: https://github.com/chekh/mister-wolf/blob/main/docs/planning/memory-audit-2026-08-29.md "https://github.com/chekh/mister-wolf/blob/main/docs/planning/memory-audit-2026-08-29.md"
[14]: https://github.com/chekh/mister-wolf/blob/main/docs/superpowers/plans/roadmap-v3.md "https://github.com/chekh/mister-wolf/blob/main/docs/superpowers/plans/roadmap-v3.md"
[15]: https://github.com/chekh/mister-wolf/tree/main/src "https://github.com/chekh/mister-wolf/tree/main/src"


Zorg: ты заметил что для вольфа применяется трехуровневая схема разделения ролей агентов? wm.wolf - агент который не выполняет сам ничего а только держит контекст цели и общается с пользователем, а все задачи делегирует субагентам-исполнителям, которые в свою очередь декомпозируют сложные задачи и поручают их субагентам-воркерам. 

ChatGPT: 
**Нет, в предыдущем анализе я эту схему не распознал как центральную архитектурную ось продукта.** Я увидел набор агентных ролей, диспетчеризацию и playbook’и, но слишком быстро свёл это к формуле «тонкие агенты + общая память». Это было существенным упущением.

В репозитории действительно реализована не просто группа специализированных агентов, а **строгая трёхуровневая модель разделения ответственности, контекста и полномочий**:

```text
Пользователь
    ↕
L0 — Mr.Wolf
цель, общий контекст, диалог, постановка, приёмка
    ↓ Task Brief
L1 — Executor Lead
декомпозиция, план исполнения, координация, интеграция
    ↓ ограниченные подзадачи
L2 — Workers
исследование, реализация, ревью
    ↑ результаты и доказательства
L1 — сводный Report
    ↑
L0 — принятие / возврат / эскалация
```

## 1. L0 — Mr.Wolf: владелец цели и отношений с пользователем

`Mr.Wolf` — это не главный исполнитель и даже не «самый умный программист» в системе. Его функция принципиально иная:

* поддерживать долговременный контекст пользовательской цели;
* уточнять требования;
* формировать проверяемые критерии приёмки;
* передавать задачу исполнителю через Task Brief;
* принимать результат по отчёту;
* возвращать работу на доработку или эскалировать проблему.

В его описании прямо указано: «координатор», «кода не касается», разрешено вызывать только `executor-*`. Также специально запрещён прямой вызов воркеров, поскольку он разрушает трёхуровневую ответственность. Даже наличие технического доступа к инструментам не означает право выполнять работу: если Wolf сам полез в реализацию, он теряет независимость приёмки. ([GitHub][1])

Это важнейший принцип:

> **L0 знает, зачем выполняется работа, но не погружается в то, как именно она выполнялась.**

То есть верхний уровень хранит не технический мусор исполнения, а:

```text
намерение пользователя
текущую цель
ограничения
критерии успеха
историю решений
состояние проекта
результаты предыдущих задач
```

Именно поэтому сессия Mr.Wolf может быть долгоживущей: она является непрерывным интерфейсом между человеком и меняющейся армией временных исполнителей.

---

## 2. L1 — Executor Lead: владелец конкретной поставки

Executor получает уже не свободный разговор пользователя, а нормализованный Task Brief.

Его ответственность:

* понять конкретную исполняемую задачу;
* классифицировать её сложность;
* декомпозировать;
* определить подзадачи и границы;
* выбрать воркеров;
* передать каждому полный локальный контракт;
* собрать результаты;
* провести проверки;
* организовать независимое ревью;
* исправить замечания;
* сформировать единый отчёт для Mr.Wolf.

В текущей реализации Executor может самостоятельно выполнить только `TRIVIAL` и `SIMPLE` работу. Задачи уровня `MEDIUM` и `COMPLEX` должны передаваться воркерам; для сложных задач требуется дробление и параллельное исполнение. Перед итоговым отчётом обязательно вызывается отдельный `worker-reviewer`. Executor может спавнить только `worker-*`, но не другого Executor и не Mr.Wolf. ([GitHub][2])

Это означает:

> **L1 знает, как организовать решение задачи, но не обязан лично выполнять все её части.**

Он является одновременно:

```text
technical lead
delivery manager
task-local architect
integration owner
```

Но только в пределах одного брифа.

Это принципиально отличается от L0. Mr.Wolf владеет долговременной целью, а Executor — конкретной поставкой.

---

## 3. L2 — Workers: узкие исполнители без лишнего контекста

Воркеры получают ровно одну подзадачу.

Например:

* `worker-implementer` — изменяет указанные файлы и выполняет точечную проверку;
* `worker-researcher` — отвечает на один исследовательский вопрос и прикладывает источники;
* `worker-reviewer` — независимо проверяет реализацию, но не меняет код.

`worker-implementer` прямо инструктирован, что он не видит общий бриф и остальной контекст. У него отсутствует инструмент спавна агентов: если задача оказалась шире переданного scope, он обязан вернуть её Executor, а не самовольно расширять работу. ([GitHub][3])

Исследователь также получает один вопрос, не правит код, не расширяет область исследования и обязан привязать каждый вывод к источнику. ([GitHub][4])

Ревьюер отделён от реализации: он читает код и требования, формирует `APPROVED` или `CHANGES`, но не может сам исправить найденную проблему. ([GitHub][5])

То есть:

> **L2 знает только то, что необходимо для выполнения одной ограниченной операции.**

---

# Что здесь действительно оригинального

Само по себе наличие manager-agent и worker-agents не уникально. Подобные схемы встречаются в multi-agent системах.

Но в Wolf важно сочетание нескольких свойств.

## 1. Разделены не только роли, но и когнитивные горизонты

```text
L0 — стратегический горизонт
L1 — тактический горизонт
L2 — операционный горизонт
```

Каждый уровень получает иной объём контекста и решает задачи иного класса.

Это не просто специализация «один пишет код, другой тестирует». Это **иерархическое управление вниманием**.

---

## 2. Контекст течёт вниз не целиком, а сжимается в контракт

Пользовательский диалог не отправляется всем агентам.

Вместо этого:

```text
диалог и цель
    ↓
Task Brief
    ↓
декомпозиция
    ↓
локальная подзадача
```

Обратно тоже не должен подниматься полный лог действий:

```text
локальный результат
    ↓
findings / patch / verdict
    ↓
сводный Report
    ↓
приёмочный вердикт
```

Это защищает верхние уровни от загрязнения:

* сырыми выводами команд;
* попытками и ошибками;
* деталями отдельных файлов;
* внутренними рассуждениями воркеров;
* промежуточными тупиковыми гипотезами.

---

## 3. Разделены постановка, исполнение и приёмка

В обычном coding agent один и тот же агент:

```text
понимает задачу
→ придумывает решение
→ пишет код
→ проверяет сам себя
→ сообщает, что всё готово
```

У Wolf:

```text
L0 определяет критерии
L1 отвечает за поставку
L2 выполняет части
отдельный L2 ревьюит
L1 собирает доказательства
L0 принимает по критериям
```

Это значительно более зрелая модель ответственности.

Причём Mr.Wolf запрещено изучать реализацию для самостоятельного формирования впечатления. Его приёмка должна основываться на заранее определённых критериях и предъявленных доказательствах, а не на фразе исполнителя «кажется, всё работает». ([GitHub][1])

---

## 4. Ошибки нижнего уровня превращаются в системное знание

Воркеры возвращают не только результат, но и `FRICTION`: какие инструменты ломались, сколько раз и какой обход сработал.

Executor агрегирует повторяющиеся проблемы, записывает значимые уроки и передаёт их в отчёте. Следующие агенты могут получить эти предупреждения через память Wolf перед использованием соответствующих инструментов. ([GitHub][2])

Получается цикл:

```text
воркер столкнулся с проблемой
        ↓
Executor распознал повторяемый паттерн
        ↓
урок попал в память Wolf
        ↓
следующий Executor включил его в промпт воркера
        ↓
новый воркер не повторил ошибку
```

Поэтому трёхуровневая архитектура связана с памятью не формально. Она является механизмом, через который опыт превращается в улучшение процесса.

---

# Как это меняет мою предыдущую оценку продукта

Я позиционировал Wolf преимущественно как:

> **Project Learning Harness**

Это верно, но недостаточно.

Более точное определение:

> **Mr. Wolf — local-first иерархический рабочий контур для AI-агентов, в котором один уровень удерживает пользовательскую цель, второй отвечает за поставку, третий выполняет ограниченные операции, а общая память делает весь процесс накопительным.**

Или короче:

# Hierarchical Project Agent Harness

В русской формулировке:

# Иерархический рабочий контур проектных агентов

---

# Является ли Wolf оркестратором

README утверждает, что Wolf — «не оркестратор», а слой памяти и процессов. Одновременно фактическая агентная модель задаёт:

* допустимые направления делегирования;
* уровни ответственности;
* форматы брифов;
* форматы отчётов;
* циклы возврата;
* лимиты повторов;
* правила приёмки;
* правила эскалации;
* ограничения инструментов. ([GitHub][6])

Поэтому здесь нужна более точная формулировка:

> **Wolf не является универсальным workflow-orchestrator вроде общего движка графов или произвольных пайплайнов. Но он реализует opinionated orchestration protocol — конкретную нормативную модель организации работы агентов.**

То есть Wolf не предлагает пользователю нарисовать любой граф:

```text
A → B → C
```

Он предлагает готовую организационную модель:

```text
координатор
    ↓
ответственный исполнитель
    ↓
узкие воркеры
```

Это не отсутствие оркестрации. Это **неуниверсальная, предметно ориентированная оркестрация**.

---

# Рыночное значение этой схемы

Она сильнее отделяет Wolf сразу от двух классов продуктов.

## От систем памяти

Mem0, Graphiti, Cognee и другие системы в основном отвечают на вопрос:

> Что агент должен помнить и как это найти?

Wolf дополнительно отвечает:

> Кто должен принимать задачу?
> Кто должен декомпозировать её?
> Какой контекст кому доступен?
> Кто имеет право исполнять?
> Кто имеет право проверять?
> В каком формате результат поднимается наверх?
> Как ошибки превращаются в изменение будущего поведения?

То есть память здесь — инфраструктура организационной модели.

---

## От универсальных multi-agent framework

Большинство фреймворков позволяют создать агентов и связи между ними.

Wolf задаёт более жёсткий производственный контракт:

```text
L0 не исполняет
L0 не вызывает L2 напрямую

L1 принимает ответственность за бриф
L1 декомпозирует
L1 интегрирует
L1 вызывает только L2

L2 получает одну задачу
L2 не создаёт агентов
L2 не расширяет scope
```

Это уменьшает гибкость, но увеличивает:

* предсказуемость;
* управляемость;
* трассируемость;
* независимость приёмки;
* возможность измерять эффективность каждого уровня.

Именно эта нормативность может стать преимуществом Wolf.

---

# Почему трёх уровней лучше, чем двух

На первый взгляд можно было бы оставить:

```text
пользователь → главный агент → воркеры
```

Но тогда главный агент одновременно должен:

* помнить всю историю проекта;
* разговаривать с пользователем;
* формировать требования;
* декомпозировать каждую задачу;
* следить за десятками технических деталей;
* собирать результаты;
* принимать собственную работу.

Контекст быстро загрязняется и разрастается.

Промежуточный Executor отделяет:

```text
долговременный контекст проекта
```

от:

```text
временного контекста конкретной поставки
```

Это, вероятно, одно из наиболее важных архитектурных решений проекта.

---

# Основные риски этой модели

## 1. Потеря информации при сжатии

На каждом переходе часть информации отбрасывается:

```text
пользователь → бриф
бриф → подзадача
воркер → результат
результаты → отчёт
```

Если Executor плохо сформулировал подзадачу, Worker может идеально выполнить неправильную работу.

Поэтому качество L1 является критическим системным фактором.

---

## 2. Приёмка только по отчёту может быть недостаточной

Mr.Wolf сохраняет независимость от реализации, но становится зависимым от честности и полноты отчёта Executor.

Поэтому отчёт должен содержать не только текстовое заявление, но и проверяемые артефакты:

```text
критерий
команда проверки
exit code
вывод или digest вывода
пути изменённых файлов
diff/stat
ревью-вердикт
ссылки на результаты воркеров
```

Иначе L0 принимает не результат, а рассказ о результате.

---

## 3. Иерархические накладные расходы

Для изменения одной строки полный цикл может оказаться дороже непосредственного вызова coding agent.

Текущая модель частично решает это тем, что Executor самостоятельно выполняет тривиальные и простые задачи, но L0 всё равно не должен обходить L1. ([GitHub][2])

Это разумный компромисс:

```text
иерархия сохраняется
но третий runtime-вызов нужен не всегда
```

То есть существуют три уровня ответственности, хотя не обязательно три фактически запущенные модели на каждой задаче.

---

## 4. Executor становится главным узким местом

Если L1 плохо:

* декомпозирует;
* выбирает воркера;
* передаёт контекст;
* формулирует критерии;
* интегрирует результаты,

то масштабирование числа воркеров лишь масштабирует ошибку.

Следовательно, качество playbook’а Executor и метрики его работы потенциально важнее качества отдельных воркеров.

---

# Скорректированный главный вывод

Раньше я сформулировал отличие Wolf так:

> Agent remembers → Project learns.

Теперь я бы расширил формулу:

```text
Обычный coding agent:
одна модель одновременно думает, действует и проверяет себя.

Mr. Wolf:
проект удерживает цель,
исполнитель организует поставку,
воркеры выполняют ограниченные операции,
память накапливает опыт всей системы.
```

Поэтому два центральных дифференциатора Wolf — не только живая память и растущие инструменты.

На самом деле их три:

1. **трёхуровневая организация агентной работы;**
2. **накопительный жизненный цикл проектного знания;**
3. **превращение успешных способов решения в постоянные инструменты.**

Причём первый элемент, вероятно, нужно ставить в позиционировании раньше памяти. Именно он объясняет фразу из концепции, что суть Wolf — не память сама по себе, а **новая организация работы агентов, опирающаяся на общую память**. ([GitHub][7])

Наиболее точная продуктовая формула теперь выглядит так:

> **Mr. Wolf разделяет общение, управление поставкой и выполнение между тремя уровнями агентов, а затем делает накопленный опыт этой организации постоянным активом проекта.**

[1]: https://github.com/chekh/mister-wolf/blob/main/.opencode/agents/mr-wolf.md "mister-wolf/.opencode/agents/mr-wolf.md at main · chekh/mister-wolf · GitHub"
[2]: https://github.com/chekh/mister-wolf/blob/main/.opencode/agents/executor-lead.md "mister-wolf/.opencode/agents/executor-lead.md at main · chekh/mister-wolf · GitHub"
[3]: https://github.com/chekh/mister-wolf/blob/main/.opencode/agents/worker-implementer.md "mister-wolf/.opencode/agents/worker-implementer.md at main · chekh/mister-wolf · GitHub"
[4]: https://github.com/chekh/mister-wolf/blob/main/.opencode/agents/worker-researcher.md "mister-wolf/.opencode/agents/worker-researcher.md at main · chekh/mister-wolf · GitHub"
[5]: https://github.com/chekh/mister-wolf/blob/main/.opencode/agents/worker-reviewer.md "mister-wolf/.opencode/agents/worker-reviewer.md at main · chekh/mister-wolf · GitHub"
[6]: https://github.com/chekh/mister-wolf/tree/main "GitHub - chekh/mister-wolf · GitHub"
[7]: https://github.com/chekh/mister-wolf/blob/main/docs/concept/concept.md "mister-wolf/docs/concept/concept.md at main · chekh/mister-wolf · GitHub"


Zorg:
обрати внимание на  консилиум,  а также учти что память и ее таксономия направлена как раз на то чтобы уменьшить негативные проблемы трехуровневой схемы и повысить качество от длительных автоматических процессов

ChatGPT:
Да. Это заставляет ещё раз скорректировать мой предыдущий анализ: **трёхуровневая схема, консилиум и таксономия памяти — не отдельные возможности Wolf, а взаимосвязанные части одной системы управления длительной агентной работой**.

Я раньше рассматривал их слишком раздельно:

```text
иерархия агентов
+
память
+
консилиум
```

Правильнее видеть единую архитектуру:

```text
Вертикальная ответственность
        +
Горизонтальная проверка решений
        +
Типизированное состояние процесса
        +
Накопительное улучшение поведения
```

# 1. Wolf моделирует не отдельного агента, а организацию

В более точной интерпретации Mr. Wolf строит аналог устойчивой проектной организации:

| Элемент Wolf                   | Организационная функция                   |
| ------------------------------ | ----------------------------------------- |
| `mr.wolf`, L0                  | владелец цели и интерфейс с пользователем |
| Executor, L1                   | ответственный за конкретную поставку      |
| Workers, L2                    | узкие специалисты                         |
| Консилиум                      | временный экспертный совет                |
| Память                         | институциональная память организации      |
| Таксономия                     | формализованный язык рабочих состояний    |
| Стюард                         | механизм организационного обучения        |
| Rules / playbooks / injections | действующие процедуры и инструкции        |
| Tools                          | накопленные исполняемые способности       |

Поэтому наиболее точная формула продукта теперь выглядит так:

> **Mr. Wolf превращает набор сменяемых и ограниченных по контексту агентов в постоянную, иерархическую и способную к накопительному обучению проектную организацию.**

Это существенно сильнее, чем «память для coding agents».

---

# 2. Трёхуровневая схема намеренно создаёт ограничения

Иерархия L0 → L1 → L2 нужна для управляемости:

```text
Пользователь
    ↕
L0: цель, требования, приёмка
    ↓
L1: планирование, декомпозиция, интеграция
    ↓
L2: ограниченная операция
```

Она даёт:

* ограничение контекста;
* понятную ответственность;
* специализацию;
* возможность параллельной работы;
* независимую приёмку;
* заменяемость агентов;
* снижение стоимости отдельных операций.

Но она неизбежно создаёт собственные проблемы:

1. информация теряется при каждом переходе;
2. ошибочная декомпозиция L1 масштабируется на всех воркеров;
3. L2 не видит всей цели и может локально сделать «правильно», но глобально неверно;
4. L0 не видит деталей исполнения и зависит от качества отчёта;
5. Executor становится точкой концентрации ошибок;
6. длинный процесс постепенно отклоняется от исходной цели;
7. решения и предположения забываются между сессиями;
8. параллельные агенты могут писать конфликтующие результаты;
9. неудачные подходы могут повторяться разными воркерами;
10. один исполнитель склонен подтверждать собственную первоначальную гипотезу.

И вот здесь память Wolf — не дополнительный комфортный сервис. **Она является компенсирующим механизмом самой иерархии.**

---

# 3. Память — это не архив, а внешнее состояние рабочего процесса

В Wolf память содержит не только `decision`, `lesson` и документы. В её каноническую таксономию входят собственно процессные объекты:

```text
work-thread
task-brief
report
info-request
blocker
session-checkpoint
council-question
council-opinion
synthesis
escalation
decision-request
rule
call-injection
playbook
```

У типов есть собственные жизненные циклы. Например:

```text
task-brief:
active → completed / superseded

council-question:
open → answered → archived

council-opinion:
proposed → accepted

escalation:
open → resolved → archived

work-thread:
active → paused → completed → archived
```

Сам `work-thread` хранит `goal`, `current_state` и `next_steps`. То есть в памяти находится не только знание о проекте, но и **исполняемое состояние длительного рабочего процесса**. ([GitHub][1])

Это позволяет сделать важный переход:

```text
Состояние находится в контексте агента
```

↓

```text
Состояние находится в проекте,
а агент временно подключается к нему
```

Следовательно, агент можно:

* заменить;
* перезапустить;
* остановить;
* переключить на другую модель;
* восстановить после падения;
* подключить к работе через несколько дней,

не полагаясь на сохранность его прежнего контекстного окна.

---

# 4. Таксономия соответствует конкретным рискам иерархии

## Потеря смысла между L0 и L1

Компенсация:

```text
work-thread
task-brief
decision
rule
acceptance criteria
```

Пользовательская цель не должна каждый раз пересказываться свободным текстом. Она закрепляется в `work-thread`, а конкретная поставка — в `task-brief`.

`work-thread` сохраняет долгий горизонт:

```text
goal
current_state
next_steps
```

`task-brief` фиксирует временный контракт одной задачи:

```text
что сделать
кто отвечает
приоритет
ограничения
критерии результата
```

Таким образом, бриф — не просто сообщение между двумя агентами, а постоянный объект процесса.

---

## Потеря деталей между L2 и L1

Компенсация:

```text
report
relations
evidence
observations
blockers
```

Воркеры возвращают не только фразу «готово», а результаты, проверки, найденные ограничения и проблемы. Связи позволяют сохранить происхождение итогового решения:

```text
result
  ├─ produced_by → worker
  ├─ answers → task
  ├─ based_on → evidence
  └─ supports → decision
```

Это уменьшает риск того, что L1 при свёртке результатов исказит или потеряет важное наблюдение.

---

## Изоляция воркера от общего контекста

Компенсация:

```text
call-injection
lesson
rule
playbook
tool
```

Воркеру не требуется передавать всю память проекта. Вместо этого ему можно доставить небольшую выборку непосредственно применимых знаний:

```text
для этого инструмента известна ловушка X
для такой операции действует правило Y
для этой задачи уже существует tool Z
```

Executor прямо ориентирован на получение активных `call-injection` перед вызовом воркеров. Повторяемые ошибки инструментов должны превращаться в уроки и дальнейшие инъекции, а успешные повторно применимые способы — тоже сохраняться. ([GitHub][2])

Это важная идея: **изоляция L2 сохраняется, но становится не слепой, а управляемой**.

---

## Дрейф в длительном процессе

Компенсация:

```text
work-thread
session-checkpoint
session-summary
recap
thread diff
```

У Wolf уже есть создание checkpoint для нити и сравнение текущего состояния с checkpoint: изменение `current_state`, добавленные и закрытые объекты, новые relations. `recap` собирает активные правила, нити, блокеры, вопросы и решения. ([GitHub][3])

Это позволяет периодически задавать системе контрольный вопрос:

```text
Где мы сейчас?
Что изменилось?
Соответствует ли это исходной цели?
Что осталось нерешённым?
Какие решения появились?
```

Для длительного автономного процесса это критично. Без внешнего checkpoint агент оценивает собственный прогресс по текущему контексту, который уже является результатом множества предыдущих сжатий и интерпретаций.

---

## Молчаливые тупики и скрытые предположения

Компенсация:

```text
open-question
info-request
blocker
decision-request
escalation
```

Это важная часть таксономии, которую я раньше недооценил.

Когда агенту не хватает данных, он не должен:

* угадывать;
* импровизировать незаметно;
* оставлять вопрос только в тексте отчёта;
* бесконечно повторять неудачную попытку.

Неопределённость превращается в объект с жизненным циклом:

```text
info-request:
open → answered / rejected / obsolete

decision-request:
open → answered / archived

escalation:
open → resolved / archived
```

Таким образом, незнание становится видимым состоянием процесса, а не скрытым дефектом рассуждения.

---

## Повторение одних и тех же ошибок

Компенсация:

```text
observation
→ lesson
→ rule / call-injection / playbook
→ доставка следующему агенту
```

В спецификации самообучение определяется не как накопление записей, а как изменение будущего поведения по измеренному опыту. Носителями такого изменения выступают правила, уроки, параметры процесса, шаблоны, роли и playbook’и. ([GitHub][4])

Следовательно, память выполняет два разных назначения:

```text
ретроспективное:
что происходило

операционное:
как теперь следует действовать
```

Именно второе делает её механизмом повышения качества.

---

## Устаревание знаний

Компенсация:

```text
status
supersede
decay
activation pipeline
```

Объект не считается вечной истиной. У него есть:

* автор;
* статус;
* жизненный цикл;
* версия;
* supersede-связь;
* признаки использования;
* возможность устаревания и архивирования.

Изменяющие поведение объекты проходят:

```text
draft
→ Sandbox Replay
→ activation
→ post-audit
→ delivery
```

То есть новый урок или новая версия playbook не должны немедленно становиться инструкцией для всех агентов только потому, что один агент её сформулировал. ([GitHub][5])

---

## Повреждение состояния при параллельной работе

Компенсация существует уже на уровне хранилища:

* lockfile-транзакции;
* атомарная запись через временный файл и rename;
* толерантное чтение JSONL;
* карантин повреждённых объектов;
* retry для `SQLITE_BUSY`.

Это было специально введено перед мультиагентной записью, чтобы несколько исполнителей не разрушали общую память проекта. ([GitHub][6])

То есть таксономия и хранилище проектировались не только для удобного поиска. Они являются **общим согласованным состоянием параллельной агентной системы**.

---

# 5. Консилиум исправляет главный эпистемический дефект иерархии

Трёхуровневая вертикаль хорошо распределяет ответственность, но создаёт опасную точку:

```text
Executor решил,
что именно так нужно понимать задачу
```

Если первоначальная гипотеза L1 неверна, то он:

1. неправильно декомпозирует задачу;
2. формирует неправильные подзадачи;
3. получает локально корректные результаты;
4. интегрирует их в неправильное решение;
5. сам же представляет это решение L0.

Все воркеры при этом могут работать безошибочно.

Консилиум создаёт **горизонтальную ветку рассуждения**, которая не обязана следовать первоначальной декомпозиции одного Executor:

```text
                      ┌─ мнение A
сложный вопрос ───────┼─ мнение B
                      ├─ мнение C
                      └─ возражение D
                              ↓
                     tally / synthesis
                              ↓
                    рекомендация процессу
```

В текущей таксономии это выражено отдельными объектами:

```text
council-question
council-opinion
synthesis
```

Мнения связываются с вопросом отношением `answers`. Механизм подсчёта проверяет кворум и заданный порог согласия; победитель отсутствует, если кворум или threshold не достигнуты. Синтез создаётся отдельным объектом и связывается через `based_on` со всеми использованными мнениями. ([GitHub][7])

Это важнее простого «вызвать несколько агентов».

## Консилиум даёт четыре защиты

### Независимое формирование альтернатив

Несколько агентов могут оценить проблему с разных точек зрения до того, как будет сформирована единая позиция.

### Сохранение несогласия

Отдельные `council-opinion` не исчезают после синтеза. Можно увидеть:

* кто предложил вариант;
* кто возражал;
* какие альтернативы были отвергнуты;
* на каких мнениях основана рекомендация.

### Запрет ложного консенсуса

Если недостаточно участников или ни один вариант не достиг порога, результатом становится не выдуманная уверенность, а отсутствие winner.

### Отделение мнений от окончательного синтеза

Сначала фиксируются независимые позиции, затем создаётся `synthesis`. Это уменьшает риск, что первый сформулированный ответ задаст рамку всем остальным.

Поэтому консилиум — **не четвёртый уровень и не постоянный начальник над Executor**. Это временный поперечный механизм, который включается там, где вертикальной цепочки недостаточно для надёжного решения.

---

# 6. Полная архитектура выглядит так

```text
                           ПОЛЬЗОВАТЕЛЬ
                                ↕
                     ┌────────────────────┐
                     │ L0 — MR.WOLF       │
                     │ цель и приёмка     │
                     └─────────┬──────────┘
                               │
                         task-brief
                               │
                     ┌─────────▼──────────┐
                     │ L1 — EXECUTOR      │
                     │ поставка и план    │
                     └──────┬───────┬─────┘
                            │       │
                  подзадачи │       │ сложное решение
                            │       ▼
                     ┌──────▼───┐  ┌──────────────────┐
                     │ L2       │  │ КОНСИЛИУМ        │
                     │ WORKERS  │  │ opinions → vote  │
                     └──────┬───┘  │ → synthesis      │
                            │      └────────┬─────────┘
                     результаты            │
                     evidence              │ recommendation
                            └──────┬────────┘
                                   ▼
                              integration
                                   │
                                report
                                   │
                                   ▼
                              L0 acceptance
```

Всё это окружено общим долговременным состоянием:

```text
work-thread
decisions
questions
blockers
checkpoints
relations
rules
lessons
playbooks
tools
escalations
```

А поверх накопленного опыта работает Стюард:

```text
повторяемые сигналы
        ↓
обнаружение паттерна
        ↓
draft изменения
        ↓
проверка
        ↓
новое правило / playbook / injection / tool
        ↓
изменённое поведение будущих агентов
```

---

# 7. Почему это особенно важно для длительных автоматических процессов

У большинства agentic pipelines с ростом продолжительности качество склонно ухудшаться:

```text
больше шагов
→ больше локальных интерпретаций
→ больше накопленных предположений
→ больше сжатий контекста
→ больше незамеченных отклонений
→ выше вероятность необратимой ошибки
```

Wolf пытается изменить саму зависимость.

Каждый этап длительного процесса должен оставлять типизированный след:

```text
задача
→ бриф
→ исполнение
→ наблюдения
→ проверки
→ решение
→ отчёт
→ checkpoint
→ урок
```

Тогда длительность становится не только источником риска, но и источником данных:

```text
больше работы
→ больше проверяемого опыта
→ лучше правила и playbook’и
→ меньше повторяющихся ошибок
→ лучше следующие циклы
```

Это и есть настоящий смысл утверждения, что работа «накапливается, а не испаряется». README и концепция прямо описывают память как единую точку правды, а процессы — как диспетчеризацию, приёмку, checkpoint/wrap-up и периодическую обработку знаний. ([GitHub][8])

---

# 8. Четыре измерения системы Wolf

Теперь я бы описал архитектуру через четыре независимых измерения.

## 1. Вертикаль ответственности

```text
L0 → L1 → L2
```

Отвечает на вопросы:

* кто владеет целью;
* кто отвечает за поставку;
* кто выполняет операцию;
* кто принимает результат.

## 2. Горизонталь рассуждения

```text
Council
```

Отвечает на вопросы:

* существуют ли альтернативные интерпретации;
* не пропущена ли критическая перспектива;
* есть ли достаточный консенсус;
* требуется ли эскалация.

## 3. Продолженность во времени

```text
Memory + taxonomy + lifecycle
```

Отвечает на вопросы:

* где находится процесс;
* что уже было решено;
* что ещё открыто;
* почему принято решение;
* что изменилось после checkpoint;
* какие знания устарели.

## 4. Обратная связь

```text
Steward + metrics + activation
```

Отвечает на вопросы:

* какие ошибки повторяются;
* какие способы оказались успешными;
* что нужно изменить в поведении агентов;
* улучшило ли изменение качество;
* следует ли сохранить, откатить или заменить правило.

Это уже не обычная multi-agent orchestration.

---

# 9. В чём теперь я вижу настоящее рыночное отличие Wolf

Большинство систем закрывают одну или две оси:

```text
agent framework:
кто кого вызывает

memory framework:
что сохранить и найти

workflow engine:
какой следующий шаг

ensemble/council:
как получить несколько ответов
```

Wolf пытается объединить:

```text
иерархическую ответственность
+ временные экспертные консилиумы
+ долговременное типизированное состояние
+ управляемое организационное обучение
```

Поэтому продукт точнее сравнивать не с отдельной memory database и не только с multi-agent framework.

Его потенциальная категория:

# Persistent Agent Organization

или более описательно:

# Governed System for Long-Running Agent Work

На русском:

# Система устойчивой организации длительной агентной работы

Главный объект Wolf — уже не memory object и даже не агент.

Главный объект:

> **проектная работа, продолжающаяся через множество задач, агентов, моделей и сессий.**

---

# 10. Особенно сильная формула продукта

Теперь я бы сформулировал сущность Wolf так:

> **Вертикаль обеспечивает ответственность.
> Консилиум обеспечивает разнообразие и проверку решений.
> Память обеспечивает непрерывность.
> Таксономия превращает непрерывность в управляемый процесс.
> Стюард превращает опыт процесса в изменение будущего поведения.**

Или одной фразой:

> **Mr. Wolf — это постоянная проектная организация из временных AI-агентов.**

Это гораздо точнее моего первоначального определения `Project Learning Harness`.

---

# 11. Где остаются реальные риски

Архитектурная идея сильная, но несколько мест требуют особого контроля.

## Консилиум может создавать псевдоразнообразие

Три экземпляра одной модели с одинаковым контекстом и почти одинаковым prompt могут выдать три варианта одной и той же ошибки.

Поэтому членам консилиума желательно задавать не только разные названия ролей, но и разные эпистемические функции:

```text
предлагающий решение
критик предположений
проверяющий доказательства
искатель контрпримеров
оценщик рисков
защитник простого варианта
```

---

## Голосование не равно истинности

Большинство может ошибаться. Поэтому голос должен сопровождаться:

```text
claim
evidence
assumptions
confidence
failure conditions
risks
```

Сейчас тип `council-opinion` структурно требует только `vote`, а `synthesis` — только `recommendation`; дополнительное обоснование можно поместить в тело объекта, но схема не заставляет это делать. ([GitHub][1])

Я бы считал это одной из ближайших точек усиления таксономии.

---

## Синтез может снова стать единой точкой ошибки

Даже при хороших независимых мнениях синтезатор способен:

* отбросить неудобное возражение;
* переоценить большинство;
* потерять условие применимости;
* выдать более уверенный вывод, чем позволяют мнения.

Поэтому `synthesis` желательно хранить не только recommendation, но и:

```text
accepted claims
rejected alternatives
unresolved dissent
confidence
assumptions
required validation
fallback
```

---

## Таксономия может превратиться в бюрократию

Если агенту приходится вручную создавать по пять объектов на каждый простой шаг, система начнёт расходовать больше ресурсов на описание работы, чем на саму работу.

Поэтому типизированные артефакты должны создаваться:

* преимущественно автоматически;
* только в значимых точках;
* с компактными контрактами;
* с различным уровнем строгости для разных классов задач.

---

# Итоговая коррекция моей оценки

Я раньше видел основной цикл так:

```text
агент работает
→ память сохраняет опыт
→ следующий агент использует его
```

Теперь правильная модель значительно глубже:

```text
L0 удерживает цель
→ L1 организует поставку
→ L2 выполняют ограниченные операции
→ консилиум исправляет односторонность решений
→ типизированная память удерживает состояние и доказательства
→ checkpoint защищает длинный процесс от дрейфа
→ Стюард обобщает повторяемый опыт
→ rules/playbooks/injections/tools меняют следующую итерацию
```

Следовательно, **память Wolf проектировалась не вопреки сложности трёхуровневой схемы, а именно потому, что такая схема без внешней типизированной памяти была бы хрупкой**.

Самая точная архитектурная формула:

# Вертикальная иерархия + горизонтальный консилиум + продольная память + замкнутый контур обучения

И именно это, а не FTS5, Markdown или отдельные CLI-команды, является центральной продуктовой идеей Mr. Wolf.

[1]: https://github.com/chekh/mister-wolf/blob/main/src/domain/memory-types.ts "mister-wolf/src/domain/memory-types.ts at main · chekh/mister-wolf · GitHub"
[2]: https://github.com/chekh/mister-wolf/blob/main/.opencode/agents/executor-lead.md "mister-wolf/.opencode/agents/executor-lead.md at main · chekh/mister-wolf · GitHub"
[3]: https://github.com/chekh/mister-wolf/blob/main/src/adapters/cli/commands/memory-session.ts "mister-wolf/src/adapters/cli/commands/memory-session.ts at main · chekh/mister-wolf · GitHub"
[4]: https://github.com/chekh/mister-wolf/blob/main/docs/superpowers/specs/2026-08-26-self-learning-design.md "mister-wolf/docs/superpowers/specs/2026-08-26-self-learning-design.md at main · chekh/mister-wolf · GitHub"
[5]: https://github.com/chekh/mister-wolf/blob/main/docs/concept/concept.md "mister-wolf/docs/concept/concept.md at main · chekh/mister-wolf · GitHub"
[6]: https://github.com/chekh/mister-wolf/blob/main/docs/superpowers/specs/2026-08-23-phase-8-schema-taxonomy.md "mister-wolf/docs/superpowers/specs/2026-08-23-phase-8-schema-taxonomy.md at main · chekh/mister-wolf · GitHub"
[7]: https://github.com/chekh/mister-wolf/blob/main/src/app/use-cases/tally-council-votes.ts "mister-wolf/src/app/use-cases/tally-council-votes.ts at main · chekh/mister-wolf · GitHub"
[8]: https://github.com/chekh/mister-wolf/tree/main "GitHub - chekh/mister-wolf · GitHub"

Zorg:
попробуй теперь выполнить повторно сравнение мр. Вольфа с другими плетформами на рынке и найти его место в нем

ChatGPT:
# Пересмотренный вывод

После учёта трёхуровневой организации, консилиума и назначения таксономии памяти Mr. Wolf следует сравнивать **не с системами памяти и не только с multi-agent framework**.

Наиболее точное рыночное определение:

> **Mr. Wolf — local-first слой управления, памяти и организационного обучения для длительной работы AI-агентов над проектом.**

Более короткое название категории:

# **Persistent Project Agent Organization**

По-русски:

# **Постоянная агентная организация проекта**

Ключевая идея здесь не в том, что отдельный агент что-то запоминает. Wolf создаёт постоянную организацию, в которой:

```text
L0 Mr.Wolf     удерживает цель и взаимодействует с человеком
L1 Executor    отвечает за поставку и координирует исполнение
L2 Workers     выполняют ограниченные операции
Council        создаёт независимые альтернативные мнения
Memory         хранит состояние, решения, проблемы и опыт организации
Steward        превращает опыт в изменение будущих процессов
```

Репозиторий явно закрепляет запрет L0 выполнять работу и обращаться напрямую к воркерам, а L1 разрешено делегировать только воркерам и самостоятельно выполнять лишь ограниченные задачи. Таксономия хранит не только знания, но и `work-thread`, `task-brief`, `report`, `blocker`, `session-checkpoint`, `council-question`, `council-opinion`, `synthesis`, `escalation`, `rule`, `call-injection`, `playbook` и `tool`. 

---

# 1. Главная коррекция относительно предыдущего сравнения

Ранее я ставил Wolf преимущественно рядом с:

* Mem0;
* Graphiti;
* Cognee;
* Letta.

Это было неточно.

По состоянию на август 2026 года функции памяти, субагентов и переиспользуемых методик уже быстро становятся стандартными:

* Devin координирует несколько изолированных сессий, анализирует предыдущую работу, извлекает закономерности, создаёт playbook’и и обслуживает базу знаний;
* GitHub Copilot умеет декомпозировать задачи через `/fleet`, запускать субагентов в отдельных контекстах и хранить репозиторные факты с цитатами и проверкой актуальности;
* OpenHands имеет проектную память, поддерживает её очистку и консолидацию, запускает специализированных субагентов и сохраняет состояние разговоров;
* Letta объединяет постоянную память, субагентов и фоновое «dreaming», обновляющее память по результатам работы. ([Devin Docs][1])

Следовательно, Wolf уже нельзя дифференцировать формулой:

```text
memory + subagents + playbooks
```

Эта комбинация становится товарной функцией рынка.

Его потенциальная уникальность находится в другой формуле:

```text
строгое разделение ответственности
+
горизонтальная проверка решений
+
типизированное состояние проектной организации
+
управляемое изменение будущего поведения
```

---

# 2. На какой части рынка располагается Wolf

Современный рынок можно условно разделить на пять слоёв.

| Слой                         | Примеры                                                       | Что они в основном решают                         |
| ---------------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| Coding-agent products        | Devin, Copilot, Claude Code, Codex, OpenHands                 | Непосредственно выполняют инженерную работу       |
| Agent frameworks             | CrewAI, LangGraph, Microsoft Agent Framework, Google ADK, AG2 | Позволяют конструировать агентные процессы        |
| Persistent agent runtimes    | Letta                                                         | Делают самого агента постоянным и обучающимся     |
| Memory systems               | Mem0, Graphiti, Cognee                                        | Хранят, связывают и извлекают знания              |
| **Project governance layer** | **Mr. Wolf**                                                  | Делает постоянной организацию работы над проектом |

Архитектурно место Wolf выглядит так:

```text
┌─────────────────────────────────────────────┐
│ Пользователь / владелец проекта             │
├─────────────────────────────────────────────┤
│ MR. WOLF                                    │
│                                             │
│ цель и требования                           │
│ L0 → L1 → L2                                │
│ консилиум                                   │
│ приёмка                                     │
│ типизированная память                       │
│ обучение процессов                         │
│ накопление инструментов                     │
├─────────────────────────────────────────────┤
│ Execution harness                           │
│ OpenCode / Codex / Claude / Copilot /       │
│ OpenHands / Devin                           │
├─────────────────────────────────────────────┤
│ Runtime                                     │
│ модели / MCP / sandbox / CI / workflows     │
├─────────────────────────────────────────────┤
│ Retrieval и storage                         │
│ Files / SQLite / FTS / graph / vectors      │
└─────────────────────────────────────────────┘
```

То есть Wolf должен стремиться находиться **над агентными платформами**, а не конкурировать с ними как ещё один coding agent.

---

# 3. Ближайший прямой конкурент — Devin

После проверки актуальной документации именно Devin оказался самым близким коммерческим аналогом.

## Что уже умеет Devin

Devin способен:

* разбивать крупную задачу на параллельные рабочие потоки;
* запускать Managed Devins в отдельных изолированных VM;
* использовать координирующую сессию для определения scope, наблюдения за прогрессом, разрешения конфликтов и сведения результатов;
* анализировать прошлые сессии;
* находить причины успехов и неудач;
* превращать удачные сессии в повторно используемые playbook’и;
* улучшать существующие playbook’и;
* дедуплицировать и актуализировать knowledge;
* запускать задачи по расписанию;
* предоставлять управление сессиями, playbook’ами и knowledge через MCP. ([Devin Docs][1])

Это очень близко к циклу Wolf:

```text
работа
→ результаты
→ анализ
→ извлечение закономерностей
→ playbook
→ применение в следующих задачах
```

## Где Devin сильнее

Devin уже является полноценной исполнительной платформой:

* рабочие среды;
* изолированные VM;
* параллельные сессии;
* управление запущенными задачами;
* расписания;
* пользовательский интерфейс;
* организационная knowledge base;
* интеграции;
* готовая коммерческая дистрибуция.

Wolf пока не должен пытаться соревноваться с этим уровнем исполнения.

## Где Wolf отличается

В публично описанной модели Devin координирующая сессия совмещает функции постановщика, декомпозитора и интегратора. Я не обнаружил в документации обязательного разделения на:

```text
неисполняющий L0
→ ответственный L1
→ ограниченные L2
```

Также не обнаружил канонического аналога консилиума, где независимые позиции сохраняются как постоянные связанные артефакты с кворумом, синтезом и дальнейшим жизненным циклом.

Knowledge и playbook’и Devin — полезные информационные ресурсы. Память Wolf претендует на более широкую роль: быть моделью самой организации процесса, включая открытые вопросы, брифы, отчёты, эскалации, блокеры, checkpoints, мнения консилиума и историю приёмки.

## Вердикт

> **Devin — ближайший прямой конкурент и самый серьёзный ориентир для Wolf.**

Но продукты делают разные ставки:

```text
Devin:
готовая управляемая рабочая сила AI-инженеров

Wolf:
постоянная, проверяемая и переносимая организация работы агентов
```

При этом разница пока больше архитектурная, чем доказанная пользовательскими результатами.

---

# 4. GitHub Copilot — самая опасная платформенная угроза

GitHub Copilot уже объединяет несколько элементов Wolf.

## Оркестрация

Команда `/fleet` позволяет главному агенту:

* декомпозировать сложную задачу;
* определить зависимости;
* запускать субагентов параллельно;
* управлять процессом и собирать результаты.

Каждый субагент получает собственное контекстное окно. Copilot SDK также позволяет задавать отдельные prompts, tools, skills и MCP-серверы для специализированных агентов. ([GitHub Docs][2])

## Память

Copilot Memory хранит:

* архитектурные решения;
* правила проекта;
* команды сборки;
* соглашения кодирования;
* пользовательские предпочтения.

Особенно важно, что репозиторные факты сохраняются с цитатами на код. Перед использованием Copilot проверяет эти ссылки против текущей ветки. Неиспользуемая память автоматически удаляется через 28 дней, если её актуальность и полезность не подтверждаются повторным применением. ([GitHub Docs][3])

Это уже:

```text
evidence
+
revalidation
+
decay
```

И в этом конкретном месте эксплуатационная модель Copilot сейчас выглядит зрелее части реализованной модели Wolf.

## Отличие Wolf

Copilot оптимизирует выполнение задачи внутри своей платформы. Его главный агент может сам работать, сам делегировать и сам интегрировать результат. Память преимущественно является набором фактов и предпочтений.

Wolf добавляет:

* неисполняющего владельца цели;
* отдельного владельца поставки;
* независимую приёмку;
* процессные артефакты;
* консилиум;
* эскалации;
* управляемое изменение ролей и playbook’ов;
* потенциальную независимость от конкретного поставщика моделей и coding agent.

## Вердикт

> **Copilot — не самый похожий на Wolf продукт, но наиболее опасный конкурент по дистрибуции.**

Пользователю может оказаться достаточно встроенных субагентов, памяти и Fleet mode. Поэтому Wolf должен давать не на 10–20% более удобную память, а принципиально более надёжную организацию длительного процесса.

---

# 5. Claude Code и Codex — угроза встроенного замещения

Claude Code развивает agent teams: ведущий агент, специализированные участники, общий список задач, обмен сообщениями и отдельные контексты. Одновременно Claude Code имеет проектные инструкции и автоматическую память, включая отдельную память субагентов. ([Claude][4])

Codex развивает модель командного центра для нескольких агентов, параллельных worktree, долговременных project threads, skills, automations и памяти, которая позволяет продолжать работу через длительные интервалы времени. ([OpenAI][5])

Обе платформы постепенно приближаются к формуле:

```text
долговременный проект
+
несколько агентов
+
проектные знания
+
автоматические процессы
```

Но пока они преимущественно остаются исполнительными средами. Организационная политика либо задаётся пользователем вручную, либо принимается основным агентом динамически.

У Wolf потенциально остаются:

* строгая независимость L0 от исполнения;
* обязательный L1;
* запрет обхода уровней;
* типизированный контракт брифа и отчёта;
* постоянная история согласования и приёмки;
* платформенно-независимый проектный канон;
* системное обучение всей организации, а не только конкретной сессии или агента.

Основная защита Wolf от Claude Code и Codex — **не более умный агент**, а переносимая система ответственности и памяти проекта.

---

# 6. OpenHands — ближайшая открытая исполнительная платформа

OpenHands сейчас гораздо ближе к Wolf, чем обычный coding-agent CLI.

Он предоставляет:

* модель-независимый SDK для software agents;
* постоянное состояние разговоров;
* pause/resume;
* контекстную компрессию;
* специализированных субагентов;
* продолжение работы ранее запущенного субагента по task ID;
* проектную и пользовательскую память;
* автоматические инструкции агенту объединять дубли, удалять устаревшее и сохранять значимые решения и причины ошибок. ([OpenHands Docs][6])

OpenHands также использует Markdown-описания специализированных агентов с ограниченными инструментами, что структурно напоминает тонкие agent frames Wolf. ([OpenHands Docs][7])

## Отличие

В OpenHands основная структура остаётся:

```text
parent agent
→ subagents
```

Память — преимущественно иерархия Markdown-файлов. Она не является формализованной моделью проектной организации с обязательными объектами брифа, поставки, консилиума, эскалации и независимой приёмки.

## Вердикт

> **OpenHands — лучший потенциальный открытый execution backend для будущего Wolf и одновременно сильный open-source substitute.**

Если Wolf останется только OpenCode-конфигурацией с памятью, OpenHands сможет закрыть значительную часть той же ценности. Если же Wolf станет переносимым организационным протоколом, OpenHands может стать одним из его runtime-адаптеров.

---

# 7. Letta — ближайший концептуальный конкурент

Letta строится вокруг постоянного агента.

Память Letta:

* принадлежит агенту;
* следует за ним между разговорами, моделями и компьютерами;
* хранится в Git-backed репозитории;
* может совместно использоваться несколькими агентами;
* обновляется самим агентом.

Фоновый механизм Dreaming запускает субагентов, которые анализируют недавние разговоры, консолидируют уроки и обновляют память. Letta также поддерживает специализированных и постоянных субагентов с собственными моделями, инструментами, skill’ами и памятью. ([Letta Docs][8])

Различие фундаментальное:

```text
Letta:
постоянным является агент

Wolf:
постоянными являются проект и организация работы
```

В Letta основной агент остаётся субъектом, который помнит, действует и вызывает помощников.

В Wolf:

* L0 не должен выполнять работу;
* L1 отвечает только за конкретную поставку;
* L2 заменяемы;
* консилиум временный;
* проектная память принадлежит не конкретной модели или агенту;
* смена агентов не должна разрушать организационную непрерывность.

## Вердикт

> **Letta — ближайший конкурент в области persistent learning, но с другой единицей долговечности.**

Эту разницу Wolf следует сделать одной из центральных частей позиционирования:

```text
Letta makes agents persistent.
Wolf makes project organizations persistent.
```

---

# 8. CrewAI — ближайший framework-конкурент по иерархии

CrewAI поддерживает hierarchical process, где manager:

* планирует;
* делегирует;
* проверяет результаты;
* распределяет задачи между участниками.

CrewAI Flows добавляют состояние, маршрутизацию, сохранение и восстановление процесса, а встроенная memory-система позволяет агентам и Flow сохранять и извлекать знания. ([CrewAI Documentation][9])

С помощью CrewAI можно воспроизвести значительную часть Wolf:

```text
manager
→ executor managers
→ workers
```

Можно также построить консилиум как группу агентов и сохранять состояние через Flow.

Но это придётся спроектировать пользователю.

CrewAI даёт:

> конструктор организации.

Wolf пытается дать:

> готовую нормативную организацию с заранее определёнными ролями, запретами, контрактами и механизмами обучения.

## Вердикт

> **CrewAI — наиболее близкий framework-конкурент, но не готовый аналог Wolf.**

Риск для Wolf заключается в том, что его могут воспринять как хорошо продуманный набор конфигураций поверх CrewAI или OpenCode. Чтобы выйти из этой позиции, нужны переносимый протокол, доказанные метрики и полноценный lifecycle.

---

# 9. LangGraph, Microsoft Agent Framework и Google ADK

Эти системы находятся уровнем ниже Wolf.

LangGraph предоставляет долговременное исполнение, persistence, human-in-the-loop, память и инфраструктуру для stateful long-running workflows. ([Docs by LangChain][10])

Microsoft Agent Framework поддерживает графы, последовательные и параллельные процессы, handoff, group collaboration, checkpointing, time travel, human-in-the-loop и наблюдаемость. ([GitHub][11])

Google ADK 2.0 предоставляет графовый workflow engine, динамическую оркестрацию, изоляцию контекста ветвей, retries, concurrency, checkpoints и длительное восстановимое исполнение. ([Блог разработчиков Google][12])

Все три способны технически реализовать:

* три уровня;
* консилиум;
* checkpoints;
* эскалации;
* циклы проверки;
* фоновые процессы.

Но они не отвечают на вопрос, **какая именно организационная модель правильна для длительной проектной работы**.

## Их отношение к Wolf

```text
LangGraph / MAF / ADK:
движок, на котором можно реализовать Wolf

Wolf:
предметная модель, которая определяет,
что именно должен исполнять движок
```

Поэтому конкурировать с ними в надёжности выполнения нецелесообразно. На более поздней стадии Wolf разумнее использовать один из таких runtime или добавить интеграционный слой.

---

# 10. AG2 / AutoGen / Magentic-One

Magentic-One использует центрального Orchestrator, который:

* планирует;
* декомпозирует задачу;
* ведёт Task Ledger;
* ведёт Progress Ledger;
* вызывает специализированных агентов;
* перепланирует работу при отсутствии прогресса.

AG2 поддерживает последовательные, групповые и вложенные agent flows. ([Microsoft на GitHub][13])

Task Ledger и Progress Ledger концептуально близки к:

```text
work-thread
current_state
next_steps
checkpoint
```

Но в Magentic-One это прежде всего состояние текущего запуска. Wolf пытается превращать результаты множества запусков в постоянное институциональное знание проекта.

Консилиум тоже можно реализовать через group chat, однако Wolf сохраняет вопрос, каждое мнение и синтез как отдельные типизированные объекты памяти.

---

# 11. MetaGPT и ChatDev

MetaGPT и ChatDev являются важными идейными предшественниками.

MetaGPT моделирует «software company» с ролями product manager, architect, project manager и engineer, используя стандартные операционные процедуры. ChatDev также строился вокруг виртуальной команды с ролевым взаимодействием. ([docs.deepwisdom.ai][14])

Это близко к Wolf метафорически:

```text
не один агент,
а организация специализированных ролей
```

Но разница существенна.

MetaGPT и ChatDev в большей степени моделируют распределение функций внутри одного производственного запуска. Wolf строит:

* постоянную проектную память;
* формальную историю ответственности;
* checkpoints;
* долгоживущие рабочие нити;
* консилиумы;
* эскалации;
* обновляемые playbook’и;
* накопление исполняемых инструментов;
* связь между неудачей прошлого процесса и поведением будущего агента.

То есть Wolf ближе не к «виртуальной software company», а к **операционной системе институциональной памяти такой компании**.

---

# 12. Mem0, Graphiti и Cognee — скорее компоненты, чем конкуренты

Эти системы остаются сильнее Wolf в специализированных областях.

Mem0 предлагает развитый memory API, автоматическое извлечение и дедупликацию фактов, области памяти для пользователей, агентов и запусков. ([Mem0][15])

Graphiti специализируется на темпоральных knowledge graph: факты имеют временную применимость, происхождение и могут изменяться без потери истории. ([Zep][16])

Cognee объединяет graph memory, контекст, traces и процессы обработки знаний. ([Cognee Documentation][17])

Они отвечают на вопрос:

> Как хранить, связывать и извлекать знания?

Wolf отвечает на другой:

> Как организовать длительную работу временных агентов так, чтобы состояние, ответственность и накопленный опыт принадлежали проекту?

Поэтому правильная стратегия:

```text
не Wolf против Graphiti/Mem0/Cognee

а

Wolf поверх сменяемого retrieval backend
```

SQLite и FTS могут оставаться простым локальным вариантом. Для крупных проектов можно добавлять адаптеры к graph/vector memory.

---

# 13. Утверждение о «write-once конкурентах» уже нужно пересмотреть

В концепции Wolf сказано, что конкуренты дают «write-once память», а Wolf — цикл жизни знаний. ([GitHub][18])

В августе 2026 года это уже нельзя использовать как сильное рыночное утверждение:

* Letta Dreaming пересматривает разговоры и консолидирует память;
* OpenHands инструктирует агента объединять дубли и удалять устаревшие сведения;
* Copilot проверяет факты против текущей ветки и удаляет неиспользуемые;
* Devin предлагает дедупликацию, разрешение конфликтов и обновление knowledge;
* Graphiti изначально моделирует изменяющиеся во времени факты. ([Letta Docs][8])

Поэтому «живая память» больше не может быть единственным УТП.

Более точное отличие Wolf:

> **Не просто обновляемая память, а обновляемая институциональная модель работы проекта.**

---

# 14. Сводное сравнение

В таблице учитывается стандартная документированная модель продукта. Почти любой framework можно расширить пользовательским кодом.

| Система                      | Что является постоянной единицей  | Организация агентов              | Память                                       | Обучение                                             | Отношение к Wolf                   |
| ---------------------------- | --------------------------------- | -------------------------------- | -------------------------------------------- | ---------------------------------------------------- | ---------------------------------- |
| **Mr. Wolf**                 | Проектная организация             | Строгая L0 → L1 → L2 + консилиум | Типизированное состояние проекта и процессов | Governed: сигналы → кандидаты → проверка → активация | Отдельная категория                |
| **Devin**                    | Организация, сессии, knowledge    | Координатор → Managed Devins     | Knowledge + история сессий                   | Анализ сессий → playbook                             | Ближайший прямой конкурент         |
| **GitHub Copilot**           | Репозиторий и пользователь        | Main agent → Fleet/subagents     | Факты с citations и revalidation             | Автоматическое накопление и decay                    | Главная платформенная угроза       |
| **Claude Code / Codex**      | Проектные сессии и агентная среда | Lead/main → agents               | Instructions, memory, threads                | Skills, automations, накопление контекста            | Встроенное замещение               |
| **OpenHands**                | Conversation и project memory     | Parent → subagents               | Markdown, user/project tiers                 | Поддержка и очистка памяти агентом                   | Open-source substitute/backend     |
| **Letta**                    | Сам агент                         | Main agent → subagents           | Agent-owned Git memory                       | Dreaming и reflection                                | Ближайший концептуальный конкурент |
| **CrewAI**                   | Crew/Flow                         | Manager и workers                | Flow state + memory                          | Пользовательские процессы                            | Framework-конкурент                |
| **LangGraph / MAF / ADK**    | Workflow/run                      | Произвольные графы               | Checkpoints/stores                           | Реализуется разработчиком                            | Потенциальный runtime Wolf         |
| **AG2 / Magentic-One**       | Team run                          | Orchestrator и специалисты       | Ledgers и state                              | Replanning внутри запуска                            | Оркестрационный аналог             |
| **Mem0 / Graphiti / Cognee** | Knowledge layer                   | Не определяют                    | Сильная специализированная память            | Memory lifecycle                                     | Возможные backend-компоненты       |
| **MetaGPT / ChatDev**        | Виртуальная команда               | Роли и SOP                       | Ограниченная проектная продолженность        | В основном внутри процесса                           | Идейные предшественники            |

---

# 15. Что у Wolf действительно может быть уникальным

Важно не переоценивать отдельные компоненты.

## Не уникальны сами по себе

Не являются самостоятельным конкурентным преимуществом:

* manager и workers;
* три уровня вложенности;
* память проекта;
* автоматическая декомпозиция;
* консилиум или group chat;
* playbook’и;
* background reflection;
* persistent sessions;
* skills;
* local-first storage.

Практически всё это уже существует по отдельности.

## Потенциально уникальна система в сборе

В изученных публичных продуктах я не обнаружил другого стандартного решения, которое объединяло бы одновременно:

### 1. Строгую вертикаль ответственности

```text
L0 не исполняет
L0 не вызывает L2
L1 отвечает за поставку
L2 не расширяет scope
```

### 2. Независимую приёмку

Владелец цели не должен принимать собственную реализацию и не должен формировать впечатление о результате через самостоятельное чтение кода.

### 3. Горизонтальный консилиум

Мнения существуют независимо от основной вертикали и остаются в памяти после синтеза.

### 4. Таксономию, соответствующую рискам иерархии

```text
потеря цели         → work-thread / task-brief
потеря результата   → report / evidence
дрейф               → checkpoint
неопределённость    → info-request / open-question
тупик               → blocker
нужда в человеке    → decision-request / escalation
односторонность     → council-opinion / synthesis
повтор ошибки       → lesson / rule / call-injection
повтор решения      → playbook / tool
```

### 5. Управляемое организационное обучение

Не просто «агент записал совет», а:

```text
сигнал
→ паттерн
→ кандидат
→ grounding
→ проверка
→ активация
→ доставка
→ измерение эффекта
```

Спецификация Wolf прямо определяет обучение как изменение будущего поведения по измеренному опыту, а не как накопление памяти. 

### 6. Исполняемую память

Наиболее интересное направление Wolf:

```text
успешный одноразовый скрипт
→ tool candidate
→ проверка
→ active tool
→ счётчик использования
→ deprecation/decay
```

Таксономия уже предусматривает `tool` со статусами `candidate`, `active`, `deprecated`, `archived`, контрактами входа/выхода и метриками использования. Однако Библиотекарь и полный процесс tools-as-memory пока в основном спроектированы, а не доведены до зрелого продукта. 

---

# 16. Где Wolf проигрывает рынку сейчас

## 16.1. Реальная готовность отстаёт от концепции

README сообщает о реализованных фазах A–B. Сама концепция признаёт, что процессы частично существуют в продукте, частично только в практике, агенты подтверждены PoC, а существенная часть Steward и tools-as-memory ещё спроектирована. Спецификация самообучения имеет статус design и ожидает утверждения. ([GitHub][19])

Поэтому нельзя сравнивать полный vision Wolf с текущим production Devin или Copilot как будто всё уже реализовано.

## 16.2. Нет полноценного durable execution runtime

Типизированная память позволяет восстановить смысл процесса, но этого недостаточно для надёжной многодневной автоматизации.

Нужны:

* leases;
* idempotency;
* crash recovery;
* retries;
* task ownership;
* heartbeats;
* timeout policies;
* cancellation;
* replay;
* compensation;
* защита от двойного исполнения;
* наблюдаемость.

LangGraph, Microsoft Agent Framework и Google ADK уже предлагают значительную часть этих механизмов на runtime-уровне. ([Docs by LangChain][10])

## 16.3. Консилиум пока является базовым механизмом

В текущей таксономии `council-opinion` структурно требует лишь строковый `vote`, а `synthesis` — строковую `recommendation`. Подсчёт проверяет кворум и долю победившего варианта. 

Пока схема не требует:

* доказательств;
* confidence;
* предположений;
* контрпримеров;
* условий применимости;
* независимости от других мнений;
* роли участника;
* модели участника;
* сохранения существенного dissent;
* обязательной верификации синтеза.

То есть архитектурная идея консилиума сильнее его текущего контракта.

## 16.4. Evidence model нуждается в динамической проверке

У Wolf уже есть поля `evidence`, `risk_level`, `predicted_effect`, `holdout_verdict` и decay. 

Но Copilot показывает следующий уровень: не просто сохранить источник, а перед использованием проверить его против текущей ветки. ([GitHub Docs][3])

Wolf потребуется аналогичная модель:

```text
claim
→ source
→ validation procedure
→ last_verified_at
→ invalidation trigger
```

## 16.5. Мультиплатформенность пока является обещанием

Архитектура заявляет однонаправленные platform adapters, но продукт остаётся OpenCode-first. ([GitHub][19])

Пока не появится хотя бы второй полноценный адаптер, утверждение «проектное знание независимо от агента» не доказано эксплуатационно.

## 16.6. Рыночная дистрибуция практически отсутствует

Репозиторий показывает серьёзную инженерную активность и сотни коммитов, но пока не имеет заметной публичной adoption, релизов или экосистемы. ([GitHub][19])

Это означает, что сегодня Wolf занимает не рыночную позицию, а **архитектурную позицию**.

---

# 17. Рыночная карта

Если взять две оси:

* по горизонтали — от универсального конструктора к готовой организационной модели;
* по вертикали — от состояния отдельного запуска к постоянной организации проекта;

получится примерно такая карта:

```text
                    ПОСТОЯННАЯ ОРГАНИЗАЦИЯ ПРОЕКТА
                                  ▲
                                  │
 Memory systems                   │             MR. WOLF
 Mem0 / Graphiti / Cognee         │             Devin
                                  │             Copilot Memory
                  Letta           │
                                  │
──────────────────────────────────┼──────────────────────────────►
 УНИВЕРСАЛЬНЫЕ ПРИМИТИВЫ          │       ГОТОВАЯ ОРГАНИЗАЦИЯ
                                  │
 LangGraph / MAF / ADK            │       CrewAI hierarchy
 OpenAI Agents SDK                │       MetaGPT / ChatDev
                                  │       Magentic-One
                                  │
                                  ▼
                      СОСТОЯНИЕ ОДНОГО ЗАПУСКА
```

Правый верхний сектор уже не пуст: туда быстро движутся Devin, Copilot, Claude Code и другие продукты.

Но Wolf может занять в нём отдельную позицию:

> **vendor-neutral, local-first, project-owned governance system.**

---

# 18. Для какого пользователя Wolf действительно нужен

Лучший начальный сегмент — не любой пользователь coding agents.

Wolf имеет смысл, когда одновременно присутствуют:

* долгоживущий проект;
* много последовательных агентных сессий;
* несколько классов задач;
* повторяющиеся ошибки и исследования;
* длительные автономные процессы;
* несколько моделей или поставщиков;
* требования к локальному хранению;
* необходимость понимать, кто и почему принял решение;
* значимая цена неправильного результата.

Типичный ранний пользователь:

```text
небольшая AI-native engineering team
или сильный индивидуальный разработчик,
который использует агентов как постоянную рабочую силу,
а не как автодополнение кода
```

Wolf избыточен для:

* одноразовых задач;
* простых изменений одного файла;
* случайного использования AI;
* коротких проектов;
* пользователей, полностью удовлетворённых встроенным workflow Copilot или Devin.

Иерархия, консилиум и таксономия дают накладные расходы. Они окупаются только там, где стоимость дрейфа, забывания и повторной работы превышает стоимость координации.

---

# 19. Как следует позиционировать продукт

## Неудачные категории

### «Memory for agents»

Слишком узко и уже почти commoditized.

### «Multi-agent framework»

Wolf проиграет LangGraph, CrewAI, MAF и ADK по гибкости и экосистеме.

### «Coding agent»

Wolf не должен конкурировать с качеством выполнения Codex, Claude Code, Devin или OpenHands.

### «Universal orchestrator»

Это заставит строить общий workflow engine и потерять предметную специфику.

## Рекомендуемая категория

# **Agentic Project Governance**

Формулировка продукта:

> **Mr. Wolf turns temporary AI agents into a persistent project organization.**

Русский вариант:

> **Mr. Wolf превращает сменяемых AI-агентов в постоянную организацию проекта.**

Техническое описание:

> **Local-first governance and learning layer for long-running coding agents: strict role separation, expert councils, typed process memory, evidence-based acceptance and governed process improvement.**

---

# 20. Что должно стать настоящим защитным барьером

Архитектуру ролей можно скопировать. Типы памяти можно скопировать. Консилиум можно собрать в CrewAI за несколько дней.

Защитой должны стать не компоненты, а накопленные доказательства их эффективности.

## 20.1. Wolf Protocol

Трёхуровневую модель следует оформить как переносимый протокол:

```text
Role contracts
Task Brief
Worker Result
Executor Report
Acceptance Verdict
Council Question
Council Opinion
Synthesis
Escalation
Checkpoint
Learning Candidate
Activation Result
```

Тогда Wolf станет не набором OpenCode agent-файлов, а стандартом организации работы, который можно реализовать поверх разных harness.

## 20.2. Benchmark накопительного качества

Нужен эксперимент на одном проекте в серии из 30–100 задач:

```text
обычный coding agent
против
agent + Wolf
```

Измерять следует:

* долю принятых критериев;
* количество rejected-циклов;
* повторение уже известных ошибок;
* повторное исследование одной проблемы;
* дрейф от исходной цели;
* потерю состояния после перезапуска;
* стоимость контекста;
* время восстановления;
* использование существующих tools;
* долю устаревших injections;
* эффект консилиума на неоднозначных решениях.

Особенно ценны ablation-тесты:

```text
один агент
vs L0→L1→L2

трёхуровневая схема без памяти
vs с таксономией

без консилиума
vs с консилиумом

без Steward
vs с управляемым обучением
```

Именно они докажут, что архитектурные ограничения дают реальное повышение качества.

## 20.3. Второй платформенный адаптер

После OpenCode нужен один контрастный runtime:

* OpenHands как открытый вариант;
* Claude Code или Codex как массовая платформа;
* Microsoft Agent Framework как промышленный runtime.

Один качественный второй адаптер даст больше доказательств мультиплатформенности, чем пять незавершённых интеграций.

## 20.4. Усиленный Council Protocol

Мнение должно иметь обязательную структуру:

```text
position
claims
evidence
assumptions
confidence
risks
counterexamples
failure_conditions
recommended_validation
```

Синтез:

```text
accepted claims
rejected alternatives
unresolved dissent
confidence
required verification
fallback
```

Мнения должны формироваться изолированно до раскрытия ответов остальных участников.

## 20.5. Динамическая валидность знаний

Каждая значимая запись должна отвечать не только на вопрос «откуда это взялось», но и:

```text
как проверить, что это всё ещё верно?
```

## 20.6. Использование существующих инфраструктурных компонентов

Wolf не должен самостоятельно становиться лучшим:

* vector store;
* knowledge graph;
* sandbox;
* workflow runtime;
* coding model;
* distributed scheduler.

Его ценность — организационный протокол и накопительная модель проекта. Остальные слои должны быть заменяемыми адаптерами.

---

# 21. Итоговая оценка

| Аспект                                                                   | Оценка |
| ------------------------------------------------------------------------ | -----: |
| Оригинальность отдельных функций                                         |   5/10 |
| Оригинальность их объединения                                            | 8.5/10 |
| Сила архитектурной идеи                                                  |   9/10 |
| Текущая завершённость продукта                                           | 5.5/10 |
| Текущая рыночная заметность                                              |   1/10 |
| Защищённость от копирования сейчас                                       |   4/10 |
| Потенциальная защищённость при наличии протокола, адаптеров и benchmarks |   8/10 |
| Потенциал отдельной категории                                            | 8.5/10 |

---

# Окончательный вывод

Mr. Wolf выходит не на пустой рынок. Напротив, он попадает в точку, к которой быстро сходятся:

```text
Devin
Copilot
Claude Code
Codex
OpenHands
Letta
CrewAI
LangGraph
Microsoft Agent Framework
```

Все они постепенно объединяют память, субагентов, длительные задачи и переиспользуемые методики.

Поэтому преимущество Wolf не может звучать так:

> «У нас тоже есть память, агенты и playbook’и».

Его место находится в более узкой и сильной категории:

# **управление постоянной проектной организацией из временных AI-агентов**

Наиболее точное сравнение:

```text
Devin                 — управляемая AI-инженерная рабочая сила
Copilot/Codex/Claude  — интегрированные исполнительные платформы
OpenHands             — открытый runtime для software agents
Letta                 — постоянный обучающийся агент
CrewAI                — конструктор агентных команд
LangGraph/MAF/ADK     — runtime длительных workflows
Mem0/Graphiti/Cognee  — инфраструктура памяти

Mr. Wolf              — постоянная организация проекта:
                         ответственность,
                         консилиум,
                         состояние,
                         приёмка,
                         институциональная память,
                         управляемое обучение
```

**Сегодня Wolf — ранний архитектурно сильный продукт без сформированной рыночной позиции. Потенциально он может занять место vendor-neutral Project Agent Governance Layer между владельцем проекта и любыми исполнительными агентами.**

Ключевая стратегическая формула:

> **Агенты сменяются. Модели сменяются. Исполнительные платформы сменяются.
> Цель, ответственность, решения, процессы и накопленный опыт проекта остаются в Mr. Wolf.**

[1]: https://docs.devin.ai/work-with-devin/advanced-capabilities?utm_source=chatgpt.com "Advanced Capabilities - Devin Docs"
[2]: https://docs.github.com/copilot/concepts/agents/copilot-cli/fleet?utm_source=chatgpt.com "Running tasks in parallel with the /fleet command - GitHub Docs"
[3]: https://docs.github.com/en/copilot/concepts/agents/copilot-memory?utm_source=chatgpt.com "About GitHub Copilot Memory - GitHub Docs"
[4]: https://code.claude.com/docs/en/agent-teams?utm_source=chatgpt.com "Orchestrate teams of Claude Code sessions - Claude Code Docs"
[5]: https://openai.com/index/introducing-the-codex-app/?utm_source=chatgpt.com "Introducing the Codex app | OpenAI"
[6]: https://docs.openhands.dev/sdk?utm_source=chatgpt.com "Software Agent SDK - OpenHands Docs"
[7]: https://docs.openhands.dev/sdk/guides/agent-file-based?utm_source=chatgpt.com "File-Based Agents - OpenHands Docs"
[8]: https://docs.letta.com/agent-sdk/memory "Memory | Letta Docs"
[9]: https://docs.crewai.com/v1.15.7/en/concepts/processes "Processes - CrewAI"
[10]: https://docs.langchain.com/oss/python/langgraph/overview "LangGraph overview - Docs by LangChain"
[11]: https://github.com/microsoft/agent-framework/blob/main/README.md "agent-framework/README.md at main · microsoft/agent-framework · GitHub"
[12]: https://developers.googleblog.com/en/announcing-adk-go-20/ "Build reliable multi-agent applications with ADK Go 2.0. Discover our new graph-based workflow engine, built-in human-in-the-loop, and dynamic orchestration - Google Developers Blog"
[13]: https://microsoft.github.io/autogen/0.5.5/reference/python/autogen_ext.teams.magentic_one.html "autogen_ext.teams.magentic_one — AutoGen"
[14]: https://docs.deepwisdom.ai/v0.6/en/guide/get_started/introduction.html?utm_source=chatgpt.com "MetaGPT: The Multi-Agent Framework | MetaGPT"
[15]: https://docs.mem0.ai/core-concepts/how-it-works?utm_source=chatgpt.com "How Mem0 Works - Mem0"
[16]: https://help.getzep.com/graphiti/getting-started/overview?utm_source=chatgpt.com "Overview | Zep Documentation"
[17]: https://docs.cognee.ai/guides/agent-memory-quickstart?utm_source=chatgpt.com "Agent Memory Quickstart - Cognee Documentation"
[18]: https://github.com/chekh/mister-wolf/blob/main/docs/concept/concept.md "mister-wolf/docs/concept/concept.md at main · chekh/mister-wolf · GitHub"
[19]: https://github.com/chekh/mister-wolf/blob/main/README.md "mister-wolf/README.md at main · chekh/mister-wolf · GitHub"
