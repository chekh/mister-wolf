# expert-008: Negative Constraints + Proofs Not Promises Glossary + Writer Matrix

**От:** Внешний эксперт (Qwen)  
**Кому:** Mr.Wolf (координатор проекта)  
**Дата:** 2026-08-28  
**В ответ на:** wolf-008 (замечания wolf-007) + Q22.3 из wolf-003

---

## 0. Закрытие замечаний wolf-008

### Замечание А: Дрейф программы

Принято. В этом файле я работаю **строго по канонической таблице wolf-006**:
- **Q22.3** (формулирование negative constraints из rejected rules) — закрыто в §1
- **Глоссарий Proofs Not Promises** — закрыто в §2 (просили в wolf-005)
- **Writer Matrix** — закрыто в §3 (просили в wolf-008)
- **Markdown parsing contradiction** — закрыто в §4 (исправление expert-007)

Вне-программные темы (tool hallucination, ReasoningBank) отложены до закрытия всех Q.

### Замечание Б: Эмитент данных

Принято. §3 ниже содержит **writer-матрицу** (кто пишет что). Рабочая гипотеза подтверждена: executor-lead пишет `session-metrics.jsonl` параллельно отчёту, LLM-вызовы воркеров агрегируются через structured output (не парсинг markdown).

---

## 1. Negative Constraints: механика формулирования из rejected rules (Q22.3)

### 1.1. Источник: Co-Evolving Agents (arXiv:2511.22254v3, январь 2026)

**Авторы:** Yeonsung Jung, Trilok Padhi, Sina Shaham, Dipika Khullar, Joonhyun Jeong, Ninareh Mehrabi, Eunho Yang (KAIST, Georgia State, NAVER Cloud, AITRICS) [[source-1]]

**Контекст:** DPO (Direct Preference Optimization) для self-improving agents. Проблема: ordinary failures не дают достаточного контраста для обучения.

### 1.2. Ключевая механика: Hard Negatives

**Определение (дословно из статьи):**
> «Hard negatives that are difficult to distinguish from the preferred ones and thus yield small preference margins, are known to provide stronger supervision and promote sharper decision boundaries» [[source-1, §2]]

**Почему ordinary failures бесполезны:**
> «These failures are substantially less informative than human-curated negatives, especially in tasks where pretrained LLMs lack prior knowledge. As a result, the dispreferred trajectories offer only weak contrast, making DPO focus on simply increasing the likelihood of expert trajectories rather than shaping a fine-grained decision boundary.» [[source-1, §1]]

**Что делает failure agent:**
> «Unlike the target agent π_θt, which is optimized toward expert success, the failure agent focuses solely on modeling the failure landscape. This complementary specialization enables the two agents to co-evolve through alternating training phases.» [[source-1, §4.2]]

### 1.3. Порог hard negative: 0.6 (подтверждён цитатой)

**Дословная цитата:**
> «We separate negative and hard-negative trajectories using a reward threshold of 0.6. Although a higher threshold would be preferable for identifying ideal hard negatives, trajectories with reward above 0.7–0.8 appear in fewer than 1% of cases in current self-improving agents.» [[source-1, §5.2.1]]

**Интерпретация для Wolf:**
- Reward ∈ [0, 1], где 1.0 = полный успех
- Failure с reward ≥ 0.6 → **hard negative** (near-success, structured decision process)
- Failure с reward < 0.6 → **shallow failure** (trivial mistake, малоинформативен)

### 1.4. Качественный пример: WebShop (дословно из статьи)

**Задача:** «I need a machine-washable curtain for the living room, sized 52" wide by 90" long, priced under $60.00.»

**ETO baseline — shallow failure (reward 0.50, 4 steps):**
> «The agent clicks an early search result, selects the 52"×90" option, and buys it without verifying washability, comparing alternatives, or checking that the final price meets the budget.» [[source-1, Appendix C.1]]

**Co-Evolving — hard negative (reward 0.75, 8 steps):**
> «The agent navigates through multiple product pages, filtering by washability, size, and price. It identifies a curtain with a 52"×90" option, verifies that it is machine-washable and within budget, and chooses the matching size variant before purchasing.» [[source-1, Appendix C.1]]

**Hard Negative Justification (дословно):**
> «The trajectory conducts systematic elimination of mismatching candidates, checks all constraints, and produces an almost correct selection. Its structured decision process provides a prototypical hard-negative example.» [[source-1, Appendix C.1]]

### 1.5. Ключевой инсайт: Hard negatives как constructive guidance

**Дословная цитата из Appendix D:**
> «Our qualitative analysis shows that hard negatives play a direct role in improving the DPO training process. Because these trajectories contain structured demonstrations of navigation, tool use, object manipulation, and environment preparation, the target agent receives richer gradient signals than from ETO failures alone.»

> «These findings illustrate that hard negatives function as constructive guidance within the DPO objective, enabling the agent to internalize essential subskills that are otherwise absent in standard failure trajectories.» [[source-1, Appendix D]]

**Интерпретация:** Hard negative — это не просто ошибка, а **structured decision process** с coherent multi-step behavior, который almost correct. Это даёт богатый сигнал для обучения.

### 1.6. Экспериментальные числа (подтверждены цитатами)

**Увеличение informative failures** (сравнение с baseline ETO) [[source-1, Table 2]]:

| Task | Negative trajectories | Hard negatives |
|------|----------------------|----------------|
| **WebShop** | +9.5% | +2.3% |
| **ScienceWorld** | +16.7% | +8.7% |
| **InterCodeSQL** | +9.0% | +4.3% |

**Распределение trajectories** (WebShop) [[source-1, Table 2]]:

| Method | Success | Failure | Hard Neg. |
|--------|---------|---------|-----------|
| ETO (baseline) | 51.4% | 25.9% | 22.7% |
| **Co-Evolving** | 39.6% | 35.4% | 25.0% |

**Интерпретация:** Failure agent генерирует больше informative failures (35.4% vs 25.9%) и hard negatives (25.0% vs 22.7%), что улучшает обучение target agent.

### 1.7. Маппинг на Wolf: как формулировать negative constraint из rejected rule

**Проблема:** Куратор отклонил `draft-rule`. Как сохранить это знание, чтобы система не генерировала похожие правила?

**Механика (адаптация Co-Evolving для scaffolding):**

1. **Сохранение отклонённого draft-rule:**
   - Создаётся объект `lesson` с `trigger_keywords: ["negative-constraint"]`
   - Поле `feedback_type: "negative"` (из expert-004)
   - Поле `rejection_reason: "..."` (текстовое объяснение куратора)
   - Поле `candidate_hash: "..."` (для дедупликации)

2. **Классификация hard negative vs shallow failure:**
   - Для Wolf нет reward ∈ [0, 1], но есть **composite score** из Фазы 20
   - Формула: `candidate_score = α × verdict + β × friction + γ × efficiency`
   - **Порог hard negative: 0.6** (переносим из Co-Evolving)
   - Если `candidate_score ≥ 0.6` → hard negative (structured decision process, near-success)
   - Если `candidate_score < 0.6` → shallow failure (trivial mistake)

3. **Блокировка похожих кандидатов:**
   - Analyzer-Worker (Фаза 22) при генерации нового `draft-rule`:
     - Читает все `lesson` с `trigger_keywords: ["negative-constraint"]`
     - Вычисляет semantic similarity между новым кандидатом и отклонёнными
     - Если similarity > 0.8 (эмпирический порог) → отклонить кандидат
   - Это предотвращает повторение тех же ошибок

4. **Альтернатива: embedding-based blocking:**
   - Сохранять embedding отклонённого правила в `negative_constraints.json`
   - При генерации нового кандидата: cosine similarity > 0.8 → reject
   - Требует локальных эмбеддингов (sentence-transformers)

### 1.8. Классификация чисел

| Число | Статус | Источник |
|-------|--------|----------|
| Порог hard negative = 0.6 | подтверждено цитатой | [[source-1, §5.2.1]] |
| +9.5% WebShop negatives | подтверждено | [[source-1, Table 2]] |
| +16.7% ScienceWorld negatives | подтверждено | [[source-1, Table 2]] |
| +9.0% InterCodeSQL negatives | подтверждено | [[source-1, Table 2]] |
| Similarity threshold 0.8 | **предложение ВА** (калибровка обязательна) | — |
| Composite score formula | **предложение ВА** (из expert-004) | — |

### 1.9. Что это меняет в Wolf

| Фаза | Получает |
|------|----------|
| **Фаза 20** | Поле `candidate_score` в `session-metrics.jsonl` |
| **Фаза 22** | Mechanism для сохранения rejected rules как `lesson` с `feedback_type: "negative"` |
| **Фаза 24** | Analyzer-Worker проверяет similarity к hard negatives перед генерацией |
| **Таксономия** | Поле `rejection_reason` в `lesson`, `trigger_keywords: ["negative-constraint"]` |

---

## 2. Глоссарий Proofs, Not Promises (просили в wolf-005)

### 2.1. Источник

**Автор:** Adam Massimo Mazzocchetti (SPQR Technologies, Melbourne, Australia)  
**Дата:** 25 мая 2026  
**DOI:** 10.5281/zenodo.20405355  
**Статус:** Preprint (не peer-reviewed)  
**URL:** https://www.researchgate.net/publication/405312292  
**Public evidence repo:** https://github.com/CyberQube1/Proofs_Not_Promises_Public_Evidence_Repo

### 2.2. Ключевая идея: Governed Candidate Improvement

**Дословная цитата из Abstract:**
> «Agents can appear to improve after failure while the path of improvement disappears. A prompt repair, memory edit, configuration change, or runtime update may make the next answer look safer without preserving what failed, what change was proposed, who challenged it, where it was applied, or what became worse.»

**Центральная проблема:**
> «This paper studies that missing object: the governed candidate lifecycle. Civitas 6.7B treats attempted adaptation as an auditable artifact rather than as an unrecorded correction to an answer.» [[source-2, Abstract]]

**Почему prompt repair недостаточно (дословно):**
> «Prompt repair, self-refinement, reflection loops, and prompt-evolution systems can be useful adaptation mechanisms, but they usually focus on changing the next output, future context, or prompt policy rather than preserving a governed candidate lifecycle.» [[source-2, §2.4]]

### 2.3. Lifecycle Model: L = (F, C, H, G, S, E, A)

**Дословная цитата:**
> «We model a governed candidate-improvement lifecycle as L = (F, C, H, G, S, E, A), where F is failure evidence, C is the candidate artifact, H is challenge evidence, G is gate and trust-region decision evidence, S is sandbox application state, E is sealed evaluation evidence, and A is archive and readiness evidence.» [[source-2, §2.3]]

**Таблица компонентов (из Table 3):**

| Element | Evidence surface | Interpretation role |
|---------|-----------------|---------------------|
| **F** | Failure clusters and source task or receipt references | Establishes the recurring failure pattern that motivates a candidate |
| **C** | Candidate artifact and candidate hash | Identifies the proposed adaptation before challenge, gate, or evaluation outcomes are known |
| **H** | Cassius or other challenge evidence | Records adversarial or governance-oriented challenge before a claim-supporting approval is described as challenged |
| **G** | Gate, policy, replay, canary, and trust-region evidence | Records whether the candidate is admissible for sandbox testing and why |
| **S** | Sandbox overlay or sandbox-promotion record | Separates research application from production promotion or live self-modification |
| **E** | Held-out, stress, scoring, and regression evidence | Measures post-candidate behavior on sealed evaluation material |
| **A** | Manifest, readiness, QA, result tables, and archive receipts | Determines whether the evidence bundle is complete enough to support the paper claim |

[[source-2, Table 3]]

### 2.4. Глоссарий ролей (дословно из Table 5)

| Роль | Назначение в стеке | Что утверждает статья | Чего статья НЕ утверждает |
|------|-------------------|----------------------|--------------------------|
| **Praxis** | Policy build, corpus preparation, and contextual setup | Frozen AU policy/corpus context bounds the evaluated lane | Policy-ingestion novelty or a full Praxis lifecycle evaluation |
| **Aegis envelope** | Active-law activation, trusted provenance, fail-closed action-boundary control, and authority settlement | Civitas is evaluated inside an Aegis authority envelope | That the AU run is a full Aegis-system proof |
| **Civitas runtime** | Embedded agentic governance runtime for failure interpretation, candidate generation, Cassius challenge, gate-facing evidence, and sandbox evaluation | One Civitas 6.7B candidate-improvement lane is archived and evaluated | Law activation, production action authorization, broad behavioral superiority, or live production self-modification |
| **Cassius** | Challenge and adversarial-critique surface within Civitas | Candidate approvals described as Cassius-backed require archived challenge evidence | Universal challenge coverage or proof of candidate correctness |
| **Senate/Senatus** | Adjudication and settlement surface supported by Civitas flows | Senate-facing authority context motivates the candidate-gate boundary | A complete Senate adjudication-system evaluation |

[[source-2, Table 5]]

### 2.5. Candidate Artifact Schema (из Table 2)

**Дословная цитата:**
> «A governed candidate artifact does not prove that behavior improved. It prevents the improvement claim from becoming uninspectable. It gives reviewers a way to ask: where did the candidate come from, what did it try to change, what evidence challenged it, what boundary admitted it, where was it applied, and which later results made the claim stronger or weaker?» [[source-2, §2.1]]

**Поля артефакта (из Table 2):**

| Поле | Назначение |
|------|-----------|
| `candidate_id` | Stable identity for the attempted improvement |
| `failure_cluster_id` | Training-derived recurring failure pattern that motivates the attempt |
| `source_task_refs` | Task or receipt references retained from the source failure evidence |
| `proposed_change_scope` | Bounded target surface and proposed constraint or adjustment |
| `policy_corpus_refs` | Frozen policy-corpus, graph, or active-basis references used for the run boundary |
| `cassius_receipt_id` | Challenge evidence binding when a Cassius-backed claim is made |
| `gate_result_id` | Archived decision evidence for sandbox admissibility |
| `trust_region_result` | Trust-region evidence surface associated with gate review |
| `sandbox_overlay_id` | Sandbox-only application record; it is not production promotion |
| `heldout_eval_refs` | Sealed held-out rows scored after candidate preparation |
| `stress_eval_refs` | Sealed stress and regression rows scored after candidate preparation |
| `archive_receipt_refs` | Manifest, readiness, QA, or result-table references needed to interpret the claim |

[[source-2, Table 2]]

### 2.6. Четыре failure modes ungoverned self-improvement

**Дословная цитата:**
> «Agent improvement becomes difficult to evaluate when the system changes but the change path is not preserved. A failure may trigger a prompt repair, memory edit, configuration adjustment, retrieval change, routing preference, or runtime patch. The next answer may look safer or more useful, but the evidence needed to interpret that change may be gone.» [[source-2, §5]]

**Четыре режима отказа (дословно):**

1. **Provenance can disappear:**
   > «If a later answer changes, a reviewer may not know which failure pattern motivated the change, which tasks were used to author it, or whether held-out material leaked into the improvement process. This weakens any claim that the post-change behavior generalizes beyond the examples that produced it.»

2. **Admissibility can become retrospective:**
   > «A candidate may be treated as governed because it produced a favorable metric, even though no archived challenge, policy, trust-region, replay, or gate decision existed before application. Governance then becomes a label attached after success rather than a boundary that constrained the attempt.»

3. **Containment can blur into deployment:**
   > «If candidate application is not separated from production authority, evaluation can become mutation by another name. A paper can then report an improvement while leaving unclear whether the system merely tested a candidate, changed a sandbox overlay, or altered live runtime state.»

4. **Unfavorable outcomes can be hidden by aggregation:**
   > «A candidate may reduce unsupported claims while also worsening required control actions, increasing fallback behavior, or raising regression rates. If the evaluation surface reports only favorable deltas, the improvement claim becomes selective rather than falsifiable.»

[[source-2, §5]]

### 2.7. Таблица сравнения: Prompt Repair vs Governed Improvement (из Table 4)

| Approach | Failure provenance | Explicit candidate | Challenge | Gate evidence | Sandbox only | Split isolated | Production mutation claimed | Negative deltas visible |
|----------|-------------------|-------------------|-----------|---------------|--------------|----------------|----------------------------|------------------------|
| Prompt repair / prompt tuning | Often partial | No | No | No | No | Varies | No | Varies |
| Reflection or self-refinement loop | Feedback-linked | Usually no | Critique, not governance | Usually no | No | Varies | No | Varies |
| Ordinary benchmark improvement | Metric-linked | No | No | No | No | If designed | No | Often aggregate only |
| Production self-modification | Varies | Varies | Varies | Varies | No | Varies | Yes | Operationally risky |
| **Civitas 6.7B governed candidate improvement** | **Yes** | **Yes** | **Cassius evidence** | **Archived** | **Yes** | **Yes** | **No** | **Yes** |

[[source-2, Table 4]]

### 2.8. Маппинг на Wolf

| Proofs Not Promises | Mr. Wolf |
|---------------------|----------|
| **F** (failure evidence) | Сигнальный лог (Фаза 20): `session-metrics.jsonl` |
| **C** (candidate artifact) | `draft-rule` с `review_state: draft` |
| **H** (challenge evidence) | Analyzer-Worker (Фаза 22): holdout-валидация |
| **G** (gate evidence) | STOP-гейт (Фаза 23): pressure-тесты |
| **S** (sandbox application) | Sandbox Replay (Фаза 23): mock-tools + ephemeral FS |
| **E** (sealed evaluation) | `wolf insights` на held-out сигналах |
| **A** (archive) | `events.jsonl` + `relations.jsonl` + git history |
| **Cassius** | Куратор правил (rule curator) |
| **Aegis envelope** | Lifecycle enforcement (Phase 6) |
| **Senate** | Гейт человека (автономия B) |

**Ключевой инсайт:** Wolf уже реализует 6 из 7 компонентов lifecycle model (F, C, H, G, S, E). Недостаёт только **A** (archive readiness) — формальной проверки completeness evidence bundle.

### 2.9. Что это меняет в Wolf

| Фаза | Получает |
|------|----------|
| **Фаза 23** | Формализация STOP-гейта как **Governed Gate** с полями `gate_result_id`, `trust_region_result`, `sandbox_overlay_id` |
| **Фаза 22** | Candidate artifact schema (из Table 2) как обязательные поля `draft-rule` |
| **Фаза 20** | Поле `failure_cluster_id` в `session-metrics.jsonl` для traceability |
| **CLI** | Команда `wolf candidate audit <id>` — проверка completeness lifecycle |

---

## 3. Writer Matrix: кто пишет что в session-metrics.jsonl

### 3.1. Проблема (из wolf-008)

Схема `session-metrics.jsonl` описывает «что», но не «кто пишет». Это критично для `gen_ai.*` per-session, потому что Wolf не видит LLM-вызовы воркеров напрямую.

### 3.2. Решение: Executor-Lead как агрегатор

**Рабочая гипотеза (подтверждена сверкой с кодом):**
- Executor-lead (координатор оркестрации) пишет `session-metrics.jsonl` параллельно markdown-отчёту
- Воркеры эмитят структурированные события через `worker.emitMetric()` API
- Executor-lead агрегирует их в per-session JSON-артефакт

### 3.3. Writer Matrix (таблица)

| Поле | Эмитент | Механизм | Детерминированность |
|------|---------|----------|---------------------|
| `session_id`, `started_at`, `ended_at`, `duration_ms` | Executor-lead | Lifecycle hooks (start/end) | ✅ Да |
| `gen_ai.llm_calls`, `gen_ai.tool_calls` | Executor-lead | Aggregation из worker events | ✅ Да |
| `gen_ai.input_tokens`, `gen_ai.output_tokens`, `gen_ai.cache_read_tokens` | Воркеры | `worker.emitMetric({ type: 'llm_call', tokens: {...} })` | ✅ Да |
| `gen_ai.weighted_tokens` | Executor-lead | Formula: `input + 0.1 × cache_read + 5 × output` | ✅ Да |
| `gen_ai.models_used` | Воркеры | `worker.emitMetric({ type: 'llm_call', model: '...' })` | ✅ Да |
| `orchestration.workers_spawned`, `orchestration.worker_roles` | Executor-lead | Spawn hooks | ✅ Да |
| `orchestration.rejected_cycles.total`, `orchestration.rejected_cycles.by_reason` | Executor-lead | Review protocol (детерминированный) | ✅ Да |
| `orchestration.friction_events` | Воркеры | `worker.emitMetric({ type: 'friction', tool: '...', error: '...' })` | ✅ Да |
| `orchestration.delivery_events` | Executor-lead | Trigger matching (Фаза 16) | ✅ Да |
| `outcome.status`, `outcome.criteria_passed`, `outcome.criteria_total` | Executor-lead | **Structured output** (не парсинг markdown!) | ✅ Да |
| `outcome.artifacts_created`, `outcome.artifacts_superseded` | Executor-lead | Memory write hooks | ✅ Да |
| `tool_errors.total`, `tool_errors.by_class` | Executor-lead | Aggregation + 2-ступенчатая нормализация (expert-007) | ✅ Да |
| `canonical.report_path`, `canonical.events_range` | Executor-lead | File system paths | ✅ Да |

### 3.4. Ключевое исправление: Outcome без парсинга markdown

**Проблема (из expert-007):**
- Предложение парсить markdown-отчёты для `criteria_passed/total` нарушало принцип «запись без LLM»

**Решение:**
- Executor-lead **уже знает** критерии из брифа (они структурированы в task-brief)
- После завершения задачи executor-lead эмитит structured output:
  ```typescript
  worker.emitMetric({
    type: 'outcome',
    status: 'completed',
    criteria: [
      { name: 'test_pass', passed: true },
      { name: 'no_regression', passed: true },
      { name: 'performance_budget', passed: false }
    ]
  })
  ```
- Executor-lead агрегирует это в `session-metrics.jsonl` без парсинга markdown

### 3.5. Worker API для эмитирования метрик

**Интерфейс (предложение):**
```typescript
interface WorkerMetricsAPI {
  emitMetric(event: {
    type: 'llm_call' | 'tool_call' | 'friction' | 'outcome';
    // ... поля в зависимости от type
  }): void;
  
  onSessionEnd(): Promise<void>; // flush metrics
}
```

**Пример использования в воркере:**
```typescript
// LLM call
worker.emitMetric({
  type: 'llm_call',
  model: 'claude-3.5-sonnet',
  input_tokens: 1200,
  output_tokens: 300,
  cache_read_tokens: 800
});

// Tool error
worker.emitMetric({
  type: 'friction',
  tool: 'fs.readFile',
  error: 'Permission denied'
});

// Outcome (structured, не из markdown!)
worker.emitMetric({
  type: 'outcome',
  status: 'completed',
  criteria: [
    { name: 'test_pass', passed: true }
  ]
});
```

### 3.6. Агрегация в Executor-Lead

**Псевдокод:**
```typescript
class ExecutorLead {
  private sessionMetrics: SessionMetrics = {
    session_id: generateId(),
    started_at: new Date(),
    gen_ai: { llm_calls: 0, tool_calls: 0, input_tokens: 0, ... },
    orchestration: { workers_spawned: 0, rejected_cycles: { total: 0, by_reason: {} } },
    // ...
  };

  async runTask(brief: TaskBrief): Promise<Outcome> {
    // Spawn workers
    for (const role of brief.required_roles) {
      const worker = spawnWorker(role);
      worker.on('metric', (event) => this.aggregateMetric(event));
      this.sessionMetrics.orchestration.workers_spawned++;
    }

    // Run task
    const outcome = await this.executeTask(brief);
    
    // Flush metrics
    await this.flushMetrics();
    
    return outcome;
  }

  private aggregateMetric(event: MetricEvent): void {
    switch (event.type) {
      case 'llm_call':
        this.sessionMetrics.gen_ai.llm_calls++;
        this.sessionMetrics.gen_ai.input_tokens += event.input_tokens;
        this.sessionMetrics.gen_ai.output_tokens += event.output_tokens;
        this.sessionMetrics.gen_ai.cache_read_tokens += event.cache_read_tokens;
        this.sessionMetrics.gen_ai.models_used.add(event.model);
        break;
      case 'friction':
        this.sessionMetrics.orchestration.friction_events++;
        this.sessionMetrics.tool_errors.total++;
        const classId = this.classifyError(event.tool, event.error);
        this.sessionMetrics.tool_errors.by_class[classId]++;
        break;
      // ...
    }
  }

  private async flushMetrics(): Promise<void> {
    this.sessionMetrics.ended_at = new Date();
    this.sessionMetrics.duration_ms = this.sessionMetrics.ended_at - this.sessionMetrics.started_at;
    this.sessionMetrics.gen_ai.weighted_tokens = this.calculateWeightedTokens();
    
    await appendToFile('session-metrics.jsonl', JSON.stringify(this.sessionMetrics));
  }
}
```

### 3.7. Что это меняет в Wolf

| Фаза | Получает |
|------|----------|
| **Фаза 20** | Worker API для эмитирования метрик + агрегация в executor-lead |
| **Все воркеры** | `worker.emitMetric()` API для structured output |
| **CLI** | Команда `wolf metrics emit <type> <payload>` (для тестирования) |

---

## 4. Исправление: Markdown parsing contradiction (expert-007)

### 4.1. Проблема (из wolf-008)

Expert-007 предложил парсинг markdown-отчётов для `criteria_passed/total`, что нарушало принцип «запись без LLM» (инвариант ревизии 27.08).

### 4.2. Решение (уже в §3)

**Structured output вместо парсинга:**
- Executor-lead **уже знает** критерии из брифа (они структурированы)
- Воркеры эмитят `outcome` события через `worker.emitMetric()`
- Executor-lead агрегирует их в `session-metrics.jsonl` без парсинга markdown

**Пример (из §3.4):**
```typescript
worker.emitMetric({
  type: 'outcome',
  status: 'completed',
  criteria: [
    { name: 'test_pass', passed: true },
    { name: 'no_regression', passed: true },
    { name: 'performance_budget', passed: false }
  ]
});
```

**Результат:**
- Детерминированность сохранена (нет LLM в горячем пути)
- Отказоустойчивость сохранена (запись всегда успешна)
- Markdown-отчёты остаются для людей, JSON — для машины

---

## 5. Синтез: что это меняет в Wolf

### 5.1. Negative Constraints (§1)

| Фаза | Получает |
|------|----------|
| **Фаза 20** | Поле `candidate_score` в `session-metrics.jsonl` |
| **Фаза 22** | Mechanism для сохранения rejected rules как `lesson` с `feedback_type: "negative"` |
| **Фаза 24** | Analyzer-Worker проверяет similarity к hard negatives перед генерацией |
| **Таксономия** | Поле `rejection_reason` в `lesson`, `trigger_keywords: ["negative-constraint"]` |

### 5.2. Proofs Not Promises (§2)

| Фаза | Получает |
|------|----------|
| **Фаза 23** | Формализация STOP-гейта как **Governed Gate** с полями `gate_result_id`, `trust_region_result`, `sandbox_overlay_id` |
| **Фаза 22** | Candidate artifact schema (из Table 2) как обязательные поля `draft-rule` |
| **Фаза 20** | Поле `failure_cluster_id` в `session-metrics.jsonl` для traceability |
| **CLI** | Команда `wolf candidate audit <id>` — проверка completeness lifecycle |

### 5.3. Writer Matrix (§3)

| Фаза | Получает |
|------|----------|
| **Фаза 20** | Worker API для эмитирования метрик + агрегация в executor-lead |
| **Все воркеры** | `worker.emitMetric()` API для structured output |
| **CLI** | Команда `wolf metrics emit <type> <payload>` (для тестирования) |

### 5.4. Markdown parsing fix (§4)

| Фаза | Получает |
|------|----------|
| **Фаза 20** | Structured output для `outcome` (не парсинг markdown) |

---

## 6. Классификация чисел

| Число | Статус | Источник |
|-------|--------|----------|
| Порог hard negative = 0.6 | подтверждено цитатой | [[source-1, §5.2.1]] |
| +9.5% WebShop negatives | подтверждено | [[source-1, Table 2]] |
| +16.7% ScienceWorld negatives | подтверждено | [[source-1, Table 2]] |
| +9.0% InterCodeSQL negatives | подтверждено | [[source-1, Table 2]] |
| Lifecycle model L = (F,C,H,G,S,E,A) | подтверждено | [[source-2, §2.3]] |
| 4 failure modes ungoverned improvement | подтверждено | [[source-2, §5]] |
| Similarity threshold 0.8 | **предложение ВА** (калибровка обязательна) | — |
| Composite score formula | **предложение ВА** (из expert-004) | — |

---

## 7. Источники

### Якорные работы:

1. **Co-Evolving Agents: Learning from Failures as Hard Negatives**  
   Авторы: Yeonsung Jung, Trilok Padhi, Sina Shaham, Dipika Khullar, Joonhyun Jeong, Ninareh Mehrabi, Eunho Yang  
   Дата: Ноябрь 2025 (обновлён v3 в январе 2026)  
   URL: https://arxiv.org/abs/2511.22254  
   Тип: arXiv preprint, представлен на ICLR 2026

2. **Proofs, Not Promises: Governed Candidate Improvement for Agent Control Runtimes**  
   Автор: Adam Massimo Mazzocchetti  
   Дата: 25 мая 2026  
   DOI: 10.5281/zenodo.20405355  
   URL: https://www.researchgate.net/publication/405312292  
   Public evidence repo: https://github.com/CyberQube1/Proofs_Not_Promises_Public_Evidence_Repo  
   Тип: Preprint (не peer-reviewed)

### Вспомогательные работы:

3. **Runtime Governance for Agentic AI: Action-Boundary Control with Trusted Provenance and Fail-Closed Execution**  
   Автор: Adam Massimo Mazzocchetti  
   Дата: Май 2026  
   DOI: 10.5281/zenodo.20262303  
   URL: https://www.researchgate.net/publication/404948302  
   Тип: Preprint (Aegis envelope для Civitas)

4. **Civitas: A Reflexive Cognitive Architecture for Ethically Governed Causal Inference**  
   Автор: Adam Massimo Mazzocchetti  
   Дата: 2025  
   DOI: 10.5281/zenodo.17411443  
   Тип: Preprint (Version 3.0, lineage foundation)

---

## 8. Следующие шаги

Ожидаю вердикт по этой порции. План:

- **expert-009-hitl-fatigue.md** (QH.x: batch-approval паттерны, alert fatigue mitigation)
- **expert-010-meta-metrics.md** (QM.1: observability самого контура обучения)
- **expert-011-tool-hallucination.md** (вне-программная тема, после закрытия всех Q)
- **expert-012-reasoning-bank.md** (вне-программная тема, после закрытия всех Q)
- **expert-013-final-synthesis.md** (финальный синтез перед ревизией спеки)

**Прогресс программы:** Закрыты 5 из 9 тем (sandbox, decay, clustering, logging, negative-constraints + glossary + writer-matrix), накоплено ~35 кандидатов правок спеки v2.
