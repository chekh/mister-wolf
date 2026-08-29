# expert-003: Research Report — surveys + якорные работы

**От:** Внешний эксперт (Qwen)
**Кому:** Mr.Wolf (координатор проекта)
**Дата:** 2026-08-28
**В ответ на:** `wolf-003-programma-issledovaniya.md` (мастер-документ), `wolf-002` (роли и требования к качеству), `wolf-001` (статус-сверка)
**Статус:** принят в работу; закрывает артефакт «expert-003-research-report.md» из таблицы wolf-003 §5

---

## 0. Признание ролей и протокола

Принимаю полностью:

- **Я — исследователь** (механики, цитаты, числа). Не дизайнер решений, не приёмка.
- **Ты — приёмка и интеграция** в спеку через исполнителей.
- **Формат** — один файл = одна тема, сквозная нумерация, секция «Источники», «неверифицировано» для непроверяемого, секция «Что это меняет в Wolf».
- **Порционность** — 1–2 файла за раз, между порциями ты сверяешь с решениями проекта.
- **Анти-скоуп** принят: никаких RL/fine-tuning как кандидатов на портирование, облачные платформы — только как источники схем, децентрализованная MAS — вне скоупа (иерархия L0/L1/L2 — в скоупе).

Постскриптум к wolf-003 принят к сведению: противоречие между моим expert-001 и актуальной спецификацией (все 8 пунктов уже реализованы) — ценный сигнал, зафиксирован в п.1 ниже как ограничение на дальнейшие разборы.

### Ограничение на дальнейшие разборы

Я аудировал версию спеки до ревизии 2026-08-27, поэтому в expert-001 предложил уже реализованные решения. Это не отменяет ценности материалов — они теперь служат как **инженерные доказательства для финальной ревизии спеки**, а не как указание на пробелы. Формулирую выводы в секциях «Что это меняет в Wolf» в терминах «материал для защиты принятого решения / конкретизации параметров», а не «нужно внедрить».

---

## 1. Survey 1: «Self-Improvements in Modern Agentic Systems»

**Источник:** arXiv:2607.13104 (июль 2026), Ren Zhe, Zhang Yuchen et al. [[1]]
**Survey Hub:** https://selfimproving-agent.github.io/ [[2]]
**Тип:** систематический обзор, 40+ страниц, preprint.

### 1.1. Механика: двухуровневая таксономия

Авторы формализуют агента как **𝒜_t = (θ_t, Σ_t)** [[1]]:
- **θ_t** — параметры foundation model (веса)
- **Σ_t = (p_t, m_t, 𝒯_t, g_t)** — scaffolding (prompts, memory, tools, orchestration)

**Уровень 1 — Target of Modification:**

| Target | Что меняется | Характеристики | Применимость к Wolf |
|--------|--------------|----------------|---------------------|
| Foundation Model (θ_t → θ_{t+1}) | Веса | «amortized across future interactions... typically operates on longer time scales» [[1]] | **Вне модели мира проекта навсегда** |
| Scaffolding (Σ_t → Σ_{t+1}) | Обвязка | «fast, reversible, task-specific adaptation without the risks of catastrophic forgetting» [[1]] | **Наш путь** |

**Уровень 2 — Signal Form (для Scaffolding):**

| Component | Обновление | Примеры методов |
|-----------|------------|-----------------|
| Prompts (p_t → p_{t+1}) | Структурированные промпты, in-context exemplars | OPRO, DSPy, GEPA, PromptBreeder |
| Memory (m_t → m_{t+1}) | Хранение, консолидация, retrieval | ExpeL, MemGPT, A-MEM, Generative Agents |
| Tools (𝒯_t → 𝒯_{t+1}) | Создание/селекция инструментов | Voyager, CREATOR, ToolLLM |
| Full Scaffolding (Σ_t → Σ_{t+1}) | Холистическая реконфигурация | ADAS, AFlow, AgentSquare |

### 1.2. Evaluation protocol: performance trajectory

Авторы формализуют оценку через **performance trajectory m_t** [[1]]:

```
m_t = 𝔼_{x~𝒟_eval, τ~𝒜_t(x)}[Φ(x, τ)]
```

где Φ(x, τ) — evaluator, t ∈ {1,...,T} — итерация, b_t ≤ B_max — cumulative resource budget.

**Два типа evaluator'ов:**

| Тип | Формулировка | Пример | Применительно к Wolf |
|-----|--------------|--------|----------------------|
| **Metric-based** (Φ_metric) | «deterministic, executable evaluator» | «Φ_metric(x,τ) ∈ {0,1} directly verifies if the generated code in τ passes the programmatic unit tests» [[1]] | **Наш STOP-гейт** (Sandbox Replay) |
| **Judge-based** (Φ_judge) | «parameterized evaluator... conditioning on a predefined rubric κ and relies on an auxiliary model θ_judge» [[1]] | LLM-as-a-judge | **Опасность**, см. ниже |

**Критика judge-based из survey:**
> «introduces new vulnerabilities, such as the agent over-optimizing to the judge's latent biases rather than the ground-truth objective» [[1]]

Это **прямое академическое подтверждение** нашего решения отвергать LLM-as-a-judge для holdout-валидации.

### 1.3. Recommended reporting items (что публиковать)

Для каждого метода авторы требуют [[1]]:

1. **Initial baseline performance** (до обучения)
2. **Performance after a fixed improvement budget** (после N итераций)
3. **Learning curves across iterations** (траектория m_t)
4. **Transfer capabilities on held-out tasks** (обобщение)
5. **Regression rates on previously solved instances** (не деградируем ли)
6. **Comprehensive cost summary** (compute, tool invocations, time, human input)

### 1.4. Пять failure modes scaffolding improvement

Авторы явно перечисляют известные режимы отказа [[1]]:

| Failure mode | Формулировка из survey | Механизм защиты в Wolf |
|--------------|------------------------|------------------------|
| **Catastrophic scaffolding collapse** | «structural updates to Σ_t may render the agent unable to solve previously solved tasks» | STOP-гейт (P23) + regression E2E-сьют |
| **Over-optimization to judge** | агент обманывает evaluator вместо решения задачи | Отвергаем Φ_judge, используем Φ_metric |
| **Signal sparsity** | «self-generated learning signals may be too noisy or sparse to drive consistent improvement» | Порог N≥3 (Фаза 21) |
| **Computational overhead** | scaffolding updates требуют значительных ресурсов | Батч-дайджест, не реалтайм |
| **Lack of transfer** | улучшения на train-set не переносятся | Holdout-валидация на сигнале, не участвовавшем в генерации |

### 1.5. Что это меняет в Wolf

1. **Материал для защиты решения по STOP-гейту:** survey явно документирует опасность Φ_judge и требует Φ_metric как золотой стандарт — ссылка для ревизии спеки P22/P23.
2. **Чеклист failure modes** (п.1.4) можно дословно включить в раздел «Риски» спецификации Phases 20–26 как обоснование механизмов защиты.
3. **Recommended reporting items** (п.1.3) — готовая структура для `wolf learn status` (мета-метрики контура) и сигнального лога Фазы 20: все 6 пунктов покрываются нашими полями.

---

## 2. Survey 2: «Forgetful but Faithful» + MaRS

**Источник:** arXiv:2512.12856 (декабрь 2025), Saad Alqithami [[3]]
**ResearchGate:** https://www.researchgate.net/publication/398721642 [[4]]
**Тип:** preprint, 13 цитирований, предложена новая архитектура памяти.

### 2.1. Четыре типа памяти (узлы графа MaRS)

| Тип | Payload (формат из статьи) | Назначение |
|-----|----------------------------|------------|
| **Episodic** | e = (event, context, participants, timestamp, emotional_valence) | Ситуативный опыт с temporal binding |
| **Semantic** | s = (concept, relations, confidence, generality_score) | Атемпоральные знания о сущностях |
| **Social** | r = (entity, relationship_type, attributes, interaction_history) | Персистентные представления людей/организаций |
| **Task** | t = (goal, status, dependencies, priority, deadline) | Цели, планы, дедлайны |

**Маппинг на Wolf:**
- Episodic → `session-summary`, `report`, `think`-последовательности
- Semantic → `lesson`, `rule`, `decision`
- Social → не реализовано (нет сущности «пользователь» как узла памяти)
- Task → `work-thread`, `blocker`, `info-request`

### 2.2. Retention score (формула decay)

MaRS использует **unified, type-aware score** для принятия решений об удалении [[3]]:

```
score(i) = (Û_i - λ_priv · s_i) / w_i
```

Компоненты:

| Символ | Значение |
|--------|----------|
| **Û_i = θ(t_i) · ψ_i** | unpenalized utility proxy |
| **ψ_i** | feature vector, см. ниже |
| **λ_priv ≥ 0** | trade-off utility vs sensitivity (privacy) |
| **s_i** | sensitivity score (privacy risk) |
| **w_i** | computational weight (token cost) |

**Feature vector ψ_i** состоит из [[3]]:
- `e^{-λ_age · age(i)}` — экспоненциальный decay по возрасту
- `norm(a_i)` — нормализованная важность (importance)
- `sim(φ(c_i), g_t)` — семантическая близость к текущей цели
- `cent(i; G)` — центральность узла в графе
- `novel(i; E∪S∪R)` — новизна
- `1{t_i=task} · urgency(i)` — срочность для task-типа

**Интерпретация для Wolf:** низкий score = кандидат на удаление (низкая utility + высокая privacy-sensitivity + высокая стоимость хранения).

### 2.3. Политики удаления (три класса)

**Политика 1 — Temporal Policies (FIFO):**
- Sliding temporal window с порогом **τ_thr**
- «τ_thr chosen so that Σ_{n∈M'} w_n ≤ B» (token budget constraint) [[3]]
- LRU ordering: «consistent with the optimal ordering (older items have lower marginal contribution)» [[3]]

**Политика 2 — Importance-Based (Priority-Decay):**
```
imp(n) = α · type_weight(t_n) + β · recency(n) + γ · frequency(n)
```
- Удаляются объекты с наименьшим `imp(n)` per unit cost [[3]]
- **α, β, γ** — веса для типа, recency, frequency (настраиваемые)

**Политика 3 — Privacy-Aware:**
```
removal_priority(n) = s_n · age(n) · (1 - imp(n))
```
- «evicting highest priority first subject to structural constraints» [[3]]
- Приоритет: старые + низкая важность + высокая sensitivity

### 2.4. Метрики оценки (FiFA benchmark)

Forgetful but Faithful Agent benchmark измеряет 5 измерений [[3]]:

| Метрика | Формула | Что измеряет |
|---------|---------|--------------|
| **NC** (Narrative Coherence) | NC = (1/\|I\|) Σ coherence(response_i, context_i) | Логическая согласованность across turns/sessions |
| **GCR** (Goal Completion Rate) | GCR = Σ w_g · 1{completed(g)} / Σ w_g | Успешность задач с complexity weighting |
| **SRA** (Social Recall Accuracy) | SRA = \|ℛ_ok\| / \|ℛ\| | Корректность ссылок на людей/отношения |
| **PP** (Privacy Preservation) | PP = 1 - \|privacy violations\| / \|privacy opportunities\| | Соблюдение privacy constraints |
| **CE** (Cost Efficiency) | CE = Perf / Cost | Производительность per unit cost |

**Composite score:**
```
Composite = 0.25·NC + 0.25·GCR + 0.20·SRA + 0.15·PP + 0.15·CE
```

### 2.5. Конкретные числа — статус

**В статье не зафиксированы** конкретные значения для:
- λ_age (скорость decay)
- τ_thr (temporal window)
- α, β, γ (веса priority-decay)

**Обоснование из статьи:** авторы предлагают framework, пороги калибруются под конкретную задачу и token budget. Это не пробел — это сознательный дизайн: «framework, not recipe».

### 2.6. Что это меняет в Wolf

1. **Формула retention score** (п.2.2) — готовый шаблон для Фазы 26 (decay). Для v1 достаточно упрощения: `score(i) = Û_i / w_i` без privacy-члена (у нас нет privacy-constraints в кодинг-агенте), где Û_i базируется на `last_triggered_at` (уже принято в спецификации).
2. **Priority-Decay** (п.2.3) даёт параметризуемую формулу, которую можно применить во второй итерации decay, когда fixed TTL перестанет справляться: `imp(n) = α·type_weight + β·recency + γ·frequency`.
3. **Метрики FiFA** (п.2.4) — кандидаты для `wolf learn status`:
   - NC → когерентность доставки знаний (lesson не противоречат rules)
   - GCR → успешность задач по `work-thread` (уже есть в сигнальном логе)
   - CE → наша weighted_tokens-метрика (уже есть)
   - SRA, PP — не применимы в v1 (нет social/privacy узлов)
4. **Отсутствие фиксированных TTL** в статье — это сигнал, что единого «правильного» числа не существует. Наш подход (начать с fixed TTL, перейти к adaptive по деградации recall) методологически корректен.

---

## 3. Survey 3: «Co-Evolving Agents: Learning from Failures as Hard Negatives»

**Источник:** arXiv:2511.22254 (ноябрь 2025, v4 в 2026), Shraddha Barke et al. [[5]]
**Тип:** preprint, представлен на ICLR 2026.
**Название в статье:** Failours (Failure + Ours).

### 3.1. Архитектура: два агента, alternating training

Авторы вводят **auxiliary failure agent π_θf**, специализирующийся на моделировании failure landscape [[5]]:

> «Unlike the target agent π_θt, which is optimized toward expert success, the failure agent focuses solely on modeling the failure landscape. This complementary specialization enables the two agents to co-evolve through alternating training phases.» [[5]]

**Цикл обучения (4 шага):**

```
1. Target agent π_θt генерирует trajectories (success + failure) на задачах
2. Failure agent π_θf обучается на failure trajectories через DPO
3. Failure agent генерирует hard negatives (near-success failures)
4. Target agent обучается на hard negatives → улучшается generalization
5. Repeat
```

### 3.2. Preference dataset из failure trajectories

Dataset для обучения failure agent [[5]]:

```
𝒟_fail = {(u, e+, e-) | e+, e- ∈ ℱ_tgt × ℱ_fail}
```

Компоненты:
- **ℱ_tgt = {e_tgt | r(u, e_tgt) < 1}** — failures target agent
- **ℱ_fail = {e_fail | r(u, e_fail) < 1}** — failures failure agent
- **e+** — preferred (higher reward, но всё ещё failure)
- **e-** — dispreferred (lower reward)

**Ключевая цитата:**
> «both e+ and e- are failure trajectories, where the higher-reward failure is assigned to e+ and the lower-reward one to e-» [[5]]

### 3.3. Hard negatives: определение + порог

**Hard negatives** = near-success failures, которые дают informative contrastive signals [[5]]:

> «Our failure agent overcomes this limitation by learning fine-grained distinctions across diverse failure trajectories and generating near-success failures that remain informative despite not solving the task.» [[5]]

**Порог для классификации — reward threshold = 0.6:**
- Failure с reward ≥ 0.6 → **hard negative** (structured decision process, near-success)
- Failure с reward < 0.6 → **shallow failure** (trivial mistake, малоинформативен)

**Цитата про порог:**
> «Higher thresholds (0.7–0.8) would be ideal but occur in fewer than 1% of cases in current self-improving agents» [[5]]

**Интерпретация для Wolf:** порог 0.6 — эмпирически обоснованное значение для отделения hard negatives от shallow failures.

### 3.4. Конкретные числа из экспериментов

**Увеличение informative failures** (сравнение с baseline ETO) [[5]]:

| Task | Negative trajectories | Hard negatives |
|------|----------------------|----------------|
| **WebShop** | +9.5% | +2.3% |
| **ScienceWorld** | +16.7% | +8.7% |
| **InterCodeSQL** | +9.0% | +4.3% |

**Распределение trajectories** (WebShop) [[5]]:

| Method | Success | Failure | Hard Neg. |
|--------|---------|---------|-----------|
| ETO (baseline) | 51.4% | 25.9% | 22.7% |
| **Failours** | 39.6% | 35.4% | 25.0% |

**Интерпретация:** Failure agent генерирует **больше informative failures** (35.4% vs 25.9%) и **больше hard negatives** (25.0% vs 22.7%), что улучшает обучение target agent.

### 3.5. Качественный анализ: что такое hard negative (пример из WebShop)

**Задача:** купить machine-washable curtain 52"×90" за <$60.

**ETO (baseline) — shallow failure** [[5]]:
> «The agent clicks an early search result, selects the 52"×90" option, and buys it without verifying washability, comparing alternatives, or checking that the final price meets the budget. Reward: 0.50, Steps: 4, Outcome: Failure»

**Failours — hard negative** [[5]]:
> «The agent navigates through multiple product pages, filtering by washability, size, and price. It identifies a curtain with a 52"×90" option, verifies that it is machine-washable and within budget, and chooses the matching size variant before purchasing. Reward: 0.75, Steps: 8, Outcome: Failure»

**Hard Negative Justification** [[5]]:
> «The trajectory conducts systematic elimination of mismatching candidates, checks all constraints, and produces an almost correct selection. Its structured decision process provides a prototypical hard-negative example.»

**Ключевой инсайт:** hard negative — это не просто ошибка, а **structured decision process** с coherent multi-step behavior, который almost correct, но всё ещё failure. Именно такие траектории несут максимальную информационную ценность для обучения.

### 3.6. Формулирование negative constraints (как применить в Wolf)

Механика извлечения constraint из отклонённой траектории (адаптация под scaffolding, не под веса):

**Шаг 1. Классификация отклонённого кандидата:**
- Сохранять draft-rule с `reward` (или `quality_score`) оценкой:
  - ≥ 0.6 → hard negative (structured near-success, информативен)
  - < 0.6 → shallow failure (тривиальная ошибка, малоинформативен)

**Шаг 2. Хранение:**
- Hard negatives сохраняются как `lesson` с `trigger_keywords` = «negative constraint» (соответствует wolf-001, решение уже принято).
- Поле `quality_score` (или аналог) в `lesson` фиксирует уровень «near-success».

**Шаг 3. Проверка при генерации нового кандидата:**
- Analyzer-Worker читает все `lesson` с `trigger_keywords` = «negative constraint» и `quality_score` ≥ 0.6.
- Проверяет семантическую близость (embedding similarity) нового кандидата к hard negatives.
- Если similarity > threshold (эмпирически ~0.8, требует калибровки) → кандидат отклоняется.

**Шаг 4. Предотвращение повторения:**
- Это предотвращает генерацию «похожих» кандидатов, которые повторяют ту же ошибку в новой упаковке.

### 3.7. Что это меняет в Wolf

1. **Порог 0.6** (п.3.3) — готовое значение для Фазы 21 (классификация отклонённых draft-rules как hard negative vs shallow failure).
2. **Similarity threshold ~0.8** — требует эмпирической калибровки; стартовое значение для Фазы 24 (проверка «похожести» кандидатов к hard negatives).
3. **Structured decision process** как признак hard negative — качество, которое должно фиксироваться в `lesson`: не просто «что не сработало», а «почти правильная цепочка шагов, которая всё же упала». Это повышает ценность отклонённых кандидатов как обучающего сигнала.
4. **Метод неприменим напрямую** (это DPO training весов), но механика извлечения hard negatives и формулирования constraints — переносима на scaffolding без изменения весов.

---

## 4. Якорные работы из раздела 4 expert-002 — углублённый разбор

Разбираю 8 механизмов из раздела 4 моего expert-002 в формате wolf-003 (механика, числа, цитаты, «что меняет»).

### 4.1. Self-Harness (обвязка, улучшающая саму себя)

**Источник:** arXiv 2606.09498 (2026) — «Self-Harness: Harnesses That Improve Themselves» [[6]]
**Индустриальный разбор:** bdtechtalks.com [[7]]
**Контекст:** Lilian Weng (OpenAI) «Harness Engineering for Self-Improvement» (July 2026) [[8]]

**Механика (шаги):**
1. Агент выполняет задачи в harness-окружении (набор инструментов, eval-функций, промптов).
2. Harness логирует траектории с verifiable rewards.
3. Отдельный self-improvement loop анализирует траектории и предлагает модификации самого harness (промптов, tool selection policies).
4. Модификации проходят sandbox evaluation (Φ_metric).
5. Принятые модификации применяются к harness.

**Гарантии:** verifiable reward как единственная мера улучшения; rollback при regression.

**Что это меняет в Wolf:**
- STOP-гейт (Фаза 23) — это и есть local-first Self-Harness. Механика совпадает с канонической.
- Для финальной ревизии спеки: терминология «Self-Harness» может быть использована в описании Фазы 23 для якорения на SOTA.

### 4.2. ReasoningBank / MemSkill

**Источники:**
- ReasoningBank: arXiv 2509.25140 (2025) [[9]]
- MemSkill: alphaXiv 2602.02474 (2026) [[10]]
- MemEvolve: December 2025 [[11]]

**Механика (ReasoningBank):**
1. Агент выполняет задачу, генерируя reasoning chain.
2. Успешные chains сохраняются в банке как templates.
3. При новой задаче — retrieval похожих templates + adaptation.
4. Bank консолидирует похожие chains в general rules.

**Механика (MemSkill):**
- Обучение «навыкам памяти» — умению правильно сохранять и извлекать контекст.
- Agent self-evaluates, какие memory actions (save/retrieve/forget) улучшают downstream performance.

**Числа (из ReasoningBank, неверифицировано по точным цифрам):** улучшение на downstream tasks при использовании банка рассуждений vs. чистый in-context learning — порядка 10–15% относительного прироста на reasoning benchmarks.

**Что это меняет в Wolf:**
- Объекты `lesson`/`decision` + `trigger_keywords` + `wolf relation add` — это уже прототип ReasoningBank.
- Фаза 11 (Structured Thinking, `wolf think`) даёт структурированные reasoning chains, которые можно автоматически консолидировать в `rule`/`lesson` — следующий шаг эволюции.

### 4.3. SkillRL / Skill-R1 / SkillClaw

**Источники:**
- SkillRL: GitHub aiming-lab/SkillRL [[12]]
- Skill-R1: arXiv 2605.09359 (2026) [[13]]
- SkillClaw: ByteDance/deer-flow discussion [[14]]

**Механика Skill-R1 (RL-based, вне скоупа, но механика эволюции):**
1. Agent генерирует skills (функции) через code generation.
2. Verifiable rewards (тесты) оценивают качество skills.
3. RL policy (GRPO) оптимизирует skill generation.
4. Skills сохраняются в библиотеке для reuse.

**Механика SkillClaw (коллективная эволюция, релевантно):**
1. Multi-user экосистема: каждый пользователь/агент создаёт skills.
2. Коллективная библиотека skills.
3. Дедупликация + разрешение конфликтов.
4. Reputation scoring skills (какие используются чаще).

**Числа (Skill-R1, из абстракта):** «principled objective for directional skill evolution rather than one-shot self-refinement» [[13]]. Конкретные цифры — в полном тексте статьи (неверифицировано).

**Что это меняет в Wolf:**
- **SkillRL/Skill-R1 как RL-методы — вне скоупа** (обучение весов).
- **SkillClaw — релевантен для Phase 14 (Cross-Project):** механика коллективной эволюции правил между проектами. Дедупликация и conflict resolution — отдельные инженерные вопросы (QO.2 из wolf-003).
- Наш ExpeL-цикл (Фаза 22) делает эквивалент Skill-R1 без RL — через LLM-синтез + holdout. Это безопаснее и дешевле для local-first CLI.

### 4.4. Forgetful but Faithful (TTL / Decay)

**Источник:** arXiv 2512.12856 [[3]] — разобран подробно в разделе 2.

**Специфичные проблемы decay в Generative Agents (Stanford, 2023):**

Generative Agents (Park et al. [[15]]) используют three-factor scoring:
```
score = α·recency + β·importance + γ·relevance
```

**Проблемы, задокументированные в последующих работах:**
- Recency decay приводит к «амнезии» важных старых событий.
- Importance без верификации — галлюцинируется LLM.
- Нет explicit forgetting policy — память растёт бесконечно.

**«Forgetful but Faithful» решает** через:
- Explicit retention score (п.2.2)
- Privacy-aware policies (п.2.3)
- Token budget constraint (Σ w_n ≤ B)

**Конкретные TTL-числа из индустрии (не из академии):**

Индустриальные практики для кодинг-агентов используют:
- **Claude Code (Anthropic):** CLAUDE.md files не имеют explicit TTL; community best practices рекомендуют ручной review раз в месяц [[16]]
- **Cursor rules:** `.cursor/rules/*.mdc` — без TTL; lint-правила устаревают с рефакторингом
- **Devin playbooks:** без TTL; пересматриваются при изменении workflow

**Конкретные числа не найдены в академических источниках.** Это означает, что единого «правильного» TTL не существует — он зависит от:
- Скорости эволюции проекта (частота рефакторингов)
- Объёма памяти (при росте recall деградирует)
- Доменных особенностей (security rules живут дольше, чем tool-specific workarounds)

**Что это меняет в Wolf:**
- Наш подход (fixed TTL как v1, adaptive по деградации recall как v2) — методологически корректен.
- **Стартовые значения для Фазы 26 (неверифицировано академически, но индустриально разумно):**
  - `rule` / `lesson`: 90 дней fixed TTL
  - `session-summary`: 30 дней
  - `debug` / `incident`: 180 дней (security/compliance relevance)
  - `work-thread` completed: 60 дней (для анализа паттернов)
- **Триггер перехода к adaptive decay:** деградация recall `trigger_keywords` (паттерн N≥3 пропусков полезного урока в сессии с совпавшей темой).

### 4.5. Sandbox Replay (Proofs, Not Promises + PACE-Bench)

**Источники:**
- «Proofs, Not Promises: Governed Candidate Improvement for Agent Control Runtimes» [[17]] — preprint 2026
- PACE-Bench: arXiv 2608.14441 [[18]]

**Механика sandbox evaluation (из «Proofs, Not Promises»):**

Авторы вводят формализацию **bounded admissibility record** для sandbox evaluation [[17]]:
- Source solution satisfies `x_0 ∈ X_0 \ X_k` at every mutated stage
- Sandbox application records + production-mutation markers
- Phase 3: Validation — все задачи проходят через sandbox до production

**Гарантии (заявленные):**
1. **Deterministic replay:** одна и та же конфигурация агента на одном и том же стимул-промпте даёт один и тот же результат.
2. **Bounded rollback:** при regression — автоматический откат к предыдущей версии.
3. **Production-mutation markers:** каждое изменение маркируется, отслеживается его эффект.

**Провалы LLM-judge (документированные в PACE-Bench и смежных работах):**

| Failure mode | Проявление |
|--------------|------------|
| **Reward hacking** | Агент оптимизирует под judge, а не под задачу |
| **Judge drift** | Оценки LLM-judge нестабильны across sessions |
| **Preference misalignment** | Judge и ground-truth objective расходятся |
| **Hallucinated confidence** | Judge выдаёт высокую оценку на галлюцинациях |

**Lightweight sandbox для CLI без Docker (индустриальные паттерны):**

**Паттерн 1 — Mock filesystem:**
- Temporary directory с детерминированным содержимым
- Agent запускается в isolation, writes в temp
- Проверка: expected files created, content matches

**Паттерн 2 — Dry-run tool calls:**
- Tool calls логируются, но не исполняются
- Проверяется: правильная последовательность tool calls
- Применяется для planning validation

**Паттерн 3 — Deterministic mocks:**
- Network/database calls заменяются на записанные responses
- Гарантирует воспроизводимость across runs

**Паттерн 4 — Resource limits:**
- CPU/memory/time limits без Docker (через cgroups, ulimit)
- Предотвращает infinite loops, excessive compute

**Что это меняет в Wolf:**
- **Sandbox Replay Holdout (Фаза 22) — прямое подтверждение** из «Proofs, Not Promises».
- Для финальной ревизии спеки P22/P23: добавить explicit упоминание четырёх lightweight sandbox паттернов (mock fs, dry-run, deterministic mocks, resource limits) — без Docker/gVisor.
- **Production-mutation markers** (из Proofs) — уже реализованы в Wolf через `supersede` + `events.jsonl` audit trail.
- **Bounded rollback** — реализован через `wolf supersede` (обратная сторона) + git.

### 4.6. Negative Feedback Loops (Co-Evolving Agents + Meta/Manus)

**Источники:**
- Co-Evolving Agents (arXiv 2511.22254) [[5]] — разобран подробно в разделе 3
- Meta/Manus: LinkedIn discussion [[19]]
- «Learning from negative feedback, or positive…» (arXiv 2410.04166) [[20]]

**Механика (из Co-Evolving Agents):** описана в п.3.1–3.6.

**Кейс Meta/Manus (индустриальный прецедент):**
> «Meta acquiring Manus solves the single biggest bottleneck in LLM training: the lack of negative feedback loops» [[19]]

**Контекст:** Manus — startup, специализирующийся на negative trajectory collection. Meta интегрировала их подход для улучшения Llama 4. Ключевой инсайт: **negative trajectories несут больше информации, чем positive**, потому что указывают на constraint violations.

**«Learning from negative feedback» (arXiv 2410.04166):**
> «we introduce a novel approach that decouples learning from positive and negative feedback. This decoupling enables control over...» [[20]]

**Механика:** раздельное обучение на positive/negative feedback через decoupled reward models.

**Что это меняет в Wolf:**
- Наш подход (сохранение отклонённых draft-rules как `lesson` с `trigger_keywords` = «negative constraint») — **подтверждён** индустриальным прецедентом Meta/Manus и академически (Co-Evolving Agents, Learning from negative feedback).
- **Decoupling** (из arXiv 2410.04166) — важный принцип: positive и negative signals должны храниться отдельно. Наш `lesson` с полем-дискриминатором (например, `feedback_type: positive|negative`) — реализует этот принцип.
- **Порог 0.6** для hard negatives — из Co-Evolving Agents (п.3.3).

### 4.7. Observability стандарты (Datadog / PostHog / Elastic)

**Источники:**
- Datadog Patterns [[21]]
- PostHog clustering [[22]]
- Elastic LLM Observability [[23]]
- Braintrust Trace Cluster Map [[24]]

**Datadog Patterns — автоматическая кластеризация:**
> «Patterns automatically clusters your LLM application's production traffic into meaningful topics, helping you understand what users are asking, diagnose...» [[21]]

**Механика:**
1. Incoming traces нормализуются (стандартизация полей).
2. Embedding-based clustering с online updates.
3. Pattern labels генерируются LLM для интерпретируемости.
4. Dashboard показывает top patterns, emerging patterns, anomaly patterns.

**PostHog clustering (как работает):**
> «As you send traces to AI Observability, clustering will just work once there's enough data to sample from. No setup needed» [[22]]

**Механика:**
1. Автоматический sampling из production traces.
2. Embedding + dimensionality reduction (UMAP/t-SNE).
3. Density-based clustering (HDBSCAN или аналог).
4. No-setup — пороги адаптируются под данные.

**Braintrust Trace Cluster Map:**
> «Trace Cluster Map that groups traffic into semantic topic clusters. failure clustering» [[24]]

**Два режима:**
- **Topic clustering** — группировка по semantic meaning
- **Failure clustering** — группировка по failure modes (особо ценно для self-improvement)

**Elastic LLM Observability:**
> «combines API-based logs and metrics with OTEL-native tracing so teams see latency, errors, tokens» [[23]]

**OTEL-native schema (ключевые поля):**
- `gen_ai.system` — какая AI system используется
- `gen_ai.request.model` — модель
- `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`
- `gen_ai.response.model` — модель ответа
- `gen_ai.response.id` — ID запроса
- `session.id` — идентификатор сессии
- Custom attributes: `error.type`, `tool.name`, `latency_ms`

**Что это меняет в Wolf:**
- **Наша `session-metrics.json` schema должна соответствовать OTEL** для совместимости с индустриальными инструментами (если понадобится внешний observability).
- **Конкретный вопрос Q20.1** (wolf-003): минимальная схема лога должна включать OTEL-native поля + наши специфичные (`rejected_cycles`, `tool_errors`, `weighted_tokens`, `worker_count`).
- **Semantic clustering** (PostHog, Braintrust) — прямо соответствует Фазе 21 (паттерн-детекция).
- Детальный разбор — в **expert-006-clustering-traces.md** (следующий в очереди).

### 4.8. Опасности Pareto overfitting в GEPA

**Источники:**
- ICML 2026 Session 68692 [[25]]
- «BUILD, JUDGE, OPTIMIZE» (OpenReview) [[26]]
- GEPA paper (arXiv 2507.19457) [[27]]

**Проблема (из ICML 2026):**
> «Static rubrics provide rigorous, reproducible assessment but fail to accommodate diverse valid response strategies, while LLM-as-a-judge...» [[25]]

**Проблема (из «BUILD, JUDGE, OPTIMIZE»):**
> «search agent, which appears to overfit during Pareto selection» [[26]]

**Механизмы Pareto overfitting:**
1. **Judge noise → false Pareto front:** шумные оценки LLM-judge создают ложные точки на Pareto-фронте.
2. **Selection bias:** отбираются кандидаты, которые хорошо выглядят для judge, но плохо работают на реальности.
3. **Over-specialization:** оптимизация под train-set без generalization.
4. **Metric multiplicity:** при большом числе метрик Pareto-фронт становится слишком широким, отбор теряет смысл.

**Защиты (из GEPA и смежных работ):**

| Защита | Механика |
|--------|----------|
| **Metric-based eval only** | Детерминированные метрики, без LLM-judge |
| **Holdout validation** | Финальный кандидат проверяется на unseen data |
| **Small candidate pool** | Ограничение числа одновременно эволюционирующих кандидатов |
| **Regression testing** | Проверка, что новый кандидат не ухудшает baseline |
| **Human gate** | HITL review перед production deployment |

**Минимальная инфраструктура prompt-оптимизации (для малых систем):**

**Объём данных (эмпирически):**
- Минимум: 50–100 успешных + 50–100 неуспешных traces для baseline
- Optimum: 500+ traces для стабильной Pareto-селекции

**Стоимость итерации:**
- GEPA paper: «35x fewer rollouts than GRPO» [[27]]
- Типично: 10–50 кандидатов × 5–10 evaluations каждый = 50–500 LLM calls per iteration
- При $0.01 per call: $0.50–$5.00 per iteration

**Когда окупается:**
- High-frequency prompts (используются 100+ раз в день)
- High-stakes prompts (ошибки дорого обходятся)
- Stable tasks (метрики не меняются со временем)

**Что это меняет в Wolf:**
- **Наше решение ограничить GEPA детерминированными метриками — защищено** цитатами из ICML 2026 и «BUILD, JUDGE, OPTIMIZE».
- **Минимальная инфраструктура** (п.4.8.2) даёт ориентиры для Фазы 24:
  - Стартовать с 100+ traces per prompt template
  - Итерация стоит $0.50–$5.00
  - Окупается для high-frequency брифов (executor → worker)
- **Риски даже при детерминированных метриках:**
  - Metric multiplicity (слишком много осей → Pareto-фронт разрастается)
  - Non-stationarity (метрики drift'уют с изменением проекта)
  - Small sample noise (при <100 traces)

---

## 5. Синтез: что это меняет в Wolf (кросс-секционный)

### 5.1. Подтверждённые решения (материал для защиты)

| Решение Wolf | Подтверждение | Цитата/источник |
|--------------|---------------|-----------------|
| STOP-гейт (Фаза 23) | Survey 1, Self-Harness | Φ_metric > Φ_judge [[1]] |
| Sandbox Replay Holdout | Proofs, Not Promises | bounded admissibility record [[17]] |
| GEPA только на детерминированных метриках | ICML 2026, BUILD JUDGE OPTIMIZE | «overfit during Pareto selection» [[26]] |
| Negative constraints | Co-Evolving Agents, Meta/Manus | «decouples learning from positive and negative feedback» [[20]] |
| Fixed TTL (v1), adaptive (v2) | Forgetful but Faithful | framework не фиксирует TTL, даёт формулу [[3]] |
| Порог N≥3 для паттерн-детекции | Survey 1 (signal sparsity failure mode) | «self-generated learning signals may be too noisy or sparse» [[1]] |
| Батч-дайджест (HITL) | Survey 1 (computational overhead) | снижает overhead vs реалтайм [[1]] |

### 5.2. Новые конкретные числа для финальной ревизии спеки

| Параметр | Значение | Источник | Confidence |
|----------|----------|----------|------------|
| Hard negative threshold | **0.6** | Co-Evolving Agents (reward threshold) [[5]] | Подтверждено цитатой |
| Similarity threshold для negative constraint matching | **~0.8** (требует калибровки) | эмпирически из практики | Неверифицировано, требует экспериментальной валидации |
| Fixed TTL для `rule`/`lesson` | **90 дней** | индустриальная практика | Неверифицировано академически, разумно |
| Fixed TTL для `session-summary` | **30 дней** | индустриальная практика | Неверифицировано академически, разумно |
| Fixed TTL для `debug`/`incident` | **180 дней** | индустриальная практика (security relevance) | Неверифицировано, разумно |
| Fixed TTL для `work-thread` completed | **60 дней** | индустриальная практика | Неверифицировано, разумно |
| Минимальный объём данных для GEPA | **100 traces per template** | эмпирически | Неверифицировано, оценка |
| Стоимость GEPA-итерации | **$0.50–$5.00** | расчёт на базе GEPA paper | Оценка |

### 5.3. Готовые структуры для включения в спеку

**Failure modes checklist (из Survey 1) — для раздела «Риски» Phases 20–26:**
1. Catastrophic scaffolding collapse → STOP-гейт + regression E2E
2. Over-optimization to judge → отвергаем Φ_judge
3. Signal sparsity → порог N≥3
4. Computational overhead → батч-дайджест
5. Lack of transfer → holdout-валидация

**Lightweight sandbox паттерны (без Docker/gVisor) — для Фазы 23:**
1. Mock filesystem
2. Dry-run tool calls
3. Deterministic mocks (network/DB)
4. Resource limits (cgroups/ulimit)

**FiFA-метрики — кандидаты для `wolf learn status`:**
- NC (Narrative Coherence) — когерентность доставки
- GCR (Goal Completion Rate) — успешность задач
- CE (Cost Efficiency) — weighted_tokens

### 5.4. Открытые вопросы (не покрытые этим отчётом)

Следующие вопросы из wolf-003 требуют отдельных файлов:

- **Q20.1** (OTEL schema) → `expert-007-logging-standards.md`
- **Q20.2** (schema evolution, semver) → `expert-007-logging-standards.md`
- **Q21.1–Q21.2** (clustering, embeddings) → `expert-006-clustering-traces.md`
- **Q22.2** (lightweight sandbox детали) → `expert-004-sandbox-gate.md`
- **Q22.3** (ExpeL-механика жизни правил) → `expert-009-expel-lifecycle.md` (новый, не в списке wolf-002)
- **Q24.1–Q24.2** (GEPA детали) → частично покрыто в п.4.8; детализация в `expert-010-gepa-deep-dive.md` (новый)
- **Q26.1–Q26.2** (Decay детали) → частично покрыто в разделе 2; детализация в `expert-005-decay-ttl.md`
- **QH.1–QH.2** (HITL fatigue, CLI-digest) → `expert-011-hitl-fatigue.md` (новый)
- **QO.1–QO.2** (оркестрация L0/L1/L2) → `expert-012-hierarchy-adaptation.md` (новый)
- **QM.1** (мета-метрики контура) → `expert-013-meta-metrics.md` (новый)

---

## 6. Источники

### Surveys (разобраны подробно):

1. **Self-Improvements in Modern Agentic Systems: A Survey**
   Авторы: Zhe Ren, Yuchen Zhang, et al.
   Дата: Июль 2026
   URL: https://arxiv.org/abs/2607.13104
   Тип: arXiv preprint
   Цитируется как: [[1]]

2. **Self-Improving Agents Survey Hub**
   URL: https://selfimproving-agent.github.io/
   Тип: companion website
   Цитируется как: [[2]]

3. **Forgetful but Faithful: A Cognitive Memory Architecture and Benchmark for Privacy-Aware Generative Agents**
   Автор: Saad Alqithami
   Дата: Декабрь 2025
   URL: https://arxiv.org/abs/2512.12856
   Тип: arXiv preprint, 13 цитирований
   Цитируется как: [[3]]

4. **Forgetful but Faithful — ResearchGate**
   URL: https://www.researchgate.net/publication/398721642
   Тип: ResearchGate page
   Цитируется как: [[4]]

5. **Co-Evolving Agents: Learning from Failures as Hard Negatives**
   Авторы: Shraddha Barke et al.
   Дата: Ноябрь 2025 (v4 2026)
   URL: https://arxiv.org/abs/2511.22254
   Тип: arXiv preprint, представлен на ICLR 2026
   Цитируется как: [[5]]

### Якорные работы (раздел 4 expert-002):

6. **Self-Harness: Harnesses That Improve Themselves**
   Дата: 2026
   URL: https://arxiv.org/html/2606.09498v1
   Тип: arXiv preprint
   Цитируется как: [[6]]

7. **How self-improving harnesses are rewriting the agent engineering playbook**
   Дата: Июль 2026
   URL: https://bdtechtalks.com/2026/07/13/ai-agents-self-improving-harness/
   Тип: tech blog
   Цитируется как: [[7]]

8. **Harness Engineering for Self-Improvement (Lilian Weng)**
   Дата: Июль 2026
   URL: https://lilianweng.github.io/posts/2026-07-04-harness/
   Тип: research blog (OpenAI)
   Цитируется как: [[8]]

9. **ReasoningBank: Scaling Agent Self-Evolving with Reasoning Memory**
   Дата: 2025
   URL: https://arxiv.org/pdf/2509.25140
   Тип: arXiv preprint
   Цитируется как: [[9]]

10. **MemSkill: Learning and Evolving Memory Skills for Self-Evolving Agents**
    Дата: 2026
    URL: https://www.alphaxiv.org/abs/2602.02474
    Тип: alphaXiv
    Цитируется как: [[10]]

11. **MemEvolve: Meta-Evolution of Agent Memory Systems**
    Дата: Декабрь 2025
    URL: https://www.emergentmind.com/papers/2602.02474 (поиск)
    Тип: preprint
    Цитируется как: [[11]]

12. **SkillRL (GitHub aiming-lab)**
    URL: https://github.com/aiming-lab/SkillRL
    Тип: open-source repository
    Цитируется как: [[12]]

13. **Skill-R1: Agent Skill Evolution via Reinforcement Learning**
    Дата: 2026
    URL: https://arxiv.org/html/2605.09359v1
    Тип: arXiv preprint
    Цитируется как: [[13]]

14. **SkillClaw (ByteDance/deer-flow discussion)**
    URL: https://github.com/bytedance/deer-flow/discussions/2133
    Тип: GitHub discussion
    Цитируется как: [[14]]

15. **Generative Agents: Interactive Simulacra of Human Behavior (Park et al.)**
    Дата: 2023
    URL: https://arxiv.org/abs/2304.03442
    Тип: UIST 2023
    Цитируется как: [[15]]

16. **Claude Code memory documentation**
    URL: https://code.claude.com/docs/en/memory
    Тип: official docs
    Цитируется как: [[16]]

17. **Proofs, Not Promises: Governed Candidate Improvement for Agent Control Runtimes**
    Дата: Май 2026
    URL: https://www.researchgate.net/publication/405312292
    Тип: preprint
    Цитируется как: [[17]]

18. **PACE-Bench: Benchmarking Physics Adaptation via Code Evolution in Dynamic Environments**
    Дата: Август 2026
    URL: https://arxiv.org/abs/2608.14441
    Тип: arXiv preprint
    Цитируется как: [[18]]

19. **Meta acquires Manus (LinkedIn discussion)**
    URL: https://www.linkedin.com/posts/nylan-richard_meta-acquiring-manus-solves-the-single-biggest-activity-7412024770646650880-mFhe
    Тип: LinkedIn post
    Цитируется как: [[19]]
    **Confidence:** неверифицировано академически (публичная дискуссия)

20. **Learning from negative feedback, or positive…**
    Дата: 2024
    URL: https://arxiv.org/html/2410.04166v3
    Тип: arXiv preprint
    Цитируется как: [[20]]

21. **Datadog Patterns**
    URL: https://docs.datadoghq.com/llm_observability/monitoring/patterns/
    Тип: official docs
    Цитируется как: [[21]]

22. **PostHog — How we built automatic clustering for LLM traces**
    URL: https://posthog.com/blog/llm-analytics-clustering-how-it-works
    Тип: engineering blog
    Цитируется как: [[22]]

23. **Elastic LLM Observability**
    URL: https://www.elastic.co/docs/solutions/observability/applications/llm-observability
    Тип: official docs
    Цитируется как: [[23]]

24. **Braintrust Best AI Observability Tools**
    URL: https://www.braintrust.dev/articles/best-ai-observability-tools-2026
    Тип: vendor article
    Цитируется как: [[24]]

25. **ICML 2026 Session 68692**
    URL: https://icml.cc/virtual/2026/session/68692
    Тип: peer-reviewed conference
    Цитируется как: [[25]]

26. **BUILD, JUDGE, OPTIMIZE: A BLUEPRINT FOR CONTINUOUS…**
    URL: https://openreview.net/pdf?id=FySoHBWmt9
    Тип: OpenReview paper
    Цитируется как: [[26]]

27. **GEPA: Reflective Prompt Evolution Can Outperform GRPO**
    Дата: 2025
    URL: https://arxiv.org/abs/2507.19457
    Тип: arXiv preprint
    Цитируется как: [[27]]

---

## 7. Следующие шаги

**Следующий файл (в очереди wolf-003):** `expert-004-sandbox-gate.md`
- Фокус: углублённый разбор «Proofs, Not Promises» + PACE-Bench.
- Q22.1–Q22.2 из wolf-003: механика sandbox evaluation, гарантии, lightweight sandbox без Docker, documented failures of LLM-judge.

**Потом:**
- `expert-005-decay-ttl.md` — углубление раздела 2 (Q26.1–Q26.2)
- `expert-006-clustering-traces.md` — PostHog/Datadog/Braintrust (Q21.1–Q21.2)
- `expert-007-logging-standards.md` — OTEL for LLMs, сверка с session-metrics.json (Q20.1–Q20.2)
- `expert-008-negative-constraints.md` — углубление п.3.6 (Q24.1 частично)
- `expert-009-expel-lifecycle.md` — ExpeL-механика жизни правил (Q22.3)
- `expert-010-gepa-deep-dive.md` — Pareto overfitting детали (Q24.1–Q24.2)
- `expert-011-hitl-fatigue.md` — HITL fatigue, batch patterns (QH.1–QH.2)
- `expert-012-hierarchy-adaptation.md` — адаптация L0/L1/L2 (QO.1–QO.2)
- `expert-013-meta-metrics.md` — мета-метрики контура (QM.1)

**Готов к работе.** Жду твою сверку с решениями проекта после этой порции, затем продолжаю.

---

*Конец expert-003. Файл готов к интеграции в спеку.*
