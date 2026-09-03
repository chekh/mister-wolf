# X1 сырьё: A/B variant-wolf vs variant-baseline (этап 3, 2026-09-03)

## Конфигурация прогонов (зафиксирована)

| | variant-wolf | variant-baseline |
|---|---|---|
| cwd | `/Users/chekh/Development/mister-wolf/playground` (текущий, после init этапа 1) | `/tmp/wolf-x1-baseline` (fresh `git archive main` + reset-фильтр: `rm -rf .opencode AGENTS.md opencode.json .opencode.json .wolf docs/site/public playground-lab .external-research` + копия README playground — единственная кодовая дельта playground, SECURITY-строка T2) |
| проектный слой | wolf init: 6 агентов, 13 скиллов, 2 плагина, AGENTS.md-протокол, `.wolf` (6 playbook'ов), opencode.json (mcp.wolf, subagent_depth=2) | отсутствует |
| агент | `--agent worker-implementer` (напрямую, БЕЗ трёхуровневой схемы — по брифу: измеряем набор волчьих агентов+память, не иерархию) | агент по умолчанию (`build`), флаг `--agent` не передаётся |
| модель (общая) | `zai-coding-plan/glm-5.2` (pinned флагом `--model` в ОБОИХ вариантах) | та же |
| общая среда | opencode CLI headless `--format json`, глобальный пользовательский конфиг машины (Zorg AGENTS.md, глобальные скиллы, глобальные MCP — см. F20 в findings.md) | та же |
| задача | дословно из `x1-prompt.txt`: «В README.md нет ссылки на LICENSE — добавь ссылку в подходящий раздел» (передача `"$(cat x1-prompt.txt)"`, урок T2 по квотингу) | та же |
| порядок | интерливинг W1,B1,W2,B2,W3,B3 (нивелирует прогрев провайдерского кеша) | — |
| свежесть между прогонами | `git -C playground checkout -- README.md` (проверка status: кроме `?? dist` — чисто; HEAD не смещался ни разу) | полный re-extract из `git archive main` + фильтр + README |

Команда-шаблон (wolf; для baseline без `--agent`, cwd=/tmp):

```bash
opencode run --model zai-coding-plan/glm-5.2 --agent worker-implementer --format json "$(cat <x1>/x1-prompt.txt)" > <x1>/wolf-N.json 2> <x1>/wolf-N.stderr.log
```

## Идентичность кодовой базы

`diff -r /tmp/wolf-x1-baseline playground` (excl: .git, .wolf, .opencode, AGENTS.md, opencode.json, dist, README-PLAYGROUND.md):

- исходный код (src/templates/tests/tools/docs продукта) — идентичен;
- остаточные дельты: `docs/plans/2026-09-03-analytics-metrics-dashboard.md` (только в baseline) и незначительный дрейф `docs/superpowers/specs/2026-09-03-analytics-metrics-dashboard-design.md` — docs-файлы, добавленные в main ПОСЛЕ снапшота b593fe9; `README-PLAYGROUND.md` — лаб-маркер, tracked в playground git, в main отсутствует. На задачу README не влияют.

## Источник метрик

- stdout JSONL (`--format json`): события step_start/tool_use/text; оттуда — sessionID и число/имена tool-вызовов. Токенов в stdout НЕТ.
- SQLite opencode `~/.local/share/opencode/opencode.db`, таблица `session`: `tokens_input`, `tokens_cache_read`, `tokens_cache_write`, `tokens_reasoning`, `tokens_output`; дочерние сессии — по `parent_id` (в каждом прогоне сессий ровно 1, дочерних нет).
- Формула (бриф): **вес = input + 0.1×cache_read + 5×output**. `cache_write = 0` во всех 6 прогонах; `reasoning` в формулу не входит — приведён справочно.
- Время: wall — обёртка `date +%s` вокруг CLI; db_span — `time_updated − time_created` (cross-check, расходится с wall на запуск CLI, ±2–9s).
- Токен-статистика ДОСТУПНА → резерв брифа «нет токен-статистики headless» не активирован (номер F20 в итоге отдан находке контаминации baseline, см. findings.md).

## Прогоны

| Прогон | sessionID | сессий | input | cache_read | cache_write | reasoning | output | вес | tool | wall | db_span |
|---|---|---|---|---|---|---|---|---|---|---|---|
| wolf-1 | ses_f9724e646ffeHqmJMPPyU30z1c | 1 | 29564 | 102272 | 0 | 569 | 465 | **42116** | 5 | 67s | 58s |
| wolf-2 | ses_f97215a3cffeLEHD… | 1 | 27990 | 105344 | 0 | 748 | 552 | **41284** | 6 | 67s | 62s |
| wolf-3 | ses_f971f9d99ffemEac… | 1 | 11518 | 122944 | 0 | 879 | 474 | **26182** | 5 | 64s | 60s |
| baseline-1 | ses_f972336eeffejqwqBSPTgGB5T0 | 1 | 23281 | 65088 | 0 | 318 | 223 | **30905** | 5 | 38s | 36s |
| baseline-2 | ses_f97203944ffe2Go5… | 1 | 16916 | 72320 | 0 | 217 | 162 | **24958** | 4 | 33s | 29s |
| baseline-3 | ses_f971e8be0ffe3rQ6… | 1 | 4330 | 108288 | 0 | 256 | 188 | **16099** | 5 | 35s | 32s |

Все прогоны: exit=0, stderr пуст, правка README выполнена — подтверждено трейсом `edit` c LICENSE (все 6) и прямым grep файла до сброса (wolf-1, baseline-1, baseline-3): `- [License](LICENSE) — MIT`, строка 197, раздел Documentation; diff против HEAD — ровно 1 добавленная строка (baseline-3). Коммитов площадки сессиями не было.

### Трейсы tool-вызовов

- wolf-1: read, bash, read, edit, bash
- wolf-2: read, glob, read, grep, edit, grep
- wolf-3: read, bash, read, edit, bash
- baseline-1: read, bash, grep, bash, edit
- baseline-2: read, bash, bash, edit
- baseline-3: read, glob, grep, read, edit

mr-wolf_* (MCP память/скиллы) — **0 вызовов в обоих вариантах**; тулы wolf-плагинов не наблюдаются. Оба варианта решили задачу core-тулами (read/glob/grep/bash/edit).

### Медианы (N=3) и дельта

| Метрика | wolf (медиана) | baseline (медиана) | Δ | Δ% |
|---|---|---|---|---|
| весовые токены | 41284 | 24958 | +16326 | **+65.4%** |
| input | 27990 | 16916 | +11074 | +65.5% |
| cache_read | 105344 | 72320 | +33024 | +45.7% |
| output | 474 | 188 | +286 | +152.1% |
| reasoning (справочно) | 748 | 256 | +492 | +192% |
| tool-вызовы | 5 | 5 | 0 | 0% |
| wall | 67s | 35s | +32s | +91.4% |

Суммы за 3 прогона: вес wolf 109582 vs baseline 71962 (×1.52); wall 198s vs 106s (×1.87).

## Наблюдения

1. **Прогрев провайдерского кеша:** в обоих вариантах input монотонно падает (wolf 29564→27990→11518; baseline 23281→16916→4330), cache_read растёт — системный промпт кешируется провайдером между сессиями. Интерливинг распределяет эффект симметрично; при N=3 медианы устойчивы к порядку качественно (все 3 wolf-прогона дороже всех... нет: wolf-3 (26182) дешевле baseline-1 (30905) — диапазоны пересекаются, но медианы разделяются уверенно).
2. **Контаминация baseline:** после прогона в `/tmp/wolf-x1-baseline` обнаружен `.wolf/cache` — глобальный wolf MCP (пользовательский конфиг opencode) auto-создаёт его в любом cwd. Поведенческого влияния нет (0 mr-wolf_* вызовов), инфра-находка → F20.
3. **Природа overhead wolf:** системный промпт тяжелее (определение worker-implementer + протокол AGENTS.md + список скиллов) → input/cache_read выше; output выше из-за многословности воркера (контракт результата). Память задачей не запрашивалась — окупиться нечему.
4. Baseline-сессии не имели .git в cwd — коммитить не могли; wolf мог, но не коммитил (в его промпт-задаче про это нет). Асимметрия среды (наличие .git/dist в playground) — конфигурационное различие по брифу (wolf = текущий playground), на метрики токенов не влияет, время git-операций не задействовано.

## Вердикт X1 (строго по цифрам)

На микро-задаче «добавь ссылку в README» wolf-вариант дороже baseline по всем токен-компонентам и времени при равном качестве (6/6 эквивалентная правка) и равном числе tool-вызовов (5=5). Гипотеза карточки X1 «Wolf дорожит итерации/токены» на классе микрозадач **опровергнута**. Память в обеих сторонах не задействована (0 mr-wolf_* вызовов) — измерить пользу памяти этот сценарий не мог by design; комплементарная проверка — X2 (память vs пустая на памяти-критичной задаче).
