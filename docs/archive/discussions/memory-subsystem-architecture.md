# Вопрос

хочу обсудить память. Предложи как ее реализовывать, структуру хранения, что и как, и пр. Решений для памяти уже очень много, нужно ли создать свое или использовать готовое? Вообщем рассмотри с разных сторон и применительно к разным проектам.

# Ответ

Да, память нужно проектировать как **отдельный слой фреймворка**, а не как “прикрутить vector DB”. Для “Мистера Вульфа” память должна быть не одной базой, а **Memory Subsystem** с несколькими типами памяти, политиками записи/чтения, аудитом, правами доступа и сменяемыми backend-ами.

Короткая позиция: **свой memory engine полностью писать не стоит на старте**. Лучше сделать собственный **Memory Abstraction Layer**, а под ним использовать готовые backend-ы: файловое состояние, SQL, vector DB, graph memory, Mem0, Zep, LangGraph Store/checkpointer и т.д. Mem0 позиционирует себя как универсальный memory layer для AI-агентов, включая self-hosted open-source вариант; Zep делает акцент на temporal knowledge graph и объединении chat/business data; LangGraph официально разделяет short-term thread memory и long-term storage. ([GitHub][1])

---

# 1. Что такое память в “Мистере Вульфе”

Память — это не просто “история чата”.

Для твоего фреймворка память должна отвечать на вопросы:

```text
Что мы уже знаем?
Откуда мы это знаем?
Можно ли этому доверять?
Кому это принадлежит?
К какому Case / проекту / пользователю / домену это относится?
Можно ли это использовать в текущем контексте?
Нужно ли это забыть?
Нужно ли спросить разрешение перед использованием?
```

То есть память должна быть не пассивным хранилищем, а управляемым слоем:

```text
Memory Layer =
  storage
  retrieval
  summarization
  extraction
  ranking
  permissioning
  lifecycle
  audit
  forgetting
```

---

# 2. Главный принцип

```text
Не строить одну “память”.
Строить несколько типов памяти с разными правилами.
```

Плохая модель:

```text
Все складываем в vector DB.
Потом ищем похожее.
```

Хорошая модель:

```text
Session Memory       — что происходит сейчас
Case Memory          — память текущего дела
Project Memory       — устойчивое знание проекта
User Memory          — предпочтения пользователя
Domain Memory        — знания доменного пакета
Artifact Memory      — созданные документы и решения
Operational Memory   — события, approvals, действия
External Memory      — подключенные системы: email, CRM, docs, repo
Semantic Memory      — факты и обобщения
Episodic Memory      — история конкретных эпизодов
Procedural Memory    — как выполнять процессы
Policy Memory        — правила и ограничения
```

---

# 3. Типы памяти

## 3.1 Session Memory

Краткосрочная память текущего диалога или runtime-потока.

Содержит:

```text
последние сообщения
активный сценарий
выбранный workflow
текущее состояние execution
активные gates
текущие outputs агентов
```

Хранение:

```text
in-memory
SQLite
Redis
LangGraph checkpointer
JSONL events
```

Для workflow-based исполнения очень полезен подход checkpointer-а: сохранять состояние графа после каждого шага, чтобы можно было продолжить выполнение после паузы, ошибки или approval. LangGraph именно так использует checkpointers для short-term/thread-level persistence. ([Документация LangChain][2])

---

## 3.2 Case Memory

Память конкретной задачи / дела.

Это центральный тип памяти для “Мистера Вульфа”.

Пример:

```text
.wolf/state/cases/2026-04-28-nda-preparation/
  case.yaml
  context.md
  events.jsonl
  selected-workflow.yaml
  task-graph.yaml
  approvals.jsonl
  artifacts/
    nda-draft.md
    risk-notes.md
    email-draft.md
  summaries/
    case-summary.md
```

Case Memory отвечает за воспроизводимость:

```text
что запросил пользователь
какой сценарий был выбран
какой контекст использовался
какие агенты были вызваны
какие tools запускались
какие approvals были получены
какие артефакты созданы
какой финальный результат
```

Это должно быть **файловым и человекочитаемым** хотя бы частично. Даже если backend — база данных, в проекте должен быть экспортируемый audit trail.

---

## 3.3 Project Memory

Долгосрочная память проекта.

Для разработки:

```text
архитектурные решения
принятые conventions
важные файлы
история refactorings
известные ограничения
технический долг
предпочитаемые workflow
```

Для офиса:

```text
шаблоны писем
ключевые клиенты
стиль коммуникации
регулярные встречи
внутренние процессы
```

Для юридических задач:

```text
шаблоны договоров
типовые риски
юрисдикции
предпочтительные clause positions
история согласований
```

Project Memory должна быть версионируемой:

```text
.wolf/memory/project/
  profile.md
  decisions/
  patterns/
  glossary.md
  constraints.md
  preferences.md
  memory-index.json
```

Важное правило: **Project Memory не должна автоматически загрязняться всем подряд**. Запись в нее должна проходить через memory policy.

---

## 3.4 User Memory

Память о предпочтениях пользователя.

Примеры:

```text
предпочитает краткие ответы
не любит автодействия без подтверждения
использует ADR вместо specs
предпочитает локальные модели для приватных задач
в письмах предпочитает сухой деловой стиль
```

Это чувствительный тип памяти. Нужно:

```text
явное подтверждение для сохранения
возможность просмотра
возможность редактирования
возможность удаления
разделение personal / project-specific preferences
```

Структура:

```text
.wolf/memory/user/
  preferences.yaml
  communication-style.md
  tool-permissions.yaml
```

Но для персональной памяти лучше поддерживать внешний backend вроде Mem0/Zep, если задача — кросс-проектная персонализация. Mem0 как раз ориентирован на запоминание preferences и адаптацию ассистентов под пользователя. ([GitHub][1])

---

## 3.5 Domain Memory

Память доменного пакета.

Например, пакет `legal-ops` может иметь:

```text
типовые структуры legal memo
список рисков для contract review
шаблоны clause matrix
ограничения: не давать final legal advice
```

Пакет `office-assistant`:

```text
шаблоны meeting brief
стандарты follow-up email
правила inbox triage
```

Пакет `software-engineering`:

```text
coding workflow
review checklist
ADR templates
security checklist
```

Это не память конкретного пользователя, а **знание пакета**.

Структура:

```text
packs/legal-ops/memory/
  risk-taxonomy.yaml
  memo-patterns.md
  clause-types.yaml

packs/office-assistant/memory/
  email-styles.md
  meeting-brief-template.md
```

---

## 3.6 Artifact Memory

Память через артефакты.

Для “Мистера Вульфа” это очень важно: не все нужно превращать в embedding. Часто лучший memory object — это документ.

```text
ADR
Spec
ADL
Meeting Brief
Risk Register
Itinerary
Decision Log
Clause Matrix
Research Report
```

Artifact Memory должна быть структурированной:

```yaml
id: adr-004
type: ADR
title: Use event-driven architecture for billing
status: accepted
created_at: 2026-04-28
scope:
  project: billing-platform
tags:
  - architecture
  - billing
  - async
links:
  supersedes: adr-001
  related:
    - adl-billing-context
```

Это дает точный retrieval:

```text
найди все accepted ADR по billing
найди последний risk register по этому клиенту
найди meeting brief по этой встрече
```

Такую память лучше хранить в файловой системе + индексировать в SQL/vector/graph.

---

## 3.7 Operational Memory

Это не “знания”, а журнал действий.

```text
events.jsonl
tool calls
approvals
denials
model choices
costs
latency
errors
fallbacks
```

Пример:

```json
{
  "event": "tool.executed",
  "case_id": "case_123",
  "tool": "calendar.create_event",
  "risk": "external_modify",
  "approval_id": "approval_456",
  "status": "success",
  "timestamp": "2026-04-28T12:01:00Z"
}
```

Operational Memory нужна для:

```text
audit
debugging
security
compliance
observability
postmortem
billing
```

Ее не надо пихать в LLM context. Ее надо использовать для контроля и анализа.

---

## 3.8 Semantic Memory

Извлеченные устойчивые факты.

Примеры:

```text
“В этом проекте используется ADR-first подход.”
“Для auth changes требуется security review.”
“Пользователь предпочитает approvals перед external actions.”
“Клиент Acme просит weekly reports по пятницам.”
```

Semantic Memory можно хранить в:

```text
Mem0
Zep
vector DB
knowledge graph
SQL facts table
```

Тут уже полезны готовые решения. Zep делает акцент на temporal knowledge graph и domain-specific entity/relationship models, что особенно полезно для business-domain памяти, где важны связи и изменения во времени. ([arXiv][3])

---

## 3.9 Episodic Memory

Память об эпизодах:

```text
прошлая поездка в Стамбул
прошлая встреча с клиентом
прошлый contract review
прошлая архитектурная дискуссия
```

Это полезно для:

```text
“как мы делали в прошлый раз?”
“какие решения уже принимались?”
“что произошло в предыдущей сессии?”
```

Хранить лучше как:

```text
case summaries
event logs
artifact links
semantic summaries
```

---

## 3.10 Procedural Memory

Память о том, **как выполнять процессы**.

Например:

```text
как готовить meeting brief
как проводить contract review
как оформлять ADR
как запускать release checklist
```

Но в твоей архитектуре это лучше хранить не как “память”, а как:

```text
workflows
skills
playbooks
domain packs
```

То есть procedural memory = конфигурация и пакеты.

---

# 4. Многоуровневая структура хранения

Я бы предложил такую структуру:

```text
.wolf/
  memory/
    user/
      preferences.yaml
      communication-style.md
      permissions.yaml

    project/
      profile.md
      glossary.md
      constraints.md
      decisions/
      patterns/
      summaries/
      memory-index.json

    domain/
      enabled-packs.yaml
      overrides/

    semantic/
      facts.jsonl
      embeddings/
      graph/

  state/
    cases/
      {case_id}/
        case.yaml
        context.md
        selected-route.json
        selected-workflow.yaml
        task-graph.yaml
        events.jsonl
        approvals.jsonl
        artifacts/
        summaries/

    sessions/
      {session_id}/
        transcript.jsonl
        short-term-state.json

  artifacts/
    adr/
    specs/
    reports/
    legal/
    office/
    travel/

  indexes/
    sqlite.db
    vector/
    graph/
```

Важно: `.wolf/memory` и `.wolf/state` — разные вещи.

```text
memory — устойчивое знание
state  — ход выполнения
```

---

# 5. Что хранить, а что не хранить

## Хранить

```text
явные предпочтения пользователя
проектные решения
принятые правила
важные ограничения
созданные артефакты
сводки завершенных Case
approved facts
workflow outcomes
часто используемые паттерны
```

## Не хранить автоматически

```text
сырые длинные диалоги целиком как “память”
случайные догадки модели
одноразовые детали
чувствительные данные без политики
секреты, токены, пароли
персональные данные без необходимости
неподтвержденные юридические/медицинские выводы
```

Ключевой принцип:

```text
Memory write should be intentional.
```

То есть агент не должен сам молча превращать все в долгосрочную память.

---

# 6. Memory lifecycle

Память должна иметь жизненный цикл.

```text
capture → extract → validate → classify → store → retrieve → use → decay/archive/delete
```

## 6.1 Capture

Система замечает потенциально полезную информацию:

```text
из диалога
из артефакта
из approval
из завершенного workflow
из документа
из внешней системы
```

## 6.2 Extract

LLM или rule extractor выделяет кандидаты:

```json
{
  "type": "preference",
  "subject": "user",
  "content": "User prefers ADR-first workflow for architecture decisions",
  "confidence": 0.91,
  "source": "case_123/context.md"
}
```

## 6.3 Validate

Проверка:

```text
это факт или догадка?
нужен ли approval?
не является ли это sensitive?
есть ли конфликт с существующей памятью?
```

## 6.4 Classify

Куда положить:

```text
user memory
project memory
case memory
domain memory
artifact index
semantic facts
```

## 6.5 Store

Запись с metadata.

## 6.6 Retrieve

Не просто semantic search, а policy-aware retrieval.

## 6.7 Use

Вставка в context только если:

```text
релевантно
разрешено
не устарело
не конфликтует
подходит к текущему домену
```

## 6.8 Decay / Archive / Delete

Память должна стареть.

```yaml
memory_retention:
  session:
    ttl: 30d
  case:
    ttl: 1y
  project_decisions:
    ttl: permanent
  user_preferences:
    ttl: until_deleted
  raw_transcripts:
    ttl: 30d
  sensitive_extracted_facts:
    ttl: 7d
```

---

# 7. Memory object schema

Нужен единый формат memory item.

```yaml
id: mem_01HX...
type: preference | fact | decision | constraint | summary | artifact_ref | event_ref
scope:
  user: user_123
  project: project_abc
  domain: software-engineering
  case: case_456
content: 'For architecture decisions, use ADR-first workflow.'
source:
  kind: artifact
  uri: '.wolf/state/cases/case_456/artifacts/adr-001.md'
confidence: 0.95
status: active
visibility:
  allowed_domains:
    - software-engineering
  allowed_agents:
    - architect
    - planner
sensitivity: normal
valid_from: 2026-04-28
valid_until: null
tags:
  - workflow
  - architecture
created_at: 2026-04-28T12:00:00Z
updated_at: 2026-04-28T12:00:00Z
```

Для юридических/финансовых/HR-доменов metadata обязательна:

```text
source
confidence
jurisdiction
owner
expiry
review_status
```

---

# 8. Retrieval: как доставать память

Плохой вариант:

```text
берем top-10 похожих chunks из vector DB
```

Лучший вариант — staged retrieval:

```text
1. Scope filter
2. Policy filter
3. Structural retrieval
4. Semantic retrieval
5. Graph retrieval
6. Recency/authority ranking
7. Conflict detection
8. Context compression
```

## 8.1 Scope filter

Сначала определить область:

```text
текущий пользователь
текущий проект
текущий домен
текущий Case
текущая команда
```

## 8.2 Policy filter

Можно ли использовать эту память?

```text
не приватная ли она?
не из другого клиента?
не запрещена ли для текущего агента?
не требует ли approval?
```

## 8.3 Structural retrieval

Сначала точные источники:

```text
accepted ADR
project constraints
user preferences
active workflow policy
current case context
```

## 8.4 Semantic retrieval

Потом embedding search.

## 8.5 Graph retrieval

Если есть entity relationships:

```text
клиент → договоры → риски → прошлые решения
сервис → ADR → incident → owner
пользователь → предпочтения → прошлые бронирования
```

Zep/Graphiti-подход здесь особенно уместен для business-domain и temporal reasoning, где важно “кто с кем связан” и “что изменилось со временем”. ([arXiv][3])

## 8.6 Conflict detection

Например:

```text
старое правило: используем specs
новое правило: используем ADR-first
```

Система должна не молча выбрать случайное, а поднять конфликт или применить precedence.

---

# 9. Precedence памяти

Нужно правило приоритетов.

```text
Current user instruction
  > Current case policy
  > Project policy
  > Domain pack policy
  > User memory
  > Project memory
  > Historical case summaries
  > General semantic memory
```

Для разработки:

```text
текущий запрос
  > текущий plan/spec
  > accepted ADR
  > project conventions
  > прошлые summaries
```

Для юридического домена:

```text
текущий документ
  > текущая юрисдикция
  > approved legal playbook
  > прошлые похожие cases
  > general legal checklist
```

---

# 10. Нужно ли делать свое решение

## Делать свое полностью — нет

Не стоит на старте писать собственный:

```text
vector DB
embedding pipeline
graph database
memory ranking engine уровня Mem0/Zep
distributed memory service
```

Это отдельный продукт.

## Делать свое обязательно — да, но на уровне abstraction

Нужно писать собственный:

```text
Memory API
Memory Policy
Memory Lifecycle
Memory Router
Memory Scopes
Memory Schemas
Memory Audit
Memory Backend Adapters
```

То есть:

```text
Не свой storage engine.
А свой Memory Control Plane.
```

---

# 11. Рекомендуемая архитектура memory subsystem

```text
MemoryManager
  ├── MemoryPolicyEngine
  ├── MemoryRouter
  ├── MemoryExtractor
  ├── MemoryValidator
  ├── MemoryStore
  │     ├── FileMemoryBackend
  │     ├── SQLiteBackend
  │     ├── VectorBackend
  │     ├── GraphBackend
  │     ├── Mem0Backend
  │     ├── ZepBackend
  │     └── LangGraphStoreBackend
  ├── MemoryRetriever
  ├── MemoryRanker
  ├── MemoryCompressor
  ├── MemoryAuditor
  └── MemoryGarbageCollector
```

API:

```ts
interface MemoryBackend {
  put(item: MemoryItem): Promise<void>;
  get(id: string): Promise<MemoryItem | null>;
  search(query: MemoryQuery): Promise<MemoryResult[]>;
  delete(id: string): Promise<void>;
  update(id: string, patch: Partial<MemoryItem>): Promise<void>;
}

interface MemoryManager {
  remember(candidate: MemoryCandidate, ctx: RuntimeContext): Promise<MemoryDecision>;
  recall(query: MemoryQuery, ctx: RuntimeContext): Promise<MemoryBundle>;
  forget(selector: MemorySelector, ctx: RuntimeContext): Promise<void>;
}
```

---

# 12. Какие готовые решения использовать

## 12.1 Files + SQLite

Лучший старт.

Использовать для:

```text
case state
events
approvals
artifact index
project memory
small installations
local-first workflow
```

Плюсы:

```text
просто
прозрачно
легко версионировать
легко дебажить
не нужен сервер
```

Минусы:

```text
нет сильного semantic retrieval
нет нормального graph reasoning
ограничения по командам/масштабу
```

Рекомендация: **обязательно сделать File/SQLite backend как baseline**.

---

## 12.2 Vector DB

Использовать для:

```text
semantic search по документам
поиск похожих кейсов
retrieval из длинных context docs
```

Варианты:

```text
Qdrant
Weaviate
Chroma
pgvector
LanceDB
Milvus
```

Не использовать vector DB как единственную память.

---

## 12.3 Mem0

Хорошо подходит для:

```text
user preferences
assistant personalization
cross-session semantic memory
consumer assistants
concierge
office assistant
personal productivity
```

Mem0 описывает себя как memory layer для AI-приложений и агентов, который сжимает историю в оптимизированные memory representations и поддерживает self-hosted open-source вариант для контроля данных. ([GitHub][1])

Для “Мистера Вульфа” Mem0 можно подключить как backend:

```yaml
memory:
  backends:
    user_semantic:
      type: mem0
      scope: user
```

---

## 12.4 Zep

Хорошо подходит для:

```text
business agents
CRM-like memory
sales assistant
legal operations
office workflows
enterprise context
temporal relationships
entity graph
```

Zep делает акцент на unified Context Graph, доменных entity types/relationship models и temporal knowledge graph architecture, что подходит для задач, где память — это не просто похожие заметки, а сеть сущностей и событий. ([getzep.com][4])

Пример:

```yaml
memory:
  backends:
    business_graph:
      type: zep
      scope:
        - organization
        - customer
        - case
```

---

## 12.5 LangGraph Store / Checkpointer

Хорошо подходит, если workflow engine будет на LangGraph или похожей graph-runtime модели.

Использовать для:

```text
thread state
workflow checkpoints
resume after gate
long-term key-value store
stateful agents
```

LangGraph официально разделяет short-term memory как часть agent state и long-term memory как user/application-level data across sessions. ([Документация LangChain][2])

---

## 12.6 Graph DB

Если не использовать Zep, можно использовать:

```text
Neo4j
Kuzu
ArangoDB
Postgres graph-like schema
Graphiti
```

Полезно для:

```text
архитектурные зависимости
юридические сущности
организации и контакты
продукты и клиенты
решения и последствия
```

---

# 13. Разные проекты — разная память

## 13.1 Software engineering

Память:

```text
Project Memory
Artifact Memory
Case Memory
Operational Memory
```

Хранение:

```text
файлы + git
SQLite index
vector index по docs/code summaries
graph для architecture dependencies
```

Что помнить:

```text
accepted ADR
coding conventions
known constraints
testing strategy
previous incidents
module ownership
```

Что не надо:

```text
весь raw code в long-term memory
все сообщения агента
каждую временную гипотезу
```

Особенно важно: memory должна быть привязана к commit/hash.

```yaml
source:
  repo: my-service
  commit: abc123
  path: docs/adr/004.md
```

Иначе агент будет вспоминать устаревшую архитектуру.

---

## 13.2 Office assistant

Память:

```text
User Memory
Organization Memory
Case Memory
Contact Memory
Artifact Memory
```

Хранение:

```text
Mem0 для пользовательских preferences
Zep или graph для contacts/accounts/interactions
Gmail/Calendar/Docs как external source of truth
local summaries для case memory
```

Что помнить:

```text
стиль писем
частые контакты
регулярные встречи
предпочитаемые форматы отчетов
обещания и action items
```

Что не хранить без разрешения:

```text
личные письма целиком
чувствительные контакты
финансовые документы
медицинские/HR-детали
```

---

## 13.3 Concierge

Память:

```text
User Preference Memory
Trip History
Vendor/Option Memory
Case Memory
```

Хранение:

```text
Mem0 для предпочтений
vector/SQL для прошлых itineraries
external tools для актуальных цен/доступности
```

Что помнить:

```text
любимые форматы поездок
ограничения бюджета
предпочтения по еде/транспорту
нежелательные варианты
прошлые поездки
```

Что не полагаться на память:

```text
цены
наличие билетов
расписания
визовые правила
```

Это всегда нужно проверять fresh через tools/web.

---

## 13.4 Legal ops

Память:

```text
Matter Memory
Document Memory
Risk Memory
Clause Memory
Policy Memory
Expert Review Memory
```

Хранение:

```text
файлы + structured artifact store
graph для parties/contracts/clauses/risks
Zep-like temporal graph для evolving matters
strict audit logs
```

Что помнить:

```text
какие позиции уже согласованы
какие риски отмечены
какие вопросы переданы юристу
какие версии документа анализировались
```

Что не делать:

```text
не превращать предварительный вывод LLM в финальную правовую позицию
не смешивать данные разных клиентов
не использовать старую юрисдикционную информацию без проверки
```

Здесь обязательны:

```text
source attribution
expert-review status
jurisdiction metadata
confidentiality labels
retention policy
```

---

## 13.5 Research assistant

Память:

```text
Research Corpus Memory
Citation Memory
Hypothesis Memory
Source Quality Memory
Project Memory
```

Хранение:

```text
artifact store
vector DB
citation graph
source metadata DB
```

Что помнить:

```text
какие источники изучены
какие выводы сделаны
какие гипотезы подтверждены/отклонены
качество источников
```

Ключевое: память должна отделять:

```text
source facts
model interpretation
user conclusion
open question
```

---

# 14. Memory policies

Нужен отдельный `memory.yaml`.

Пример:

```yaml
memory:
  default_write_policy: ask_for_long_term

  scopes:
    session:
      backend: sqlite
      retention: 30d
      auto_write: true

    case:
      backend: file
      retention: 1y
      auto_write:
        - workflow_state
        - artifacts
        - approvals
        - final_summary

    project:
      backend: file_sqlite
      retention: permanent
      auto_write: false
      write_requires:
        - user_approval
        - source_artifact

    user:
      backend: mem0
      retention: until_deleted
      auto_write: false
      write_requires:
        - explicit_user_consent

    business_graph:
      backend: zep
      retention: policy_defined
      enabled_for:
        - office-assistant
        - legal-ops
        - sales-assistant

  sensitive:
    secrets:
      store: never
    personal_data:
      store: ask
    legal_conclusions:
      store: expert_review_only
```

---

# 15. Memory write gates

Должны быть отдельные gates на запись в память.

Например:

```text
“Сохранить это как предпочтение для будущих задач?”
“Записать это как проектное правило?”
“Обновить memory: этот клиент предпочитает PDF-отчеты?”
“Зафиксировать это решение как ADR memory?”
```

Не надо спрашивать на каждую мелочь. Нужно спрашивать для:

```text
user preferences
long-term project rules
sensitive business facts
legal/financial/HR facts
cross-case memory
```

Для обычного Case Memory можно писать автоматически.

---

# 16. Memory visibility

Каждая память должна иметь область видимости.

```yaml
visibility:
  scope: user | project | workspace | organization | domain | case
  allowed_agents:
    - planner
    - office_assistant
  denied_agents:
    - external_a2a_agent
  allowed_tools:
    - context_retriever
  exportable: false
```

Особенно важно для A2A.

Remote agent не должен получать всю память. Он должен получать только memory bundle, разрешенный policy.

```text
Wolf Agent → Memory Policy → Safe Memory Bundle → External Agent
```

---

# 17. Memory bundle

Агент не должен напрямую ходить во всю память.

Он должен получать `MemoryBundle`.

```yaml
memory_bundle:
  case:
    summary: ...
    active_constraints: ...
  project:
    relevant_decisions:
      - adr-004
      - adr-009
  user:
    preferences:
      - concise_updates
      - approval_before_external_send
  domain:
    checklist:
      - contract_review_basic
  exclusions:
    - hidden_sensitive_notes
```

Это дает контроль и объяснимость.

---

# 18. Memory as context vs memory as control

Разделить два применения памяти.

## Memory as context

То, что идет в prompt:

```text
пользователь предпочитает краткий стиль
в проекте используется ADR-first
последний meeting brief
```

## Memory as control

То, что влияет на runtime:

```text
для этого клиента нельзя отправлять email без approval
для legal domain требуется expert review
для production changes запрещен autonomous mode
```

Control memory должна быть структурированной и проверяться Policy Engine, а не просто вставляться в prompt.

---

# 19. Возможные ошибки

## Ошибка 1: считать vector DB памятью

Vector DB — это retrieval backend, не memory system.

## Ошибка 2: хранить все

Чем больше мусора, тем хуже агент.

## Ошибка 3: не различать source и inference

```text
Source: договор содержит пункт X.
Inference: пункт X может быть риском.
```

Это разные вещи.

## Ошибка 4: нет политики забывания

Без forgetting память быстро становится токсичной.

## Ошибка 5: память без audit

Для office/legal/business это неприемлемо.

## Ошибка 6: память попадает внешним агентам без фильтра

A2A требует strict memory boundary.

---

# 20. Что делать в MVP

Я бы начал так:

## MVP Memory 1: File + SQLite

```text
Case Memory
Project Memory
Artifact Index
Event Log
Approval Log
```

Структура:

```text
.wolf/
  memory/
    user/preferences.yaml
    project/profile.md
    project/decisions/
  state/
    cases/{case_id}/
      context.md
      events.jsonl
      approvals.jsonl
      artifacts/
      summary.md
  indexes/wolf.sqlite
```

Этого достаточно для dev, office-lite, research-lite.

---

## MVP Memory 2: Memory API

```ts
memory.remember();
memory.recall();
memory.forget();
memory.summarizeCase();
memory.buildBundle();
```

Без привязки к конкретному backend.

---

## MVP Memory 3: Memory Policies

```yaml
memory:
  project:
    write: ask
  case:
    write: auto
  user:
    write: explicit_consent
  sensitive:
    store: never
```

---

## MVP Memory 4: Vector Backend

Добавить semantic search по:

```text
case summaries
artifacts
docs
project memory
```

---

## MVP Memory 5: External Backend Adapters

Добавить адаптеры:

```text
Mem0Backend
ZepBackend
LangGraphStoreBackend
```

Так фреймворк не становится конкурентом Mem0/Zep, а умеет использовать их.

---

# 21. Итоговая рекомендация

Не делай собственную “память” как монолит.

Делай:

```text
Memory Control Plane
```

То есть собственные:

```text
типы памяти
schemas
scopes
policies
lifecycle
audit
retrieval pipeline
memory bundle builder
backend adapters
```

А хранение и retrieval можно подключать:

```text
File/SQLite для локального состояния и прозрачности
Vector DB для semantic search
Mem0 для персональной cross-session памяти
Zep для business/domain graph memory
LangGraph checkpointer/store для graph workflow state
Graph DB для сложных entity relationships
```

Самая короткая формула:

```text
Memory is not storage.
Memory is governed context.
```

Для “Мистера Вульфа” это особенно важно: агент не просто “помнит”, а **помнит с областью видимости, источником, правами, сроком жизни и правилами использования**.

[1]: https://github.com/mem0ai/mem0?utm_source=chatgpt.com 'GitHub - mem0ai/mem0: Universal memory layer for AI Agents'
[2]: https://docs.langchain.com/oss/python/langgraph/add-memory?utm_source=chatgpt.com 'Memory - Docs by LangChain'
[3]: https://arxiv.org/abs/2501.13956?utm_source=chatgpt.com 'Zep: A Temporal Knowledge Graph Architecture for Agent Memory'
[4]: https://www.getzep.com/?utm_source=chatgpt.com 'Context Engineering & Agent Memory Platform for AI Agents - Zep'

---

# Вопрос

Как агент понимает в рантайм что и когда и куда надо сохранить или извлечь? 2. Найди проекты которые можно взять за основу для начала

# Ответ

## 1. Как агент в runtime понимает, что и когда сохранять или извлекать

Нужен не один “модуль памяти”, а **Memory Decision Loop** внутри runtime. Агент не должен напрямую решать “положу это в память”. Он должен проходить через слой политики памяти.

Общая схема:

```text
User Request / Runtime Event
  ↓
Memory Trigger Detector
  ↓
Memory Policy Engine
  ↓
Memory Router
  ↓
Memory Extractor / Retriever
  ↓
Memory Store / Memory Bundle
  ↓
Agent Context / Workflow State
```

То есть память работает в двух направлениях:

```text
Recall path  — что достать из памяти перед действием
Write path   — что сохранить после события или результата
```

---

# A. Когда извлекать память

Агент должен извлекать память не “всегда”, а в определенных точках workflow.

## Основные точки recall

```text
1. При создании Case
2. При определении сценария
3. Перед выбором workflow
4. Перед сборкой runtime
5. Перед запуском агента
6. Перед risky action
7. Перед gate / approval
8. Перед финальным ответом
```

Например:

```text
Пользователь: “Подготовь NDA для нового подрядчика”
```

Runtime делает recall:

```text
Case creation:
  - есть ли похожие прошлые NDA cases?
  - есть ли project/client preferences?

Scenario routing:
  - это legal_ops + office_assistant?
  - какой workflow обычно используется?

Policy resolution:
  - нужны ли legal gates?
  - можно ли создавать документы без approval?

Agent execution:
  - какие шаблоны NDA использовать?
  - какие clause positions приняты?

Before action:
  - можно ли отправить письмо?
  - можно ли создать calendar event?

Final response:
  - какие артефакты созданы?
  - что нужно сохранить как summary?
```

---

## Recall trigger должен быть декларативным

Пример:

```yaml
memory_recall:
  - on: case.created
    recall:
      - user.preferences
      - project.constraints
      - domain.active_policies

  - on: scenario.resolved
    recall:
      - previous_cases.similar
      - workflow_preferences
      - artifact_patterns

  - on: workflow.step.before
    when:
      step.agent: legal_assistant
    recall:
      - legal.matter_memory
      - contract_review_patterns
      - client_clause_preferences

  - on: tool.before
    when:
      action.type: external_send
    recall:
      - user.approval_preferences
      - recipient_history
      - communication_style
```

Так агент “понимает” не через магию, а через **event-driven memory policy**.

---

# B. Когда сохранять память

Сохранение тоже должно происходить по событиям.

## Основные точки write

```text
1. После создания Case
2. После выбора scenario/workflow
3. После создания артефакта
4. После approval / denial
5. После завершения workflow step
6. После завершения Case
7. После явной команды пользователя “запомни”
8. После обнаружения устойчивого preference/fact/decision
```

Пример:

```yaml
memory_write:
  - on: artifact.created
    when:
      artifact.type: ADR
      artifact.status: accepted
    write_to:
      - project.decisions
      - artifact_index

  - on: gate.approved
    when:
      gate.type: user_approval
    write_to:
      - case.approvals
      - operational_log

  - on: case.completed
    write_to:
      - case.summary
      - project.history
    extract:
      - durable_decisions
      - reusable_patterns
      - unresolved_questions

  - on: user.says_remember
    write_to:
      - user.memory
    require:
      - explicit_consent
```

---

# C. Что именно сохранять

Нужно различать **сырые события**, **артефакты**, **выводы**, **факты**, **предпочтения**, **правила**.

## 1. Raw event

```json
{
  "event": "tool.executed",
  "tool": "calendar.create_event",
  "case_id": "case_123",
  "status": "success",
  "timestamp": "2026-04-28T12:00:00Z"
}
```

Хранится в `events.jsonl`. Это audit/state, не semantic memory.

## 2. Artifact reference

```yaml
type: artifact_ref
artifact_type: ADR
path: docs/adr/004-use-event-bus.md
status: accepted
```

Это индекс артефактов.

## 3. Durable fact

```yaml
type: fact
content: 'Project uses ADR-first workflow for architecture decisions.'
source: '.wolf/artifacts/adr/004.md'
confidence: high
scope: project
```

Это semantic/project memory.

## 4. User preference

```yaml
type: preference
content: 'User prefers approval before external sends.'
scope: user
write_policy: explicit_consent
```

Это user memory.

## 5. Policy-relevant memory

```yaml
type: constraint
content: 'Legal documents require expert review before final recommendation.'
scope: domain
enforced_by: policy_engine
```

Это уже не просто context, а control memory.

---

# D. Кто принимает решение о записи

Не основной LLM напрямую.

Нужна цепочка:

```text
Runtime Event
  ↓
Memory Candidate Extractor
  ↓
Memory Classifier
  ↓
Memory Policy Engine
  ↓
Memory Validator
  ↓
Memory Router
  ↓
Backend Adapter
```

## Memory Candidate Extractor

Выделяет кандидаты:

```json
{
  "candidate_type": "project_preference",
  "content": "Use ADR instead of specs for architectural changes.",
  "source": "user_message",
  "confidence": 0.88
}
```

## Memory Classifier

Определяет тип:

```text
user_preference?
project_rule?
case_summary?
domain_fact?
artifact_ref?
sensitive_data?
```

## Memory Policy Engine

Решает:

```text
store automatically
ask user
require expert review
store only in case memory
do not store
```

## Memory Validator

Проверяет:

```text
есть ли источник?
не конфликтует ли с existing memory?
не является ли это догадкой?
не sensitive ли это?
```

## Memory Router

Выбирает место:

```text
case memory
project memory
user memory
domain memory
artifact index
semantic store
graph store
operational log
```

---

# E. Минимальная логика принятия решения

Пример правил:

```yaml
memory_policies:
  case:
    auto_store:
      - workflow_state
      - tool_events
      - approvals
      - artifacts
      - final_summary

  project:
    store:
      - accepted_decisions
      - approved_rules
      - reusable_patterns
    require_approval:
      - new_project_policy
      - coding_convention
      - architecture_preference

  user:
    require_explicit_consent:
      - preference
      - personal_profile
      - communication_style

  domain:
    package_owned: true
    project_override_allowed: true

  sensitive:
    never_store:
      - secrets
      - tokens
      - passwords
    require_special_policy:
      - legal_conclusion
      - medical_data
      - HR_data
      - financial_sensitive_data
```

---

# F. Как память попадает в prompt

Агент не должен получать всю память. Он получает **Memory Bundle**.

```yaml
memory_bundle:
  case:
    summary: 'Preparing NDA for contractor Acme.'
    active_artifacts:
      - nda_draft.md
      - risk_notes.md

  project:
    constraints:
      - 'External emails require approval.'
      - 'Legal documents require expert review.'

  user:
    preferences:
      - 'Prefers concise updates.'
      - 'Wants approval before external actions.'

  domain:
    playbook:
      - 'Contract review must produce clause matrix and risk register.'

  excluded:
    - 'raw email contents not relevant'
    - 'sensitive notes denied by policy'
```

Memory Bundle строит не агент, а `MemoryBundleBuilder`:

```text
query → retrieve → policy filter → rank → compress → bundle
```

---

# G. Практический runtime-алгоритм

```ts
async function runCase(input) {
  const caseCtx = await caseManager.open(input);

  const initialMemory = await memory.recall({
    event: 'case.created',
    input,
    scopes: ['user', 'project', 'domain', 'similar_cases'],
  });

  const scenario = await scenarioRouter.resolve(input, initialMemory);

  const policy = await policyEngine.resolve({
    input,
    scenario,
    memory: initialMemory,
  });

  const workflow = await workflowResolver.select({
    scenario,
    policy,
    memory: initialMemory,
  });

  await memory.remember({
    event: 'workflow.selected',
    data: { scenario, workflow, policy },
    scope: 'case',
  });

  for (const step of workflow.steps) {
    const stepMemory = await memory.recall({
      event: 'workflow.step.before',
      step,
      caseCtx,
      policy,
    });

    const result = await executor.runStep(step, {
      caseCtx,
      memory: stepMemory,
      policy,
    });

    await memory.remember({
      event: 'workflow.step.after',
      result,
      caseCtx,
      policy,
    });
  }

  const summary = await summarizer.summarizeCase(caseCtx);

  await memory.remember({
    event: 'case.completed',
    data: summary,
    caseCtx,
    policy,
  });

  return resultAggregator.final(caseCtx);
}
```

---

# H. Самая важная идея

```text
Агент не “сам помнит”.
Агент работает внутри memory-aware runtime.
```

То есть решение о памяти должно приниматься не только LLM-ом, а связкой:

```text
events + policies + schemas + extractors + validators + storage adapters
```

---

# 2. Какие проекты можно взять за основу

Я бы разделил их на 5 категорий:

```text
1. Stateful agent runtime
2. Personal / semantic memory layer
3. Temporal graph memory
4. Workflow/checkpoint memory
5. Knowledge engine / document memory
```

---

## Shortlist

| Проект                          | Для чего брать                                     | Роль в “Мистере Вульфе”                        |
| ------------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| **Letta**                       | stateful agents, long-term memory, agent runtime   | прототип agent runtime с памятью               |
| **Mem0**                        | user preferences, semantic memory, personalization | backend для user/project semantic memory       |
| **Zep**                         | temporal business memory, entities, relationships  | backend для business/legal/office graph memory |
| **Graphiti**                    | open-source temporal knowledge graph               | graph memory engine                            |
| **LangGraph**                   | workflow checkpoints, resume, HITL                 | execution state / case runtime                 |
| **LangMem**                     | extraction, memory tools, prompt optimization      | memory tools + extraction layer                |
| **Cognee**                      | document/knowledge graph memory                    | knowledge engine для docs/research             |
| **LlamaIndex**                  | document indexes, RAG, structured retrieval        | retrieval layer для артефактов и docs          |
| **Qdrant / pgvector / LanceDB** | vector backend                                     | low-level semantic index                       |
| **SQLite + files**              | transparent local memory                           | baseline storage для MVP                       |

---

# 2.1 Letta

**Ссылка:** `https://github.com/letta-ai/letta`

Letta — хороший кандидат, если хочется начать с готовой идеи **stateful agents with persistent memory**. В описании проекта указано, что Letta предоставляет API и SDK для stateful agents, а также поддерживает skills и subagents; он model-agnostic. ([GitHub][1])

Что взять:

```text
- long-term memory как часть agent runtime
- transparent memory
- stateful agents
- agent API
- skills/subagents
- модель “агент живет между сессиями”
```

Как использовать в твоей архитектуре:

```text
Не брать Letta как весь фреймворк.
Изучить как reference для:
  - stateful agent object
  - memory visibility
  - agent lifecycle
  - memory-aware runtime
```

Для “Мистера Вульфа” Letta ближе всего к идее “агент не stateless”, но тебе все равно нужен свой слой policy/workflow/domain packs.

---

# 2.2 Mem0

**Ссылка:** `https://github.com/mem0ai/mem0`

Mem0 позиционируется как universal memory layer for AI agents; он фокусируется на сохранении предпочтений, адаптации ассистентов и continuous learning. ([GitHub][2])

Что взять:

```text
- user preference memory
- semantic memory
- memory extraction/update
- cross-session personalization
- backend для “что пользователь любит/предпочитает”
```

Где использовать:

```text
office assistant
concierge
personal productivity
support assistant
sales assistant
```

Пример интеграции:

```yaml
memory:
  backends:
    user_semantic:
      type: mem0
      scopes:
        - user
        - preference
        - personalization
```

Не стоит отдавать Mem0 всю память. Лучше использовать его как один backend за твоим `MemoryManager`.

---

# 2.3 Zep

**Ссылка:** `https://github.com/getzep/zep`

Zep полезен для business-memory сценариев. Его репозиторий описывает Zep как систему, powered by Graphiti, с temporal knowledge graph для relationship-aware context retrieval и state changes over time. ([GitHub][3])

Что взять:

```text
- temporal knowledge graph
- entity + relationship memory
- business context
- evolving facts
- relationships over time
```

Где использовать:

```text
legal ops
sales
office assistant
CRM-like memory
customer history
contract/matter memory
```

Пример:

```yaml
memory:
  backends:
    business_graph:
      type: zep
      scopes:
        - customer
        - organization
        - matter
        - contract
```

Zep особенно хорош там, где важно не просто “похожее воспоминание”, а связи:

```text
клиент → договор → риск → версия документа → юрист → согласованная позиция
```

---

# 2.4 Graphiti

**Ссылка:** `https://github.com/getzep/graphiti`

Graphiti — open-source framework для temporal context graphs. В описании указано, что он строит и запрашивает temporal context graphs для AI agents; также есть MCP server для Claude/Cursor-like клиентов. ([GitHub][4])

Что взять:

```text
- свой graph memory backend
- temporal facts
- valid_at / invalid_at
- incremental graph updates
- entity relationship retrieval
```

Когда брать Graphiti вместо Zep:

```text
если хочешь self-hosted graph engine
если хочешь контролировать graph memory
если Zep кажется слишком platform-level
если нужен MCP-compatible graph memory
```

Для “Мистера Вульфа” Graphiti можно использовать как backend для `GraphMemoryBackend`.

---

# 2.5 LangGraph

**Ссылки:**
`https://github.com/langchain-ai/langgraph`
`https://docs.langchain.com/oss/python/langgraph/persistence`

LangGraph важен не столько как “memory framework”, сколько как **workflow state / checkpoint engine**. Документация описывает persistence layer, который сохраняет graph state as checkpoints after each step, organized into threads; это нужно для human-in-the-loop workflows, time travel debugging и fault-tolerant execution. ([Документация LangChain][5])

Что взять:

```text
- checkpoint после каждого шага
- resume после gate
- thread-level state
- workflow graph execution
- human-in-the-loop persistence
```

Для “Мистера Вульфа” это почти идеальный reference для:

```text
Case State
Workflow State
Gate pause/resume
Execution Engine
```

Даже если не использовать LangGraph напрямую, его модель persistence стоит взять.

---

# 2.6 LangMem

**Ссылка:** `https://github.com/langchain-ai/langmem`

LangMem помогает агентам learn/adapt over time: extract important information from conversations, optimize behavior through prompt refinement, maintain long-term memory; он дает functional primitives и native integration with LangGraph storage. ([GitHub][6])

Что взять:

```text
- memory extraction tools
- search/manage memory tools
- prompt optimization from experience
- integration with LangGraph stores
```

Для твоего фреймворка LangMem интересен как reference для:

```text
MemoryExtractor
MemoryTools
MemoryCandidate pipeline
```

Особенно полезно для MVP, если ты строишь на LangGraph-подходе.

---

# 2.7 Cognee

**Ссылка:** `https://github.com/topoteretes/cognee`

Cognee описывает себя как open-source knowledge engine для AI agent memory: ingest data in any format, combine vector search + graph DB + cognitive science approaches, чтобы документы были searchable by meaning и connected by relationships. ([GitHub][7])

Что взять:

```text
- document ingestion
- knowledge graph over documents
- vector + graph retrieval
- research/document memory
```

Где использовать:

```text
research assistant
legal document corpus
company knowledge base
project documentation
long-lived artifact memory
```

Для “Мистера Вульфа” Cognee можно использовать как `KnowledgeMemoryBackend`.

---

# 2.8 LlamaIndex

**Ссылка:** `https://github.com/run-llama/llama_index`

LlamaIndex не является только memory-проектом, но полезен как retrieval/indexing слой для документов, артефактов и knowledge bases. Для “Мистера Вульфа” его логично рассматривать как backend для:

```text
artifact retrieval
document indexes
structured RAG
query engines
```

Если основной фокус — документы, отчеты, юридические материалы, research corpus, LlamaIndex может быть проще, чем писать retrieval самому.

---

# 2.9 Qdrant / pgvector / LanceDB

Это не memory systems, а storage backends.

Использовать для:

```text
semantic search
artifact embeddings
case summaries
project docs
```

Не использовать как “всю память”. Vector DB не решает:

```text
что сохранять
когда сохранять
кому можно читать
как забывать
как разрешать конфликты
как вести audit
```

---

# 3. Что взять за основу именно для начала

## Вариант A: Самый практичный MVP

```text
Files + SQLite
+ LangGraph-style checkpoints
+ LangMem-like extraction tools
+ optional Mem0 adapter
```

Стартовая архитектура:

```text
.wolf/state/cases/{case_id}/events.jsonl
.wolf/state/cases/{case_id}/context.md
.wolf/state/cases/{case_id}/artifacts/
.wolf/memory/project/*.md
.wolf/indexes/wolf.sqlite
```

Плюсы:

```text
быстро
прозрачно
легко дебажить
не зависишь от чужого сервиса
подходит для разработки и локальных проектов
```

Минусы:

```text
слабее semantic retrieval
нет graph memory
нужно самому писать MemoryManager
```

Это лучший первый шаг.

---

## Вариант B: Если делать agent runtime на готовой основе

```text
Letta as stateful agent reference/backend
+ собственный Workflow/Policy layer
```

Плюсы:

```text
готовая идея persistent agents
есть API/SDK
model-agnostic
есть skills/subagents
```

Минусы:

```text
может быть слишком opinionated
твой Wolf runtime все равно придется строить сверху
```

---

## Вариант C: Если основной фокус — офис, продажи, legal ops

```text
Zep или Graphiti
+ Files/SQLite для audit
+ Policy layer сверху
```

Плюсы:

```text
temporal graph
entity relationships
business context
хорошо для evolving facts
```

Минусы:

```text
сложнее MVP
нужно проектировать entity schemas
```

---

## Вариант D: Если основной фокус — персональный ассистент / консьерж

```text
Mem0
+ Files/SQLite Case Memory
+ Policy layer
```

Плюсы:

```text
user preferences
personalization
cross-session memory
```

Минусы:

```text
не заменяет workflow state и audit
не решает domain packs
```

---

## Вариант E: Если основной фокус — research / knowledge base

```text
Cognee или LlamaIndex
+ vector DB
+ artifact store
```

Плюсы:

```text
сильный document ingestion
retrieval по knowledge corpus
graph/vector hybrid
```

Минусы:

```text
это больше knowledge engine, чем operational memory
```

---

# 4. Моя рекомендация для “Мистера Вульфа”

Не брать один проект “за основу всего”. Сделать **свое ядро Memory Control Plane**, но с готовыми backend adapters.

## Базовый стек для MVP

```text
1. Filesystem
   - case state
   - artifacts
   - summaries
   - human-readable memory

2. SQLite
   - indexes
   - metadata
   - events
   - approvals
   - memory items

3. LangGraph-style checkpoint model
   - workflow state
   - pause/resume
   - gates

4. LangMem-inspired extraction
   - memory candidates
   - search/manage memory tools

5. Optional Mem0 adapter
   - user preferences
   - personalization
```

## Следующий уровень

```text
6. Graphiti or Zep adapter
   - temporal graph memory
   - business/legal/entity relationships

7. Cognee or LlamaIndex adapter
   - document/knowledge memory

8. Vector backend
   - Qdrant / pgvector / LanceDB
```

---

# 5. Как это вписать в архитектуру

```text
Wolf Agent
  ↓
MemoryManager
  ├── CaseMemory      → files + SQLite
  ├── StateMemory     → checkpoints
  ├── ProjectMemory   → files + SQLite + vector
  ├── UserMemory      → Mem0 adapter
  ├── BusinessMemory  → Zep / Graphiti adapter
  ├── KnowledgeMemory → Cognee / LlamaIndex adapter
  └── OperationalLog  → events.jsonl + SQLite
```

Главное: все backend-и должны быть заменяемыми.

```ts
interface MemoryBackend {
  put(item: MemoryItem): Promise<void>;
  get(id: string): Promise<MemoryItem | null>;
  search(query: MemoryQuery): Promise<MemoryResult[]>;
  update(id: string, patch: Partial<MemoryItem>): Promise<void>;
  delete(id: string): Promise<void>;
}
```

А над ними — твоя логика:

```text
MemoryPolicyEngine
MemoryRouter
MemoryExtractor
MemoryValidator
MemoryBundleBuilder
MemoryAuditor
```

---

# 6. Ответ на первый вопрос одной схемой

```text
Когда извлекать?
  По событиям workflow:
    case.created
    scenario.resolved
    workflow.selected
    step.before
    tool.before
    gate.before
    response.before

Когда сохранять?
  По событиям:
    artifact.created
    gate.approved
    tool.executed
    workflow.step.completed
    case.completed
    user.explicitly_requested_memory

Куда сохранять?
  Решает MemoryRouter:
    case memory
    project memory
    user memory
    domain memory
    semantic memory
    graph memory
    artifact index
    operational log

Можно ли сохранять?
  Решает MemoryPolicyEngine:
    auto
    ask
    require expert review
    store only locally
    deny
```

---

# 7. Финальный вывод

Для начала я бы не строил “свою Mem0/Zep”. Я бы строил:

```text
Wolf Memory Control Plane
```

То есть:

```text
свои типы памяти
свои политики
свои события
свои схемы
свой routing
свой audit
свой Memory Bundle
```

А хранение подключал бы готовое:

```text
Files + SQLite        — обязательно для MVP
LangGraph pattern     — для workflow state и gates
LangMem ideas/tools   — для extraction/search/manage memory
Mem0                  — для user semantic memory
Zep/Graphiti          — для temporal graph/business memory
Cognee/LlamaIndex     — для document knowledge memory
```

Именно так сохранится главная идея “Мистера Вульфа”: **логика управляется проектом и политиками, а не скрыта внутри чужого memory framework**.

[1]: https://github.com/letta-ai/letta?utm_source=chatgpt.com 'GitHub - letta-ai/letta: Letta is the platform for building stateful ...'
[2]: https://github.com/mem0ai/mem0?utm_source=chatgpt.com 'GitHub - mem0ai/mem0: Universal memory layer for AI Agents'
[3]: https://github.com/getzep/zep?utm_source=chatgpt.com 'GitHub - getzep/zep: Zep | Examples, Integrations, & More'
[4]: https://github.com/getzep/graphiti?utm_source=chatgpt.com 'GitHub - getzep/graphiti: Build Real-Time Knowledge Graphs for AI Agents'
[5]: https://docs.langchain.com/oss/python/langgraph/persistence?utm_source=chatgpt.com 'Persistence - Docs by LangChain'
[6]: https://github.com/langchain-ai/langmem?utm_source=chatgpt.com 'GitHub - langchain-ai/langmem'
[7]: https://github.com/topoteretes/cognee?utm_source=chatgpt.com 'GitHub - topoteretes/cognee: Knowledge Engine for AI Agent Memory in 6 ...'
