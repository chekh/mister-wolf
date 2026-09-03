# EXP-20260903-first-cycle: init + T1 на pristine

- Статус: concluded (этапы 1–3 завершены 2026-09-03: init+T1 ✅ → T2 ✅ → X1 ✅)
- Дата: 2026-09-03
- Гипотеза: `wolf init` на pristine-площадке (playground/, снапшот main) даёт полный корректный набор с первого раза: 6 агентов/13 скиллов/3 команд/2 плагинов, 6 playbook'ов active, штампы, opencode.json с subagent_depth=2, 0 doc-файлов в памяти, идемпотентность. Охватывает регрессии F4/F5/F6/F7/F8/F15.

## Сетап

| Вариант | Агенты/конфигурация | Отличие от базового |
|---|---|---|
| variant-wolf | base-set Wolf (`wolf init --model zai-coding-plan/glm-5.2`) | + |

Pristine playground (снапшот main, 1 коммит `b593fe9`, память пустая, `.wolf` отсутствовал). CLI из локального билда main-репо (`node dist/bootstrap/cli.js`, дист свежий, пересборка не выполнялась). Все wolf-команды — cwd=playground.

## Метод измерения

Чек-лист сценария 1 (7 пунктов: агенты/скиллы/команды/плагины/playbook'и/штампы/opencode.json) + T1 (`subagent_depth` в opencode.json) + M2 (0 doc-файлов в `.wolf/memory`) + идемпотентность (повторный init: 0 created, счётчик файлов памяти неизменен). Каждый пункт → команда → факт → PASS/FAIL. Пречек: init без `--model` в не-TTY → exit 1 + подсказка.

## Сценарии

- `playground-lab/registry/scenarios.md` — Сценарий 1 (главный), T1, M2.

## Ожидаемое поведение

Из гипотезы: пречек даёт exit 1 с подсказкой про `--model` (без стека); init создаёт 6 агентов, 13 скиллов (с именами в логе, F5), 3 команды, 2 плагина, 24+ штампа `wolf:rendered`, opencode.json с mcp.wolf + subagent_depth=2 (F4/F7/F15), без misleading-сообщений (F6); `list --type playbook` → 6 active/accepted; в памяти 0 doc-файлов (F8), только seeded-набор; повторный init — 0 created, файлы памяти неизменны.

## Протокол

### Шаг 1. Пречек (init без --model, не-TTY)
- Вывод: `Error: non-interactive init requires a model; re-run: wolf init --model <providerID/modelID> [--platform <ids>]`, exit 1. Чистая подсказка, стек-трейса нет. PASS.

### Шаг 2. Основной init (`--model zai-coding-plan/glm-5.2`)
- exit 0. Создано: 6 агентов, 13 скиллов, 3 команды, 2 плагина, AGENTS.md, opencode.json, init-report в память.
- F5 (имена скиллов): ДА — каждая строка вида `[skill] wolf-plan → .opencode/skills/wolf-plan/SKILL.md`. PASS.
- F6 (misleading): НЕТ. Строк «platform configs: skipped» нет; «restart opencode — to pick up the MCP server and the default Mr.Wolf agent» печатается ПОСЛЕ `opencode.json: written` — соответствует действительности. PASS.
- F7 (упоминание opencode.json/MCP): ДА — `- opencode.json: written (mcp.wolf, default_agent=mr-wolf, subagent_depth=2)`. PASS.

### Шаг 3. Чек-лист сценария 1
| # | Проверка | Команда | Факт | Вердикт |
|---|---|---|---|---|
| 1 | Агенты | `ls .opencode/agents \| wc -l` | 6 | PASS |
| 2 | Скиллы | `ls .opencode/skills \| wc -l` | 13 | PASS |
| 3 | Команды | `ls .opencode/command \| wc -l` | 3 | PASS |
| 4 | Плагины | `ls .opencode/plugins \| wc -l` | 2 | PASS |
| 5 | Playbook'и | `wolf list --type playbook` | 6, все `[active]`; `review_state: accepted` у всех 6 в файлах памяти (вывод list поле не показывает — проверено grep по `.wolf/memory`) | PASS |
| 6 | Штампы | `grep -r "wolf:rendered" .opencode/ \| wc -l` | 24 | PASS |
| 7 | opencode.json | `cat opencode.json` | создан init'ом: mcp.wolf (local, enabled), default_agent=mr-wolf, subagent_depth=2 | PASS |

### Шаг 4. T1 (регрессия F15)
- `grep subagent_depth opencode.json` → `"subagent_depth": 2`. PASS.

### Шаг 5. M2 (регрессия F8)
- `ls .wolf/memory/*doc*` → 0 (zsh: no matches found). PASS.
- Всего файлов: 9. Верхний уровень: `briefs/`, `events.jsonl`, `shared/`, `threads/`. Состав: 6 playbook'ов + 1 rule (routing agent models) + init-report (tasks) + events.jsonl. `review_state: accepted` у 8 объектов (6 playbook'ов + init-report + rule).

### Шаг 6. Идемпотентность
- Повторный init: exit 0, все артефакты `skipped — content identical` / `unchanged` / `already exists — not duplicating`; строк «created» — 0. Файлов памяти: 9 до → 9 после. PASS.
- Наблюдение (не отклонение): во втором прогоне «Next steps» короче — пункт «restart opencode» опущен, т.к. конфиг не менялся.

### Шаг 7. Коммит в git площадки
- `git add -A` + commit → `4e19f43`, log: 2 коммита, status чист.
- ОТКЛОНЕНИЕ: `.wolf/*` и `opencode.json` игнорируются унаследованным `.gitignore` (строки 3 и 15) → в коммит попали только `.opencode/*` + AGENTS.md (25 файлов). → F18.

### Этап 2. T2 — живой спавн (трёхуровневая схема)

- **Сетап:** каталог `measurements/2026-09-03-first-cycle` создан; линк `playground/dist -> ../dist` создан (не существовал) — сетап-шаг конвенции RT2, не починка.
- **Команда:** `opencode run --agent mr-wolf --model zai-coding-plan/glm-5.2 --format json "<промпт из карты>"` (cwd=playground). Попытка 1 с инлайновым промптом упала до запуска — `zsh: unmatched '` (shell-квотинг), ноль событий; повтор через файл промпта `t2-prompt.txt` (правило повтора: конфигурационная причина).
- **Результат:** EXIT=0, 498s. Транскрипт: raw 50739 байт / 22 строки (JSONL, только корневая сессия mr-wolf), stderr пуст. Полный разбор — `measurements/2026-09-03-first-cycle/t2-transcript.md` (с приложенным raw).
- **Чек-лист T2:** авторство событий субсессий в raw не наблюдаемо (headless пишет только корневую сессию) — c/f на косвенных свидетельствах (task_result lead'а + git diff).

| # | Проверка | Вердикт | Цитата-основание |
|---|---|---|---|
| a | mr-wolf не редактировал сам | PASS | tool_use корневой сессии: `skill`, `glob`×2, `mr-wolf_brief`, `task`, `mr-wolf_list`, `mr-wolf_add` — edit/write/bash нет |
| b | спавн executor-lead | PASS | `"tool":"task"`, `subagent_type: "executor-lead"`, sub-сессия `ses_f97398b3dffehx5CgrPDXzpty2` ≠ корневая |
| c | lead → worker-implementer + reviewer, отчёт через lead | PASS (косвенно) | task_result lead'а: «Свежий worker-implementer на исполнение… Ревью стадия 1 ✅ … стадия 2 ✅ … Итог ревьюера: ACCEPT» |
| d | README.md изменён | PASS | diff: `+- [Security policy](SECURITY.md) — supported versions, vulnerability reporting` (строка 196, `## Documentation`; 1 файл, 1 insertion) |
| e | финальный статус с основаниями | PASS | text-part mr-wolf: «# Отчёт координатора: **ACCEPTED** ✅ … Критерии: 4/4» (таблица AC1–AC4) |
| f | ревью не-self | PASS (косвенно) | роли разделены: «worker-implementer — исполнение, worker-reviewer — двухстадийное ревью»; «подтверждено ревьюером стадии 2» |

- **README площадки:** изменён внутренней сессией, коммита inner-сессия не делала (в брифе: «НЕ коммитить»); закоммичено этапом: `git -C playground add README.md` (только README — dist-симлинк untracked `?? dist`, не ignored, в коммит не берём; наблюдение, не находка).
- **Находки этапа:** отклонений нет (6/6 PASS). Зарезервированная F19 (headless не поддерживает спавн) НЕ воспроизвелась — task-вызов с subagent_type отработал в `opencode run` при subagent_depth=2; F19 не активируется, новые F не заводились.
- Побочное: Mr.Wolf внутри live-сессии использовал MCP-тулы (`mr-wolf_brief/list/add`), приёмочный след — `mem_20260903_acceptance_readme_md_ssylka_na_security_1bffdf`; FRICTION lead'а — rtk-обёртка grep исказила вывод (единично, перезапуск через bash).

### Этап 3. X1 — A/B variant-wolf vs variant-baseline

- **Конфигурация (зафиксирована по карточке X1 + брифу диспетчера):** сравнивается проектный слой wolf против голого opencode default. WOLF = текущий `playground/` (wolf init этапа 1: 6 агентов / 13 скиллов / 2 плагина / AGENTS.md-протокол / `.wolf`-память / проектный mcp.wolf), запуск `--agent worker-implementer` **напрямую** — БЕЗ трёхуровневой схемы (по брифу: измеряем набор волчьих агентов+память, не иерархию). BASELINE = `/tmp/wolf-x1-baseline` (fresh `git archive main` + reset-фильтр + копия README playground), агент по умолчанию `build` (без `--agent`). Общее: модель `zai-coding-plan/glm-5.2` pinned в обоих, headless `--format json`, задача дословно из `measurements/.../x1/x1-prompt.txt`, порядок — интерливинг W1,B1,W2,B2,W3,B3, между прогонами — свежесть (wolf: `git checkout -- README.md`, HEAD не смещался; baseline: полный re-extract).
- **Идентичность:** `diff -r` за вычетом артефактов — исходный код идентичен; остаточные дельты: 2 docs-файла analytics-планов (дрейф main после снапшота b593fe9) + лаб-маркер README-PLAYGROUND.md; на задачу не влияют.
- **Метрики:** токены из SQLite opencode (`session.tokens_*`, дочерних сессий нет — 1 сессия/прогон; в stdout JSONL токенов нет, оттуда — sessionID и tool-вызовы). Вес = input + 0.1×cache_read + 5×output; cache_write=0 всюду; reasoning — справочно. Время: wall + db_span (cross-check). Токен-статистика доступна → резерв «нет статистики headless» не активирован.

| Прогон | input | cache_read | reasoning | output | вес | tool | wall |
|---|---|---|---|---|---|---|---|
| wolf-1 | 29564 | 102272 | 569 | 465 | **42116** | 5 | 67s |
| wolf-2 | 27990 | 105344 | 748 | 552 | **41284** | 6 | 67s |
| wolf-3 | 11518 | 122944 | 879 | 474 | **26182** | 5 | 64s |
| baseline-1 | 23281 | 65088 | 318 | 223 | **30905** | 5 | 38s |
| baseline-2 | 16916 | 72320 | 217 | 162 | **24958** | 4 | 33s |
| baseline-3 | 4330 | 108288 | 256 | 188 | **16099** | 5 | 35s |

| Медианы (N=3) | wolf | baseline | Δ | Δ% |
|---|---|---|---|---|
| весовые токены | 41284 | 24958 | +16326 | **+65.4%** |
| input | 27990 | 16916 | +11074 | +65.5% |
| cache_read | 105344 | 72320 | +33024 | +45.7% |
| output | 474 | 188 | +286 | +152.1% |
| tool-вызовы | 5 | 5 | 0 | 0% |
| wall | 67s | 35s | +32s | +91.4% |

- **Качество:** 6/6 эквивалентная правка (`- [License](LICENSE) — MIT` в раздел Documentation). **Поведение:** mr-wolf_* тулов 0 вызовов в ОБОИХ вариантах — память задачей не задействована; обе стороны решили core-тулами (read/glob/grep/bash/edit).
- **Наблюдение:** input монотонно падает / cache_read растёт от прогона к прогону в обоих вариантах (прогрев провайдерского кеша); интерливинг распределяет эффект симметрично.
- **Вердикт X1 (по цифрам, без интерпретаций сверх данных):** на микро-задаче wolf дороже baseline по всем компонентам — медианный вес +65.4%, время +91.4% — при равных tool-вызовах (5=5) и равном качестве (6/6). Гипотеза «Wolf дорожит итерации/токены» на классе микрозадач **опровергнута**. Польза памяти этим сценарием не измерялась (память не запрашивалась) → комплементарная проверка X2.
- Сырьё: `measurements/2026-09-03-first-cycle/x1/` — x1-prompt.txt, {wolf,baseline}-N{1,2,3}.json (JSONL, 39–47KB), x1-runs.md (полная сводка, трейсы тулов, наблюдения).

## Находки

- F18 (INFRA, сетап полигона, open): pristine-снапшот унаследовал `.gitignore` main — артефакты init (`.wolf/`, `opencode.json`) не версионируются git'ом площадки; память нельзя откатывать/сравнивать через git между этапами. Решение за владельцем.
- F20 (INFRA/методика A/B, documented): глобальный wolf MCP (пользовательский конфиг opencode машины) auto-создаёт `.wolf/cache` в любом cwd сессии — baseline-каталог `/tmp/wolf-x1-baseline` оброс волчьим артефактом вопреки reset-фильтру. Поведенческого влияния в X1 не выявлено (0 mr-wolf_* вызовов у обеих сторон), но строго «голый baseline» на этой машине достижим только изоляцией профиля (HOME/OPENCODE_CONFIG) — учесть в X2+.

## Вердикт

Окончательный (этап 3/3, concluded, 2026-09-03). Этап 1: 7/7 PASS чек-листа, T1/M2/идемпотентность PASS, регрессии F4/F5/F6/F7/F8/F15 не воспроизвелись; отклонение — F18 (сетап полигона). Этап 2: T2 живой спавн — 6/6 PASS, трёхуровневая схема L0→L1→L2 работает в headless (резерв F19 не воспроизвёлся). Этап 3: X1 A/B — 6/6 прогонов, wolf дороже baseline на микро-задаче (+65.4% медианных весовых токенов, +91.4% времени, tool-вызовы равны 5=5, качество равное 6/6, память не задействована ни одной стороной); гипотеза экономии Wolf на микрозадачах опровергнута, польза памяти вне области измерения X1 → сценарий X2. Новая находка этапа 3: F20 (контаминация baseline глобальным wolf MCP, влияние на поведение не выявлено).
