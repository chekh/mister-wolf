# Wave 2.13 Baseline — dogfood «до» (P200)

- Дата снапшота: 2026-09-29 (UTC), исполнитель — поток C (P200).
- Источник: dogfood-репо Mr.Wolf, main @ `71f711f` (post-2.12.0 + план 2.13), бинарь `dist` main = **2.12.0**.
- Назначение: опорные числа «до» для сверки «после» диеты/таксономии (P213/P230/P231); вход e2e-таблицы «все старые имена» (P222/P224).
- Машины-данные: `wave-2.13-baseline/` рядом (скрипт `snapshot.sh` воспроизводит всё, кроме живых метрик дня).
- Бриф потока C сужает P200 до dogfood; снапшот Tender — вне объёма этого потока (не снят).

## Сводка

| Метрика                        | Значение «до»                                                                                                                                                                                                                                                                                                                                                                        | Артефакт                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| Версия бинаря                  | 2.12.0                                                                                                                                                                                                                                                                                                                                                                               | `dogfood-version.txt`             |
| Реестр команд `cli-entry.ts`   | **45 команд** (+1 `help`): init sync add list get search rebuild-index supersede transition scan brief thread diff decision blocker info-request article session mcp rule relation taxonomy migrate council validate solve call insights recap think scaffold tool complain update learn effectiveness analytics dashboard task-eval memory-stage coord run bootstrap upgrade doctor | `dogfood-help.txt`                |
| `wolf --help`                  | 94 строки всего; 89 строк с отступом (команды + перенос описаний)                                                                                                                                                                                                                                                                                                                    | `dogfood-help.txt`                |
| Конфиг `.wolf/config.yaml`     | **543 строки**; `memory_types:` — строка 5 (дамп ядра таксономии присутствует)                                                                                                                                                                                                                                                                                                       | `dogfood-config-wc.txt`           |
| Объекты памяти                 | **861 md-файл** в `.wolf/memory` (862 строки TSV с заголовком)                                                                                                                                                                                                                                                                                                                       | `dogfood-ids-sha256.tsv`          |
| Счётчики по типам (top)        | document-ref 208, lesson 170, decision 119, report 81, session-summary 75, task-brief 62, rule 34, article 31, work-thread 16, blocker 14, observation 13, playbook 11, call-injection 6, council-opinion 5, context 5, open-question 3, info-request 2, council-question 2, synthesis 1, session-checkpoint 1, document-native 1, (без типа) 1                                      | `dogfood-counts-by-type.json`     |
| Счётчики по статусам           | active 691, archived 71, superseded 25, completed 25, proposed 19, resolved 12, obsolete 7, accepted 6, open 2, answered 2, (без статуса) 1                                                                                                                                                                                                                                          | `dogfood-counts-by-status.json`   |
| Медиана суточных доставок (7д) | **144** (окно 2026-09-23…29: 3042/3584/734/144/0/0/0 на момент снапшота; 2026-09-29 — частичный день, живой счётчик)                                                                                                                                                                                                                                                                 | `dogfood-delivery-7d.json`        |
| Доставок всего за историю      | 39 128 delivery-сигналов                                                                                                                                                                                                                                                                                                                                                             | `dogfood-delivery-7d.json`        |
| Delivery-окно аналитики        | снимок `analytics --view delivery --json` (missRateByAgent, routerMs, topDelivered и пр.)                                                                                                                                                                                                                                                                                            | `dogfood-analytics-delivery.json` |

Критерий потерь (P213/P230): сортированное множество id до == после; для немигрируемых — sha256(frontmatter+body), для всех — sha256(body) (`dogfood-ids-sha256.tsv`, колонки 4/5).

## Методика и отклонения

1. `wolf list --json` в 2.12.0 **не существует** (у `list` нет json-вывода — только текстовые строки). Id-снапшот снят напрямую по markdown-файлам `.wolf/memory`: id = имя файла, sha256_full = файл целиком, sha256_body = контент после закрывающего `---`. Повторный прогон на неизменённом `.wolf` даёт побайтово тот же TSV (проверено: rerun → diff пустой).
2. Файл `agent-brief-latest` — кэш агента (пустое тело, без type/status в frontmatter); в снапшоте учтён отдельной строкой, объектом памяти не является.
3. Delivery-медиана: `event == "delivery"` в `.wolf/metrics/session-metrics.jsonl`, окно = 7 дней от последнего дня с доставкой, нулевые дни внутри окна включены, сегодняшний день частичный (число живое, растёт в течение дня). Снятие baseline-сессией породило несколько delivery-сигналов 2026-09-29 (холодный старт executor'а) — на медиану окна не влияет.
4. `wolf list`/`wolf analytics` пишут mcp_call-телеметрию (with-cli-call) — delivery-сигналы и sha256-снапшоты не затрагивают; скрипт более ничего не пишет.

## Воспроизведение

```bash
bash docs/research/wave-2.13-baseline/snapshot.sh /path/to/mister-wolf
```

Требует собранного `dist` в dogfood-репо (бинарь baseline = бинарь «до»).
