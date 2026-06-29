Критика в целом справедливая. Я бы принял её не как опровержение концепции, а как список **обязательных ограничителей**, без которых Mr. Wolf действительно может стать “configuration hell + slow agent router + unsafe meta-agent”.

Я уже внёс в концептуальный документ новый блок:

```text id="9p569u"
31. Критические риски и проектные ограничения
```

Там зафиксированы контрмеры по router, hard safety, latency, traceability, policy conflicts, cold start, memory aging и imported capabilities.

## Главный вывод по критике

Концепцию нужно усилить такой формулой:

```text id="in0qdb"
Mr. Wolf должен быть не просто мощным control plane,
а bounded, explainable, fail-safe control plane.
```

То есть не “LLM решает, что делать”, а:

```text id="clzcw9"
deterministic core
+ declarative config
+ bounded LLM assistance
+ explicit policy
+ explainable routing
+ fail-fast / ask / deny behavior
```

Иначе критики правы: если LLM окажется внутри Scenario Router / Runtime Assembler как скрытый управляющий центр, мы получим не control plane, а “галлюцинирующий control plane”.

---

# 1. Риск centralized fragility — валиден

Да, `Wolf Facade` и `Scenario Router` становятся опасной точкой ошибки.

Но это лечится не отказом от фасада, а изменением статуса router decision.

Нужно:

```text id="dbynqs"
Router decision = proposal, not command.
```

Каждое решение router должно иметь:

```text id="690hyj"
selected_scenario
confidence
matched_rules
alternatives
reason
risk_level
needs_confirmation
```

Правило:

```text id="2an9iy"
high confidence + low risk → execute
low confidence → ask
high risk → ask even with high confidence
ambiguous scenario → present alternatives
```

Это прямо согласуется со старой идеей Adaptive Facade: пользователь видит одного агента, но runtime должен задавать себе вопросы “какой workflow применим?”, “какие политики ограничивают?”, “какие tools/skills/models разрешены?” — не полагаться на одну “догадку” фасада .

---

# 2. Галлюцинации control plane — самый серьёзный риск

Это ключевое замечание.

Нельзя позволить LLM:

```text id="4dql29"
- самому решать, что policy allow;
- самому маппить опасные wrapper параметры;
- самому выбирать external AgentEndpoint без схемы;
- самому повышать trust imported capability;
- самому обходить hard-deny.
```

Нужна архитектурная граница:

```text id="5hmn7a"
LLM may propose.
Deterministic core disposes.
```

Иначе “Policies stronger than prompts” будет иллюзией. В старых материалах уже была правильная линия: поведение задаётся конфигурацией, действия контролируются policy, а core должен оставаться универсальным исполнителем, где domain-specific логика не зашита в код .

Я бы ввёл в концепцию термин:

```text id="s4p144"
Deterministic Safety Core
```

Он должен включать:

```text id="hynw2g"
hard_deny
path guards
command guards
tool permission guards
wrapper schema validation
external action guards
secret/PII guards
trust boundaries
```

И правило:

```text id="icf89m"
Hard-deny stronger than policy.
Policy stronger than prompt.
Prompt never overrides safety.
```

---

# 3. Latency / context explosion — валидно

Если на каждый запрос запускать полный пайплайн:

```text id="aetbrz"
Router → Context → Memory → Policy → Assembler → Agent → Tool → Wrapper
```

то UX будет плохим.

Правильная контрмера:

```text id="jbxrd3"
Fast path before full orchestration.
```

Не каждая задача — workflow. Нужна шкала исполнения:

```text id="s6n93s"
quick_answer
simple_context_read
single_tool_call
single_agent_invoke
full_workflow
multi-agent workflow
```

Принцип:

```text id="ay7qci"
Do not assemble a fleet when one deterministic step is enough.
```

Это важно сохранить в roadmap: `wolf solve` не должен всегда быть тяжёлым. Он должен уметь сказать: “это простой read-only ответ, workflow не нужен”.

---

# 4. Traceability paradox — валидно, но решаемо

Полный trace нужен, но нельзя заставлять человека читать мегабайты событий.

Нужно три уровня наблюдаемости:

```text id="mhpd1j"
1. User Summary
   Что выбрано, что сделано, что требует внимания.

2. Debug Trace
   Scenario, workflow, agents, tools, policy decisions, gates, errors.

3. Full Audit Log
   Все events, tool calls, model calls, chunks, outputs.
```

И отдельная команда/механизм:

```text id="n39k1g"
wolf explain <case_id>
wolf explain <case_id> --why-not <action>
wolf trace <case_id> --level debug
```

Особенно нужен “why not”:

```text id="ekgcol"
Почему Wolf не выполнил действие?
- policy deny
- low router confidence
- missing tool permission
- memory conflict
- gate rejected
- tool unavailable
```

Старые документы уже фиксировали event/state как обязательную основу: state remembers, events.jsonl, approvals, artifacts и generated runtime state нужны для audit, resume и debugging .

---

# 5. Policy bypass — критика справедлива

Если policy decision делает LLM — это опасно.

Правильная модель:

```text id="2sym0o"
LLM может классифицировать намерение или объяснить policy.
Policy Engine должен быть deterministic.
```

Текущий реализованный MVP3 уже идёт в правильную сторону: rule-based allow/ask/deny. В концепции это надо усилить:

```text id="960pcj"
Policy Engine не вызывает LLM для enforcement.
```

В будущем можно добавить LLM-assisted policy suggestion, но только так:

```text id="vyaq4l"
LLM proposes policy candidate
human/project owner approves
compiled deterministic rule enforces
```

---

# 6. Domain Pack conflicts — нужно добавить явно

Критика права: если подключить Legal + DevOps + Office, конфликты неизбежны.

Нужен `Policy Conflict Resolver`.

Базовое precedence:

```text id="3p37hr"
Hard safety rules
  > organization policy
  > project policy
  > case policy
  > domain pack policy
  > skill default policy
  > tool default policy
```

Fail-closed rule:

```text id="7h3lbn"
conflict + side effect → ask or deny
conflict + sensitive data → deny or ask
conflict + read-only low-risk → allow only if policy permits
```

Memory subsystem уже предусматривал conflict detection и precedence: например, если старое правило говорит “используем specs”, а новое — “ADR-first”, система должна поднять конфликт или применить precedence, а не выбирать случайно . Это нужно распространить с memory на domain packs и policies.

---

# 7. Cold start / configuration hell — самый продуктовый риск

Да, если для первого результата нужно написать десятки YAML, проект проиграет более “тупым”, но готовым агентам.

Нужна модель зрелости конфигурации:

```text id="7hz92x"
Level 0 — zero-config
  safe defaults, read-only / answer / context build.

Level 1 — generated config
  wolf init сканирует проект и предлагает wolf.yaml.

Level 2 — project config
  пользователь редактирует scenarios, agents, policies.

Level 3 — packs/adapters
  подключаются domain packs, external skills, MCP tools.

Level 4 — organization control plane
  централизованные policies, memory, adapters, audit.
```

Порог входа:

```bash id="fhp0p1"
wolf init
wolf solve "review this repo"
```

Не:

```text id="7ghw7p"
напишите 500 строк YAML, чтобы получить первый ответ.
```

Это нужно считать не “nice to have”, а survival requirement.

---

# 8. Memory freshness — валидно

Memory как control действительно опасна.

Контрмеры:

```text id="hoayj4"
source required
status required
ttl / valid_until
supersedes / superseded_by
confidence
scope
sensitivity
policy visibility
conflict detection
```

Memory не должна молча блокировать новые действия на основе старого знания. В старых документах уже есть правильная формула: memory — это governed context, а не storage; retrieval должен проходить scope filter, policy filter, structural/semantic/graph retrieval, ranking, conflict detection и compression . Также важно, что long-term memory write должен быть intentional, а Project Memory не должна автоматически загрязняться всем подряд .

---

# 9. Что я бы добавил в концепцию как “Design Constraints”

Я бы сделал отдельный раздел **Non-negotiable design constraints**:

```text id="hymd4q"
1. Router decisions are explainable and reversible.
2. Low confidence routing asks user.
3. Hard safety checks are deterministic and non-overridable.
4. LLM never directly enforces policy.
5. Runtime Assembler outputs explicit CaseRuntime plan.
6. Imported capabilities are untrusted by default.
7. Policy conflicts fail closed.
8. Memory control items require source, validity and precedence.
9. Full audit exists, but debug summaries are layered.
10. Zero-config path must work.
11. Fast path must exist for simple tasks.
12. Config generation must reduce cold start.
```

---

# 10. Что из критики я бы не принял полностью

## “Централизация фасада плоха”

Не согласен. Единый фасад — это суть UX. Проблема не в фасаде, а в том, чтобы фасад не был непрозрачным и всесильным.

Правильно:

```text id="2jhzaz"
single facade UX
not single opaque decision point
```

## “Многослойность неизбежно медленная”

Не обязательно. Если есть fast path, caching, deterministic routing, lazy memory/context loading и профили исполнения, система может быть быстрой для простых задач и глубокой для сложных.

## “YAML ведёт к configuration hell”

Может. Поэтому YAML должен быть не способом программировать всё, а способом описывать структуру, политики и маршруты. Сложная логика должна уходить в plugins/adapters, а конфиг должен иметь генератор и presets.

---

# 11. Как это меняет ближайшую реализацию

Для следующего большого шага `wolf solve` нужно сразу включить защитные рамки:

```text id="kkjvas"
- solve --dry-run показывает план без исполнения;
- router confidence обязателен;
- ambiguous routing asks user;
- hard-deny safety core применяется до любых tools;
- policy conflict detection хотя бы минимальный;
- explain output показывает why selected;
- zero-config default scenario exists;
- init can generate starter wolf.yaml;
- fast path for simple single-agent answer.
```

Минимальный `wolf solve` не должен быть “магическим”. Он должен быть:

```text id="pwd0wk"
visible planner + safe executor
```

---

# 12. Итоговая позиция

Экспертная критика усиливает концепцию. После неё Mr. Wolf нужно позиционировать не просто как:

```text id="rcn9uw"
configurable agentic control plane
```

а как:

```text id="cy35xb"
bounded, deterministic-first, explainable agentic control plane
```

Финальная уточнённая формула:

```text id="u0unoc"
Mr. Wolf is a configurable agentic control plane with a single user-facing facade,
but its routing, policy, capability selection, memory use and execution are bounded
by deterministic safety, explicit plans, conflict resolution and auditability.
```

По-русски:

```text id="pki40v"
Mr. Wolf — это единый фасад решения задач,
но не бесконтрольный мета-агент:
его маршрутизация, выбор capabilities, политика, память и исполнение
ограничены deterministic safety core, явными планами, разрешением конфликтов и аудитом.
```

Это стоит добавить прямо в начало концепции рядом с основной формулой.
