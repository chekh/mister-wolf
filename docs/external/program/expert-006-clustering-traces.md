# expert-006: Clustering Traces — ключи однотипности и алгоритмы без тяжёлых эмбеддингов

**От:** Внешний эксперт (Qwen)  
**Кому:** Mr.Wolf (координатор проекта)  
**Дата:** 2026-08-28  
**В ответ на:** Q21.x из wolf-003 (кластеризация сигналов для Фазы 21)

---

## 0. Контекст и принятые ограничения

Фаза 21 (Паттерн-детекция) требует:
- Формальный ключ однотипности для группировки сигналов (ошибок, rejected-циклов)
- Алгоритм кластеризации без тяжёлых эмбеддингов (local-first, минимум зависимостей)
- Порог N≥3 как параметр процесса

Ниже — разбор трёх продакшн-систем (Clio/Anthropic, PostHog, Datadog Patterns), которые решают эту задачу на масштабе 1M+ трейсов. Все три используют один и тот же pipeline с вариациями.

---

## 1. Три продакшн-системы кластеризации трейсов

### 1.1. Clio (Anthropic, декабрь 2024)

**Источник:** Tamkin et al., arXiv:2412.13678 [[1]]  
**Масштаб:** 1 миллион разговоров Claude.ai Free/Pro  
**Стоимость:** $48.81 за 100K conversations (~$0.0005 per conversation) [[2]]

**Pipeline (5 стадий):**

1. **Facet extraction** (Claude 3 Haiku):
   - Извлечение атрибутов: `Summary`, `Topic`, `Request/Task`, `Language`, `Turn count`, `Concerning behavior` (1–5 score)
   - Самый дешёвый модель для per-conversation volume

2. **Embedding + k-means**:
   - Embedding: `all-mpnet-base-v2` (sentence-transformers, 384-dim)
   - k-means с k "adjusted based on dataset size" (может быть тысячи кластеров)
   - Намеренно over-segmented для downstream hierarchy

3. **Cluster labeling** (Claude 3.5 Sonnet):
   - Читает sample conversation summaries (не raw text)
   - Генерирует title + description для каждого кластера
   - Объём: несколько тысяч calls на весь run

4. **Hierarchical clustering** (bottom-up):
   - Embed cluster labels themselves
   - Re-cluster at coarser granularity
   - Sonnet генерирует labels для merged groups
   - Результат: ~10 top-level → ~100 mid-level → ~1,000 leaf clusters

5. **Privacy auditing**:
   - Minimum cluster size over **unique accounts AND conversations**
   - Final auditor pass удаляет clusters с private info

**Валидация:** Synthetic reconstruction — 19,476 transcripts с known hierarchy, **94% recovery accuracy vs 5% random baseline** [[3]].

**Ключевой инсайт:** Facet schema decouples clustering axis from data. Один раз extracted facets → можно кластеризовать по любому subset без re-touching raw traces.

---

### 1.2. PostHog AI Clustering (март 2026)

**Источник:** Andy Maguire, PostHog Blog [[4]]  
**Масштаб:** Произвольный (sampling для контроля стоимости)  
**Алгоритм:** UMAP + HDBSCAN

**Pipeline:**

1. **Ingest**: Traces как PostHog events с `$ai_*` properties
2. **Text representation**: JSON → readable text (uniform downsampling для huge traces)
3. **Sample**: Hourly sampling of N traces/generations
4. **Summarize**: GPT-4.1 nano (fast and cheap) с structured output
5. **Embed**: Generate embedding vectors from summaries
6. **Cluster**: **UMAP dimensionality reduction + HDBSCAN clustering**
7. **Label**: AI agent names and describes each cluster
8. **Display**: Clusters tab с scatter plot и distribution chart

**Design considerations:**
- **Huge traces**: Iteratively drop lines while preserving structure (lossy but necessary)
- **No existing embeddings**: Shortcut — convert traces to text, summarize, embed summaries (не нужен RAG pipeline)
- **Zero-config by default**: Temporal workflows run automatically
- **User steering**: Clustering jobs (up to 5 configurations per project)

---

### 1.3. Datadog Patterns (2026)

**Источник:** Datadog Documentation [[5]]  
**Масштаб:** До 10,000 records per run  
**Алгоритм:** UMAP + HDBSCAN (как PostHog)

**Pipeline:**

1. Pull LLM interactions from production traffic (filter + sampling)
2. Summarize each interaction with AI
3. Compute text embedding using **self-hosted open source model**
4. Form clusters using **UMAP and HDBSCAN**
5. Review each cluster and generate meaningful topics with AI
6. Attribute each interaction to a single topic
7. Build hierarchy by grouping similar topics

**Features:**
- **Automatic dataset curation**: Каждый run добавляет suggested interactions в managed dataset для покрытия gaps
- **Compare across runs**: Track evolution — когда topic marked NEW появляется near top, это сигнал new use case или failure mode
- **Online Evals integration**: Evaluation results привязаны к topics

---

## 2. Ключи однотипности (Normalization Keys / Facets)

### 2.1. Таксономия facets из Clio-on-traces

Источник: Distributional blog (mapping Clio onto agent traces) [[6]]

**Direct facets** (вычисляются из OpenTelemetry trace, без LLM):

```yaml
- turn_count
- tool_call_count
- distinct_tools_invoked
- max_recursion_depth
- total_latency_ms
- total_tokens
- tool_error_count
- retry_count
```

**LLM-extracted facets** (один pass per trace, Haiku-equivalent):

```yaml
- task_summary             # what the user asked the agent to do
- tool_call_sequence       # ordered, deduplicated string of tool names
- failure_mode             # null if successful; else short description
- reasoning_pattern        # e.g. "linear plan-execute", "ReAct loop with revision"
- claimed_vs_actual_tools  # lazy-tool-call check
- resource_pattern         # "aggressively cached", "fan-out heavy", etc.
- completion_status        # full, partial, abandoned, hallucinated-completion
- concerning_behavior      # 1-5 score
```

**Высоко-сигнальные facets для behaviour-clustering:**

1. **`tool_call_sequence`** — novel to agent setting, highest-signal facet:
   - Trace с `[search, read, search, prune, search, read, answer]` vs `[search, answer]` — разные кластеры даже при идентичном task_summary
   - Cluster boundary = where interesting questions live ("is the agent over-searching on this class of task?")

2. **`failure_mode`** — where unknown-unknowns argument is strongest:
   - Pre-defined eval не может catch failure mode it didn't anticipate
   - Clustering on natural-language failure descriptions может

3. **`claimed_vs_actual_tools`** — Distributional example:
   - Small per-trace check: "did chain-of-thought claim a tool call that did not appear in span tree?"
   - Clustering axis reveals silent-hallucination sub-population

### 2.2. Маппинг на Wolf (Фаза 20 → Фаза 21)

**Текущий сигнальный лог (Фаза 20):**
- rejected-циклы с причинами
- тул-ошибки по типам
- весовые токены, длительность, worker count

**Предложение для расширения:**

```typescript
// session-metrics.json (расширение)
{
  "session_id": "string",
  "timestamp": "ISO8601",
  
  // Direct facets (already planned)
  "rejected_cycles": [
    {
      "reason": "timeout | tool_error | validation_failed",
      "tool_name": "string",
      "error_class_id": "string", // нормализованный ключ (см. §3)
      "context_hash": "string"    // hash от контекста для grouping
    }
  ],
  "tool_errors": [
    {
      "tool_name": "string",
      "error_type": "string",
      "error_class_id": "string"
    }
  ],
  
  // Новые facets для кластеризации
  "tool_call_sequence": ["tool1", "tool2", "tool3"],
  "max_recursion_depth": 3,
  "completion_status": "full | partial | abandoned | hallucinated",
  
  // Derived
  "total_duration_ms": 45000,
  "total_tokens": 12500,
  "worker_count": 2
}
```

**Ключ однотипности для кластеризации (Фаза 21):**

```typescript
type NormalizationKey = {
  tool_name: string;           // "read_file" | "search" | ...
  error_class_id: string;      // нормализованный (см. §3)
  context_signature: string;   // hash от key context fields
}
```

**Почему не raw context:**
- Если context включает пути к файлам, имена переменных, ID тредов → порог N≥3 не будет достигнут никогда (каждая ошибка уникальна)
- Если context отбросить → кластеры слишком широкие ("ошибка чтения файла")
- Решение: **error_class_id** как нормализованный ключ + **context_signature** как hash от key fields

---

## 3. Алгоритмы кластеризации без тяжёлых эмбеддингов

### 3.1. Три подхода из продакшна

| Система | Алгоритм | Embedding | Применимость для Wolf |
|---------|----------|-----------|----------------------|
| **Clio** | k-means | `all-mpnet-base-v2` (sentence-transformer) | Требует embedding model, но lightweight |
| **PostHog** | UMAP + HDBSCAN | Custom (суммаризация → embed) | UMAP требует numpy/sklearn, HDBSCAN — density-based |
| **Datadog** | UMAP + HDBSCAN | Self-hosted open source | Аналогично PostHog |

### 3.2. Рекомендация для Wolf: Rule-based clustering (без эмбеддингов)

**Проблема:** Все три системы используют эмбеддинги (даже lightweight). Для local-first CLI без внешних зависимостей это overhead.

**Решение:** Deterministic rule-based clustering на основе **error_class_id**.

**Алгоритм:**

```typescript
// Фаза 21: Паттерн-детекция
function clusterSignals(signals: Signal[]): Pattern[] {
  // 1. Group by normalization key
  const groups = new Map<string, Signal[]>();
  
  for (const signal of signals) {
    const key = `${signal.tool_name}:${signal.error_class_id}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(signal);
  }
  
  // 2. Filter groups with N≥3 (threshold)
  const patterns: Pattern[] = [];
  for (const [key, groupSignals] of groups.entries()) {
    if (groupSignals.length >= 3) {
      patterns.push({
        pattern_id: generateId(),
        normalization_key: key,
        signals: groupSignals,
        count: groupSignals.length,
        first_seen: min(groupSignals.map(s => s.timestamp)),
        last_seen: max(groupSignals.map(s => s.timestamp)),
        evidence_links: groupSignals.map(s => s.session_id)
      });
    }
  }
  
  return patterns;
}
```

**Преимущества:**
- Детерминированный (нет LLM-вызовов для кластеризации)
- Нет зависимостей от embedding models
- Быстрый (O(n) по числу signals)
- Прозрачный (легко debug)

**Недостатки:**
- Не может discover emergent patterns (только известные error_class_id)
- Требует предварительной нормализации (LLM-теггер error_class_id на этапе логирования)

### 3.3. Гибридный подход: Rule-based + lightweight semantic clustering

**Если нужен discovery emergent patterns:**

1. **Rule-based clustering** для известных error types (fast, deterministic)
2. **Lightweight semantic clustering** для неизвестных (раз в неделю, batch):
   - Embed summaries с `all-mpnet-base-v2` (или аналог)
   - HDBSCAN для density-based clustering
   - LLM labeling для generated cluster names

**Стоимость:** ~$0.0075 per trace (Clio-on-traces estimate) [[7]]

---

## 4. Конкретные числа и пороги

### 4.1. Подтверждённые цитатами

| Число | Значение | Источник |
|-------|----------|----------|
| Recovery accuracy | 94% (synthetic reconstruction) | Clio [[3]] |
| Cost per conversation | $0.0005 | Clio (100K run) [[2]] |
| Cost per trace (extended) | ~$0.0075 | Distributional estimate [[7]] |
| Cluster hierarchy | ~10 top / ~100 mid / ~1000 leaf | Clio (1M conversations) [[8]] |
| Max records per run | 10,000 | Datadog Patterns [[5]] |

### 4.2. Предложения ВА (калибровка обязательна)

| Параметр | Дефолт | Обоснование |
|----------|--------|-------------|
| **N (threshold)** | 3 | Из спеки Wolf (Фаза 21) |
| **error_class_id taxonomy** | 20–50 классов | Эмпирически (cover 95% errors) |
| **context_signature fields** | tool_name + error_type + file_extension | Минимум для disambiguation |
| **Lightweight clustering frequency** | Раз в неделю | Баланс cost vs freshness |
| **Max signals per batch** | 1,000 | OOM protection для in-memory clustering |

---

## 5. Что это меняет в Wolf (Фаза 21)

### 5.1. Расширение сигнального лога (Фаза 20)

**Добавить поля в `session-metrics.json`:**

```json
{
  "tool_call_sequence": ["read_file", "search", "write_file"],
  "max_recursion_depth": 2,
  "completion_status": "full"
}
```

**Обоснование:** Эти facets — highest-signal для behaviour-clustering [[9]].

### 5.2. Нормализация ошибок (Фаза 20 → 21)

**Добавить LLM-теггер на этапе логирования:**

```typescript
// При записи tool_error в events.jsonl
async function logToolError(error: ToolError, context: Context) {
  const error_class_id = await classifyError(error, context); // LLM call (Haiku-equivalent)
  
  events.append({
    type: "tool_error",
    tool_name: error.toolName,
    error_type: error.type,
    error_class_id: error_class_id, // нормализованный ключ
    context_signature: hashContext(context), // для grouping
    timestamp: now()
  });
}
```

**Таксономия error_class_id:**
- `fs_permission_denied`
- `fs_file_not_found`
- `network_timeout`
- `network_rate_limit`
- `validation_schema_mismatch`
- `validation_required_field_missing`
- ... (20–50 классов, cover 95% errors)

**Обоснование:** Без нормализации порог N≥3 не будет достигнут из-за high cardinality context.

### 5.3. Кластеризация (Фаза 21)

**Базовый алгоритм (rule-based):**

```typescript
// wolf insights --patterns
function detectPatterns(signals: Signal[]): Pattern[] {
  const groups = groupBy(signals, s => `${s.tool_name}:${s.error_class_id}`);
  
  return Object.entries(groups)
    .filter(([_, group]) => group.length >= 3) // threshold N≥3
    .map(([key, group]) => ({
      pattern_id: generateId(),
      normalization_key: key,
      signals: group,
      count: group.length,
      evidence_links: group.map(s => s.session_id)
    }));
}
```

**Расширенный алгоритм (lightweight semantic clustering, optional):**

```typescript
// wolf insights --patterns --deep (раз в неделю)
async function detectEmergentPatterns(signals: Signal[]): Promise<Pattern[]> {
  // 1. Summarize each signal (LLM, Haiku-equivalent)
  const summaries = await Promise.all(
    signals.map(s => summarizeSignal(s))
  );
  
  // 2. Embed summaries (all-mpnet-base-v2 или аналог)
  const embeddings = await embed(summaries);
  
  // 3. Cluster (HDBSCAN)
  const clusters = hdbscan(embeddings);
  
  // 4. Label clusters (LLM, Sonnet-equivalent)
  const labeled = await Promise.all(
    clusters.map(c => labelCluster(c, signals))
  );
  
  return labeled.filter(c => c.count >= 3);
}
```

**Стоимость:** ~$0.0075 per signal [[7]], для 1,000 signals/week = $7.5/week.

### 5.4. Валидация (по образцу Clio)

**Synthetic reconstruction для тестирования кластеризатора:**

```typescript
// tests/integration/pattern-detection.test.ts
test('pattern detector recovers known failure modes', async () => {
  // 1. Generate synthetic signals с known patterns
  const synthetic = generateSyntheticSignals({
    'fs_permission_denied': 10,
    'network_timeout': 15,
    'validation_schema_mismatch': 8
  });
  
  // 2. Run pattern detector
  const patterns = detectPatterns(synthetic);
  
  // 3. Measure recovery
  const recovery = measureRecovery(patterns, expectedPatterns);
  expect(recovery).toBeGreaterThan(0.8); // цель: 80%+ (Clio: 94%)
});
```

**Цель:** 80%+ recovery accuracy (Clio: 94%, но у нас проще taxonomy).

---

## 6. Источники

1. **Clio: A Platform for Privacy-Preserving, Large-Scale Insights into Claude Usage**  
   Авторы: Tamkin et al. (Anthropic)  
   Дата: Декабрь 2024  
   URL: https://arxiv.org/abs/2412.13678  
   Тип: arXiv preprint

2. **Clio cost breakdown**  
   Источник: Distributional blog (mapping Clio onto agent traces)  
   URL: https://saulius.io/blog/hierarchical-clustering-agent-traces-unknown-failure-modes  
   Цитата: «The 100,000-conversation pilot run cost $48.81 end-to-end, or roughly $0.0005 per conversation»

3. **Clio validation: synthetic reconstruction**  
   Источник: Distributional blog  
   URL: https://saulius.io/blog/hierarchical-clustering-agent-traces-unknown-failure-modes  
   Цитата: «94% accuracy versus 5% for random guessing. Figure 4 in the paper»

4. **How we built automatic clustering for LLM traces**  
   Автор: Andy Maguire (PostHog)  
   Дата: Март 2026  
   URL: https://posthog.com/blog/llm-analytics-clustering-how-it-works

5. **Datadog Patterns Documentation**  
   URL: https://docs.datadoghq.com/llm_observability/monitoring/patterns/

6. **Mapping Clio onto agent traces**  
   Автор: Saulius (Distributional)  
   URL: https://saulius.io/blog/hierarchical-clustering-agent-traces-unknown-failure-modes  
   Цитата: «tool_call_sequence is novel to the agent setting and is probably the highest-signal facet for behaviour-clustering»

7. **Cost per trace estimate**  
   Источник: Distributional blog  
   URL: https://saulius.io/blog/hierarchical-clustering-agent-traces-unknown-failure-modes  
   Цитата: «A realistic estimate: Haiku-equivalent facet extraction over a long trace: ~5K input tokens, ~500 output tokens. At Haiku 4.5 pricing (~$1/M input, ~$5/M output), that's ~$0.0075 per trace»

8. **Clio cluster hierarchy**  
   Источник: Distributional blog  
   URL: https://saulius.io/blog/hierarchical-clustering-agent-traces-unknown-failure-modes  
   Цитата: «Net result: ~10 top-level categories, ~100 mid-level, ~1,000 leaf, in a navigable tree»

9. **High-signal facets for behaviour-clustering**  
   Источник: Distributional blog  
   URL: https://saulius.io/blog/hierarchical-clustering-agent-traces-unknown-failure-modes  
   Цитата: «tool_call_sequence is novel to the agent setting and is probably the highest-signal facet for behaviour-clustering. A trace where the agent did [search, read, search, prune, search, read, answer] lives in a different cluster from one that did [search, answer] even when the task summary is identical»

---

## 7. Следующий шаг

Ожидаю вердикт по этой порции. План — `expert-007-logging-standards.md` (Q20.x: OTEL for LLMs, сверка с `session-metrics.json`).

**Резюме для агента:**
- Три продакшн-системы используют один pipeline: facet extraction → embedding → clustering (UMAP+HDBSCAN или k-means) → LLM labeling → hierarchy
- Ключ однотипности: `tool_name:error_class_id` (нормализованный через LLM-теггер)
- Для Wolf v1: rule-based clustering (без эмбеддингов), lightweight semantic clustering — optional (раз в неделю)
- Конкретные числа: N≥3 (threshold), 80%+ recovery accuracy (цель), $0.0075 per trace (cost для deep clustering)
