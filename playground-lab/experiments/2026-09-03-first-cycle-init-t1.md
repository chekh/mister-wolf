# EXP-20260903-first-cycle: init + T1 на pristine

- Статус: running (этап 1 из 3: init+T1 → T2 → X1)
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

## Находки

- F18 (INFRA, сетап полигона, open): pristine-снапшот унаследовал `.gitignore` main — артефакты init (`.wolf/`, `opencode.json`) не версионируются git'ом площадки; память нельзя откатывать/сравнивать через git между этапами. Решение за владельцем.

## Вердикт

Не окончательный (этап 1 в рамках running). Этап 1 пройден: чек-лист сценария 1 — 7/7 PASS, T1 PASS, M2 PASS, идемпотентность PASS, регрессии F4/F5/F6/F7/F8/F15 не воспроизвелись. Единственное отклонение — F18 (git-игнор артефактов, сетап полигона, не дефект Wolf). Ожидает T2/X1.
