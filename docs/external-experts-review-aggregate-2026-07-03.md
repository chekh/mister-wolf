# Сводный отчет внешней экспертизы: Mr. Wolf (глубинный фактчек)

**Дата агрегации:** 2026-07-03  
**Источники:** `.external_experts_review/` — отзывы от DeepSeek, Gemini, Kimi, OpenAI, Qwen, Zai.  
**Статистика по источникам:** 3 файла пусты (DeepSeek, Gemini, Kimi), 3 содержат полноценный анализ (OpenAI, Qwen, Zai).  
**Проверенная кодовая база:** `main`, commit `ff86ff1` (последний на момент проверки).  
**Результат `npm run test:run`:** 45 файлов, 123 теста — pass.  
**Результат `npm run check`:** FAIL на этапе `tsc --noEmit` (`src/adapters/mcp/mcp-tools.ts`).

---

## 1. Исправленное резюме

Эксперты правы в главном: **Mr. Wolf занял правильную нишу** local-first project memory substrate для AI-кодеров, и архитектурные решения сильны. Однако ряд их конкретных утверждений **устарел или неверен** относительно текущего `main`. Более того, в проекте есть **критическая техническая регрессия**, которую эксперты не заметили: `npm run check` не проходит из-за несовместимости MCP SDK и Zod-схем.

**Главные находки второго уровня:**

1. `AGENTS.md` и `README.md` актуальны и согласованы; устаревшими являются `docs/superpowers/plans/roadmap.md`, `MEMORY.md` (раздел 3.3) и `docs/user-guide.md`.
2. OpenAI ошибочно утверждает, что в `src/` остались каталоги `agent`, `workflow`, `model`, `policy`, `tool`, `kernel`, `state`. Их там нет.
3. OpenAI ошибочно называет `AGENTS.md` отстающим документом. На самом деле он самый свежий (сгенерирован 2026-07-03).
4. `wolf scan` **уже регистрирует** документы как `document` (`src/app/use-cases/scan-project.ts:67-124`). `MEMORY.md` врет об обратном.
5. `npm run check` падает с 15 ошибками TypeScript в `src/adapters/mcp/mcp-tools.ts`. MCP-интеграция работает в runtime (тесты проходят), но не компилируется строго.
6. Два roadmap-файла (`roadmap.md` и `roadmap-v2.md`) дезориентируют: `roadmap-v2.md` предлагает Phase 6–14, но Phase 6, 7 и 12 уже реализованы в коде.

---

## 2. Методология фактчека

Каждое конкретное утверждение экспертов проверялось по следующим источникам:

- исходный код в `src/`;
- `package.json`, `tsconfig.json`;
- `README.md`, `AGENTS.md`, `MEMORY.md`, `docs/user-guide.md`, `docs/superpowers/plans/roadmap.md`, `docs/superpowers/plans/roadmap-v2.md`;
- история git (`git log --oneline --all`);
- запуск `npm run test:run` и `npm run check`;
- glob-поиск по структуре проекта.

В отчете используется маркировка:

- **✅ Подтверждено** — факт соответствует кодовой базе.
- **⚠️ Частично верно** — утверждение устарело или верно с оговорками.
- **❌ Не подтверждено** — факт не соответствует текущей кодовой базе.
- **🔴 Новая находка** — проблема, не упомянутая экспертами.

---

## 3. Фактчек по ключевым утверждениям

### 3.1. Состояние фаз

| Утверждение                                                               | Источник      | Статус             | Пояснение                                                                                                                                                    |
| ------------------------------------------------------------------------- | ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| «README говорит, что Phase 5 завершена и следующая Phase 6 — Governance»  | OpenAI        | ⚠️ Частично верно  | `README.md:15-17` говорит, что завершены фазы 0–7, следующая — Phase 8. OpenAI смотрел старую версию или `roadmap.md`.                                       |
| «AGENTS.md говорит, что completed phases — 0–4, а next phase — Phase 5»   | OpenAI        | ❌ Не подтверждено | `AGENTS.md:39-50` явно перечисляет завершенные фазы 0–7 и Phase 8 как следующую.                                                                             |
| «MEMORY.md говорит, что scan еще не регистрирует documents автоматически» | OpenAI        | ⚠️ Устарело        | `MEMORY.md:66-69` действительно так говорит, но `src/app/use-cases/scan-project.ts:67-124` доказывает обратное. Это документационный долг, а не технический. |
| «roadmap-v2 superseds roadmap.md»                                         | roadmap-v2.md | ✅ Подтверждено    | `docs/superpowers/plans/roadmap-v2.md:5-6` явно это заявляет.                                                                                                |
| «Phase 6 Governance, Phase 7 MCP, Phase 12 Session Wrap-Up запланированы» | roadmap-v2.md | ⚠️ Устарело        | Все три фазы уже реализованы в `main` (см. `README.md`, `AGENTS.md`, `git log`).                                                                             |

**Вывод:** проблема не в том, что документация «разъехалась», а в том, что **часть документов не удалена/обновлена после завершения фаз**. `README.md` и `AGENTS.md` — источники правды о текущем состоянии; `roadmap.md` и `MEMORY.md` — отстают.

### 3.2. Архитектура и старые модули

| Утверждение                                                                                 | Источник | Статус             | Пояснение                                                                                                                                                          |
| ------------------------------------------------------------------------------------------- | -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| «В src tree есть старые каталоги вроде agent, workflow, model, policy, tool, kernel, state» | OpenAI   | ❌ Не подтверждено | `glob src/**/{agent,workflow,model,policy,tool,kernel,state}/**` возвращает 0 файлов. Структура `src/` чистая: `domain/`, `app/use-cases/`, `ports/`, `adapters/`. |
| «Hexagonal Architecture — эталонное разделение»                                             | Qwen     | ✅ Подтверждено    | `src/domain/` не импортирует ничего; `app/use-cases/` импортирует `domain` и `ports`; `adapters/` импортируют `ports`. См. `AGENTS.md:32-37`.                      |
| «Таксономия из 14 типов»                                                                    | Qwen/Zai | ✅ Подтверждено    | `src/domain/memory-types.ts:1-15` перечисляет 14 типов. Это много.                                                                                                 |
| «SQLite FTS5 используется для поиска»                                                       | Qwen/Zai | ✅ Подтверждено    | `src/adapters/sqlite/sqlite-search-index.ts`, `src/adapters/sqlite/sqlite-schema.ts`.                                                                              |
| «Markdown + JSONL + SQLite»                                                                 | Qwen     | ✅ Подтверждено    | `MEMORY.md:7-8`, `src/adapters/fs/markdown-memory-store.ts`, `src/adapters/fs/jsonl-event-log.ts`.                                                                 |

### 3.3. MCP и интерфейсы

| Утверждение                                                              | Источник      | Статус            | Пояснение                                                                                                                                            |
| ------------------------------------------------------------------------ | ------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| «MCP есть в коде, но не стал продуктовым интерфейсом»                    | OpenAI        | ✅ Подтверждено   | `wolf mcp` есть (`src/adapters/cli/commands/memory-mcp.ts`), но в `README.md` он скрыт в разделе Commands, а не выделен как primary agent interface. |
| «MCP tool names должны быть плоскими»                                    | roadmap-v2.md | ✅ Уже сделано    | `src/adapters/mcp/mcp-tools.ts:39-304` использует `search`, `add`, `create_thread` и т.д. — уже без `memory_` префикса.                              |
| «MCP server должен быть простым: search_memory, add_memory, get_context» | Qwen          | ⚠️ Частично верно | Сейчас 15 tools + ping. Surface широкий, но имена уже плоские.                                                                                       |
| «Нужен интеграционный тест полного цикла через MCP»                      | Zai           | ✅ Уже сделано    | `tests/integration/mcp-stdio.test.ts` существует и проходит.                                                                                         |

### 3.4. Качество и тесты

| Утверждение                                       | Источник                      | Статус          | Пояснение                                                                                                   |
| ------------------------------------------------- | ----------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------- |
| «`npm run check` passes, 103 tests»               | session-summary от 2026-07-02 | ❌ Устарело     | Сейчас 123 теста проходят, но `npm run check` падает на `tsc --noEmit`.                                     |
| «Активная разработка: 274 коммита за ~2.5 месяца» | Zai                           | ✅ Подтверждено | `git log --oneline --all \| wc -l` → 277.                                                                   |
| «0 звезд, 0 форков, 0 issues»                     | Zai                           | 🔴 Не проверено | `gh` недоступен в окружении, но репозиторий публичный и малозвездный. Это метрика adoption, не техническая. |

---

## 4. Скрытые проблемы, которые эксперты не заметили

### 4.1. `npm run check` не проходит 🔴

**Где:** `src/adapters/mcp/mcp-tools.ts:42-291` (15 ошибок).  
**Что:** `McpServer.registerTool` ожидает `StandardSchemaWithJSON` или `ZodRawShape`, а код передает объекты вида `{ query: z.string(), ... }`, которые не являются ни тем, ни другим. Вероятная причина: обновление `@modelcontextprotocol/server` до версии, требующей `~standard`-символ, или несоответствие между Zod v3 и ожиданиями SDK.  
**Почему важно:** эксперты хвалят качество и `npm run check`, но он сломан. Это блокер для любого CI/CD и для внешнего пользователя, который попробует `npm install && npm run check`.  
**Почему тесты проходят:** `vitest` использует `tsx`/transform, который не выполняет полную проверку типов; runtime-интеграция работает.

### 4.2. Неконсистентность между двумя roadmap-файлами 🔴

- `docs/superpowers/plans/roadmap.md` — застыла на Phase 6 Governance.
- `docs/superpowers/plans/roadmap-v2.md` — proposal от 2026-07-02, который уже частично устарел (Phase 6, 7, 12 реализованы).

Это создает путаницу даже для автора проекта.

### 4.3. `MEMORY.md` не отражает Phase 6-7 🔴

Конкретные расхождения:

- `MEMORY.md:66-69` говорит, что `scan` не регистрирует `document`. Реальность: `scan-project.ts:67-124` регистрирует.
- `MEMORY.md:78-84`, `97-98`, `126-127`, `143-149`, `152-153`, `170-171`, `177-196` используют старый синтаксис `node dist/bootstrap/cli.js ...`, тогда как весь CLI перешел на `wolf ...`.
- В `MEMORY.md` нет раздела про `rule` (Phase 6), хотя есть раздел 9 «Rules».
- В `MEMORY.md` нет упоминания `session wrap-up` авто-триггеров, кроме одной строки 108-113.

### 4.4. `docs/user-guide.md` застыл на Phase 2 🔴

`docs/user-guide.md:2` прямо заявляет: «Версия: соответствует Phase 2». Это основное руководство пользователя, и оно игнорирует Phase 3–7.

### 4.5. `rule`-объект ломает MCP memory tools 🔴

Попытка вызвать `mr-wolf_memory_*` через MCP приводит к ошибке парсинга объекта типа `rule`, потому что enum валидатора не включает `rule`:

```
Invalid enum value. Expected 'document' | 'decision' | ... | 'blocker' | 'session-checkpoint', received 'rule'.
```

Это означает, что встроенная память проекта (`.wolf/memory/objects/rules/...`) несовместима с собственным MCP-интерфейсом.

### 4.6. 14 memory types + 18 top-level CLI-команд = когнитивная перегрузка 🔴

Эксперты упоминали это поверхностно, но не количифицировали. Факты:

- 14 типов: `document`, `decision`, `lesson`, `observation`, `session-summary`, `open-question`, `context`, `work-thread`, `info-request`, `article`, `blocker`, `session-checkpoint`, `rule` (`src/domain/memory-types.ts`).
- 18 top-level команд в `src/adapters/cli/cli-entry.ts:37-55`.
- Только `work-thread` имеет 4 подкоманды (`create`, `list`, `brief`, `diff`); `info-request`, `article`, `decision`, `blocker`, `session`, `rule` — по 2-3 подкоманды.

Это подтверждает диагноз OpenAI: пользователь должен запоминать слишком много сущностей.

### 4.7. `search` возвращает минимальный контекст 🔴

`src/adapters/mcp/mcp-tools.ts:62`:

```ts
const text = results.map((r) => `${r.object.id} [${r.object.type}] ${r.object.title}`).join('\n');
```

CLI `memory-search.ts` может возвращать больше, но MCP-интерфейс дает агенту только `id [type] title`. Это усиливает аргумент OpenAI о необходимости `search --explain`.

---

## 5. Пересмотренные приоритеты

### P0 — Исправить `npm run check` (критический блокер)

**Почему P0:** любой внешний пользователь, следующий README, запустит `npm run check` и получит ошибку. Это подрывает доверие к заявлениям о качестве.  
**Что делать:**

1. В `src/adapters/mcp/mcp-schemas.ts` превратить объекты в настоящие Zod-схемы (`z.object({...})`) или добавить `~standard`-символ.
2. Адаптировать `mcp-tools.ts` под API текущей версии `@modelcontextprotocol/server`.
3. Проверить, что `npm run check` проходит.

### P1 — Документационная консолидация

**Цель:** один источник правды о фазах и командах.  
**Конкретные действия:**

1. Удалить или переименовать `docs/superpowers/plans/roadmap.md` (устарел). Сделать `roadmap-v2.md` canonical или объединить с `README.md`/`AGENTS.md`.
2. Обновить `MEMORY.md`:
   - удалить/исправить раздел 3.3 о `scan`;
   - заменить все `node dist/bootstrap/cli.js` на `wolf`;
   - добавить раздел про `rule`, `session wrap-up`, governance-атрибуты.
3. Обновить `docs/user-guide.md` до актуальных фаз 0–7.
4. Добавить явное правило: «после завершения фазы удаляйте или помечайте устаревшие roadmap-файлы».

### P2 — Высокоуровневый UX-слой: recall / solve / call

**Почему:** консенсус OpenAI + Zai. Проект перегружен CRUD-командами; нужны сценарные входы.  
**Граница:** Mr. Wolf не думает вместо агента, а достает память.  
**Минимальный scope:**

1. `wolf recall [--topic <topic>] [--format json|markdown]` — agent-ready context pack.
2. `wolf call --for <topic> [--compact]` — короткая corrective injection.
3. `wolf solve "<problem>" [--save]` — Solve Pack generator.

### P3 — Упростить MCP tool surface

**Сейчас:** 15 tools + ping.  
**Цель:** снизить до 5-7 критичных:

- `search` (с explain-опцией);
- `add`;
- `get`;
- `list`;
- `recall` (новый);
- `call` (новый);
- `solve` (новый).

Специфические команды (`create_thread`, `create_info_request` и т.д.) можно оставить, но спрятать под флаг `--advanced` или в отдельном namespace.

### P4 — Onboarding и adoption

**Zai прав:** порог входа высок.  
**Действия:**

1. Добавить в README секцию «Connect to Claude Desktop / OpenCode via MCP» с примером конфигурации.
2. Пример «Hello World»: создать тред, info-request, article, получить brief.
3. Добавить architecture diagram.
4. Рассмотреть `pkg` или `bun build --compile` для бинарников.

### P5 — Исправить валидацию типа `rule` в MCP/memory tools

**Где:** валидатор памяти/MCP не знает тип `rule`.  
**Действие:** добавить `rule` в enum типов валидатора или перейти к динамической схеме.

### P6 — Улучшить retrieval: explain и rank

**OpenAI:** `search --explain`, `recall --explain`.  
**Qwen:** гибридный FTS5 + векторы.  
**Порядок:** сначала `explain` (дешево, не требует зависимостей), потом векторы как опция.

### P7 — Capture presets

**OpenAI:** `wolf capture debug/decision/research/lesson/handoff`.  
**Почему это лучше, чем добавлять типы:** сценарная команда скрывает сложность таксономии, но внутри создает правильные объекты.

### P8 — Governance и schema-driven taxonomy

**OpenAI считает Governance преждевременным; Qwen считает правильным.**  
**Компромисс:** governance-атрибуты (`memory_class`, `truth_role`, `lifetime`) уже в коде. Нужно стабилизировать их использование, но не добавлять новые правила до P0–P4.

---

## 6. Глубокий анализ экспертных рекомендаций

### 6.1. OpenAI: «Phase 6 — Governance, но я бы назвал Phase 6: Agent UX Stabilization»

**Оценка:** частично устарело. Phase 6 Governance и Phase 7 Session Wrap-Up уже реализованы. Идея «Agent UX Stabilization» должна стать **Phase 8**, а не заменой Phase 6.  
**Суть верна:** следующий этап должен быть про UX, а не про метаданные.

### 6.2. OpenAI: три magic-команды recall / solve / call

**Оценка:** высокоприоритетная и корректная рекомендация.  
**Дополнение:** нужно связать их с существующей логикой:

- `recall` может переиспользовать `generate-agent-brief.ts` + фильтры по confidence/importance.
- `solve` может использовать `search-memory.ts` + ранжирование по `rule`/`decision`.
- `call` — новый artifact type (`call-injection`?) или формат вывода `article`.

### 6.3. Qwen: гибридный поиск и граф связей

**Оценка:** технически верно, но не первоочередно.  
**Дополнение:** перед векторами нужно:

1. Исправить `search --explain`.
2. Материализовать `relations.jsonl` в queryable graph (можно в SQLite).
3. Только потом добавлять `sqlite-vec`.

### 6.4. Qwen: Git hooks для проактивности

**Оценка:** хорошая идея, но рискует добавить шума.  
**Дополнение:** хуки должны быть opt-in, иначе каждый commit будет порождать `context`-объекты.

### 6.5. Zai: бинарники, npm publish, Hello World

**Оценка:** верно и критично для adoption.  
**Дополнение:** `package.json:6-8` уже определяет `bin.wolf = "./dist/bootstrap/cli.js"`, так что `npm install -g mr-wolf` будет работать после публикации. Нужно только опубликовать и добавить инструкцию.

### 6.6. Zai: «0 звезд, 0 форков, 0 issues»

**Оценка:** метрика вероятно верна, но не техническая проблема.  
**Дополнение:** это симптом неясного позиционирования и высокого порога входа. Решается P0–P4.

---

## 7. Рекомендуемый план PR

### PR 1: `fix: repair MCP TypeScript compilation and rule-type validation`

**Scope:**

- Исправить `src/adapters/mcp/mcp-schemas.ts` и `mcp-tools.ts` для совместимости с `@modelcontextprotocol/server`.
- Добавить `rule` в enum типов валидатора памяти (где бы он ни был — вероятно, `memory-object-schema.ts` или MCP-обертка).
- Убедиться, что `npm run check` проходит.
- Добавить тест, который запускает `tsc --noEmit` (или использовать `npm run check` в CI).

### PR 2: `docs: consolidate roadmap, MEMORY.md, user-guide`

**Scope:**

- Удалить `docs/superpowers/plans/roadmap.md` или сделать редирект на `roadmap-v2.md`.
- Обновить `roadmap-v2.md`: отметить Phase 6, 7, 12 как completed; переименовать оставшиеся фазы.
- Обновить `MEMORY.md`: scan, flat namespace, rule, session wrap-up.
- Обновить `docs/user-guide.md` до Phase 7.

### PR 3: `feat: agent UX layer — recall, solve, call`

**Scope:**

- `wolf recall` — контекст-пак для агента.
- `wolf solve "problem"` — Solve Pack generator.
- `wolf call --for topic` — compact corrective injection.
- Тесты + документация.

### PR 4: `feat: MCP first-class interface and onboarding`

**Scope:**

- README секция про MCP + пример конфигурации для OpenCode/Claude Desktop.
- Сужение tool surface (optional `--advanced`).
- `search --explain`.

### PR 5: `feat: capture presets`

**Scope:**

- `wolf capture debug/decision/research/lesson/handoff`.
- Каждая preset создает правильный набор объектов.

---

## 8. Итоговый вердикт (скорректированный)

**Mr. Wolf — это архитектурно зрелый alpha-продукт с сильной концепцией, но с двумя критическими проблемами:**

1. **Техническая регрессия:** `npm run check` не проходит. Это блокер для доверия и CI.
2. **Документационный долг:** несколько ключевых документов устарели или противоречат друг другу.

**Эксперты были правы в стратегическом диагнозе** (нужен UX-слой, lower adoption barrier, MCP first-class), **но частично ошиблись в тактических деталях** (старые каталоги, устаревшость AGENTS.md, состояние scan).

**Следующий шаг не должен быть ни Governance, ни schema-driven taxonomy.** Сначала нужно:

1. Починить сборку.
2. Выровнять документацию.
3. Добавить `recall` / `solve` / `call`.

Только после этого имеет смысл возвращаться к гибридному поиску, графу связей и расширенной governance.

---

## 9. Приложение: файлы-источники и проверки

- `.external_experts_review/openai.md` — продуктовый анализ, UX, magic-команды.
- `.external_experts_review/qwen.md` — архитектура, Write Protocol, retrieval, governance.
- `.external_experts_review/zai.md` — adoption, порог входа, сообщество, MCP.
- `README.md:15-17` — актуальные фазы 0–7.
- `AGENTS.md:39-50` — актуальные фазы 0–7, сгенерирован 2026-07-03.
- `docs/superpowers/plans/roadmap.md` — застрял на Phase 6.
- `docs/superpowers/plans/roadmap-v2.md` — proposal с частично устаревшими фазами.
- `MEMORY.md:66-69` — устаревшее утверждение о `scan`.
- `src/app/use-cases/scan-project.ts:67-124` — регистрация `document` при сканировании.
- `src/adapters/cli/cli-entry.ts:37-55` — 18 top-level команд.
- `src/domain/memory-types.ts:1-15` — 14 типов памяти.
- `src/adapters/mcp/mcp-tools.ts:39-304` — 15 MCP tools.
- `src/adapters/mcp/mcp-tools.ts:42-291` — ошибки TypeScript, `npm run check` fail.
- `npm run test:run` — 123 теста, pass.
- `npm run check` — fail на `tsc --noEmit`.
