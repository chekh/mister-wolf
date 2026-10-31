# expert-010: Meta-observability контура обучения (QM.1)

**От:** Внешний эксперт (Qwen)
**Кому:** Mr.Wolf (координатор проекта)
**Дата:** 2026-08-29
**В ответ на:** wolf-010 (вопрос об автономии + QM.1)
**Закрывает вопросы:** QM.1 (wolf-003)

---

## 0. Краткое содержание порции

Этот документ закрывает последний вопрос программы про meta-observability контура обучения и даёт формальную основу для staged evolution автономии. Главный якорь — **«Risk-Tiering Internally Created Agentic AI Systems»** (arXiv 2607.09586, июль 2026), который даёт академическое обоснование blast-radius подхода.

---

## 1. Главная находка: Risk-Tiering как формальная основа

**arXiv 2607.09586 (июль 2026)** — формальная спецификация оценки риска внутренних агентских систем. Четыре измерения риска:

| Dimension | Определение | Шкала |
|-----------|-------------|-------|
| **Autonomy** | Степень независимости принятия решений | Tier 1–4 |
| **Action Authority** | Область действий, которые агент может совершать | Tier 1–4 |
| **Blast Radius** | Масштаб последствий при сбое агента | Tier 1–4 |
| **Reversibility** | Насколько легко действия можно отменить | Tier 1–4 |

**Цитата:** «Autonomy, Action Authority, Blast Radius, and Reversibility all scored» — именно эти 4 оси должны определять уровень гейта.

### 1.1. Маппинг на Wolf

**Для `draft-rule`:**
- **Blast Radius** = (sessions/week where rule triggers) × (criticality of affected contexts)
- **Reversibility** = 0.5 (есть `wolf supersede`)
- **Autonomy** = зависит от уровня (B/B+/C)
- **Action Authority** = read-only (правило не выполняет действий, только доставляется в контекст)

Это закрывает замечание wolf-010: «похожесть» ≠ risk, risk = blast radius.

---

## 2. Blast Radius Formula для правил

```typescript
function calculateBlastRadius(rule): number {
  const triggerFrequency = countTriggeredSessions(rule, last30days) / 30;
  const contextCriticality = averageCriticality(rule.trigger_keywords);
  const reversibility = rule.reversible ? 0.5 : 1.0; // wolf supersede = 0.5

  return triggerFrequency * contextCriticality * reversibility;
}
```

### 2.1. Thresholds (предложение ВА, калибровка обязательна)

| Blast radius | Risk level | Approval strategy |
|--------------|------------|-------------------|
| `< 0.2` | low risk | batch-approve после 14 дней (или при следующем дайджесте) |
| `[0.2, 0.6]` | medium risk | batch-approve после 21 дня |
| `> 0.6` | high risk | всегда через человека (never auto-approve) |

### 2.2. Operationalization `context_criticality` (открытый вопрос)

Варианты шкалы (для ревизии спеки):
1. **Тег в `.wolf/config.yaml`**: `criticality: low | medium | high` на `trigger_keywords` (класс «параметры»)
2. **По типу связанного объекта**: `work-thread` = high, `lesson` = medium, `observation` = low
3. **По глубине графа отношений**: чем больше связей `relations.jsonl`, тем выше критичность

**Рекомендация ВА:** вариант 1 (тег в config) — явный, читаемый, автономия B.

---

## 3. 5 слоёв meta-observability

Формализация наблюдаемости самого контура обучения:

### Layer 1 — Signal Quality (Фаза 20)

| Метрика | Target | Назначение |
|---------|--------|------------|
| `signal_coverage` | ≥95% | % сессий с полным `session-metrics.jsonl` |
| `uncategorized_errors` | <5% | % ошибок без `error_class_id` |
| `orphan_signals` | 0 | Сессии без linkage к `events.jsonl` |

**Диагностика:**
- Низкий `signal_coverage` → проблема writer-матрицы (executor-lead не пишет)
- Высокий `uncategorized_errors` → нужен `wolf errors refine`
- `orphan_signals > 0` → проблема в `session_id` propagation

### Layer 2 — Pattern Detection (Фаза 21)

| Метрика | Target | Назначение |
|---------|--------|------------|
| `cluster_density` | ≥3 | Среднее число сигналов в кластере (порог N≥3) |
| `cluster_stability` | ≥70% | % кластеров, сохранившихся после N итераций |
| `emerging_patterns` | — | Число новых кластеров за неделю |

**Диагностика:**
- Низкий `cluster_density` → проблема в нормализации `error_class_id` (слишком специфично)
- Низкий `cluster_stability` → сигналы слишком шумные или нормализация нестабильна
- Много `emerging_patterns` → новая категория проблем в проекте

### Layer 3 — Candidate Generation (Фаза 22)

| Метрика | Target | Назначение |
|---------|--------|------------|
| `draft_generation_rate` | — | Draft-правил/неделю |
| `holdout_pass_rate` | ≥60% | % drafts, прошедших holdout |
| `evidence_quality` | ≥3 | Среднее число evidence-ссылок на draft |

**Диагностика:**
- Низкий `holdout_pass_rate` → Analyzer-Worker генерирует слабых кандидатов
- Низкий `evidence_quality` → кластеры слишком малы или Analyzer-Worker плохо работает
- Высокий `draft_generation_rate` без активаций → bottleneck на STOP-гейте или Кураторе

### Layer 4 — Gate Effectiveness (Фаза 23)

| Метрика | Target | Назначение |
|---------|--------|------------|
| `stop_gate_pass_rate` | ≥85% | % candidates, прошедших pressure-тесты |
| `false_positive_rate` | <20% | Правила, отклонённые STOP, но не вызвавшие регрессий |
| `regression_detection` | 0 | Число регрессий, пойманных E2E после активации |

**Диагностика:**
- Низкий `stop_gate_pass_rate` → STOP-гейт слишком строгий или Analyzer-Worker генерирует плохие кандидаты
- Высокий `false_positive_rate` → pressure-тесты некорректны
- `regression_detection > 0` → STOP-гейт не ловит регрессии, нужен аудит

### Layer 5 — Delivery Impact (Фаза 16/20)

| Метрика | Target | Назначение |
|---------|--------|------------|
| `delivery_recall` | ≥80% | % сессий с совпавшей темой, где правило было доставлено |
| `rule_utilization` | ≥70% | % доставленных правил, повлиявших на поведение (по сигнальному логу) |
| `negative_constraint_hits` | — | Число блокировок новых кандидатов из-за similarity к hard negatives |

**Диагностика:**
- Низкий `delivery_recall` → проблема `trigger_keywords` или `wolf call` (Фаза 16)
- Низкий `rule_utilization` при высоком `delivery_recall` → **диагностическое правило**: проблема исполнения, не генерации (harness-benefit немонотонен, Lin et al. 2026)
- Много `negative_constraint_hits` → слишком много hard negatives в базе, нужна консолидация

---

## 4. Команда `wolf learn status` — конкретная структура

```bash
$ wolf learn status --period 30d

=== SIGNAL QUALITY ===
Signal coverage:        94.2% (284/301 sessions)
Uncategorized errors:   8.3% (target: <5%) ⚠
Orphan signals:         0

=== PATTERN DETECTION ===
Active clusters:        12
Cluster density:        4.7 signals/cluster (target: ≥3) ✓
Emerging patterns:      3 new this week

=== CANDIDATE GENERATION ===
Draft rules generated:  8
Holdout pass rate:      62.5% (5/8) (target: ≥60%) ✓
Evidence quality:       4.2 links/draft (target: ≥3) ✓

=== GATE EFFECTIVENESS ===
STOP gate pass rate:    80.0% (4/5) (target: ≥85%) ⚠
Regression detections:  0 ✓
False positives:        1 (rule_042 — отклонена, но не вызвала регрессий)

=== DELIVERY IMPACT ===
Delivery recall:        87.3% (target: ≥80%) ✓
Rule utilization:       73.1% (19/26 delivered rules affected behavior) (target: ≥70%) ✓
Negative constraint hits: 2

=== RISK DISTRIBUTION ===
High risk drafts:       2 (awaiting human review)
Medium risk drafts:     3 (batch-approve after 21d)
Low risk drafts:        0

=== HEALTH SCORE ===
Overall: 78/100 (GOOD)
Bottleneck: uncategorized errors (8.3% > 5% target), STOP gate pass rate (80% < 85%)
Recommendation: run `wolf errors refine` to classify uncategorized cluster; audit STOP gate
```

### 4.1. CLI-команды

```bash
wolf learn status [--period <duration>]   # основной отчёт
wolf learn history [--metric <name>]      # тренды метрик
wolf learn diagnose                       # детальная диагностика bottleneck
wolf learn export [--format json|md]      # экспорт для аудита
```

---

## 5. Staged Autonomy Evolution (B → B+ → C)

**Текущий уровень: B** (автономия для параметров, гейт для правил/структуры)

### 5.1. Критерии апгрейда до B+ (частичная автономия для low-risk правил)

Все условия должны выполняться одновременно:
- `delivery_recall ≥ 90%` за последние 90 дней
- `regression_detections = 0` за последние 60 дней
- `stop_gate_pass_rate ≥ 85%` за последние 30 дней
- `uncategorized_errors < 3%` за последние 30 дней
- `signal_coverage ≥ 95%` за последние 30 дней

**При достижении B+:**
- Low-risk правила (`blast_radius < 0.2`) → auto-approve после 14 дней (или при следующем дайджесте — см. open question в wolf-011)
- Medium-risk (`blast_radius ∈ [0.2, 0.6]`) → batch-approve после 21 дней
- High-risk (`blast_radius > 0.6`) → всегда через человека

### 5.2. Критерии апгрейда до C (полная автономия для правил)

Все условия должны выполняться одновременно:
- `delivery_recall ≥ 95%` за последние 180 дней
- `regression_detections = 0` за последние 120 дней
- `rule_utilization ≥ 85%` за последние 90 дней
- `human_override_rate < 5%` (пользователь редко отменяет решения системы)
- Все критерии B+ выполняются

**Важно:**
- Апгрейд требует явного решения пользователя (отдельная запись в `decision`)
- Не происходит автоматически
- Reversible откат одним `decision`

### 5.3. Реализация в Wolf

**CLI:**
```bash
wolf learn autonomy status           # текущий уровень + прогресс к B+
wolf learn autonomy upgrade-to b+    # проверка критериев + запрос decision
wolf learn autonomy downgrade-to b   # откат одним решением
```

**Таксономия `decision`:**
```yaml
decision_type: autonomy_upgrade
from_level: b
to_level: b+
triggering_metrics:
  delivery_recall: 0.92
  regression_detections: 0
  stop_gate_pass_rate: 0.87
  uncategorized_errors: 0.021
  signal_coverage: 0.96
period_days: 90
effective_date: 2026-12-15
```

---

## 6. Что это меняет в Wolf

| Компонент | Изменение |
|-----------|-----------|
| **Фаза 20** | Добавить Layer 1 метрики в `session-metrics.jsonl` (coverage, uncategorized, orphan) |
| **Фаза 21** | Добавить Layer 2 метрики (density, stability, emerging) |
| **Фаза 22** | Добавить Layer 3 метрики (generation rate, holdout pass rate, evidence quality) |
| **Фаза 23** | Добавить Layer 4 метрики (stop gate pass rate, false positive rate, regression detection) |
| **Фаза 16/20** | Добавить Layer 5 метрики (delivery recall, rule utilization, negative constraint hits) |
| **CLI** | Новая команда `wolf learn status` + `history` + `diagnose` + `export` |
| **Автономия** | Staged evolution B → B+ → C с формальными критериями |
| **Таксономия** | Поле `blast_radius` в `lesson`, тип `decision` для `autonomy_upgrade` |
| **Риск-модель** | Замена «похожесть → risk» на «blast radius = trigger_freq × context_criticality × reversibility» |

---

## 7. Классификация чисел

| Число | Статус | Источник |
|-------|--------|----------|
| 4 измерения риска (Autonomy, Action Authority, Blast Radius, Reversibility) | подтверждено | arXiv 2607.09586 |
| Blast radius thresholds 0.2/0.6 | **предложение ВА** | — |
| 5 слоёв meta-observability | **предложение ВА** | — |
| Delivery recall target ≥80% | **предложение ВА** | — |
| Staged autonomy criteria (90d/60d/30d windows) | **предложение ВА** | — |
| Reversibility = 0.5 для `supersede` | **предложение ВА** | — |

---

## 8. Источники

### Якорная статья:

1. **Risk-Tiering Internally Created Agentic AI Systems**
   - Авторы: (не указаны в первоисточнике)
   - Дата: Июль 2026
   - URL: https://arxiv.org/abs/2607.09586
   - Тип: arXiv preprint
   - Статус: peer-reviewed (подтверждено цитатами)

### Поддерживающие:

2. **AARM (Autonomous Action Runtime Management)**
   - Дата: Февраль 2026
   - URL: https://arxiv.org/abs/2602.09433
   - Тип: arXiv preprint, 10 цитирований

3. **Proofs, Not Promises: Governed Candidate Improvement**
   - Автор: Adam Massimo Mazzocchetti
   - Дата: Май 2026
   - URL: https://www.researchgate.net/publication/405312292
   - DOI: 10.5281/zenodo.20405355
   - Тип: SSRN preprint (не peer-reviewed)

4. **Lin et al. 2026** (harness-benefit немонотонен)
   - Цитируется в обзоре Lilian Weng (июль 2026)
   - Контекст: 9B модель пишет harness так же, как Opus; средние модели выигрывают больше всего
   - Статус: secondary source (требует сверки с первоисточником)

---

## 9. Открытые вопросы для ревизии спеки

1. **Operationalization `context_criticality`** — см. §2.2
2. **Калибровка threshold 0.2/0.6** — эмпирическая после 30 дней работы Ф20
3. **Auto-approve 14 дней vs digest cadence 7 дней** — см. wolf-011 §3.3 (избыточность)
4. **Storage для meta-metrics** — `.wolf/meta-metrics/` как derived-файлы, rebuildable из `session-metrics.jsonl`

---

## 10. Что дальше

Следующий файл: `expert-011-gepa.md` (Q24.1–Q24.2: Pareto-оптимизация шаблонов брифов, опасность LLM-as-a-judge, детерминированные метрики качества).

После него: `expert-012-orchestration.md` (QO.1–QO.2: уровни L0/L1/L2, границы изменения).

И финальный: `expert-013-recommendations-brief.md` (консолидация всех ~55 кандидатов правок, приоритизация, глоссарий, единый список источников).
