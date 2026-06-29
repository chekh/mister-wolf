# Mr. Wolf — методика разработки концепции

## 1. Назначение документа

Этот документ задаёт методику разработки концепции Mr. Wolf. Цель — превратить концепцию из архитектурного манифеста в проверяемый, реалистичный и инженерно пригодный документ.

Работа над концепцией должна учитывать не только видение автора, но и оценки разных экспертных ролей: архитектора, разработчика, SRE/эксплуатации, специалиста по безопасности, UX/product, специалиста по интеграциям и доменных экспертов.

Итоговая концепция должна отвечать на вопросы:

- ради чего существует Mr. Wolf;
- какую боль пользователя он решает;
- какие функциональные группы входят в систему;
- какие у них границы и контракты;
- что является core, что plugin, что adapter, что config;
- какие части уже реализуемы сейчас;
- где риски overengineering;
- как система остаётся полезной в минимальном варианте;
- как внешние agent environments, skills, MCP tools и plugins подключаются к Wolf;
- как обеспечиваются безопасность, предсказуемость и объяснимость.

---

## 2. Принципы разработки концепции

### 2.1 От идеи к инженерной модели

Каждая идея должна быть доведена до инженерной формы:

```text
идея → функциональная группа → границы → входы/выходы → риски → MVP-вариант
```

Если идея не может быть описана через входы, выходы, состояние, конфиг и failure modes, она остаётся слишком абстрактной и не должна попадать в ядро концепции без уточнения.

---

### 2.2 User journey first

Слои архитектуры должны проверяться через реальные пользовательские сценарии.

Базовые проверочные сценарии:

1. Пользователь вызывает `wolf solve "review this repo"`.
2. Пользователь работает в OpenCode-сессии и общается только с Mr. Wolf.
3. Wolf выбирает простой single-agent путь без workflow.
4. Wolf выбирает workflow с policy gate.
5. Wolf использует imported MCP tool через wrapper.
6. Wolf отказывается выполнять действие и объясняет почему.
7. Wolf использует память проекта или case history.

Любой слой концепции должен отвечать на вопрос:

```text
Как он участвует хотя бы в одном core journey?
```

---

### 2.3 Минимальная полезная версия для каждого слоя

Для каждой функциональной группы нужно определить:

```text
Full idea
Minimum useful version
Out of scope
```

Это защищает проект от overengineering.

Пример:

```text
Memory

Full idea:
  governed memory control plane, semantic retrieval, graph memory,
  project/user/domain/case memory, policy-aware retrieval.

Minimum useful version:
  case summaries + project-memory.json + recent cases query.

Out of scope:
  vector DB, graph DB, autonomous memory writes, LLM summaries by default.
```

---

### 2.4 Deterministic-first

Управляющие решения должны быть deterministic-first.

LLM может помогать:

- классифицировать;
- предлагать план;
- объяснять;
- генерировать черновик конфигурации;
- суммаризировать.

Но LLM не должен единолично:

- отменять hard-deny;
- выдавать policy allow;
- повышать trust external capability;
- выбирать опасный AgentEndpoint без валидации;
- исполнять side-effect action без policy.

Правило:

```text
LLM may propose.
Deterministic core disposes.
```

---

### 2.5 Fail-safe and explainable

Система должна быть не только powerful, но и bounded, explainable, fail-safe.

Обязательные ограничения:

- low-confidence routing → ask;
- high-risk action → ask or deny;
- policy conflict → fail closed;
- imported capability → untrusted by default;
- memory conflict → explain / ask / ignore;
- hard-deny → non-overridable;
- runtime plan → explicit and inspectable.

---

### 2.6 No configuration hell

Концепция должна учитывать холодный старт.

Нельзя требовать десятки YAML-файлов для первого полезного запуска.

Уровни зрелости конфигурации:

```text
Level 0: zero-config
Level 1: generated config via wolf init
Level 2: project config
Level 3: packs/adapters/imported capabilities
Level 4: organization control plane
```

Первый полезный путь:

```bash
wolf init
wolf solve "review this repo"
```

---

### 2.7 Layer independence

Каждый слой должен быть полезен отдельно:

- Workflow Engine можно использовать без Wolf Facade.
- Context Resolver можно использовать без agents.
- Policy Engine можно использовать для tools и workflows.
- Tool Registry можно использовать без multi-agent.
- MCP adapter можно использовать поверх `wolf_solve`.

Это сохраняет модульность и снижает риск монолита.

---

## 3. Экспертные роли

Работа над концепцией должна проходить через несколько экспертных перспектив.

### 3.1 Architect

Фокус:

- целостность архитектуры;
- границы слоёв;
- зависимости;
- extensibility;
- core vs plugin vs adapter;
- реалистичность runtime assembly.

Вопросы:

- Не смешаны ли responsibilities?
- Где живёт доменная логика?
- Не стал ли core слишком “умным”?
- Можно ли слой заменить plugin?
- Есть ли clear contracts?

---

### 3.2 Developer / Framework User

Фокус:

- developer experience;
- простота первого запуска;
- понятность конфигов;
- отладка;
- локальная разработка;
- тестируемость.

Вопросы:

- Сколько нужно сделать, чтобы получить первый результат?
- Можно ли понять ошибку?
- Можно ли написать простой plugin/tool?
- Не превращается ли YAML в programming language?
- Как выглядит минимальный пример?

---

### 3.3 SRE / Operations

Фокус:

- надёжность;
- latency;
- observability;
- failure modes;
- retries;
- state recovery;
- resource usage.

Вопросы:

- Что происходит при сбое tool/model/provider?
- Можно ли resume case?
- Как понять, где зависло?
- Как ограничить стоимость и токены?
- Как избежать runaway workflows?

---

### 3.4 Security / Governance

Фокус:

- policy bypass;
- prompt injection;
- external capability trust;
- MCP tool risks;
- secret/PII protection;
- approval gates;
- auditability.

Вопросы:

- Может ли LLM обойти policy?
- Где hard-deny?
- Какие imported capabilities считаются untrusted?
- Как предотвращается unsafe side effect?
- Что видит external/A2A agent?

---

### 3.5 Product / UX

Фокус:

- понятность идеи;
- полезность первого сценария;
- Time to Hello World;
- single facade experience;
- explanations;
- dry-run UX.

Вопросы:

- Понятно ли за 5 минут, зачем нужен Wolf?
- Что пользователь получает в первый день?
- Не слишком ли много терминов?
- Как выглядит “один решатель” в OpenCode?

---

### 3.6 Integration Expert

Фокус:

- OpenCode;
- VSCode;
- OpenClaw;
- MCP;
- plugins/hooks;
- adapters;
- external skills/tools.

Вопросы:

- Как Wolf становится primary facade в OpenCode?
- Где MCP server, а где MCP client?
- Как импортируются external skills?
- Как оборачиваются external MCP tools?
- Что делает adapter, а что core?

---

### 3.7 Domain Expert

Фокус:

- применимость вне разработки;
- domain packs;
- artifacts;
- domain-specific policies;
- constraints;
- workflows.

Вопросы:

- Как это работает для office/legal/concierge/research?
- Какие артефакты являются ценностью?
- Какие действия опасны?
- Какие gates нужны?
- Какие tools нужны?

---

## 4. Методика анализа функциональных групп

Каждая функциональная группа оформляется через Subsystem Card.

### 4.1 Шаблон Subsystem Card

```text
Название:

Назначение:
  Что делает группа.

Пользовательская ценность:
  Что получает пользователь.

Runtime-ценность:
  Что получает система.

Входы:
  Какие данные принимает.

Выходы:
  Что возвращает.

Конфигурация:
  Какие yaml/md/json элементы нужны.

Кодовые компоненты:
  Какие runtime classes/modules нужны.

State / Events:
  Что сохраняется.

Зависимости:
  От каких групп зависит.

Что deterministic:
  Что исполняется без LLM.

Где допускается LLM:
  Где LLM может помогать.

Failure modes:
  Как может ошибиться.

Security risks:
  Какие риски безопасности.

Performance risks:
  Какие риски latency/cost.

MVP-вариант:
  Минимальная полезная реализация.

Out of scope:
  Что точно не входит.

Complexity score:
  Оценка сложности.

Acceptance example:
  Маленький пример успешного поведения.
```

---

### 4.2 Шкала сложности

Оцениваем по 6 осям от 1 до 5:

```text
Implementation complexity
Config complexity
Runtime risk
Security risk
Latency/cost risk
Debugging complexity
```

Итог:

```text
6–12   → safe MVP
13–20  → split or simplify
21–30  → defer / research / plugin-only
```

---

### 4.3 Обязательные проверки для каждой группы

#### Anti-overkill review

```text
Можно ли это заменить конфигом?
Можно ли это заменить одним workflow?
Можно ли это сделать позже как plugin?
Нужно ли это для first useful scenario?
Создаёт ли это новый DSL?
Нужно ли это пользователю в первый день?
Можно ли это объяснить в 2 предложениях?
```

#### Failure-mode review

```text
Что будет, если группа ошибётся?
Как обнаружить ошибку?
Как остановить выполнение?
Как объяснить пользователю?
Как откатить?
Как записать в trace?
```

#### OpenCode reality check

```text
Как это используется в OpenCode-сессии?
Нужно ли OpenCode знать об этом слое?
Это plugin?
Это hook?
Это MCP tool?
Это internal Wolf runtime?
Вызывает ли это wolf_solve?
```

---

## 5. Функциональные группы для разбора

### Группа 1. Wolf Facade / Solve

Вопросы:

- Что технически значит “общаться с Mr. Wolf”?
- Что делает `wolf solve`?
- Какие режимы solve существуют?
- Когда solve не запускает workflow?
- Как работает dry-run?
- Как Wolf объясняет выбор?

---

### Группа 2. Scenario Router

Вопросы:

- Как выбирается scenario?
- Как считается confidence?
- Что делать при ambiguity?
- Какие alternatives показывать?
- Какие сигналы используются?

---

### Группа 3. Runtime Assembler

Вопросы:

- Что такое CaseRuntime?
- Какие поля обязательны?
- Когда нужен approval плана?
- Как выбираются workflow/agent/skill/tool/model/policy?

---

### Группа 4. Policy / Deterministic Safety Core

Вопросы:

- Что hard-deny?
- Что project policy?
- Что domain policy?
- Как решаются конфликты?
- Где LLM запрещён?

---

### Группа 5. Capability Registry

Вопросы:

- Что такое capability?
- Какие типы capability есть?
- Как регистрируются native и imported capabilities?
- Как считается trust/risk?
- Как работает selective loading?

---

### Группа 6. Skills

Вопросы:

- Что такое skill?
- Чем skill отличается от tool/workflow/agent?
- Какие бывают native/imported skills?
- Как импортируются external prompt commands?

---

### Группа 7. Tools / MCP Tools

Вопросы:

- Какие tools native?
- Какие imported?
- Как tool проходит policy?
- Как tool связан с wrapper?
- Как подключаются MCP tools?

---

### Группа 8. Wrappers

Вопросы:

- Что wrapper нормализует?
- Где input/output mapping?
- Как добавляется risk/policy?
- Где граница между wrapper и workflow?

---

### Группа 9. Adapters / OpenCode / IDE

Вопросы:

- Как Wolf становится primary facade в OpenCode?
- Что делает OpenCode plugin?
- Что делает MCP server?
- Что делает hook?
- Что делает adapter?

---

### Группа 10. Agents / AgentEndpoint / A2A

Вопросы:

- Что такое local agent?
- Что такое remote A2A agent?
- Что такое human expert endpoint?
- Как workflow вызывает AgentEndpoint?

---

### Группа 11. Model Router

Вопросы:

- Кто выбирает route?
- Где expensive/cheap model decision?
- Есть ли budget?
- Где fallback?

---

### Группа 12. Context

Вопросы:

- Когда строить context?
- Какие context profiles?
- Как избежать context explosion?
- Как context связан с memory?

---

### Группа 13. Memory

Вопросы:

- Что пишется автоматически?
- Что требует approval?
- Что влияет на runtime?
- Что только context?
- Как проверяется устаревание?

---

### Группа 14. Artifacts

Вопросы:

- Что является artifact?
- Как artifact связан с workflow?
- Где schemas/templates?
- Как artifact проходит lifecycle?

---

### Группа 15. Plugins / Hooks

Вопросы:

- Какие hook points есть?
- Что plugin может расширять?
- Какие permissions у plugin?
- Как plugin не обходит policy?

---

### Группа 16. State / Events / Trace

Вопросы:

- Какие события обязательны?
- Как строится user summary?
- Как debug trace отличается от audit log?
- Как реализовать why-not?

---
