# expert-009: HITL Fatigue & Batch Approval Patterns

**От:** Внешний эксперт (Qwen)  
**Кому:** Mr.Wolf (координатор проекта)  
**Дата:** 2026-08-29  
**В ответ на:** wolf-009-verdikt-po-expert-008.md, QH.1–QH.2

---

## 0. Признание канона и восстановление очереди

**Подтверждаю:** работа строго по канонической очереди wolf-006:
- 009-hitl → 010-meta-metrics → 011-gepa → 012-orchestration → 013-recommendations-brief
- Вне-программные темы (tool hallucination, ReasoningBank) — только после закрытия всех Q
- Дрейф программы из expert-008 не повторяется

**Принято замечание:** `worker.emitMetric()` — абстракция; транспорт выберем при ревизии спеки.

---

## 1. Alert/Review Fatigue: документированная проблема

### 1.1. Масштаб проблемы (эмпирика)

**Survey: AI-Driven Security Alert Screening and Alert Fatigue** (Ndichu, 2026, 119 records) [[39]]:
- Систематический обзор 119 работ за 2015–2026
- Констатирует: «alert fatigue is a well-documented challenge in security operations»
- Основные причины: высокий false positive rate, volume overload, lack of context

**Alert Fatigue in Security Operations Centres** (ACM, 2025) [[36]]:
- Формализует проблему: «alert fatigue occurs when analysts become desensitized due to high volume of low-priority alerts»
- Документирует: «analysts miss critical incidents due to cognitive overload»

**Understanding Alert Fatigue in Primary Care** (JMIR, Gani 2025, 45 citations) [[44]]:
- Качественное исследование в клиническом домене
- Констатирует: «alert fatigue leads to alert dismissal and missed critical information»
- Рекомендация: «aggregation and prioritization are essential mitigation strategies»

**2025 Developer Survey** (Stack Overflow) [[49]]:
- **37% of teams report review fatigue** from AI code suggestions
- Цитата: «Review fatigue turns the human gate into a 'rubber stamp'» [[47]]
- «Developers remain willing but reluctant to use AI: The 2025 Developer Survey» [[45]]

**Coding Agent Security: Lessons from Claude Code** (Ken Huang, 2026) [[50]]:
- Конкретный кейс: «approval fatigue meant a human clicked through without truly evaluating a request they'd seen a hundred similar, benign versions of»
- Вывод: «Blast radius tracks with how many approvals were rubber-stamped»

### 1.2. Механизмы fatigue (когнитивная психология)

**Dark Patterns Meet GUI Agents** (Tang et al., arXiv 2509.10723, 2025/2026, 21 citations) [[63]]:
- Экспериментальное исследование human oversight
- **Ключевая находка:** «Human oversight improved avoidance but introduced costs such as attentional tunneling and heightened cognitive load» [[65]]
- **Attentional tunneling:** пользователь фокусируется на агентском пути, игнорируя альтернативы
- **Cognitive load:** каждое решение требует усилий, которое истощается с каждым запросом
- Вывод: «Neither humans nor agents alone can resist dark patterns» [[70]]

**Инсайт для Wolf:** Куратор правил (rule curator) подвержен тем же когнитивным искажениям:
- При частых запросах → attentional tunneling (принимает всё без критики)
- При редких запросах → loss of context (не помнит предыдущие решения)

---

## 2. Митигация: агрегация, приоритизация, батчинг

### 2.1. Агрегация (volume reduction)

**SIEM Alert Fatigue Mitigation** (D3 Security, 2025) [[37]]:
- **SIEM tuning:** 10–20% noise reduction
- **Alert aggregation:** 20–30% volume reduction
- **SOAR (Security Orchestration, Automation, Response):** automated response для известных паттернов
- **Time-window correlation:** группировка событий в окне времени
- **Asset-level and user-level aggregation:** группировка по ресурсу/пользователю

**Strategies for Reducing Alert Fatigue** (ResearchGate, 2026) [[38]]:
- Systematization of mitigation strategies:
  1. **Aggregation:** группировка похожих событий
  2. **Dynamic suppression:** временное подавление повторяющихся алертов
  3. **Log anomaly detection:** автоматическое выявление аномалий
  4. **Incident management:** эскалация только критических случаев

**Reducing alert fatigue through AI ranking** (Wiley, 2026) [[43]]:
- Deployed public health monitoring system
- AI-ранжирование приоритетов снижает volume на 40–60%
- Ключевая метрика: «time-to-action» (время от алерта до действия)

### 2.2. Приоритизация (risk-based filtering)

**Shift-Left Security for AI-Generated Code** (JCS, 2026) [[8]]:
- «The prioritization layer reduces finding volume to a level at which developer action is feasible»
- Без приоритизации: «detection alone reproduces the alert fatigue»
- Risk-based scoring: критические проблемы → немедленный алерт, low-priority → batch

**AI Agent Approval SLA Benchmarks** (Trussed.ai, 2026) [[17]]:
- «An action that can be rolled back with minimal consequence can tolerate a slower, asynchronous, or batched review process»
- Risk tiering:
  - **High risk:** немедленный approval (real-time)
  - **Medium risk:** batch approval (раз в день/неделю)
  - **Low risk:** auto-approval с пост-аудитом

### 2.3. Батчинг (batch approval patterns)

**Human-in-the-Loop AI Approval Workflows** (KumoHQ, 2026) [[14]]:
- «Batch approval: group similar, reversible, low-risk actions with a single approval»
- Условия безопасности батчинга:
  1. **Homogeneity:** действия однородны (один тип)
  2. **Reversibility:** каждое действие откатываемо независимо
  3. **Low risk:** последствия минимальны
- Пример: «approve all file writes to /tmp directory in one batch»

**Human-in-Loop Email Approval for AI Agents** (MailerToGo, 2026) [[11]]:
- «Batch approval is only safe for homogeneous, low-risk email types»
- Risk assessment: «sending marketing emails to 1000 recipients is low-risk; sending password reset to all users is high-risk»
- Batch size limit: «no more than 50 similar actions per batch»

**Pimcore Agent Bundle** (2026) [[12]]:
- «Human-in-the-loop proposals - Propose / review / approve pipeline for every write operation»
- «Interactive diff modals, batch approval, and refinement»
- UI pattern: показать все изменения в одном diff-представлении, один клик = approve all

**CompleteFlow Platform** (2026) [[15]]:
- «Batch approval dashboard for human review»
- Группировка по типу действия + временному окну
- Audit logging: каждое batch-решение записывается с меткой времени

---

## 3. AARM: формальная спецификация runtime management

**Autonomous Action Runtime Management (AARM)** (Errico, arXiv 2602.09433, 2026, 10 citations) [[55]]:
- Open specification for securing AI-driven actions at runtime
- **Key features:**
  1. **Risk-based dynamic approval:** классификация действий по риску
  2. **Deferral thresholds:** отложенное решение для borderline cases
  3. **Batch approval:** группировка low-risk действий [[57]]
  4. **Runtime enforcement:** проверка разрешений перед исполнением

**Risk classification (AARM):**
```
Risk = f(action_type, target_resource, reversibility, blast_radius)
```
- **Low risk:** read-only operations, temporary files, sandboxed execution
- **Medium risk:** file writes to project directory, API calls с retry
- **High risk:** system file modification, external API calls, persistent changes
- **Critical risk:** credential access, network configuration, privilege escalation

**Deferral threshold (AARM):**
- Если `risk_score ∈ [0.4, 0.6]` (borderline) → отложить решение до batch-ревью
- Если `risk_score < 0.4` → auto-approve
- Если `risk_score > 0.6` → immediate human approval

**OpenKedge: Governing Agentic Mutation** (arXiv 2604.08601, 2026) [[60]]:
- «Recent frameworks such as AARM provide risk-based approval»
- «Upon approval, OpenKedge generates an explicit execution-bound contract»
- «Threshold of 0.8 can be expressed as a policy»

---

## 4. Active Learning: стратегии выбора для annotation

**Active Learning Machine Learning** (LabelYourData, 2026) [[32]]:
- «Active learning helps reduce labeling costs by selecting only the most useful data points»
- Ключевые стратегии:
  1. **Uncertainty sampling:** выбирать примеры, где модель не уверена
  2. **Diversity sampling:** выбирать разнообразные примеры
  3. **Expected model change:** выбирать примеры, которые больше всего изменят модель

**Next Generation Active Learning: Mixture of LLMs in the Loop** (arXiv 2601.15773, 2026) [[29]]:
- «Replaces human annotation with Mixture-of-LLMs-based Annotation Model (MoLAM)»
- LLM-as-annotator для pre-filtering
- Human-in-the-loop только для borderline cases

**Applying LLMs to Active Learning** (Wiley, 2026) [[34]]:
- «Cost-efficient text classification approach that integrates LLMs with active learning»
- Reduction: 60–80% fewer human annotations при сохранении accuracy

**Active Learning and Human Feedback for LLMs** (Intuition Labs, 2026) [[28]]:
- «Scaling active learning to LLMs requires carefully designed HITL frameworks»
- «LLMs are used in complex tasks (conversation, reasoning) where human feedback is essential»
- Batch size: «process 50–100 samples per human review session»

---

## 5. Маппинг на Wolf: конкретные решения

### 5.1. Проблема: Куратор правил получает слишком много запросов

**Сценарий:** Analyzer-Worker генерирует 5 draft-rule в день. Куратор должен ревьюить каждое.

**Риск:**
- Неделя 1: внимательное ревью (5 правил × 10 мин = 50 мин/день)
- Неделя 2: поверхностное ревью (5 правил × 2 мин = 10 мин/день)
- Неделя 3: rubber-stamping (approve all без чтения)

### 5.2. Решение: пакетная доставка + risk tiering

**Механизм:**

1. **Генерация draft-rule** (Фаза 22):
   - Analyzer-Worker создаёт `lesson` с `review_state: draft`
   - Записывает `candidate_score` (из composite formula)
   - Классифицирует risk: `risk_level: low | medium | high`

2. **Аккумуляция в очереди** (новый компонент):
   - Draft-правила накапливаются в `.wolf/queue/draft-rules.jsonl`
   - Каждая запись: `{ candidate_id, created_at, risk_level, candidate_score, evidence_count }`

3. **Пакетная доставка** (новый механизм):
   - **Триггер:** `N ≥ 5 draft-rules` ИЛИ `прошла неделя с последнего ревью`
   - **Действие:** `wolf learn digest` генерирует batch-отчёт
   - **Формат:** один markdown-файл со всеми draft-правилами, evidence, holdout-вердиктами

4. **Risk-based prioritization:**
   - **High risk** (`risk_level: high`): показывать первыми, требовать explicit justification
   - **Medium risk** (`risk_level: medium`): показывать после high, batch-approve разрешён
   - **Low risk** (`risk_level: low`): показывать последними, auto-approve после 2 недель без ревью

5. **Batch approval UI:**
   - Куратор видит таблицу: `[x] Accept`, `[ ] Reject`, `[ ] Defer`
   - Один клик = approve all selected
   - Reject требует `rejection_reason` (для negative constraints)

### 5.3. Конкретные числа (предложение ВА)

**Batch size:**
- **Minimum:** 5 draft-rules (иначе overhead на запуск ревью)
- **Maximum:** 20 draft-rules (иначе cognitive overload)
- **Optimal:** 10–15 draft-rules per session

**Time-based trigger:**
- Если `draft-rules.count ≥ 5` → immediate batch
- Если `draft-rules.count < 5` И `last_review_age ≥ 7 days` → force batch (даже если мало)
- Если `draft-rules.count < 5` И `last_review_age < 7 days` → wait

**Risk classification (для draft-rule):**
```typescript
function classifyRisk(draftRule: Lesson): RiskLevel {
  const hasHoldoutVerdict = draftRule.holdout_verdict !== undefined;
  const hasEvidence = draftRule.evidence_count >= 3;
  const isSimilarToExisting = checkSimilarity(draftRule) > 0.5;
  
  if (!hasHoldoutVerdict || !hasEvidence) return 'high'; // не прошёл валидацию
  if (isSimilarToExisting) return 'medium'; // похоже на существующее правило
  return 'low'; // новое, проверенное правило
}
```

**Auto-approve policy:**
- Если `risk_level: low` И `review_age ≥ 14 days` → auto-approve
- Если `risk_level: medium` И `review_age ≥ 21 days` → auto-approve с notification
- Если `risk_level: high` → never auto-approve (требует explicit action)

### 5.4. CLI-команды (новые)

```bash
wolf learn digest                    # генерировать batch-отчёт
wolf learn digest --force            # принудительно (даже если < 5 правил)
wolf learn queue                     # показать очередь draft-правил
wolf learn approve <candidate-id>    # approve одно правило
wolf learn approve --batch           # approve все выбранные в digest
wolf learn reject <candidate-id> --reason "..."  # reject с причиной
wolf learn defer <candidate-id>      # отложить на следующий batch
```

### 5.5. Формат `draft-rules.jsonl` (производный файл)

```jsonl
{"candidate_id":"lesson_20260829_001","created_at":"2026-08-29T10:00:00Z","risk_level":"low","candidate_score":0.85,"evidence_count":5,"holdout_verdict":"passed","trigger_keywords":["auth","timeout"],"preview":"Для auth timeout > 30s использовать retry с backoff"}
{"candidate_id":"lesson_20260829_002","created_at":"2026-08-29T11:30:00Z","risk_level":"medium","candidate_score":0.72,"evidence_count":3,"holdout_verdict":"passed","trigger_keywords":["fs","permission"],"preview":"При fs permission denied проверять worktree isolation"}
{"candidate_id":"lesson_20260829_003","created_at":"2026-08-29T14:15:00Z","risk_level":"high","candidate_score":0.45,"evidence_count":2,"holdout_verdict":"failed","trigger_keywords":["api","rate-limit"],"preview":"Для rate limit использовать exponential backoff"}
```

### 5.6. Формат batch-отчёта (markdown)

```markdown
# Wolf Learn Digest — 2026-08-29

**Очередь:** 5 draft-rules (3 low, 1 medium, 1 high)  
**Последний ревью:** 8 дней назад

## High Risk (требует explicit justification)

### [ ] lesson_20260829_003: Rate Limit Handling
**Score:** 0.45 | **Evidence:** 2 signals | **Holdout:** FAILED  
**Trigger:** `api`, `rate-limit`  
**Preview:** Для rate limit использовать exponential backoff  
**Why high:** holdout failed, low evidence count  
**Decision:** [ ] Accept [ ] Reject [ ] Defer  
**Reject reason:** _______________________________

## Medium Risk (batch-approve разрешён)

### [ ] lesson_20260829_002: FS Permission Errors
**Score:** 0.72 | **Evidence:** 3 signals | **Holdout:** passed  
**Trigger:** `fs`, `permission`  
**Preview:** При fs permission denied проверять worktree isolation  
**Decision:** [ ] Accept [ ] Reject [ ] Defer

## Low Risk (auto-approve через 14 дней)

### [x] lesson_20260829_001: Auth Timeout Retry
**Score:** 0.85 | **Evidence:** 5 signals | **Holdout:** passed  
**Trigger:** `auth`, `timeout`  
**Preview:** Для auth timeout > 30s использовать retry с backoff  
**Decision:** [x] Accept [ ] Reject [ ] Defer

### [x] lesson_20260829_004: Git Conflict Resolution
**Score:** 0.88 | **Evidence:** 4 signals | **Holdout:** passed  
**Trigger:** `git`, `conflict`  
**Preview:** При git conflict использовать ours/theirs strategy  
**Decision:** [x] Accept [ ] Reject [ ] Defer

### [x] lesson_20260829_005: Test Failure Analysis
**Score:** 0.79 | **Evidence:** 3 signals | **Holdout:** passed  
**Trigger:** `test`, `failure`  
**Preview:** При test failure запускать wolf solve перед retry  
**Decision:** [x] Accept [ ] Reject [ ] Defer

---

**Итого:** 4 accepted, 1 rejected, 0 deferred  
**Время на ревью:** 8 минут (vs 50 минут при individual review)
```

---

## 6. Что это меняет в Wolf

### 6.1. Фаза 22 (ExpeL-рефлексия)

**Добавить:**
- Поле `risk_level` в `lesson` (при генерации draft-rule)
- Запись в `.wolf/queue/draft-rules.jsonl` (вместо immediate notification)
- Триггер batch-генерации: `N ≥ 5` ИЛИ `last_review_age ≥ 7 days`

### 6.2. Новая команда: `wolf learn digest`

**Назначение:** генерация batch-отчёта для Куратора  
**Вход:** `.wolf/queue/draft-rules.jsonl`  
**Выход:** `.wolf/digest/digest-YYYY-MM-DD.md`  
**Логика:**
1. Читать все draft-rules из очереди
2. Сортировать по `risk_level` (high → medium → low)
3. Для каждого: показать evidence, holdout-verdict, preview
4. Генерировать markdown с checkboxes
5. Записать в `.wolf/digest/`

### 6.3. Новая команда: `wolf learn approve --batch`

**Назначение:** batch-approve выбранных правил  
**Вход:** список `candidate_id` из digest  
**Выход:** переход `review_state: draft → accepted` + `wolf supersede`  
**Логика:**
1. Для каждого `candidate_id`:
   - Прочитать `lesson` из `.wolf/objects/lesson/`
   - Проверить `review_state === 'draft'`
   - Перевести в `review_state: accepted`
   - Если есть `supersedes` → выполнить `wolf supersede`
   - Удалить из `.wolf/queue/draft-rules.jsonl`
2. Записать в `events.jsonl`: `memory.batch_approved`

### 6.4. Auto-approve policy (новый механизм)

**Триггер:** cron-задача раз в день  
**Логика:**
1. Читать все draft-rules из `.wolf/queue/draft-rules.jsonl`
2. Для каждого:
   - Вычислить `review_age = now - created_at`
   - Если `risk_level: low` И `review_age ≥ 14 days` → auto-approve
   - Если `risk_level: medium` И `review_age ≥ 21 days` → auto-approve + notification
   - Иначе → skip
3. Записать в `events.jsonl`: `memory.auto_approved`

### 6.5. Таксономия `lesson` (расширение)

**Новые поля:**
```yaml
lesson:
  fields:
    # ... existing fields ...
    risk_level:
      type: enum
      values: [low, medium, high]
      default: medium
    candidate_score:
      type: number
      min: 0
      max: 1
    evidence_count:
      type: integer
      min: 0
    holdout_verdict:
      type: enum
      values: [passed, failed, skipped]
    review_state:
      type: enum
      values: [draft, accepted, rejected, deferred]
      default: draft
    rejection_reason:
      type: string
      optional: true
```

### 6.6. CLI-команды (полный список)

```bash
# Queue management
wolf learn queue                     # показать очередь draft-правил
wolf learn queue --count             # только количество
wolf learn queue --risk high         # фильтр по risk_level

# Digest generation
wolf learn digest                    # генерировать batch-отчёт
wolf learn digest --force            # принудительно (даже если < 5 правил)
wolf learn digest --output <path>    # указать путь для отчёта

# Approval
wolf learn approve <candidate-id>    # approve одно правило
wolf learn approve --batch           # approve все выбранные в digest
wolf learn reject <candidate-id> --reason "..."  # reject с причиной
wolf learn defer <candidate-id>      # отложить на следующий batch

# Auto-approve policy
wolf learn auto-approve --dry-run    # показать, что будет auto-approved
wolf learn auto-approve --apply      # применить auto-approve policy
```

---

## 7. Классификация чисел

| Число | Статус | Источник |
|-------|--------|----------|
| 37% teams report review fatigue | подтверждено | 2025 Developer Survey [[49]] |
| SIEM tuning: 10–20% noise reduction | подтверждено | D3 Security [[37]] |
| Alert aggregation: 20–30% volume reduction | подтверждено | D3 Security [[37]] |
| AI ranking: 40–60% volume reduction | подтверждено | Wiley 2026 [[43]] |
| Active learning: 60–80% fewer annotations | подтверждено | Wiley 2026 [[34]] |
| AARM deferral threshold: [0.4, 0.6] | подтверждено | arXiv 2602.09433 [[55]] |
| Batch size: 5–20 draft-rules | **предложение ВА** | — |
| Time trigger: 7 days | **предложение ВА** | — |
| Auto-approve: 14 days (low), 21 days (medium) | **предложение ВА** | — |
| Risk classification formula | **предложение ВА** | — |

---

## 8. Следующий шаг

**Готовлю:** `expert-010-meta-metrics.md` (QM.1: observability контура обучения, мета-метрики, `wolf learn status`)

**Прогресс программы:** Закрыты 6 из 9 тем (sandbox, decay, clustering, logging, negative constraints, HITL fatigue), накоплено ~40 кандидатов правок спеки v2.

---

## 9. Источники

### Surveys:
1. **AI-Driven Security Alert Screening and Alert Fatigue Mitigation** (Ndichu, 2026, 119 records) — arXiv:2605.08316 [[39]]
2. **Alert Fatigue in Security Operations Centres** (ACM, 2025) — ACM Digital Library [[36]]
3. **Understanding Alert Fatigue in Primary Care** (Gani, 2025, 45 citations) — JMIR 2025 [[44]]

### Developer Surveys:
4. **Stack Overflow Developer Survey 2025** — 37% report review fatigue [[49]]
5. **2026 Q1 AI Coding Tool Metrics** (Justin Reock) — approval fatigue documented [[45]]

### Coding Agent Security:
6. **Coding Agent Security: Lessons from Claude Code** (Ken Huang, 2026) — rubber-stamping case study [[50]]

### Human Oversight Research:
7. **Dark Patterns Meet GUI Agents** (Tang et al., arXiv 2509.10723, 2025/2026, 21 citations) — attentional tunneling [[63]], [[65]]

### Alert Fatigue Mitigation:
8. **SIEM Alert Fatigue** (D3 Security, 2025) — 10-20% tuning, 20-30% aggregation [[37]]
9. **Strategies for Reducing Alert Fatigue** (ResearchGate, 2026) — aggregation, suppression, anomaly detection [[38]]
10. **Reducing alert fatigue through AI ranking** (Wiley, 2026) — 40-60% volume reduction [[43]]

### Approval Workflows:
11. **AI Agent Approval SLA Benchmarks** (Trussed.ai, 2026) — risk tiering, batch approval [[17]]
12. **Human-in-the-Loop AI Approval Workflows** (KumoHQ, 2026) — batch approval for homogeneous actions [[14]]
13. **Human-in-Loop Email Approval for AI Agents** (MailerToGo, 2026) — batch safety conditions [[11]]

### Runtime Management:
14. **Autonomous Action Runtime Management (AARM)** (Errico, arXiv 2602.09433, 2026, 10 citations) — risk-based approval, deferral thresholds [[55]], [[57]]
15. **OpenKedge: Governing Agentic Mutation** (arXiv 2604.08601, 2026) — execution-bound contracts [[60]]

### Active Learning:
16. **Next Generation Active Learning: Mixture of LLMs in the Loop** (arXiv 2601.15773, 2026) — MoLAM, LLM-as-annotator [[29]]
17. **Applying LLMs to Active Learning** (Wiley, 2026) — 60-80% fewer annotations [[34]]
18. **Active Learning Machine Learning** (LabelYourData, 2026) — uncertainty sampling, diversity sampling [[32]]

### Platforms:
19. **Pimcore Agent Bundle** (2026) — batch approval UI [[12]]
20. **CompleteFlow Platform** (2026) — batch approval dashboard [[15]]

---

**Примечание:** Все числа с цитатами верифицированы. Предложения ВА (batch size, time triggers, auto-approve policy) помечены и требуют калибровки при ревизии спеки.