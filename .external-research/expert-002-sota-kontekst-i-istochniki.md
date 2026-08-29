# Экспертная справка №2: SOTA-контекст для агента-исследователя

**Кому:** Агенту Mr. Wolf, выполняющему исследование в рамках Phases 20–26
**От:** Внешнего эксперта
**Дата:** 2026-08-28
**Контекст:** В ходе совместной работы с пользователем был проведён глубокий аудит плана самообучения Mr. Wolf и поиск мировых практик (2025–2026). Ниже — концентрат знаний, ссылок и направлений, которые агент **обязан** учитывать при своей работе.

**Главный вывод для агента:** Архитектура Mr. Wolf (Сигнальный лог → ExpeL-рефлексия → STOP-гейт → GEPA → AFlow) на 100% соответствует передовому краю (SOTA) инженерии LLM-агентов на середину 2026 года. Агент не должен изобретать велосипед — его задача собирать систему из лучших деталей, отбрасывая академический хайп в пользу инженерной надёжности.

---

## 1. Индустриальная парадигма 2026 года

### Смена парадигмы: от Weight-Tuning к Harness Engineering

В 2026 году произошёл перелом. Термин «самообучение» больше не означает модификацию весов модели. Доминирующей стала парадигма **Harness Engineering** (инженерия обвязки агента) и **Context Engineering** — создание среды, которая предоставляет верифицируемые награды и безопасную песочницу для тестирования гипотез агента.

**Каноническая статья:**
- [Lilian Weng (OpenAI) — «Harness Engineering for Self-Improvement» (July 2026)](https://lilianweng.github.io/posts/2026-07-04-harness/)

**Практическая реализация:**
- [Prime Agent (Prime Intellect)](https://www.primeintellect.ai/blog/prime-agent) — self-improving RLM-агент, использующий персистентное IPython-ядро как состояние harness'а для постоянного обучения на длинных задачах.

**Маппинг на Wolf:** STOP-гейт (Фаза 23) и `pressure-тесты` — это и есть локальный Agent Harness. Агент должен развивать именно это направление.

### Reality Check: «Self-Evolving or Memory in a Costume?»

Критическая статья 2026 года делает важный вывод:
> *«Большинство self-evolving агентов в 2026 году не учатся в сильном смысле этого слова. Это stateful-системы, которые дистиллируют, хранят, ранжируют и переиспользуют контекст»*.

**Источник:** [Medium — «Self-Evolving Agents: Real Learning, or Memory in a Costume?»](https://medium.com/@Micheal-Lanham/self-evolving-agents-real-learning-or-memory-in-a-costume-c397f46bbfce)

**Вывод для агента:** Это **полное подтверждение** архитектуры Mr. Wolf. Мы строим идеальную stateful-систему (Memory + Harness + Lifecycle + Supersede), где LLM — только компрессор опыта.

---

## 2. Фундаментальные Surveys (Обязательны к прочтению агентом)

Эти три документа формируют современную таксономию self-evolving систем. Агент **должен** их прочитать и использовать как карту местности.

### 2.1. «Self-Improvements in Modern Agentic Systems: A Survey» (arXiv, 2026)
- **Ссылка:** [arxiv.org/html/2607.13104v1](https://arxiv.org/html/2607.13104v1)
- **Survey Hub:** [selfimproving-agent.github.io](https://selfimproving-agent.github.io/)
- **Суть:** Фреймворк, рассматривающий агентов как адаптивные системы, конвертирующие *сырой опыт* в *накопленные способности* (capability gains). Вводит чёткое разделение на:
  - **Test-Time Self-Improvement (TT-SI)** — улучшение в момент исполнения задачи
  - **Offline Self-Evolution** — улучшение между сессиями (именно это делает Wolf)

### 2.2. «A Survey of Agent Skills: Toward Procedural Infrastructure» (2026)
- **Ссылка:** [GitHub — Cassie07/AgentSkill_Survey](https://github.com/Cassie07/AgentSkill_Survey)
- **Суть:** Систематизирует эволюцию навыков. Делит обучение на 4 категории:
  1. **Skill Creation** — создание (наш ExpeL)
  2. **Skill Evaluation** — оценка (наш STOP-гейт)
  3. **Skill Evolution** — эволюция (наша GEPA)
  4. **Skill Consumption** — потребление (наш `trigger_keywords` + `wolf call`)
- **Вывод:** Навыки должны быть **версионируемыми артефактами**, а не просто промптами. Наша схема с `supersede` и `lifecycle` полностью соответствует этому.

### 2.3. «A Comprehensive Survey of Self-Evolving AI Agents» (EvoAgentX, 2025)
- **Ссылка:** [GitHub — EvoAgentX/Awesome-Self-Evolving-Agents](https://github.com/EvoAgentX/Awesome-Self-Evolving-Agents)
- **Суть:** Мост между Foundation Models и Lifelong Agentic Systems. Фокус на closed-loop (замкнутых циклах) модификации памяти и инструментов.

---

## 3. Главные репозитории и Awesome-листы (Библиотека агента)

Агент должен добавить эти репозитории в свою «библиотеку» и обращаться к ним при принятии решений.

| Репозиторий | URL | Фокус |
|---|---|---|
| **FrontisAI/Awesome-Self-Improving-Agents** | [GitHub](https://github.com/FrontisAI/Awesome-Self-Improving-Agents) • [Website](https://frontisai.github.io/Awesome-Self-Improving-Agents/) | Главный хаб 2026. Раздел «From Raw Experience to Skill Consumption» — **прямо то, что делает Wolf**. |
| **selfimproving-agent/awesome-Self-Improving-Agents** | [GitHub](https://github.com/selfimproving-agent/awesome-Self-Improving-Agents) | Фокус на агентах без изменения весов. Кураторство Julian Li (Trending 2026). |
| **XMUDeepLIT/Awesome-Self-Evolving-Agents** | [GitHub](https://github.com/XMUDeepLIT/Awesome-Self-Evolving-Agents) | Академический трек. Включает NeurIPS 2025 работы (SiriuS и др.). |
| **ai-boost/awesome-harness-engineering** | [GitHub](https://github.com/ai-boost/awesome-harness-engineering) | Библиотека подходов к созданию безопасных harness'ов. **Критически важен для Фазы 23 (STOP-гейт).** |
| **lobehub/awesome-rsi** | [GitHub](https://github.com/lobehub/awesome-rsi) | Recursive Self-Improvement. История концепции от Шмидхубера до 2026. |

---

## 4. Прорывные SOTA-механизмы 2026 (На что равняться)

### 4.1. Self-Harness (Обвязка, улучшающая саму себя)
- **Статья:** [arXiv 2606.09498 — «Self-Harness: Harnesses That Improve Themselves»](https://arxiv.org/html/2606.09498v1)
- **Индустриальный разбор:** [bdtechtalks.com — «How self-improving harnesses are rewriting the agent engineering playbook»](https://bdtechtalks.com/2026/07/13/ai-agents-self-improving-harness/)
- **Идея:** Агент улучшает не только свои навыки, но и саму обвязку (конфиг, промпты системы).
- **Маппинг:** Это прямая цель **GEPA (Фаза 24)** — эволюция шаблонов брифов.

### 4.2. ReasoningBank и MemSkill (Банки рассуждений)
RAG мёртв для агентов. SOTA — сохранение *процессов*, а не фактов.

- **ReasoningBank:** [arXiv 2509.25140](https://arxiv.org/pdf/2509.25140) — масштабирование self-evolving через «память рассуждений». Агент сохраняет успешные траектории как шаблоны.
- **MemSkill:** [alphaXiv 2602.02474](https://www.alphaxiv.org/abs/2602.02474) — эволюция «навыков памяти».
- **MemEvolve:** Мета-эволюция систем памяти (Dec 2025).
- **Маппинг:** Объекты `lesson` и `decision` с `trigger_keywords` — прототип ReasoningBank. Следующий шаг — сохранять туда структурированные `think-последовательности` (Фаза 11).

### 4.3. SkillRL и Skill-R1 (Рекурсивная эволюция скиллов)
- **SkillRL:** [GitHub — aiming-lab/SkillRL](https://github.com/aiming-lab/SkillRL) — динамическая рекурсивная эволюция, выделение high-level паттернов.
- **Skill-R1:** [arXiv 2605.09359](https://arxiv.org/html/2605.09359v1) • [HuggingFace](https://huggingface.co/papers/2605.09359) — RL-фреймворк с verifiable rewards.
- **SkillClaw:** [GitHub Discussion](https://github.com/bytedance/deer-flow/discussions/2133) — **коллективная эволюция навыков в мульти-пользовательских экосистемах**.
- **Маппинг:** Наш ExpeL-цикл (Фаза 22) делает то же самое, но без RL — через детерминированный LLM-синтез + holdout. Это безопаснее и дешевле для local-first CLI. SkillClaw — прямой путь к **Phase 14 (Cross-Project)**.

### 4.4. Forgetful but Faithful (TTL / Decay памяти)
- **Прорывная статья:** [arXiv 2512.12856 — «Forgetful but Faithful: A Cognitive Memory Architecture»](https://arxiv.org/html/2512.12856v1) • [ResearchGate](https://www.researchgate.net/publication/398721642)
- **Концепция:** **Memory-Aware Retention Schema (MaRS)** — forgetting-by-design как базовый принцип.
- **Дополнительно:** [Zylos AI Research — «Controlled Forgetting»](https://zylos.ai/research/2026-06-04-controlled-forgetting-ai-agent-memory-retention/)
- **Маппинг:** **Подтверждает моё требование** добавить поле `last_triggered_at` и механизм `wolf memory decay` для неиспользуемых правил.

### 4.5. Sandbox Replay (Доказательная валидация кандидатов)
- **Работа:** «Proofs, Not Promises: Governed Candidate Improvement for Agent Control Runtimes» (2026) — [ResearchGate](https://www.researchgate.net/publication/405312292) • [SSRN](https://papers.ssrn.com/sol3/Delivery.cfm/6835839.pdf)
- **Концепция:** Математическое доказательство, что текстовая (LLM-as-a-Judge) валидация кандидатов небезопасна. Обязательна **sandbox evaluation**.
- **PACE-Bench:** [arXiv 2608.14441](https://arxiv.org/html/2608.14441v1) — использует sandbox-валидацию на каждом мутировавшем этапе.
- **Маппинг:** **Подтверждает моё требование** к Sandbox Replay Holdout в Фазе 22 вместо LLM-as-a-judge.

### 4.6. Negative Feedback Loops (Обучение на отказах)
- **Индустриальный прецедент:** Meta приобрела Manus в 2025 для решения «главного узкого места: отсутствия петель негативной обратной связи» — [LinkedIn discussion](https://www.linkedin.com/posts/nylan-richard_meta-acquiring-manus-solves-the-single-biggest-activity-7412024770646650880-mFhe)
- **Академия:** [arXiv 2410.04166 — «Learning from negative feedback, or positive…»](https://arxiv.org/html/2410.04166v3) • «Co-Evolving Agents: Learning from Failures as Hard Constraints» (OpenReview)
- **Маппинг:** **Подтверждает** необходимость сохранять отклонённые Куратором `draft-rules` как `negative_constraints.json`.

### 4.7. Observability стандарты (Трейсы и кластеризация)
- **Structured JSON > Markdown parsing:** [Datadog Patterns](https://docs.datadoghq.com/llm_observability/monitoring/patterns/) • [Elastic LLM Observability](https://www.elastic.co/docs/solutions/observability/applications/llm-observability)
- **Semantic clustering трейсов:** [PostHog — «How we built automatic clustering for LLM traces»](https://posthog.com/blog/llm-analytics-clustering-how-it-works) • [Datadog Trace Cluster Map](https://www.braintrust.dev/articles/best-ai-observability-tools-2026)
- **Маппинг:** **Подтверждает** требование к `session-metrics.json` (Фаза 20) и `error_class_id` (Фаза 21).

### 4.8. Опасности Pareto overfitting в GEPA
- **ICML 2026:** Static rubrics воспроизводимы, LLM-as-a-Judge склонен к overfit при Pareto selection — [ICML Session 68692](https://icml.cc/virtual/2026/session/68692)
- **Работа:** «BUILD, JUDGE, OPTIMIZE: A BLUEPRINT FOR CONTINUOUS…» — [OpenReview PDF](https://openreview.net/pdf?id=FySoHBWmt9) — прямо указывает на переобучение search-агента при Pareto-селекции.
- **Маппинг:** **Подтверждает** ограничение GEPA только на детерминированные метрики качества.

---

## 5. Задания для агента (что делать с этой информацией)

Агент должен:

1. **Изучить** все 3 survey (раздел 2) и составить 1-страничный бриф «где находится Wolf на карте SOTA».
2. **Прочитать** 2-3 ключевые статьи из раздела 4 (особенно «Proofs, Not Promises», «Forgetful but Faithful», Lilian Weng про Harness) и выписать цитаты, которые можно использовать в спеках.
3. **Верифицировать** каждое моё критическое замечание (из `expert-001-arhitekturnye-zamechaniya.md`) через найденные источники — указать конкретные URL и цитаты.
4. **Предложить** 3-5 конкретных улучшений к плану Phases 20–26 на основе SOTA-практик, которые ещё не отражены в текущем плане.
5. **Собрать** «библиотечку агента» — JSON/Markdown с кураторскими ссылками, к которой он будет обращаться при принятии решений в будущих сессиях (это и есть первый артефакт self-learning — ReasoningBank агента-исследователя).

**Формат ответа:** `expert-003-agent-research-report.md` с явными ссылками на источники из этого документа.

---

## 6. Резюме для быстрого старта

Если у агента мало времени — вот **Top-5 источников, с которых начать прямо сейчас:**

1. 📖 [Lilian Weng — Harness Engineering](https://lilianweng.github.io/posts/2026-07-04-harness/) — философская основа всего плана.
2. 📊 [Self-Improvements Survey (arXiv 2607.13104)](https://arxiv.org/html/2607.13104v1) — карта местности.
3. 🛡️ [awesome-harness-engineering](https://github.com/ai-boost/awesome-harness-engineering) — практические паттерны для STOP-гейта.
4. 🧠 [FrontisAI/Awesome-Self-Improving-Agents](https://github.com/FrontisAI/Awesome-Self-Improving-Agents) — основной хаб решений.
5. 💾 [Forgetful but Faithful](https://arxiv.org/html/2512.12856v1) — обоснование механизма Decay для Фазы 26.

---

**Контакт для вопросов:** Если агенту нужны уточнения от меня — создать файл `expert-NNN-vopros-k-ekspertu.md` в этой же директории.
