# Mr. Wolf Scenario Playthrough Bank — формат игры и требования к проведению

## 1. Назначение

Scenario Playthrough Bank хранит результаты “игры” по сценариям. Игра нужна, чтобы не ограничиваться статичной Scenario Card, а проверить, как человек и Mr. Wolf взаимодействуют во времени.

Playthrough не должен превращаться в длинный художественный диалог. Он должен быть короткой структурированной симуляцией, из которой можно извлечь требования, артефакты, риски, UX-проблемы, policy gaps и границы подсистем.

## 2. Основная идея игры

Каждый сценарий проигрывается тремя ролями:

```text
User Simulator
  играет реального пользователя.

Wolf Simulator
  играет Mr. Wolf по текущей концепции.

Observer/Critic
  фиксирует слабые места, артефакты, подсистемы и вопросы к концепции.
```

Дополнительно можно добавлять специализированные экспертные роли:

```text
Security Reviewer
SRE Reviewer
Domain Reviewer
Integration Reviewer
Artifact Reviewer
```

## 3. Что является результатом игры

На каждый сценарий создаются две записи:

1. **Playthrough Record** — короткое моделирование взаимодействия.
2. **Extraction Report** — структурированный анализ того, что игра показала для концепции.

Source of truth — JSONL:

```text
scenario-bank/playthroughs/playthroughs.jsonl
scenario-bank/playthroughs/extraction-reports.jsonl
```

## 4. Структура папок

```text
scenario-bank/
  playthroughs/
    playthroughs.jsonl
    extraction-reports.jsonl
    by-domain/
      software_engineering.jsonl
      office_assistant.jsonl
      legal_ops.jsonl
    summaries/
      playthrough-summary.md
      weak-spots.md
      concept-updates.md
```

## 5. Требования к проведению игры

### 5.1 Общие правила

- Играть только по одной Scenario Card за раз.
- Не переписывать Scenario Card во время игры; изменения фиксировать в Extraction Report.
- Не писать длинные диалоги.
- Максимум 8–12 interaction steps.
- Каждый step должен иметь явный actor.
- Wolf Simulator не должен использовать capabilities, которых нет в Scenario Card, без отметки `missing_capability`.
- Если Wolf не уверен, он должен ask/clarify, а не угадывать.
- Если действие рискованное, Wolf должен apply policy/gate.
- Если действие невозможно, Wolf должен explain why-not.

### 5.2 Поведение User Simulator

User Simulator должен вести себя как реальный человек:

- формулировать задачу неполно;
- не знать внутренних терминов Wolf;
- иногда менять требования;
- иногда хотеть быстрый результат;
- иногда не понимать, будет ли Wolf делать side effects;
- иногда просить “сделай всё сам”;
- иногда давать уточнение после вопроса Wolf.

User Simulator не должен:

- подсказывать архитектуру;
- называть внутренние компоненты;
- заранее выбирать правильный workflow;
- быть идеальным пользователем.

### 5.3 Поведение Wolf Simulator

Wolf Simulator должен действовать по концепции Mr. Wolf:

- принимать задачу через фасад;
- определять scenario;
- учитывать confidence/ambiguity;
- строить план, если нужно;
- применять configuration mode;
- выбирать persona/skill/workflow/tool/model;
- применять policy;
- спрашивать approval;
- отказывать при hard-deny;
- создавать или использовать artifacts;
- объяснять важные решения пользователю.

Wolf Simulator не должен:

- выполнять side effects без policy;
- использовать LLM как замену hard policy;
- скрывать uncertainty;
- загружать все skills/tools сразу;
- превращать простой сценарий в full orchestration без причины.

### 5.4 Поведение Observer/Critic

Observer/Critic фиксирует:

- где пользователь был неясен;
- где Wolf сделал правильное уточнение;
- где Wolf ошибся или должен был спросить;
- где возник overengineering;
- где не хватило artifact;
- где нужен gate;
- где нужен wrapper/adapter;
- где не хватает memory/context;
- где появилось policy conflict;
- какие концептуальные вопросы возникли.

Observer/Critic должен быть строгим. Его задача — не подтвердить концепцию, а найти слабые места.

## 6. Формат Playthrough Record

```yaml
playthrough_id: string
scenario_id: string
run_id: string
played_at: string
roles:
  user_simulator: string
  wolf_simulator: string
  observer: string

summary:
  user_goal: string
  wolf_path: string
  outcome: success | partial_success | blocked | refused | unclear

interaction_steps:
  - step: 1
    actor: user | wolf | observer
    type: user_request | clarification_question | clarification_answer | plan | approval_request | approval_response | action | result | refusal | observation
    content: string
    internal_notes:
      scenario_decision: string
      confidence: high | medium | low
      artifacts_created: string[]
      policies_checked: string[]
      capabilities_used: string[]

final_visible_result:
  type: answer | plan | artifact | refusal | partial_result
  summary: string

runtime_path:
  scenario: string
  persona: string
  execution_mode: simple_answer | context_answer | dry_run | workflow | governed_action | external_capability
  configuration_mode: string[]
  components_used: string[]

artifacts_observed:
  created: string[]
  used: string[]
  missing: string[]

policy_and_gates:
  decisions: string[]
  gates_created: string[]
  refusals: string[]

issues_detected:
  - string
```

## 7. Формат Extraction Report

```yaml
extraction_id: string
scenario_id: string
playthrough_id: string

verdict:
  usefulness: high | medium | low
  realism: high | medium | low
  concept_pressure: high | medium | low
  implementation_risk: high | medium | low

behavior_findings:
  user_confusion_points: string[]
  wolf_decision_points:
    - decision: string
      confidence: high | medium | low
      issue: string
  good_behaviors: string[]
  bad_behaviors: string[]

artifact_findings:
  required_artifacts: string[]
  missing_artifacts: string[]
  questionable_artifacts: string[]
  artifact_lifecycle_questions: string[]

component_findings:
  components_confirmed: string[]
  components_missing: string[]
  components_overkill: string[]
  new_components_suggested: string[]

configuration_findings:
  configuration_mode_confirmed: string[]
  config_needed: string[]
  can_be_zero_config: boolean
  generated_config_possible: boolean
  domain_pack_needed: boolean
  custom_plugin_needed: boolean

policy_findings:
  required_policies: string[]
  required_gates: string[]
  hard_denies: string[]
  policy_conflicts: string[]
  safety_gaps: string[]

capability_findings:
  required_tools: string[]
  required_skills: string[]
  required_adapters: string[]
  required_wrappers: string[]
  imported_capabilities: string[]

memory_findings:
  memory_needed: none | read | write_candidate | control
  memory_items: string[]
  stale_memory_risks: string[]
  memory_visibility_concerns: string[]

failure_modes:
  observed: string[]
  potential: string[]
  mitigations: string[]

complexity_assessment:
  implementation_complexity: 1
  config_complexity: 1
  runtime_risk: 1
  security_risk: 1
  latency_cost_risk: 1
  debugging_complexity: 1
  total: 6
  recommendation: safe_mvp | simplify | split | defer

concept_updates:
  must_add: string[]
  should_add: string[]
  can_defer: string[]
  rejected_assumptions: string[]

next_questions:
  - string
```

## 8. Типы outcome

```yaml
outcomes:
  success:
    meaning: Wolf completed expected behavior.
  partial_success:
    meaning: Wolf produced useful output but needed missing capabilities or assumptions.
  blocked:
    meaning: Wolf could not proceed due to missing context, tools, config, or approval.
  refused:
    meaning: Wolf correctly refused due to policy/hard-deny.
  unclear:
    meaning: Scenario or user intent was too ambiguous for reliable behavior.
```

## 9. Типы interaction step

```yaml
interaction_step_types:
  - user_request
  - clarification_question
  - clarification_answer
  - scenario_explanation
  - plan
  - dry_run
  - approval_request
  - approval_response
  - action
  - tool_call
  - artifact_created
  - result
  - refusal
  - observation
```

## 10. Требования к Simulation Summary

Simulation Summary должен быть коротким:

```text
max 12 interaction steps
max 2 sentences per step
no full prompt transcripts unless necessary
no implementation code
no long explanations
```

Цель — увидеть структуру поведения, не писать роман.

## 11. Четыре режима игры

Для важных сценариев можно проводить 4 прогона.

### 11.1 UX Play

Фокус:

```text
Что видит пользователь?
Где он путается?
Достаточно ли объяснений?
Где нужен dry-run?
Где нужен approval?
```

### 11.2 Runtime Play

Фокус:

```text
Какие компоненты просыпаются?
Какие объекты создаются?
Какие решения принимает Wolf?
Какие artifacts появляются?
```

### 11.3 Failure Play

Фокус:

```text
Что если router ошибся?
Что если policy conflict?
Что если tool недоступен?
Что если memory устарела?
Что если user не дал approval?
```

### 11.4 Minimality Play

Фокус:

```text
Что можно убрать?
Что является overkill?
Можно ли решить проще?
Какой minimum useful version?
```

Не каждый сценарий обязан иметь все 4 прогона. Для Level 1–2 достаточно UX + Minimality. Для Level 4–5 желательно все 4.

## 12. Example Playthrough Record

```yaml
playthrough_id: pt-software-review-next-mvp-001
scenario_id: software.review.next_mvp.001
run_id: run-001
played_at: 2026-05-01
roles:
  user_simulator: product_user
  wolf_simulator: mr_wolf_current_concept
  observer: architect_critic

summary:
  user_goal: 'Understand current project state and choose next MVP.'
  wolf_path: 'Context-aware single-agent review with lightweight scenario routing.'
  outcome: success

interaction_steps:
  - step: 1
    actor: user
    type: user_request
    content: 'Проверь репозиторий и предложи следующий MVP.'
    internal_notes: {}
  - step: 2
    actor: wolf
    type: scenario_explanation
    content: 'Я интерпретирую это как project review / roadmap planning. Сначала соберу контекст, затем верну краткий отчёт и рекомендацию.'
    internal_notes:
      scenario_decision: roadmap_planning
      confidence: high
      artifacts_created:
        - ScenarioDecision
      policies_checked:
        - read_only_allowed
      capabilities_used: []
  - step: 3
    actor: wolf
    type: action
    content: 'Собираю контекст проекта в read-only режиме.'
    internal_notes:
      artifacts_created:
        - ContextBundle
      capabilities_used:
        - context.read
  - step: 4
    actor: wolf
    type: result
    content: 'Следующий MVP: Wolf Facade / Solve Command. Причина: без единого входа текущие runtime primitives остаются разрозненными.'
    internal_notes:
      artifacts_created:
        - ReviewReport
        - NextMVPRecommendation

final_visible_result:
  type: artifact
  summary: 'ReviewReport with next MVP recommendation.'

runtime_path:
  scenario: roadmap_planning
  persona: software_architect
  execution_mode: context_answer
  configuration_mode:
    - generated_config
    - dynamic_persona
  components_used:
    - WolfFacade
    - ScenarioRouterLight
    - ContextResolver
    - AgentRunner
    - ModelRouter
    - TraceSystem

artifacts_observed:
  created:
    - ScenarioDecision
    - ContextBundle
    - ReviewReport
    - CaseTrace
  used:
    - repository_files
    - docs
  missing: []

policy_and_gates:
  decisions:
    - read_only_allowed
  gates_created: []
  refusals: []

issues_detected:
  - 'Need explicit distinction between report as final answer vs persisted artifact.'
```

## 13. Example Extraction Report

```yaml
extraction_id: er-software-review-next-mvp-001
scenario_id: software.review.next_mvp.001
playthrough_id: pt-software-review-next-mvp-001

verdict:
  usefulness: high
  realism: high
  concept_pressure: medium
  implementation_risk: low

behavior_findings:
  user_confusion_points: []
  wolf_decision_points:
    - decision: 'selected roadmap_planning'
      confidence: high
      issue: 'No issue; user intent was clear.'
  good_behaviors:
    - 'Wolf explained selected path before acting.'
    - 'Wolf stayed read-only.'
  bad_behaviors: []

artifact_findings:
  required_artifacts:
    - ScenarioDecision
    - ContextBundle
    - ReviewReport
    - CaseTrace
  missing_artifacts:
    - 'Explicit SolveResult envelope'
  questionable_artifacts: []
  artifact_lifecycle_questions:
    - 'Should ReviewReport be stored under artifacts/ or only in outputs?'

component_findings:
  components_confirmed:
    - WolfFacade
    - ScenarioRouterLight
    - ContextResolver
    - AgentRunner
    - ModelRouter
    - TraceSystem
  components_missing:
    - SolveResultEnvelope
  components_overkill:
    - FullWorkflowEngine
    - MultiAgentDelegation
  new_components_suggested:
    - LightweightSolvePlanner

configuration_findings:
  configuration_mode_confirmed:
    - generated_config
    - dynamic_persona
  config_needed:
    - default_review_scenario
  can_be_zero_config: true
  generated_config_possible: true
  domain_pack_needed: false
  custom_plugin_needed: false

policy_findings:
  required_policies:
    - read_only_project_access
  required_gates: []
  hard_denies:
    - no_file_write
  policy_conflicts: []
  safety_gaps: []

capability_findings:
  required_tools:
    - context.read
  required_skills:
    - software.project_review_optional
  required_adapters: []
  required_wrappers: []
  imported_capabilities: []

memory_findings:
  memory_needed: read
  memory_items:
    - recent_case_summaries_optional
  stale_memory_risks:
    - 'Old roadmap decision may bias recommendation.'
  memory_visibility_concerns: []

failure_modes:
  observed: []
  potential:
    - context_too_large
    - stale_memory_bias
  mitigations:
    - use bounded context
    - cite memory source and freshness

complexity_assessment:
  implementation_complexity: 2
  config_complexity: 1
  runtime_risk: 1
  security_risk: 1
  latency_cost_risk: 2
  debugging_complexity: 1
  total: 8
  recommendation: safe_mvp

concept_updates:
  must_add:
    - SolveResult envelope
  should_add:
    - Artifact lifecycle rule for reports
  can_defer:
    - Multi-agent roadmap analysis
  rejected_assumptions:
    - 'Full workflow required for repo review'

next_questions:
  - 'Should project review use memory by default or only when present?'
```

## 14. Quality gates for playthroughs

A playthrough is valid if:

- references an existing Scenario Card;
- has no more than 12 interaction steps;
- includes final outcome;
- lists components used;
- lists artifacts created/used/missing;
- has policy/gate notes;
- has issues_detected;
- has a matching Extraction Report.

An Extraction Report is valid if:

- includes verdict;
- includes behavior findings;
- includes artifact findings;
- includes component findings;
- includes policy findings;
- includes complexity assessment;
- includes concept updates.

## 15. How playthrough data is used

Playthrough data feeds:

```text
Concept updates
Functional decomposition
Artifact catalog
Capability registry design
Policy model
Adapter model
Memory model
Roadmap prioritization
First Useful Product definition
```

The playthrough bank should be treated as research data. Do not overwrite old playthroughs; create new runs when the concept changes.
