# Источники и границы изучения

Дата доступа: 2026-11-16. Данные репозиториев получены через GitHub и сверены с локальными копиями; статьи — через первичные страницы и доступный HTML. Никакие внешние skill-инструкции не выполнялись.

## Вольф

- [Baseline 4052d9e18acc397e57436dec567bc249b1b25e41](https://github.com/chekh/mister-wolf/tree/4052d9e18acc397e57436dec567bc249b1b25e41), package 3.1.2.
- [Русская база v3.0.0](https://github.com/chekh/mister-wolf/tree/v3.0.0/templates/base). Нормативные фрагменты и роли сверены; не заявляется пословная сертификация всех исходных строк.
- [Исторический Steward 2.33.0](https://github.com/chekh/mister-wolf/blob/v2.33.0/templates/base/agents/steward.md): прочитана рамка, включая faces/plugin delivery, заранее разрешённую агрегацию и её prompt-level preflight. Это база анализа возврата, не действующая роль 3.1.2.
- Текущие 9 agents, 35 SKILL.md и 18 Markdown-референсов — полный английский read-through. Матрица с hashes: 02-file-review-matrix.csv.
- [get-call-injections.ts](https://github.com/chekh/mister-wolf/blob/4052d9e1/src/app/use-cases/get-call-injections.ts): адресная доставка, бюджет, баннер зрелых уроков, сообщение об отключённом Стюарде.
- [save-proposal.ts](https://github.com/chekh/mister-wolf/blob/4052d9e1/src/app/use-cases/save-proposal.ts) и [deliver-proposal.ts](https://github.com/chekh/mister-wolf/blob/4052d9e1/src/app/use-cases/deliver-proposal.ts): существующий proposal и различие save/deliver/process.
- [apply-aggregate.ts](https://github.com/chekh/mister-wolf/blob/4052d9e1/src/app/use-cases/apply-aggregate.ts): существующий mutable путь, его порядок и preflight-ограничение.
- `detect-unaggregated-lessons.ts`, `governance.ts`, `type-schema-builder.ts`, `memory-types.ts`, `face-operation.ts`, `seed-base-playbooks.ts`: сверка текущих механизмов/типов/совместимости. Это адресный анализ для дизайна, не аудит всего исходного кода.
- [Roadmap v4](https://github.com/chekh/mister-wolf/blob/4052d9e1/docs/dev/roadmap/roadmap-v4.md): существующие O1/U1/D1/D2. Пакет предлагает пересмотр зависимости trial от UI: испытание должно быть доступно CLI/MCP раньше полной консоли. Это отдельное решение владельца, не автоматическое изменение очереди.

## oh-my-hermes

Revision: `f716b0b7840432b7a8ad5699e47cb25c08b26f2f`. Лицензия MIT; при копировании кода/существенных текстов сохранить notice, при адаптации — source/revision и описание отличий.

- [workflow_learning.py](https://github.com/rlaope/oh-my-hermes/blob/f716b0b7840432b7a8ad5699e47cb25c08b26f2f/src/workflows/workflow_learning.py): прочитаны schema/constants, route/queue/replay surfaces и целевые фрагменты, не все ~4000 строк.
- [self_improvement_store_contract.py](https://github.com/rlaope/oh-my-hermes/blob/f716b0b7840432b7a8ad5699e47cb25c08b26f2f/src/workflows/self_improvement_store_contract.py): полный контракт destinations.
- [learning_candidate.py](https://github.com/rlaope/oh-my-hermes/blob/f716b0b7840432b7a8ad5699e47cb25c08b26f2f/src/workflows/learning_candidate.py): targeted reading класса кандидата, сигналов, границ prepared-not-observed.
- [memory_dreaming.py](https://github.com/rlaope/oh-my-hermes/blob/f716b0b7840432b7a8ad5699e47cb25c08b26f2f/src/plugin_bundle/omh/memory_dreaming.py): первые разделы механизма trigger/mode/profile scope; фоновая LLM-консолидация не проверялась запуском.
- [Memory Keeper](https://github.com/rlaope/oh-my-hermes/blob/f716b0b7840432b7a8ad5699e47cb25c08b26f2f/roles/memory-keeper.md): responsibility descriptor и evidence boundary.
- [Measured Loop Discipline](https://github.com/rlaope/oh-my-hermes/blob/f716b0b7840432b7a8ad5699e47cb25c08b26f2f/agent-skills/ulw-loop/references/measured-loop-discipline.md): прочитан; декларативные поля не выданы за реализацию.
- `omh-agent-ops-review`, instrumentation-ladder и decision-frontier: изучены применимые нормы различения observed/prepared, измеримости и недостающего решения.

## TokenEconomizer

Revision: `583fff78bf504b59d542f953c31e87d01d02ab42`. Лицензия Apache-2.0; потенциальная прямая интеграция требует сохранить применимые notices/attribution и проверить зависимые компоненты. Этот пакет предлагает перенос принципов, не vendoring.

- [README](https://github.com/microsoft/TokenEconomizer/blob/583fff78bf504b59d542f953c31e87d01d02ab42/README.md): методы, условия и claims отделены от собственных результатов.
- [Micro-skills](https://github.com/microsoft/TokenEconomizer/blob/583fff78bf504b59d542f953c31e87d01d02ab42/tokeneconomizer/microskills/README.md), `lifecycle.py`, части `envfacts.py`: формирование, подтверждение, contradiction/retirement, caps.
- [Loop guard](https://github.com/microsoft/TokenEconomizer/blob/583fff78bf504b59d542f953c31e87d01d02ab42/tokeneconomizer/loopguard/README.md): free gate/judge/envelope/redirect. Конкретная OpenCode-интеграция не устанавливалась и не проверялась.
- [Статья v1](https://arxiv.org/html/2610.22732v1): метод и cache-aware accounting, limitations переноса результатов.

## Исследования

| Источник | Версия | Глубина |
| --- | --- | --- |
| [DAIR Harness Engineering](https://academy.dair.ai/papers/collections/harness-engineering?view=latest) | каталог на дату доступа | скрининг направлений, не чтение всех 835 работ |
| [ACE](https://arxiv.org/html/2510.04618v3) | v3, 2026-03-29 | abstract, мотивация, метод incremental delta/grow-and-refine и evaluation boundaries |
| [GEPA](https://arxiv.org/html/2507.19457v2) | v2, 2026-02-14 | abstract, reflective evolution/Pareto и рамка оценки |
| [SkillsBench](https://arxiv.org/html/2602.12670v4) | v4, 2026-06-14 | abstract, актуальный inventory и self-generated condition/trajectory audit |
| [SoMem](https://arxiv.org/abs/2611.11929v1) | v1, 2026-11-09 | abstract-level scouting; не валидирован экспериментально для Wolf |
| [DISCERN](https://arxiv.org/abs/2611.15729v1) | v1, 2026-11-11 | abstract-level scouting; сохранение provenance и resolution |
| [MemCredit](https://arxiv.org/abs/2611.15600v1) | v1, 2026-11-11 | abstract-level scouting; utility vs relevance |
| [The Memory Trap](https://arxiv.org/abs/2611.07554v1) | v1, 2026-11-05 | abstract-level scouting; scope overgeneralization |

## Что проверено в этой работе

Точный baseline и инвентарь; чтение указанного английского корпуса; выборочная нормативная сверка с русским исходником по всем основным ролям/навыкам; совпадение операционных frontmatter 9/9; наличие и содержание целевых конфликтов; существующие точки расширения памяти/предложений/агрегации; версии внешних репозиториев; внутренняя связность проектного пакета.

## Что не проверено

Живые прогоны нового Стюарда, новые команды, performance thresholds, эффективность и экономия, все реализации внешних проектов, статистическая надёжность чужих бенчмарков, семантика всего исходного кода Wolf. Независимый экспертный review этого проектного пакета не проводился. Реализация и принятие нового релиза остаются следующей работой.
