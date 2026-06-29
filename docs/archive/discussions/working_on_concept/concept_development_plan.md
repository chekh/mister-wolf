# Mr. Wolf — план разработки концепции

## 6. План разработки концепции

### Этап 1. Согласовать методику

Результат:

- утверждённый подход;
- список экспертных ролей;
- шаблон Subsystem Card;
- шкала сложности;
- список функциональных групп;
- критерии готовности.

Выходной документ:

```text
mr-wolf-concept-methodology.md
```

---

### Этап 2. Зафиксировать core user journeys

Нужно описать 5–7 конкретных сценариев end-to-end.

Минимальный набор:

1. CLI `wolf solve "review this repo"`.
2. OpenCode session with Mr. Wolf facade.
3. Simple single-agent answer.
4. Workflow with approval gate.
5. Imported MCP tool through wrapper.
6. Policy deny with explanation.
7. Memory/context-assisted solve.

Для каждого journey описать:

```text
user input
selected path
components involved
expected result
trace
failure cases
```

Выходной документ:

```text
mr-wolf-core-journeys.md
```

---

### Этап 3. Разобрать функциональные группы

Для каждой из 16 групп заполнить Subsystem Card.

Порядок разбора:

#### Раунд 1 — скелет системы

1. Wolf Facade / Solve
2. Scenario Router
3. Runtime Assembler
4. Policy / Safety Core
5. Capability Registry
6. Adapter Layer / OpenCode

#### Раунд 2 — capabilities

7. Skills
8. Tools / MCP Tools
9. Wrappers
10. Agents / AgentEndpoint
11. Model Router

#### Раунд 3 — knowledge and outputs

12. Context
13. Memory
14. Artifacts

#### Раунд 4 — platform concerns

15. Plugins / Hooks
16. State / Events / Trace

Выходной документ:

```text
mr-wolf-functional-decomposition.md
```

---

### Этап 4. Экспертные ревью

Каждый эксперт смотрит на функциональные группы под своим углом.

#### Architect review

Фокус:

- границы;
- зависимости;
- core/plugin split;
- conceptual consistency.

#### Developer review

Фокус:

- DX;
- first useful scenario;
- config complexity;
- debugability.

#### SRE review

Фокус:

- latency;
- failure modes;
- state recovery;
- observability;
- cost controls.

#### Security review

Фокус:

- policy bypass;
- external capability trust;
- MCP risks;
- memory visibility;
- side effects.

#### Product/UX review

Фокус:

- clarity;
- Time to Hello World;
- one-solver experience;
- explainability.

#### Integration review

Фокус:

- OpenCode;
- adapters;
- MCP server/client;
- hooks;
- plugin boundaries.

Выходной документ:

```text
mr-wolf-expert-review-notes.md
```

---

### Этап 5. Составить dependency map

Определить:

- что зависит от чего;
- что можно делать независимо;
- что нельзя делать рано;
- какие компоненты блокируют `wolf solve`;
- какие компоненты блокируют OpenCode integration;
- какие компоненты блокируют imported skills/tools.

Выходной документ:

```text
mr-wolf-dependency-map.md
```

---

### Этап 6. Составить risk register

Категории рисков:

- router risk;
- assembler hallucination;
- policy bypass;
- configuration hell;
- cold start;
- memory rot;
- latency;
- debugging complexity;
- external capability trust;
- adapter fragility;
- domain pack conflicts.

Для каждого риска:

```text
risk
impact
likelihood
mitigation
detection
owner component
```

Выходной документ:

```text
mr-wolf-risk-register.md
```

---

### Этап 7. Определить First Useful Product

Нужно выбрать минимальный сценарий, который доказывает ценность Wolf.

Кандидат:

```text
User in CLI/OpenCode asks:
  "Review this repo and suggest next milestone."

Wolf:
  - accepts task through solve;
  - builds context;
  - selects default review scenario;
  - invokes one reviewer/architect agent;
  - returns structured report;
  - writes case trace;
  - explains selected path.
```

Выходной документ:

```text
mr-wolf-first-useful-product.md
```

---

### Этап 8. Обновить основную концепцию

После decomposition, экспертных ревью, dependency map и risk register обновить основной concept document.

Структура concept v2:

1. Executive Summary
2. Problem
3. Vision
4. Core Principles
5. Core User Journeys
6. Architecture Overview
7. Functional Groups
8. Boundaries
9. Safety and Policy Model
10. Capability Model
11. Integration Model
12. Memory / Artifacts / State
13. Risks and Constraints
14. First Useful Product

Выходной документ:

```text
mr-wolf-concept-v2.md
```

---

## 7. Критерии готовности концепции

Концепция считается готовой к roadmap/spec phase, если:

- каждая функциональная группа имеет Subsystem Card;
- есть 5–7 core user journeys;
- есть dependency map;
- есть risk register;
- есть First Useful Product definition;
- эксперты дали замечания;
- замечания классифицированы как accepted/rejected/deferred;
- в концепции явно указано, что входит в core, plugin, adapter, config, state;
- есть защита от overengineering;
- есть zero-config / cold start strategy;
- есть realistic OpenCode integration path;
- есть правило deterministic safety core;
- есть clear boundaries для skills/tools/MCP/A2A.

---

## 8. Правила принятия решений

При спорных решениях использовать такой порядок:

```text
1. Безопасность и policy.
2. Простота first useful scenario.
3. Модульность и границы.
4. Возможность расширения через plugin/adapter.
5. Универсальность между доменами.
6. Максимальная автоматизация.
```

Если решение увеличивает универсальность, но ломает first useful scenario, оно откладывается.

Если решение красиво архитектурно, но требует сложной конфигурации на старте, оно откладывается или прячется за generated defaults.

Если решение даёт power, но создаёт policy bypass, оно запрещается до появления safety model.

---

## 9. Рабочий формат экспертного участия

Для каждого экспертного ревью использовать формат:

```text
Role:
Reviewed sections:
Top 5 concerns:
Must fix:
Should fix:
Can defer:
Rejected assumptions:
Suggested tests/examples:
Final verdict:
```

Вердикты:

```text
Approved
Approved with fixes
Needs redesign
Reject for now
```

Все замечания попадают в decision log:

```text
accepted
partially accepted
deferred
rejected
```

Для rejected/deferred обязательно указывать причину.

---

## 10. Ближайший следующий шаг

Следующий рабочий шаг после согласования этой методики:

```text
Сформировать core user journeys и заполнить первые 6 Subsystem Cards:
1. Wolf Facade / Solve
2. Scenario Router
3. Runtime Assembler
4. Policy / Safety Core
5. Capability Registry
6. Adapter Layer / OpenCode
```

После этого можно подключать экспертные роли к первому ревью.
