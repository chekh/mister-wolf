# Expert Review — Mr. Wolf Scenario Lab

**Review date:** 2026-05-02
**Scope:** Aggregated findings from 20 Scenario Cards, 20 Playthrough Records, 20 Extraction Reports
**Method:** Role-based expert simulation per `testing-approach.md`

---

## 1. Архитектор

### Главные замечания
- **Component explosion:** 25+ new components suggested across extraction reports. Многие (AnswerCache, PaywallNotifier, MatchScoreExplainer) — это не компоненты runtime, а feature requests. Нужно отличать subsystem от helper logic.
- **Duality Router vs RouterLight:** 13 подтверждений ScenarioRouterLight и 7 ScenarioRouter. Непонятно, когда какой используется. Это создаёт риск смешения responsibilities.
- **Missing abstraction:** Нет явного SolveResult / ExecutionResult envelope. 3 extraction reports упоминают его как missing, но в schema он не фигурирует.

### Подтверждённые выводы
- WolfFacade, ContextResolver, TraceSystem — core, используются в 100% сценариев.
- AgentRunner и PolicyCore needed для L4–L5.
- AdapterLayer и MCPWrapper нужны только при external capabilities (30% сценариев).

### Отвергнутые предположения
- "LightweightSolvePlanner" suggested для L2. Нет: L2 решается через обычный routing без planner.
- "FullWorkflowEngine" marked as overkill — correct, L2–L3 не нуждаются в workflow engine.

### Must Add (концепция)
1. **SolveResult envelope** —统一的 output wrapper для всех execution modes.
2. **Router abstraction** — единый интерфейс routing, реализуемый как lightweight (L1–L2) и full (L3–L5).
3. **Component taxonomy** — разделить на: Core (always), Conditional (L3+), External (MCP/imported).

### Should Add
- **Artifact lifecycle state machine** (created → validated → persisted → archived).
- **Component registry** — чтобы не плодить ad-hoc components в extraction reports.

### Can Defer
- Все 25+ "suggested components" кроме топ-5. Они — feature ideas, не runtime subsystems.

---

## 2. Разработчик / DX-эксперт

### Главные замечания
- **Configuration hell signal:** 6 разных configuration modes в 20 сценариях. Для разработчика это означает 6 разных способов инициализации. Нужен clear default path.
- **Missing L1 coverage for non-dev domains:** Только software_engineering и office_assistant имеют L1. Это создаёт впечатление, что Wolf — инструмент для разработчиков, а не универсальный фасад.
- **Gate proliferation:** 12 сценариев (60%) имеют gates. Для DX это friction. Нужна категоризация: silent gate (auto-approve при низком риске) vs blocking gate.

### Подтверждённые выводы
- Zero-config mode works для L1 (подтверждено 2 раза).
- Generated config достаточно для L2–L3 (9 сценариев).
- Domain pack needed только для specialized domains (legal, finance, security).

### Отвергнутые предположения
- "custom_plugin needed для incident response" — нет, это domain pack + config, не custom code.

### Must Add (концепция)
1. **Default configuration path:** zero_config → generated_config → explicit_config (progressive disclosure).
2. **Gate severity levels:** silent / notify / block. Не все gates должны быть blocking.
3. **L1 scenarios для всех доменов** — иначе DX говорит "это не для меня".

### Should Add
- **wolf init --domain <domain>** — генерация starter config под домен.
- **Dry-run mode as default preview** перед L4–L5 actions.

### Can Defer
- Custom plugin framework (0 сценариев действительно требуют custom code).
- Multi-language skill adapters.

---

## 3. SRE / Эксплуатация

### Главные замечания
- **Failure modes are generic:** 64 failure modes, но 80% — это stale_data / missing_context / unavailable_api. Мало специфичных runtime failures (OOM, timeout, deadlock, retry exhaustion).
- **No observability components:** TraceSystem упомянут 20 раз, но нет MetricsCollector, LogAggregator, AlertManager. SRE не может operate без observability.
- **Runaway workflow risk:** L5 incident response playthrough показывает emergency mode. Нет circuit breaker или max execution depth.

### Подтверждённые выводы
- Context too large — реальная проблема (2 упоминания + implicit в L3–L4).
- API rate limits — реальны (arXiv, Google Calendar, ERP).
- Stale memory bias — подтверждено 3 раза.

### Отвергнутые предположения
- "Emergency mode bypasses gates" — отвергнуто в extraction report, но в concept нет explicit circuit breaker.

### Must Add (концепция)
1. **Observability subsystem:** MetricsCollector, ExecutionSpan, AlertThreshold для всех L3+.
2. **Circuit breaker:** max steps, max tokens, max external calls per scenario.
3. **Retry policy:** explicit backoff для external capabilities (MCP, API).

### Should Add
- **Health check endpoint** для Wolf runtime.
- **Graceful degradation:** если MCP unavailable, fallback к read-only mode.

### Can Defer
- Distributed tracing across subagents (нет subagents в текущей архитектуре).
- Cost allocation per scenario (пока нет billing integration).

---

## 4. Security / Governance

### Главные замечания
- **Policy inconsistency:** 33 политики, но нет hierarchy. Например, `read_only_allowed` vs `read_only_project_access` vs `read_public_data_allowed` — это одно и то же или разное?
- **PII everywhere:** 5 сценариев имеют PII gate, но PII detection не описан как subsystem. Есть `pii_handling_gate`, но нет `PIIDetector`.
- **Hard-deny bypass risk:** Emergency mode (L5 incident response) может обходить gates. Нужен audit trail, но в concept он описан как "should add", не "must add".

### Подтверждённые выводы
- Hard-deny works: file_write, shell_mutation, external_send denied по умолчанию.
- Expert gate needed для legal/financial/security actions.
- Untrusted external capabilities (MCP, imported skills) правильно помечены.

### Отвергнутые предположения
- "PII gate alone guarantees compliance" — отвергнуто в 1 extraction report, но schema не требует PII verification.
- "Emergency mode should bypass all gates" — отвергнуто, но механизм override не описан.

### Must Add (концепция)
1. **Policy hierarchy:** global (always) → domain → scenario → user override. Сейчас нет structure.
2. **PII subsystem:** detector + redactor + verifier. Gate alone insufficient.
3. **Audit trail for emergency overrides:** immutable log с причиной, timestamp, approver.

### Should Add
- **Policy conflict resolver:** когда two policies collide (e.g., read_only vs external_send approval).
- **Secrets scanner:** scan всех inputs (docs, configs) перед processing.

### Can Defer
- Multi-jurisdiction compliance framework (только 1 legal scenario touches jurisdiction).
- Automated penetration testing scenarios.

---

## 5. Product / UX

### Главные замечания
- **Time to First Useful Output (TTFUO):** L1 scenarios показывают immediate answer (хорошо). L2–L3 требуют explanation step — это добавляет latency в UX. Нужен "fast path" для common scenarios.
- **User confusion in L4–L5:** 4 playthroughs показывают, что user не понимает, почему нужен approval. Нет explicit "why this gate?" explanation в visible behavior.
- **Missing L1 для non-dev:** 9 доменов, но L1 только в 2. Это говорит, что Wolf воспринимается как dev-tool, не универсальный assistant.

### Подтверждённые выводы
- User simulator иногда формулирует неполно (подтверждено во всех L4–L5 playthroughs).
- Clarification question от Wolf — good pattern (подтверждено 3 раза).
- Dry-run как preview — positive UX pattern (L3 playthroughs).

### Отвергнутые предположения
- "User understands configuration modes" — нет, user_input показывает, что пользователи не знают про domain packs или dynamic personas.

### Must Add (концепция)
1. **Gate explanation:** every approval request must include "why" in user-visible text.
2. **Fast path for L1–L2:** skip scenario explanation для zero-config simple answers.
3. **Universal L1 scenarios:** каждый домен должен иметь минимум 1 simple_answer scenario.

### Should Add
- **Progressive disclosure:** показывать configuration options только при необходимости.
- **Undo / rollback hint:** для L4 actions, показывать "this can be reverted" если true.

### Can Defer
- Voice / chat interface optimizations.
- Mobile-responsive output formatting.

---

## 6. Integration / MCP-эксперт

### Главные замечания
- **MCP as second-class citizen:** MCPWrapper упомянут 3 раза, но нет explicit MCP lifecycle (connect, auth, health-check, disconnect).
- **Adapter boundary unclear:** AdapterLayer упомянут 1 раз. Непонятно, где граница между native tool, MCP tool, imported skill.
- **External capability trust model:** Сценарии помечают external как untrusted, но нет explicit trust scoring или sandbox model.

### Подтверждённые выводы
- GitHub MCP, Google Calendar MCP, Slack MCP — все реальные use cases.
- MCP unavailable — real failure mode (подтверждено 2 раза).
- Fallback needed для всех external capabilities.

### Отвергнутые предположения
- "External API = MCP" — нет, ERP API и legal DB — это не MCP, это direct HTTP. Нужна чёткая классификация.

### Must Add (концепция)
1. **Capability taxonomy:** native → wrapped → MCP → imported_skill → direct_api. Каждый тип — свои policy rules.
2. **MCP lifecycle manager:** connect → capability_discovery → health_check → invoke → disconnect.
3. **Fallback registry:** для каждого external capability — fallback action или graceful degradation.

### Should Add
- **Capability sandbox:** isolated execution для untrusted imported skills.
- **MCP capability cache:** avoid re-discovery на каждый запрос.

### Can Defer
- A2A (agent-to-agent) protocol support (0 сценариев используют A2A).
- Custom adapter SDK для third-party integrations.

---

## 7. Доменный эксперт

### Главные замечания
- **Domain coverage insufficient:** 20 сценариев — это seed, не bank. Для анализа концепции нужно минимум 100.
- **Domain mode variation weak:** В legal_ops только enterprise/regulated. Нет personal, prototype, emergency для legal.
- **Artifact profile imbalance:** 57 артефактов, но 40 из них — single-occurrence. Нет recurring artifact patterns across domains.

### Подтверждённые выводы
- legal_ops, finance_ops, security_compliance — все требуют explicit governance (подтверждено).
- research и product_management — bias-sensitive domains (подтверждено в extraction reports).
- office_assistant — highest UX sensitivity (calendar, email directly affect user daily workflow).

### Отвергнутые предположения
- "All domains can use same artifact set" — нет, legal needs EvidenceTable, finance needs AuditTrail, research needs LiteratureMatrix.

### Must Add (концепция)
1. **Domain-specific artifact taxonomies:** каждый домен должен иметь свой artifact profile, не generic список.
2. **Domain mode coverage:** каждый домен должен иметь ≥3 domain modes в банке.
3. **Bias/conflict detection:** для HR, research, product — mandatory, не optional.

### Should Add
- **Domain expert gate:** для legal, finance, medical — human-in-the-loop обязателен.
- **Cross-domain scenario:** e.g., "legal review of product roadmap" — tests domain switching.

### Can Defer
- Industry-specific compliance packs (HIPAA, SOX) — пока нет таких сценариев.
- Multi-language document processing.

---

## Cross-Cutting Concerns

### Что все эксперты согласны
1. **20 сценариев — недостаточно** для robust concept analysis. Нужно ≥100.
2. **SolveResult / execution envelope** — missing core abstraction.
3. **L1 coverage gaps** — критичны для UX и first useful product.
4. **Overengineering in extraction reports** — слишком много "suggested components".

### Что эксперты не согласны
- **Architect vs DX:** Architect хочет component registry, DX хочет zero-config defaults. Баланс: registry exists, но user не видит его напрямую.
- **Security vs UX:** Security хочет больше gates, UX хочет меньше friction. Баланс: gate severity levels (silent/notify/block).
- **SRE vs Product:** SRE хочет observability, Product хочет fast path. Баланс: observability async, не блокирует TTFUO.
