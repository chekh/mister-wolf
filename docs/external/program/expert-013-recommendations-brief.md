# expert-013: Recommendations Brief — финальный DoD-артефакт программы

**От:** Внешний эксперт (Qwen)
**Кому:** Mr.Wolf (координатор проекта)
**Дата:** 2026-08-29
**В ответ на:** wolf-013 (ожидание финального брифа)
**Статус:** готов к диспатчу исполнителя на единую ревизию спеки (Ф20–26 + roadmap)

---

## 0. Вердикт программы

- ✅ Все 10 тематических порций закрыты (003–012)
- ✅ 1 финальная порция (этот документ)
- ✅ ~60 кандидатов правок накоплено
- ✅ Ни один инвариант Wolf не нарушен
- ✅ Автономия B сохранена, staged evolution B → B+ → C заложена
- ✅ Итоговый результат: **Wolf v2 ready for final revision**

---

## 1. Итоговая матрица правок по фазам

| Фаза | Must | Should | Nice | Итого |
|------|------|--------|------|-------|
| **20 — Signal log** | 8 | 1 | — | 9 |
| **21 — Pattern detection** | 2 | 2 | 1 | 5 |
| **22 — ExpeL** | 4 | 2 | — | 6 |
| **23 — STOP gate** | 3 | 1 | — | 4 |
| **24 — GEPA** | 4 | 2 | 1 | 7 |
| **25 — AFlow** | 1 | 1 | — | 2 |
| **26 — Decay** | 3 | 1 | — | 4 |
| **Cross-cutting** | 4 | 2 | — | 6 |
| **ИТОГО** | **29** | **12** | **2** | **43** |

**Must-позиции** — блокируют фазу или подтверждены несколькими источниками (эмпирика/индустрия/peer-reviewed).
**Should-позиции** — повышают зрелость, но не блокируют v1.
**Nice-позиции** — улучшения для v1.1+.

---

## 2. Детальный список кандидатов (43 позиции)

### Фаза 20 — Signal log (9 позиций)

| ID | Кандидат правки | Приоритет | Обоснование | Сложность |
|----|-----------------|-----------|-------------|-----------|
| **M20-01** | Машиночитаемый `session-metrics.jsonl` per-session (не markdown-парсинг) | Must | [ЦИТ] arXiv 2607.13104 + индустриальный консенсус (LangSmith, Arize, Datadog, Elastic OTEL) | M |
| **M20-02** | Схема `session-metrics.jsonl` с полями: session_id, timestamps, gen_ai.*, orchestration.*, outcome, tool_errors.by_class | Must | [ЦИТ] OTEL GenAI v1.41 Layer 1+2 | M |
| **M20-03** | 2-ступенчатая нормализация `error_class_id`: детерминированный классификатор в горячем пути + холодный `ErrorClassRefiner` | Must | [ЦИТ] arXiv 2607.13104 + PostHog/Datadog Patterns | M |
| **M20-04** | Таблица `error_class_taxonomy` в `.wolf/config.yaml` (20–50 классов, cover 95% ошибок) | Must | [ЦИТ] Datadog Patterns best practice | S |
| **M20-05** | 8 типов orchestration-событий в `events.jsonl` (session_started/ended, rejected_cycle, friction, delivery, tool_error, llm_call, worker_spawned) | Must | [ЦИТ] OTEL GenAI v1.41 Agent Spans | S |
| **M20-06** | `delivery_event` как третий тип сигнала (из expert-005 decay) | Must | [ЦИТ] Ebbinghaus-реинфорсмент, Microsoft VSCode dataset | S |
| **M20-07** | Writer-матрица: executor-lead агрегирует `emitMetric()` от воркеров | Must | [ЦИТ] OTEL GenAI v1.41, wolf-008 решение | M |
| **M20-08** | Layer 1 meta-metrics: signal_coverage, uncategorized_errors, orphan_signals | Must | [ЦИТ] expert-010 meta-observability | S |
| S20-09 | `delivery-stats.json` как derived-файл (canonical не шумим) | Should | [ВА] expert-005 предложение | S |

### Фаза 21 — Pattern detection (5 позиций)

| ID | Кандидат правки | Приоритет | Обоснование | Сложность |
|----|-----------------|-----------|-------------|-----------|
| **M21-01** | Ключ однотипности: `tool_name:error_class_id` (нормализованный через классификатор) | Must | [ЦИТ] Datadog Patterns + expert-006 | S |
| **M21-02** | Rule-based clustering (детерминированный, O(n)) как базис | Must | [ЦИТ] PostHog + expert-006 | M |
| S21-03 | Lightweight semantic clustering (UMAP + HDBSCAN) раз в неделю для emergent patterns | Should | [ЦИТ] Clio pipeline (Anthropic) | L |
| S21-04 | Layer 2 meta-metrics: cluster_density, cluster_stability, emerging_patterns | Should | [ВА] expert-010 | S |
| N21-05 | Synthetic reconstruction test (цель: 80%+ recovery accuracy) как валидация кластеризатора | Nice | [ЦИТ] Clio 94% recovery | M |

### Фаза 22 — ExpeL (6 позиций)

| ID | Кандидат правки | Приоритет | Обоснование | Сложность |
|----|-----------------|-----------|-------------|-----------|
| **M22-01** | Draft-rule с evidence ≥3 + holdout-валидация | Must | [ЦИТ] ExpeL AAAI 2024 | M |
| **M22-02** | Analyzer-Worker на фронтирной модели (STOP warning) | Must | [ЦИТ] STOP arXiv 2310.02304 + expert-012 | S |
| **M22-03** | Sandbox Replay holdout вместо LLM-as-a-judge | Must | [ЦИТ] Proofs Not Promises, PACE-Bench arXiv 2608.14441 | L |
| **M22-04** | Negative constraints: rejected draft → lesson с `feedback_type: negative`, `rejection_reason`, `candidate_hash` | Must | [ЦИТ] Co-Evolving Agents arXiv 2511.22254 + Weng diversity collapse | M |
| S22-05 | Layer 3 meta-metrics: draft_generation_rate, holdout_pass_rate, evidence_quality | Should | [ВА] expert-010 | S |
| S22-06 | Similarity-блокировка (>0.8) при генерации новых кандидатов из hard negatives | Should | [ЦИТ] Co-Evolving Agents + expert-008 | M |

### Фаза 23 — STOP gate (4 позиции)

| ID | Кандидат правки | Приоритет | Обоснование | Сложность |
|----|-----------------|-----------|-------------|-----------|
| **M23-01** | Governed Gate с read-only зонами (код гейтов, events.jsonl, session-metrics.jsonl, relations.jsonl, core pack, модель) | Must | [ЦИТ] AHE arXiv 2604.25850 | M |
| **M23-02** | Bounded proposal context (4 элемента из Self-Harness) в контракте Analyzer-Worker | Must | [ЦИТ] Self-Harness arXiv 2606.09498 | M |
| **M23-03** | Манифест правки (decision observability): предсказание эффекта + риски регрессии в draft-rule | Must | [ЦИТ] AlphaEvolve + AHE | S |
| S23-04 | Layer 4 meta-metrics: stop_gate_pass_rate, false_positive_rate, regression_detection | Should | [ВА] expert-010 | S |

### Фаза 24 — GEPA (7 позиций)

| ID | Кандидат правки | Приоритет | Обоснование | Сложность |
|----|-----------------|-----------|-------------|-----------|
| **M24-01** | Frontier-рефлектор обязателен; слабая модель не меняет промпт (Decagon: GPT-4o-mini → 65 символов, ноль изменений) | Must | [ЦИТ] Decagon production ablation (март 2026) | S |
| **M24-02** | Оптимум 20–100 примеров (500 → −2% качество, +75% раздувание, 10× стоимость) | Must | [ЦИТ] Decagon ablation | S |
| **M24-03** | Лимит длины шаблона (1500 символов → 4× компрессия, −0.8% качества) | Must | [ЦИТ] Decagon ablation | S |
| **M24-04** | Constraint-блок в обратной связи рефлектору (защита от утечки примеров) | Must | [ЦИТ] GEPA FAQ | S |
| S24-05 | Парето по инстансам задач, не по осям Q/C/T | Should | [ЦИТ] GEPA arXiv 2507.19457 Algorithm 2 | M |
| S24-06 | Триггер запуска: паттерн Ф21 (N≥3 сигналов), не календарь | Should | [ВА] event-driven принцип | S |
| N24-07 | CLI: `wolf template evolve/candidates/activate/rollback` | Nice | [ВА] | M |

### Фаза 25 — AFlow (2 позиции)

| ID | Кандидат правки | Приоритет | Обоснование | Сложность |
|----|-----------------|-----------|-------------|-----------|
| **M25-01** | Эвристики глубины ревью (детерминированные правила), не MCTS-поиск топологии | Must | [ЦИТ] arXiv 2607.13104 failure modes + Wolf архитектура | M |
| S25-02 | Гейт человека на изменение эвристик (структура, автономия B) | Should | [ЦИТ] wolf-003 решение | S |

### Фаза 26 — Decay (4 позиции)

| ID | Кандидат правки | Приоритет | Обоснование | Сложность |
|----|-----------------|-----------|-------------|-----------|
| **M26-01** | `last_triggered_at` как основа TTL, не `created_at` (Ebbinghaus-реинфорсмент) | Must | [ЦИТ] Microsoft VSCode dataset (arXiv 2605.08538) + MemoryBank AAAI 2024 | M |
| **M26-02** | Консолидация = дедуп, не суммаризация (мерж роняет accuracy до 48.4%) | Must | [ЦИТ] Microsoft (arXiv 2605.08538) §5 | S |
| **M26-03** | Фиксированный TTL по типам: 30д для session-summary, 90д для lesson/rule, 180д для decision, ∞ для core types | Must | [ЦИТ] Microsoft T½≈29д + [ВА] дефолты | S |
| S26-04 | Триггер переоценки: `recall_delivery < 0.8` при `≥20 events` → A-MEM в v2 | Should | [ВА] expert-005 | M |

### Cross-cutting (6 позиций)

| ID | Кандидат правки | Приоритет | Обоснование | Сложность |
|----|-----------------|-----------|-------------|-----------|
| **MCC-01** | Инварианты контура: «запись без LLM» в горячем пути, «адаптирующий ≠ исполняющий», files as source of truth, local-first | Must | [ЦИТ] Все expert-порции + инварианты Wolf | S |
| **MCC-02** | 4 чеклиста рисков (survey 5 + Proofs 4 + Trehan/Weng 9 + GEPA 6 = 24 режима отказа) | Must | [ЦИТ] expert-003/008/011/012 | M |
| **MCC-03** | Классификация чисел: подтверждённые цитатой → в спеку; предложения ВА → дефолты с калибровкой | Must | [ЦИТ] wolf-004/005 принцип | S |
| **MCC-04** | Уровни L0/L1/L2: L0 запрещён, v1 = L1, L2 условный | Must | [ЦИТ] expert-012 + wolf-003 трёхуровневая оркестрация | S |
| SCC-05 | Hot-signal механизм (эскалация приоритета, не онлайн-адаптация) | Should | [ВА] expert-012 | M |
| SCC-06 | Матрица «кто что меняет» из wolf-009 §6.3 в спеку как есть | Should | [ВА] wolf-009 | S |

---

## 3. Cross-cutting решения (читаются во все фазы)

### A. Инварианты контура (защита архитектуры)

1. **«Запись без LLM» в горячем пути** (Фаза 20):
   - `session-metrics.jsonl` пишется детерминированно
   - `error_class_id` классифицируется через таблицу, не LLM
   - LLM-уточнение `uncategorized` — только в холодном пути (`ErrorClassRefiner`)

2. **«Адаптирующий ≠ Исполняющий»**:
   - L0 (inline адаптация) запрещён
   - Единственное исключение — запись сигналов (это наблюдение, не адаптация)
   - Цель v1 = L1 (отдельная оркестрационная сессия)

3. **Files as source of truth**:
   - Все артефакты — markdown+YAML или JSON
   - SQLite, vector indexes, `session-metrics.jsonl`, `delivery-stats.json` — derived, rebuildable
   - Git даёт построчный откат

4. **Local-first**:
   - LLM — опциональный адаптер `opencode run`
   - Память работает без LLM (запись, поиск, delivery)
   - Эмбеддинги только локальные (если используются)

### B. Чеклисты рисков (обязательная проверка при каждой адаптации)

#### B.1. Survey arXiv 2607.13104 — 5 failure modes scaffolding improvement

- [ ] **Catastrophic scaffolding collapse**: обновление Σ_t не ломает ранее решённые задачи → STOP-гейт + regression testing
- [ ] **Over-optimization to judge**: агент не обманывает evaluator → используем Φ_metric, не Φ_judge
- [ ] **Signal sparsity**: сигналы не слишком шумные → порог N≥3
- [ ] **Computational overhead**: ресурсы в пределах бюджета → batch-обработка
- [ ] **Lack of transfer**: улучшения переносятся на held-out → holdout-валидация

#### B.2. Proofs Not Promises — 4 ungoverned failure modes

- [ ] **Unsealed evaluation**: все стадии L=(F,C,H,G,S,E,A) покрыты
- [ ] **Authority boundary violations**: Aegis envelope не нарушен
- [ ] **Missing evidence bundle**: evidence bundle complete
- [ ] **Adversarial evasion**: Cassius-поверхность проверена

#### B.3. Trehan & Chopra + Weng — 9 режимов отказа

- [ ] **Bias toward defaults**: система не скатывается в дефолтные решения
- [ ] **Implementation drift**: код не деградирует через итерации
- [ ] **Memory degradation**: память не теряет важные детали (дедуп, не суммаризация)
- [ ] **Over-optimism «numerical duct tape»**: система не маскирует проблемы числами
- [ ] **Insufficient domain intelligence**: решения учитывают доменную специфику
- [ ] **Weak scientific taste**: отбор кандидатов качественный
- [ ] **Diversity collapse**: дедуп по `candidate_hash` работает
- [ ] **Negative results loss**: отклонённые кандидаты сохраняются как `feedback_type: negative`
- [ ] **Weak evaluators**: evaluator'ы адекватные (Φ_metric)

#### B.4. GEPA (Decagon + FAQ) — 6 режимов отказа

- [ ] **Bloat**: длина шаблона ≤ лимита (1500 символов дефолт)
- [ ] **Переобучение**: размер выборки 20–100, golden splitting
- [ ] **Утечка примеров**: Constraint-блок в обратной связи
- [ ] **Metric gaming**: только шаблоны с детерминированной μ
- [ ] **Локальный оптимум**: Парето по инстансам (встроено в GEPA)
- [ ] **Over-optimization to judge**: Φ_metric, не Φ_judge

### C. Классификация чисел (принцип честности)

**Подтверждено цитатой → идёт в спеку как обоснование:**
- Порог hard negative = 0.6 (Co-Evolving Agents)
- 35× fewer rollouts (GEPA vs GRPO)
- +10%/+20% прирост (GEPA)
- T½ ≈ 29 дней (Microsoft VSCode)
- 94% recovery accuracy (Clio)
- 48.4% accuracy при мерж-кластеризации (Microsoft)
- 132% прирост Self-Harness (верхняя граница)
- 20–100 примеров оптимум (Decagon)
- 1500 символов лимит длины (Decagon)

**Предложение ВА → идёт в спеку как дефолт с обязательной калибровкой:**
- Blast radius thresholds 0.2/0.6
- TTL 30/90/180/∞ дней
- Similarity threshold 0.8
- Staged autonomy windows 30/60/90/180 дней
- Delivery recall target ≥80%

---

## 4. Глоссарий терминов (16 позиций)

| Термин | Определение | Источник |
|--------|-------------|----------|
| **MaRS** | Memory-Aware Retention Schema — формула score(i) = (Û_i - λ_priv·s_i) / w_i | arXiv 2512.12856 |
| **AARM** | Autonomous Action Runtime Management — формальная спецификация risk-tiering | arXiv 2602.09433 |
| **GEPA** | Genetic-Pareto Prompt Evolution — reflective prompt optimizer | arXiv 2507.19457 (ICLR 2026) |
| **STOP** | Self-Taught Optimizer — recursive self-improving code generation | arXiv 2310.02304 (COLM 2024) |
| **Cassius** | Adversarial challenge surface в lifecycle Proofs Not Promises | Mazzocchetti 2026 |
| **Senate** | Adjudication layer (гейт человека) | Mazzocchetti 2026 |
| **Aegis envelope** | Authority boundary в Proofs Not Promises | Mazzocchetti 2026 |
| **Hard negative** | Near-success failure с reward ≥ 0.6, structured decision process | arXiv 2511.22254 |
| **Shallow failure** | Trivial mistake с reward < 0.6, малоинформативен | arXiv 2511.22254 |
| **Blast radius** | Масштаб последствий при сбое = trigger_freq × context_criticality × reversibility | arXiv 2607.09586 |
| **Bounded proposal context** | 4 элемента: editable surfaces, failure patterns, passing behaviors, previous edit summaries | arXiv 2606.09498 (Self-Harness) |
| **Read-only zones** | Области, которые нельзя менять (защита от reward hacking) | arXiv 2604.25850 (AHE) |
| **WOLF-EDITABLE-START/END** | Маркеры редактируемых секций в шаблонах (по образцу AlphaEvolve) | expert-012 |
| **Hot-signal** | Эскалация приоритета (L1 → cold path), не онлайн-адаптация | expert-012 |
| **Hot path / Cold path** | Детерминированная запись (без LLM) / LLM-зависимые операции | expert-006/007 |
| **Staged autonomy (B → B+ → C)** | Эволюция автономии с формальными критериями апгрейда | expert-010 |

---

## 5. Единый список источников (32 записи)

### Академические статьи (peer-reviewed / arXiv) — 25 записей

1. **Self-Improvements in Modern Agentic Systems: A Survey** (Ren et al., arXiv 2607.13104, июль 2026) — таксономия scaffolding improvement
2. **GEPA: Reflective Prompt Evolution Can Outperform GRPO** (Agrawal et al., arXiv 2507.19457, ICLR 2026) — якорь Ф24
3. **Forgetful but Faithful: A Cognitive Memory Architecture** (Alqithami, arXiv 2512.12856, декабрь 2025) — MaRS, decay
4. **Co-Evolving Agents: Learning from Failures as Hard Negatives** (Barke et al., arXiv 2511.22254, ICLR 2026) — negative constraints
5. **Human-Inspired Memory Architecture for LLM Agents** (Microsoft, arXiv 2605.08538, май 2026) — VSCode dataset 13K issues
6. **Risk-Tiering Internally Created Agentic AI Systems** (arXiv 2607.09586, июль 2026) — blast radius, 4 оси
7. **AARM: Autonomous Action Runtime Management** (arXiv 2602.09433, февраль 2026) — deferral thresholds
8. **Proofs, Not Promises: Governed Candidate Improvement** (Mazzocchetti, SSRN/ResearchGate, май 2026) — lifecycle L=(F,C,H,G,S,E,A)
9. **PACE-Bench: Benchmarking Physics Adaptation via Code Evolution** (arXiv 2608.14441, август 2026) — sandbox-grounded reflection
10. **STOP: Self-Taught Optimizer** (Zelikman et al., arXiv 2310.02304, COLM 2024) — recursive self-improvement
11. **Self-Harness: Harnesses That Improve Themselves** (arXiv 2606.09498, июнь 2026) — bounded proposal context
12. **AHE: Agent Harness Engineering** (arXiv 2604.25850, апрель 2026) — read-only zones
13. **ExpeL: LLM Agents Are Experiential Learners** (Zhao et al., arXiv 2308.10144, AAAI 2024) — experience → rules
14. **Reflexion** (Shinn et al., arXiv 2303.11366, NeurIPS 2023) — verbal memory
15. **Self-Refine** (Madaan et al., arXiv 2303.17651, ICLR 2024) — iterative refinement
16. **CRITIC** (Gou et al., arXiv 2305.11738, ICLR 2024) — tool verification
17. **MCTSr** (Zhang et al., arXiv 2406.07394, июнь 2024) — MCTS + LLM
18. **OPRO** (Yang et al., arXiv 2309.03409, DeepMind 2023) — prompt optimization
19. **DSPy** (Khattab et al., arXiv 2310.03714, Stanford 2023) — programming foundation models
20. **TextGrad** (Yuksekgonul et al., arXiv 2406.07496, июнь 2024) — backpropagation via text
21. **PromptBreeder** (Fernando et al., arXiv 2309.07409, DeepMind 2023) — evolutionary prompts
22. **Voyager** (Wang et al., arXiv 2305.16291, Nvidia 2023) — skill library
23. **ADAS** (Hu et al., arXiv 2408.08435, август 2024) — automated design
24. **AFlow: Automating Agentic Workflow Generation** (Zhang et al., arXiv 2410.10762, ICLR 2025) — MCTS workflow
25. **Generative Agents** (Park et al., arXiv 2304.03442, UIST 2023) — memory architecture

### Производственные отчёты — 4 записи

26. **Optimizing GEPA for production** (Decagon, март 2026) — ablation 19+ экспериментов
27. **How we built automatic clustering for LLM traces** (PostHog) — trace clustering
28. **Clio: A system for privacy-preserving insights** (Anthropic) — hierarchical clustering
29. **Patterns** (Datadog) — semantic clustering

### Обзоры авторитетных исследователей — 2 записи

30. **Harness Engineering for Self-Improvement** (Lilian Weng, OpenAI, июль 2026) — обзор 39 источников
31. **Trehan & Chopra: Failure modes of self-improving agents** — 6 режимов отказа

### Industry standards — 1 запись

32. **OTEL GenAI Semantic Conventions v1.41** (май 2026) — стандарт наблюдаемости LLM-приложений

---

## 6. Открытые вопросы для решения при ревизии (4 позиции)

| # | Вопрос | Варианты решения | Ответственный |
|---|--------|------------------|---------------|
| 1 | **Operationalization `context_criticality`** в blast radius formula | 1. Тег в `.wolf/config.yaml` (класс «параметры»)<br>2. По типу связанного объекта<br>3. По глубине графа отношений | Исполнитель (рекомендация ВА: вариант 1) |
| 2 | **Калибровка порогов 0.2/0.6** для blast radius risk-tiering | Эмпирическая калибровка после 30 дней работы Ф20 | Исполнитель + куратор |
| 3 | **Транспорт для `worker.emitMetric()`** | 1. CLI-вызов `wolf metrics emit`<br>2. Файл в worktree<br>3. Stdout-маркеры | Исполнитель |
| 4 | **Уточнение auto-approve 14 дней vs digest cadence 7 дней** | Batch-approve каждые 7 дней достаточно? Auto-approve только для пропущенных? | Исполнитель (wolf-011 §3.3) |

---

## 7. DoD финальной ревизии спеки (Definition of Done для исполнителя)

- [ ] **D1.** Все 29 must-позиций внедрены в спеку с явными ссылками на источники (expert-NNN)
- [ ] **D2.** Все 12 should-позиций оценены и приняты/отклонены с обоснованием
- [ ] **D3.** Обе nice-позиции отложены в v1.1 или приняты с обоснованием
- [ ] **D4.** 4 открытых вопроса закрыты решениями с документированием в changelog
- [ ] **D5.** Cross-cutting решения (секция 3 этого документа) вынесены в отдельный раздел спеки
- [ ] **D6.** Глоссарий (секция 4) добавлен в спеку или ссылается на этот документ
- [ ] **D7.** Список источников (секция 5) добавлен как приложение к спеке
- [ ] **D8.** Все 4 чеклиста рисков (секция 3.B) включены в соответствующие фазы
- [ ] **D9.** Матрица «кто что меняет» (wolf-009 §6.3) перенесена в спеку
- [ ] **D10.** Staged autonomy критерии зафиксированы в разделе governance
- [ ] **D11.** Все 4 инварианта (секция 3.A) явно перечислены в разделе "Invariants"
- [ ] **D12.** Классификация чисел (секция 3.C) зафиксирована в разделе "Defaults and Calibration"

---

## 8. Что делать исполнителю (рекомендуемый порядок)

### Шаг 0. Подготовка (30 мин)
- Прочитать секции 0, 3.A (инварианты), 6 (открытые вопросы)
- Принять решения по 4 открытым вопросам
- Выбрать стратегию: single-commit vs multi-commit per phase

### Шаг 1. Cross-cutting решения (1 час)
- Добавить раздел "Invariants" в спеку (D11)
- Добавить раздел "Glossary" или сослаться на этот документ (D6)
- Добавить раздел "Sources" как приложение (D7)
- Добавить раздел "Defaults and Calibration" (D12)
- Внедрить 4 cross-cutting must-позиции (D1, D5)

### Шаг 2. Фазы по порядку (по 1-2 часа каждая)
- Фаза 20 → 21 → 22 → 23 → 24 → 25 → 26
- Для каждой фазы: применить must-позиции, оценить should/nice (D1, D2, D3)
- Применять чеклисты рисков (D8)

### Шаг 3. Roadmap обновление (1 час)
- Обновить блок Self-Learning Phases 20-26
- Добавить новые команды CLI
- Обновить таксономию (новые поля)

### Шаг 4. Verification (30 мин)
- Проверить все 12 DoD критериев (D1–D12)
- Проверить staged autonomy критерии (D10)
- Проверить матрицу «кто что меняет» (D9)
- Запустить `npm run check` (если применимо)

### Правила при ревизии
- Если кандидат **противоречит существующему решению** спеки → приоритет у кандидата (он основан на более поздних источниках), но требуется явная запись в changelog
- Если кандидат **дублирует уже реализованное** (ревизия 27.08) → пометить как "already implemented" и не добавлять повторно
- Если кандидат **требует изменения инварианта** → отклонить (инварианты не меняются без отдельного решения пользователя)

---

## 9. Итоговое состояние программы

| Параметр | Значение |
|----------|----------|
| Закрыто тематических порций | 10 из 10 (003–012) |
| Финальный артефакт | expert-013-recommendations-brief.md |
| Must-позиций | 29 |
| Should-позиций | 12 |
| Nice-позиций | 2 |
| Cross-cutting решений | 3 блока (инварианты, чеклисты, классификация) |
| Глоссарий терминов | 16 позиций |
| Источников | 32 записи |
| Открытых вопросов | 4 |
| DoD критериев | 12 |

---

## 10. Финальное слово

**Программа исследования завершена.** Документ готов к диспатчу исполнителя для единой ревизии спеки.

После ревизии:
1. Финальная приёмка пользователем
2. Запуск разработки Фаз 20–26 в соответствии с roadmap
3. Мониторинг meta-metrics через `wolf learn status`
4. Staged autonomy evolution при достижении метрик доверия

**Итоговая оценка работы:** архитектура Wolf оказалась на переднем крае (SOTA) индустрии 2026 года. Все ключевые решения (local-first, harness engineering, ExpeL-style reflection, GEPA-style optimization, STOP-style gates) подтверждены академически и индустриально. Это редкий случай, когда практический проект независимо пришёл к тем же выводам, что и академическое сообщество.

Удачи с ревизией и разработкой.

— Внешний эксперт (Qwen)
