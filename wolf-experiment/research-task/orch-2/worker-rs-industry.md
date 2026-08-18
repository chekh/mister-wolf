# Обзор мультиагентных LLM-фреймворков: альтернативы схеме Mr. Wolf

**Дата:** 2026-08-18
**Источник:** официальные GitHub-репозитории и документация

---

## Сводка

Все рассмотренные фреймворки решают одну задачу — координацию нескольких LLM-агентов, — но через принципиально разные модели оркестрации. AutoGen и OpenAI Agents SDK ставят во главу угла диалог и передачу управления (handoffs/swarm); LangGraph — явный граф состояний с чекпоинтами; CrewAI — ролевые команды с менеджером (hierarchical process); MetaGPT — SOP-процесс по аналогии с программной компанией. Общего: поддержка human-in-the-loop, tools, распределённые модели (OpenAI/local). Различаются глубиной иерархии, механизмами памяти и изоляцией контекста. Ни один фреймворк из коробки не реализует трёхуровневую схему Wolf→Executor→Worker с файловой изоляцией; ближайшие аналоги — CrewAI hierarchical и LangGraph subgraphs.
---
--- 

## 1. AutoGen (Microsoft)

### Архитектура оркестрации

AutoGen — уровневая архитектура: Core API (Actor model) → AgentChat API → Extensions API.

Паттерны Teams: RoundRobinGroupChat, SelectorGroupChat, Swarm, MagenticOneGroupChat, DiGraph/GraphFlow.

> Источник: https://github.com/microsoft/autogen

AutoGen в **maintenance mode**. Преемник — Microsoft Agent Framework.

### Координация и контекст

- Core: Actor model, message passing, локальный/распределённый runtime.
- AgentChat: GroupChat — общий контекст. Swarm — полная история.
- Контекст не изолирован в GroupChat. Изоляция через кастомные Team.
- AgentTool — вызов агента как инструмента.

> Источник: https://github.com/microsoft/autogen

### Ограничения

- Maintenance mode — нет новых фич.
- Нет встроенной иерархии менеджер→исполнитель; DiGraph вручную.
- Риск бесконечных циклов (нет лимитов ходов).
- AutoGen Studio — не production-ready.

### Use cases

- Multi-agent chat patterns.
- Автономные команды (Magentic-One: web, code, files).
- Прототипирование + MCP-интеграция.

> Источник: https://github.com/microsoft/autogen
---

## 2. CrewAI

### Архитектура оркестрации

Две парадигмы:

1. **Crews** — команды с ролями. Process: Sequential (выход→вход) и Hierarchical (автоматический менеджер-агент делегирует задачи по возможностям).
2. **Flows** — event-driven воркфлоу (@start, @listen, @router), стейт, условное ветвление.

> Источник: https://github.com/crewAIInc/crewAI, https://docs.crewai.com/concepts/processes

### Координация и контекст

- Sequential: выход Task → context следующей.
- Hierarchical: менеджер видит все агенты/задачи, делегирует, валидирует.
- **Unified Memory** — иерархическая память с scope'ами (/agent/researcher). Автоматическое извлечение фактов после задачи, подстановка перед следующей.
- **MemoryScope** — изоляция (агент видит свою ветку). **MemorySlice** — чтение из нескольких scope'ов.
- Crews вложены в Flows.

> Источник: https://docs.crewai.com/concepts/memory

### Ограничения

- Иерархия — **только 2 уровня** (менеджер→исполнители).
- Hierarchical требует дополнительных LLM-вызовов.
- Telemetry (OTEL_SDK_DISABLED для отключения).
- Memory default: OpenAI embeddings, нужен embedder для приватности.

> Источник: https://github.com/crewAIInc/crewAI (Telemetry)

### Use cases

- Research, content generation, stock analysis.
- Production automation с HIL, checkpointing, structured output.

> Источник: https://github.com/crewAIInc/crewAI (Examples)
---

## 3. LangGraph (LangChain)

### Архитектура оркестрации

Low-level фреймворк на **направленных графах состояний** (вдохновлён Pregel/Apache Beam).

- Nodes — функции/агенты.
- Edges — переходы (условные, циклы).
- State — общий объект (TypedDict/Pydantic).
- Subgraphs — вложенные графы для модульности.
- Checkpointing — персистентное состояние, durable execution.

> Источник: https://github.com/langchain-ai/langgraph

### Координация и контекст

- **Shared state** — единое состояние, модифицируемое на каждом шаге.
- **Interrupts** — human-in-the-loop (пауза, инспекция, продолжение).
- Short-term + long-term память через store.
- Subgraphs — модульная иерархия с частью состояния.
- LangSmith для tracing.

> Источник: https://github.com/langchain-ai/langgraph

### Ограничения

- **Нет встроенных агентов/команд** — low-level, всё строится вручную.
- Высокий порог входа.
- Deep Agents — отдельный продукт.
- Нет паттерна «manager delegates» — через граф.

### Use cases

- Stateful long-running агенты.
- Сложные воркфлоу (branching, looping).
- Durable execution.
- Production deployment через LangSmith.

> Источник: https://github.com/langchain-ai/langgraph
---

## 4. MetaGPT

### Архитектура оркестрации

Моделирует **программную компанию**. Философия: **Code = SOP(Team)**.

Роли: ProductManager, Architect, ProjectManager, Engineer. Ввод — строка требования → артефакты (user stories, requirements, APIs, код). Порядок: PM → Architect → Engineer (SOP-цепочка).

> Источник: https://github.com/geekan/MetaGPT, https://docs.deepwisdom.ai/main/en/

### Координация и контекст

- **Publish-Subscribe**: роли публикуют артефакты через MessageBus.
- Контекст через типизированные документы (Requirements → Design → Tasks → Code).
- Per-role LLM config (config2.yaml).
- Data Interpreter — агент для анализа данных.

> Источник: https://github.com/geekan/MetaGPT

### Ограничения

- Жёсткий SOP для software pipeline — трудно адаптировать.
- Нет гибкого оркестратора — порядок фиксирован.
- Python 3.9–3.11.
- Фокус на коммерческом MGX; open-source менее активен.
- Нет иерархии «менеджер делегирует» — роли равноправны.

### Use cases

- Генерация ПО по описанию.
- Data analysis (Data Interpreter).
- Research, Debate, Receipt Assistant.

> Источник: https://github.com/geekan/MetaGPT
---

## 5. OpenAI Agents SDK

### Архитектура оркестрации

Lightweight, provider-agnostic (OpenAI + 100+ LLM).

- Agent — LLM + instructions + tools + guardrails + handoffs.
- **Handoffs** — передача управления сабагенту (получает полную историю).
- **Agent as Tool** — вызов агента как инструмента (результат обратно).
- SandboxAgent — контейнерный workspace.
- Runner — оркестратор (sync/async/streaming).

> Источник: https://github.com/openai/openai-agents-python

### Координация и контекст

- Handoffs: целевой агент получает **полную историю** (не изолирован).
- Agent as Tool: сабагент **изолирован** (без истории родителя).
- Guardrails: input/output safety checks.
- Sessions: история (Redis).
- Tracing: встроенный.
- MCP-интеграция.

> Источник: https://github.com/openai/openai-agents-python

### Ограничения

- Нет иерархии — только handoff (плоский) / agent-as-tool (звёздный).
- max_turns (default 10), без лимита вложенности handoffs.
- Default gpt-5.6-luna — OpenAI-экосистема.
- SandboxAgent: macOS/Linux или Docker.
- Молодой framework (2024–2025).

### Use cases

- Text agents с tool use.
- Sandbox-агенты (файлы, команды).
- Voice/Realtime агенты.
- Handoff-цепочки (delegation).
- HIL через guardrails.

> Источник: https://github.com/openai/openai-agents-python
---

## Сравнительная таблица

| Фреймворк | Оркестрация | Координация / контекст | Ограничения | Use cases |
|---|---|---|---|---|
| **AutoGen** | Teams: RoundRobin, Selector, Swarm, DiGraph; Core: Actor model | GroupChat — общий контекст; Swarm — с историей; AgentTool — изолированный | Maintenance mode; нет 3-уровневой иерархии; циклы | Multi-agent chat, autonomous teams |
| **CrewAI** | Crews (Sequential/Hierarchical) + Flows | Менеджер делегирует; Memory с scope-изоляцией | 2 уровня; telemetry; memory требует embedder | Research, content, automation |
| **LangGraph** | StateGraph: nodes + edges + subgraphs | Shared state; interrupts для HIL; checkpointing | Low-level; нет паттернов; высокий порог | Stateful agents, durable workflows |
| **MetaGPT** | SOP-цепочка ролей; Pub/Sub | Структурированные артефакты; MessageBus | Жёсткий SOP; Python 3.9–3.11 | Code gen, data analysis |
| **OpenAI Agents SDK** | Handoffs + Agent-as-Tool + Runner | Handoff: полная история; Tool: изолированный | Нет иерархии; max_turns; молодая | Delegation, voice, sandbox |

---

## Выводы

1. **Ближайший аналог Wolf→Executor→Worker** — CrewAI hierarchical или LangGraph subgraphs, оба требуют кастомизации для 3 уровней.
2. **Изоляция контекста** лучше всего в CrewAI (MemoryScope) и LangGraph (subgraph state).
3. **Файловый обмен** — уникальный паттерн, нативно не даёт ни один фреймворк; эмуляция через structured output → файл.
4. **AutoGen устарел** (maintenance mode), преемник — Microsoft Agent Framework.
5. **OpenAI Agents SDK** — самый молодой, хорош для delegation, но не для сложной иерархии.

---

*URL проверены 2026-08-18. Источники: официальные GitHub README и документация.*
