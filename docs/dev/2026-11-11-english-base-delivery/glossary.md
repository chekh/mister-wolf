---
slug: glossary-ru-en
title: Глоссарий перевода Wolf RU→EN
status: approved
created: 2026-11-11
approved_by: owner
approved_on: 2026-11-12
---

# Глоссарий RU→EN — волна перевода поставки

Утверждён владельцем 2026-11-12 (REQ-04: группы перевода не стартуют без утверждённого глоссария — гейт снят). Статус строк §1–5 — `approved`; §6 (инвентаризация G2+) и §6a (кандидаты перевода G2) — `candidate` по правилу «новый термин сначала candidate». Канонические EN-варианты согласованы с существующей англоязычной документацией сайта (`docs/site/guide`) и кодом (`src/domain/memory-types.ts`).

Правило одно: один RU-термин — один EN-термин по всему проекту. Колонка «Запрещённые варианты (aliases)» перечисляет RU/EN-варианты, которые не должны встречаться в переводах вместо канонического термина. Формат таблицы — контракт design §4.3.

## 1. Типы памяти Wolf

| RU-термин                      | EN-термин   | Запрещённые варианты (aliases)            | Статус     |
| ------------------------------ | ----------- | ----------------------------------------- | ---------- |
| память                         | memory      | хранилище, база знаний, knowledge base    | `approved` |
| решение                        | decision    | резолюция, resolution, ruling             | `approved` |
| урок                           | lesson      | инсайт, takeaway, insight                 | `approved` |
| правило                        | rule        | policy, политика, норма                   | `approved` |
| запись (тип памяти)            | note        | observation, entry, заметка               | `approved` |
| тред (рабочий тред)            | thread      | work-thread, ветка, задача                | `approved` |
| жалоба                         | complaint   | grievance, issue, претензия               | `approved` |
| лицо (агента)                  | face        | persona, identity, маска, аватар          | `approved` |
| инструмент                     | tool        | утилита, utility, скрипт (как тип памяти) | `approved` |
| плейбук                        | playbook    | guide, методичка                          | `approved` |
| фасет                          | facet       | tag, грань                                | `approved` |
| мнение (консилиума)            | opinion     | council-opinion                           | `approved` |
| синтез                         | synthesis   | обобщение, summary, consensus             | `approved` |
| предложение (сигнал)           | proposal    | suggestion, offer, заявка                 | `approved` |
| связь (между записями)         | relation    | link, edge, reference                     | `approved` |
| замена (версии записи)         | supersede   | replace, override, устаревание            | `approved` |
| устаревание (типа/инструмента) | deprecation | obsolescence, удаление, removal           | `approved` |
| триаж                          | triage      | разбор, routing, классификация            | `approved` |

## 2. Роли и организация

| RU-термин                                                           | EN-термин      | Запрещённые варианты (aliases)                            | Статус     |
| ------------------------------------------------------------------- | -------------- | --------------------------------------------------------- | ---------- |
| Стюард                                                              | Steward        | управляющий, смотритель, curator                          | `approved` |
| ведущий                                                             | lead           | координатор, coordinator, orchestrator, manager           | `approved` |
| наниматель / постановщик (кто задаёт поручение и принимает возврат) | requester      | customer, employer, hirer, buyer, supervisor, постановщик | `approved` |
| исполнитель                                                         | executor       | worker, performer, воркер                                 | `approved` |
| владелец                                                            | owner          | хозяин, proprietor, хост                                  | `approved` |
| консилиум                                                           | council        | совещание, consultation, board, комитет                   | `approved` |
| эксперт                                                             | expert         | консультант, specialist                                   | `approved` |
| позиция (эксперта)                                                  | position       | stance, viewpoint                                         | `approved` |
| нанимать (исполнителя)                                              | hire           | спавнить, spawn, инстанцировать                           | `approved` |
| мандат / поручение (акт назначения)                                 | mandate        | permission, полномочия, допуск, assignment, delegation    | `approved` |
| фрейм (рамка агента)                                                | frame          | каркас, рамка, шаблон агента                              | `approved` |
| контур (доверия)                                                    | contour        | perimeter, граница доверия                                | `approved` |
| жалобный контур                                                     | complaint loop | feedback loop, петля жалоб                                | `approved` |
| луп обучения                                                        | learning loop  | петля обучения, feedback loop                             | `approved` |
| сессия                                                              | session        | чат, conversation, диалог                                 | `approved` |

## 3. Механизмы

| RU-термин                      | EN-термин            | Запрещённые варианты (aliases)                | Статус     |
| ------------------------------ | -------------------- | --------------------------------------------- | ---------- |
| бутстрап                       | bootstrap            | первичное наполнение, initial draft           | `approved` |
| бриф                           | brief                | ТЗ, задание, assignment                       | `approved` |
| доктор                         | doctor               | health check, диагностика                     | `approved` |
| обновление (проектов/CLI)      | upgrade              | update, апдейт                                | `approved` |
| проход обновления              | pass                 | run, волна, раунд                             | `approved` |
| инициализация                  | init                 | setup, установка, installation                | `approved` |
| разрешение (конфликта upgrade) | resolve              | урегулирование, settle                        | `approved` |
| штамп / штампованный файл      | stamp / stamped file | маркер, клеймо, watermark                     | `approved` |
| свидетель (запись рендера)     | witness              | журнал рендера, render record                 | `approved` |
| защитить (файл)                | protect              | freeze, hold, lock                            | `approved` |
| оставить (локальный вариант)   | keep                 | retention, hold, сохранить                    | `approved` |
| взять (базовую версию)         | take                 | adopt, overwrite, принять базу                | `approved` |
| закрепить (файл/модель)        | pin                  | lock, fixate, зафиксировать                   | `approved` |
| карта обновлений               | update map           | update-map, манифест обновлений               | `approved` |
| прокладка (связей плагина)     | wiring               | проводка, hookup                              | `approved` |
| инъекция                       | injection            | infusion, embed, подстановка, вставка         | `approved` |
| доставка / поставка            | delivery             | supply, distribution, provision               | `approved` |
| страж владения                 | ownership guard      | проверка владельца, sentinel                  | `approved` |
| базовый набор                  | base set             | базовый комплект, template set, набор скиллов | `approved` |
| парк (проектов)                | park                 | registry, реестр, ферма                       | `approved` |
| холодный старт                 | cold start           | boot, прогрев, запуск с нуля                  | `approved` |

## 4. Процедурные термины

| RU-термин                   | EN-термин           | Запрещённые варианты (aliases)                       | Статус     |
| --------------------------- | ------------------- | ---------------------------------------------------- | ---------- |
| гейт                        | gate                | barrier, checkpoint-gate, шлюз                       | `approved` |
| приёмка                     | acceptance          | принятие, approval (как перевод приёмки), sign-off   | `approved` |
| ревью                       | review              | рецензия, осмотр                                     | `approved` |
| чекпоинт                    | checkpoint          | snapshot, точка сохранения                           | `approved` |
| передача (работы/контекста) | handoff             | эстафета, transfer, передача дел                     | `approved` |
| критерий приёмки            | acceptance criteria | acceptance criterion, условия приёмки                | `approved` |
| вердикт                     | verdict             | заключение, ruling                                   | `approved` |
| задача (единица работы)     | task                | задание, issue, тикет                                | `approved` |
| план                        | plan                | программа                                            | `approved` |
| профиль (поручения)         | profile             | role, тип поручения                                  | `approved` |
| плотность (текста)          | density             | детализация, verbosity                               | `approved` |
| проверка                    | verification        | контроль, validation (как перевод проверки), testing | `approved` |
| валидация                   | validation          | verify, проверка                                     | `approved` |

## 5. Общие методические термины

| RU-термин                             | EN-термин   | Запрещённые варианты (aliases)                                      | Статус     |
| ------------------------------------- | ----------- | ------------------------------------------------------------------- | ---------- |
| требование                            | requirement | запрос, demand, spec                                                | `approved` |
| ограничение (проектное)               | constraint  | restriction, limitation (как перевод проектного ограничения), лимит | `approved` |
| граница                               | boundary    | limit, предел                                                       | `approved` |
| след (размышления)                    | trace       | thesaurus-free-trace, log, trail                                    | `approved` |
| доказательство                        | evidence    | attestation, proof, подтверждение                                   | `approved` |
| обоснование                           | rationale   | justification, мотивировка                                          | `approved` |
| цель                                  | goal        | objective, target                                                   | `approved` |
| намерение                             | intent      | замысел, intention                                                  | `approved` |
| скилл / методика                      | skill       | навык, capability, methodology, методичка                           | `approved` |
| область (задачи)                      | scope       | охват, размах, рамки                                                | `approved` |
| рабочее дерево                        | worktree    | work tree, дерево каталогов                                         | `approved` |
| релиз                                 | release     | version, выпуск                                                     | `approved` |
| утверждение (тезис)                   | claim       | thesis, statement, assertion                                        | `approved` |
| утверждение (согласование владельцем) | approval    | sign-off, ratification, согласование                                | `approved` |

## Источники сверки

- `src/domain/memory-types.ts` — канон типов: rule, lesson, decision, thread, complaint, tool, note, face; фасеты; supersede; triage.
- `docs/site/guide/cli/command-reference.md` — имена команд и механизмов (bootstrap, doctor, upgrade, resolve, propose, tool, face, claim).
- `docs/site/guide/organization.md` — lead, executor, hire, council, position, acceptance, checkpoint, brief, profile, density.
- `docs/site/guide/delivery.md` — frame, face, delivery, channel, injection, ownership guard, fallback, Steward, complaint loop.
- `docs/site/guide/upgrade.md` — stamp/stamped file, witness, update map, protect/keep/take/pin, pass, park, base set.
- `templates/base/` (AGENTS.md, skills wolf-plan/wolf-council/wolf-user-report и др.) — встречаемость RU-терминов: ведущий, исполнитель, бриф, гейт, приёмка, ревью, чекпоинт, тред, требования, ограничения, консилиум, синтез, владелец, мандат, нанимать.

## 6. Понятия групп G2+ (candidate — инвентаризация перед переводом)

Добавлены по инвентаризации понятий G2 (32 файла `wolf-*/SKILL.md`, их references
и `writing-skills`), чтобы параллельные переводчики не породили синонимы — это уже
случилось в G1 с «нанимателем» (`requester`/`hirer`). Статус `candidate`: вступают
в силу после утверждения владельцем на границе группы (REQ-04).

### Роли и действия

| RU-термин                      | EN-термин         | Запрещённые варианты (aliases)              | Статус      |
| ------------------------------ | ----------------- | ------------------------------------------- | ----------- |
| права (что разрешено роли)     | rights            | permissions, authority, полномочия          | `candidate` |
| ответственный (за решение)     | responsible party | decision owner, accountable, ответственный  | `candidate` |
| читатель                       | reader            | audience, consumer                          | `candidate` |
| писатель (технический)         | writer            | author, technical writer                    | `candidate` |
| диспетчер (платформенный наём) | dispatcher        | coordinator, coordinator-level, оркестратор | `candidate` |

### Тестовые и диагностические понятия

| RU-термин                 | EN-термин  | Запрещённые варианты (aliases)         | Статус      |
| ------------------------- | ---------- | -------------------------------------- | ----------- |
| тест                      | test       | проверка, testing, spec                | `candidate` |
| прогон (тестов)           | test run   | run, execution, прогонка               | `candidate` |
| сценарий (тест-кейс)      | scenario   | case, story, сценарий                  | `candidate` |
| фикстура                  | fixture    | mock data, sample, фикстура            | `candidate` |
| регрессия                 | regression | regression test, регресс               | `candidate` |
| оракул (эталон проверки)  | oracle     | reference, expected value              | `candidate` |
| порог (NFR)               | threshold  | limit, barrier, граница                | `candidate` |
| шов (тестовый)            | seam       | boundary, joint, шов                   | `candidate` |
| дефект                    | defect     | bug, issue, error, баг                 | `candidate` |
| сбой                      | failure    | crash, error, failure case, отказ      | `candidate` |
| падение (процесса)        | crash      | failure, падение, аварийное завершение | `candidate` |
| исход (шага/эксперимента) | outcome    | result, output, исход                  | `candidate` |
| вывод (заключение)        | conclusion | outcome, finding, deduction            | `candidate` |
| пробная проверка          | probe      | test, sample, probing                  | `candidate` |
| инцидент                  | incident   | event, accident, инцидент              | `candidate` |

### Ревью и экспертиза

| RU-термин                | EN-термин      | Запрещённые варианты (aliases)                  | Статус      |
| ------------------------ | -------------- | ----------------------------------------------- | ----------- |
| находка (ревью)          | finding        | remark, comment, issue, замечание               | `candidate` |
| замечание (ревью)        | remark         | finding, comment, note                          | `candidate` |
| линза (ревью/эксперта)   | lens           | perspective, view, focus                        | `candidate` |
| покрытие (ревью)         | coverage       | scope, completeness, охват                      | `candidate` |
| аудит                    | audit          | review, inspection, аудит                       | `candidate` |
| след аудита              | audit trail    | log, trace, history                             | `candidate` |
| пробел (знаний/покрытия) | gap            | hole, missing part, пробел                      | `candidate` |
| блокер                   | blocker        | impediment, obstacle, блокер                    | `candidate` |
| эскалация                | escalation     | raise, upward, эскалация                        | `candidate` |
| допущение (эксперта)     | assumption     | presumption, guess, допущение                   | `candidate` |
| альтернатива             | alternative    | option (для выбора решения), вариант            | `candidate` |
| компромисс               | trade-off      | compromise, balance                             | `candidate` |
| рекомендация             | recommendation | advice, suggestion (для proposal), рекомендация | `candidate` |
| расхождение (мнений)     | disagreement   | conflict, divergence, dissonance                | `candidate` |
| контрпример              | counterexample | counter-example, negative case                  | `candidate` |
| уверенность (оценка)     | confidence     | certainty, assurance                            | `candidate` |
| влияние                  | impact         | effect, influence, влияние                      | `candidate` |

### Процесс и решения

| RU-термин                            | EN-термин   | Запрещённые варианты (aliases)                                           | Статус      |
| ------------------------------------ | ----------- | ------------------------------------------------------------------------ | ----------- |
| режим (FULL/LITE/FIX, execute/solve) | mode        | setting, regime, режим                                                   | `candidate` |
| цикл (исправлений/ревью)             | cycle       | round, loop, итерация                                                    | `candidate` |
| раунд (ревью)                        | round       | cycle, iteration, раунд                                                  | `candidate` |
| бюджет (поручения)                   | budget      | limit, quota, allowance                                                  | `candidate` |
| основание (для решения/вывода)       | grounds     | reason, basis (только как «базис»), rationale (только для «обоснования») | `candidate` |
| последствие                          | consequence | effect, impact, следствие                                                | `candidate` |
| готовность (результата)              | readiness   | readiness state, maturity                                                | `candidate` |
| польза (для читателя/пользователя)   | benefit     | value, gain, advantage, выгода                                           | `candidate` |
| канон                                | canon       | standard, rule set, канон                                                | `candidate` |
| ядро (TASK)                          | core        | base, kernel, ядро                                                       | `candidate` |
| экземпляр (исполнителя)              | instance    | copy, agent copy, экземпляр                                              | `candidate` |
| шаблон                               | template    | pattern, boilerplate, шаблон                                             | `candidate` |
| статус                               | status      | state, статус                                                            | `candidate` |
| состояние (работы)                   | state       | status, condition, состояние                                             | `candidate` |
| ревизия (SHA/версия)                 | revision    | version, commit, ревизия                                                 | `candidate` |
| версия                               | version     | revision, release, версия                                                | `candidate` |

### Технические понятия (git, релиз, среда)

| RU-термин                | EN-термин     | Запрещённые варианты (aliases)              | Статус      |
| ------------------------ | ------------- | ------------------------------------------- | ----------- |
| ветка (git)              | branch        | line, thread (для тред), ветка              | `candidate` |
| коммит                   | commit        | check-in, snapshot, коммит                  | `candidate` |
| рабочая копия            | working copy  | checkout, work copy, рабочая копия          | `candidate` |
| откат                    | rollback      | revert, undo, откат                         | `candidate` |
| миграция                 | migration     | upgrade (для обновления), перенос           | `candidate` |
| публикация               | publication   | release (для релиза), publish, публикация   | `candidate` |
| интеграция               | integration   | merge, соединение, интеграция               | `candidate` |
| среда (выполнения)       | environment   | env, setup (для инициализации), среда       | `candidate` |
| изоляция                 | isolation     | separation, sandboxing, изоляция            | `candidate` |
| совместимость            | compatibility | conformance, совместимость                  | `candidate` |
| гарантия                 | guarantee     | promise, assurance, гарантия                | `candidate` |
| инвариант                | invariant     | constant, неизменность                      | `candidate` |
| свойство                 | property      | attribute, characteristic, свойство         | `candidate` |
| артефакт                 | artifact      | artefact, output, артефакт                  | `candidate` |
| потребитель              | consumer      | user, client, потребитель                   | `candidate` |
| канал                    | channel       | path, lane, канал                           | `candidate` |
| карточка (инструмента)   | card          | entry, record (для записи), карточка        | `candidate` |
| библиотека (средств)     | library       | collection, catalogue, библиотека           | `candidate` |
| реестр                   | registry      | list, catalog, реестр                       | `candidate` |
| измерение                | measurement   | metric, measure, измерение                  | `candidate` |
| эксперимент              | experiment    | test, trial, эксперимент                    | `candidate` |
| зрелость                 | maturity      | readiness, ripeness, зрелость               | `candidate` |
| мутация (правила/набора) | mutation      | change, edit, мутация                       | `candidate` |
| сигнал                   | signal        | signal message, sign, сигнал                | `candidate` |
| обязательство            | obligation    | commitment, duty, обязательство             | `candidate` |
| условие                  | condition     | requirement (для требования), term, условие | `candidate` |
| приоритет                | priority      | rank, order, приоритет                      | `candidate` |
| риск                     | risk          | hazard, danger, риск                        | `candidate` |
| преемник                 | successor     | heir, next, преемник                        | `candidate` |
| подавец (жалобы)         | filer         | complainant, reporter, подавец              | `candidate` |
| триажирующий             | triager       | triage owner, reviewer, триажирующий        | `candidate` |

## 6a. Кандидаты перевода G2 (блоки E1–E5, 2026-11-14)

Термины, введённые переводом G2 и отсутствовавшие в §1–6. Все строки `candidate` — вступают в силу по правилу волны; при срабатывании гейта 4 на слова, совпадающие с чужими алиасами (edge, summary, policy), вопрос выводится в исключения по примечанию.

| RU-термин                                      | EN-термин             | Запрещённые варианты (aliases)                | Статус      |
| ---------------------------------------------- | --------------------- | --------------------------------------------- | ----------- |
| руководитель (испытателя, writing-skills)      | supervisor            | manager, chief                                | `candidate` |
| руководитель (синоним ведущего, wolf-feedback) | lead                  | —                                             | `candidate` |
| переносимость                                  | portability           | —                                             | `candidate` |
| работоспособность                              | operability           | —                                             | `candidate` |
| ответственность (раздел design)                | responsibility        | ownership (зарезервирован за state ownership) | `candidate` |
| носитель решения                               | responsible party     | decision owner                                | `candidate` |
| исследование                                   | research              | —                                             | `candidate` |
| расследование                                  | investigation         | —                                             | `candidate` |
| ребро (графа)                                  | edge                  | —                                             | `candidate` |
| совет (орган)                                  | council               | —                                             | `candidate` |
| стенограмма                                    | transcript            | —                                             | `candidate` |
| анкета                                         | questionnaire         | —                                             | `candidate` |
| опрос                                          | interview             | —                                             | `candidate` |
| обход                                          | workaround            | —                                             | `candidate` |
| аналог                                         | counterpart           | —                                             | `candidate` |
| нагрузка                                       | load                  | —                                             | `candidate` |
| ущерб                                          | damage                | —                                             | `candidate` |
| деградация                                     | degradation           | —                                             | `candidate` |
| выдача прав                                    | grant of rights       | —                                             | `candidate` |
| расход                                         | spend                 | —                                             | `candidate` |
| счётчик                                        | counter               | —                                             | `candidate` |
| заглушка                                       | stub                  | —                                             | `candidate` |
| объём                                          | volume                | —                                             | `candidate` |
| ознакомление                                   | familiarization pass  | —                                             | `candidate` |
| унификация                                     | unification           | —                                             | `candidate` |
| рамка (разговора)                              | frame                 | —                                             | `candidate` |
| носитель контекста                             | context holder        | —                                             | `candidate` |
| загрязняющий тест                              | polluting test        | —                                             | `candidate` |
| бинарное деление                               | bisection             | —                                             | `candidate` |
| организатор                                    | organizer             | —                                             | `candidate` |
| ревьюер (роль, не имя агента)                  | reviewer              | —                                             | `candidate` |
| автор                                          | author                | —                                             | `candidate` |
| редактор (роль, не имя агента)                 | editor                | —                                             | `candidate` |
| сводка                                         | summary               | —                                             | `candidate` |
| средство                                       | means                 | —                                             | `candidate` |
| ловушка                                        | pitfall               | —                                             | `candidate` |
| трение                                         | friction              | —                                             | `candidate` |
| механика                                       | mechanics             | —                                             | `candidate` |
| спор                                           | dispute               | —                                             | `candidate` |
| читаемость                                     | readability           | —                                             | `candidate` |
| редактура                                      | editing               | —                                             | `candidate` |
| оговорка                                       | caveat                | —                                             | `candidate` |
| реплика                                        | turn                  | —                                             | `candidate` |
| конструкция                                    | construction          | —                                             | `candidate` |
| поставщик                                      | provider              | —                                             | `candidate` |
| валидатор                                      | validator             | —                                             | `candidate` |
| проверяемость                                  | verifiability         | —                                             | `candidate` |
| узлы                                           | nodes                 | —                                             | `candidate` |
| диспетчеризация                                | dispatching           | —                                             | `candidate` |
| преемник                                       | successor             | —                                             | `candidate` |
| передающая сторона                             | the transferring side | —                                             | `candidate` |
| получатель (передачи)                          | receiver              | —                                             | `candidate` |
| помощник-агент                                 | helper agent          | —                                             | `candidate` |
| регламент                                      | policy                | —                                             | `candidate` |
| спутники (скиллы)                              | companions            | —                                             | `candidate` |
| сохранность                                    | preservation          | —                                             | `candidate` |
| потомки                                        | descendants           | —                                             | `candidate` |
| писатели                                       | writers               | —                                             | `candidate` |
| очередь интеграции                             | integration queue     | —                                             | `candidate` |
| адаптер хостинга                               | hosting adapter       | —                                             | `candidate` |
| постоянный контролёр                           | permanent controller  | —                                             | `candidate` |
| координатор                                    | coordinator           | —                                             | `candidate` |
| адресат (читатель документа)                   | reader                | audience, addressee                           | `candidate` |
| существенный                                   | substantial           | significant                                   | `candidate` |
| значимый                                       | material              | significant                                   | `candidate` |
| консультация (одиночная, wolf-council)         | consultation          | —                                             | `candidate` |
| политика (проекта)                             | policy                | rules, regulation                             | `candidate` |

Примечания разведений: `edge` — только ребро графа памяти (алиас `relation` — «связь» — в графовом контексте не употребляется); `summary` — сводка как раздел текста, не канон RESULT-синтеза; `policy` — гит-регламент (git-collaboration-policy), не «правило»; `receiver` — получатель передачи работы, приёмка результата остаётся за acceptance owner; `coordinator` — третья роль в жалобном контуре, не lead и не dispatcher; `supervisor`/`lead` — разведение по смыслу «руководитель» (см. две строки выше и журнал G2-E4/E5). Употребления coordinator/edge/supervisor в переводах G2 проверены семантическим ревью цикла 1 (R2) как корректные по смыслу — слова добавляются в «Исключения» гейта 4, чтобы чужие алиасы не ловили верные употребления.

## 6b. Кандидаты перевода G3 (блоки A–D, 2026-11-15)

Термины, введённые переводом G3 и отсутствовавшие в §1–6a. Все строки `candidate`. Омонимы «разбор», «удаление», «связь» разведены квалификатором в RU-термине.

| RU-термин                                      | EN-термин                         | Запрещённые варианты (aliases) | Статус      |
| ---------------------------------------------- | --------------------------------- | ------------------------------ | ----------- |
| актуальный                                     | current                           | —                              | `candidate` |
| актуальность                                   | currency                          | freshness                      | `candidate` |
| неактуальный / устаревший                      | stale                             | outdated                       | `candidate` |
| заявление (тезис о готовности)                 | claim                             | —                              | `candidate` |
| обоснованный                                   | justified                         | —                              | `candidate` |
| ошибка (в ходе проверок)                       | failure                           | —                              | `candidate` |
| слияние (git)                                  | merge                             | —                              | `candidate` |
| уборка / очистка                               | cleanup                           | —                              | `candidate` |
| восстановление                                 | recovery                          | —                              | `candidate` |
| лимит                                          | limit                             | —                              | `candidate` |
| разбор (замечаний ревью)                       | handling                          | —                              | `candidate` |
| разбор (анализ ситуации)                       | analysis                          | —                              | `candidate` |
| расхождение                                    | divergence                        | —                              | `candidate` |
| предметная проверка                            | domain test                       | —                              | `candidate` |
| RED-проверка                                   | RED run                           | —                              | `candidate` |
| багфикс                                        | defect fix                        | bugfix, баг                    | `candidate` |
| итог (исход шага)                              | outcome                           | —                              | `candidate` |
| итог (человекочитаемый, заключительная сводка) | summary                           | —                              | `candidate` |
| сложность                                      | complexity                        | —                              | `candidate` |
| поведение                                      | behavior                          | —                              | `candidate` |
| контракт                                       | contract                          | —                              | `candidate` |
| оценка                                         | evaluation                        | —                              | `candidate` |
| представление (визуальное)                     | representation                    | —                              | `candidate` |
| оформление (тема)                              | styling                           | —                              | `candidate` |
| подпись                                        | label                             | —                              | `candidate` |
| глубина                                        | depth                             | —                              | `candidate` |
| преобразование                                 | transformation                    | —                              | `candidate` |
| упрощение                                      | simplification                    | —                              | `candidate` |
| прослойка                                      | layer                             | —                              | `candidate` |
| косвенность                                    | indirection                       | —                              | `candidate` |
| вложенность                                    | nesting                           | —                              | `candidate` |
| исходник                                       | source                            | —                              | `candidate` |
| резюме (краткое)                               | summary                           | —                              | `candidate` |
| интерактивность (документа)                    | interactivity                     | —                              | `candidate` |
| цена контекста                                 | context cost                      | —                              | `candidate` |
| обработчик интеграции                          | integration handler               | —                              | `candidate` |
| ведущий участник                               | lead participant                  | —                              | `candidate` |
| общий репозиторий / общий remote               | shared repository / shared remote | —                              | `candidate` |
| рабочая ветка                                  | working branch                    | —                              | `candidate` |
| связь (сеть зависимостей)                      | connectivity                      | —                              | `candidate` |
| отметка готовности                             | readiness mark                    | —                              | `candidate` |
| условия допуска / допуск                       | admission conditions / admission  | —                              | `candidate` |
| ветка восстановления                           | recovery branch                   | —                              | `candidate` |
| служебная учётная запись                       | service account                   | —                              | `candidate` |
| повторная попытка                              | retry                             | —                              | `candidate` |
| кандидат интеграции                            | integration candidate             | —                              | `candidate` |
| коммит интеграции                              | integration commit                | —                              | `candidate` |
| merge-коммит-кандидат                          | candidate merge commit            | —                              | `candidate` |
| предъявление                                   | presentation                      | —                              | `candidate` |
| основа                                         | foundation                        | basis                          | `candidate` |
| удалённая ветка                                | remote branch                     | —                              | `candidate` |
| удаление (модуля)                              | removal                           | deletion                       | `candidate` |
| удаление (ветки/данных)                        | deletion                          | removal                        | `candidate` |
| обход / обойти                                 | workaround / bypass               | —                              | `candidate` |
| журнал выпуска / журнал интеграции             | release log / integration log     | —                              | `candidate` |

Примечания разведений G3: `handling` — разбор замечаний code-review (receiving-code-review), `analysis` — разбор ситуации (policy §13); `removal` — удаление модуля (software-design «Removal check», исключение ниже), `deletion` — удаление ветки/данных (policy); глаголы: «удалить (частные данные/файлы)» → delete (user-report), «remove» зарезервирован за модульным removal; `claim` — слит с RU «утверждение» в verification-before-completion (оба RU-слова означают тезис о готовности); `failure` — канон «сбой» применён к RU «ошибка» в ходе проверок, «дефект» остаётся defect; `policy` — омоним «регламента» и «политики проекта» разведён контекстом (Git Collaboration Policy / project policy); `connectivity` — связь-сеть (policy), «связь (между записями)» остаётся relation; `bypass` — глагол «обойти» (policy), «обход» остаётся workaround; `полномочия` — если сфера допустимых действий («вправе», права доступа, policy §3, G1 routes) → rights, если синоним мандата-акта назначения (wolf-git SKILL и G2-методики) → mandate — смотреть по RU-контексту; `вариант` — выбор из альтернатив → option (G2), вариация вида/исполнения → variant (user-report); `norm` — запрещён: RU «норма» как синоним правила → rule.

## 6c. Кандидаты перевода G4 (блоки A–D, 2026-11-15)

Термины, введённые переводом G4 (агенты и команды). Все строки `candidate`. Ролевые H1-заголовки — канонические названия ролей агентов.

| RU-термин                            | EN-термин             | Запрещённые варианты (aliases) | Статус      |
| ------------------------------------ | --------------------- | ------------------------------ | ----------- |
| экспертиза                           | expertise             | —                              | `candidate` |
| содержательный                       | substantive           | —                              | `candidate` |
| руководитель (промежуточный уровень) | manager               | supervisor, coordinator        | `candidate` |
| диагностика                          | diagnostics           | diagnosis                      | `candidate` |
| доказательный                        | evidence-based        | —                              | `candidate` |
| спорный                              | disputed              | —                              | `candidate` |
| объёмный                             | high-volume           | —                              | `candidate` |
| повторный вызов (REUSE)              | re-invocation         | —                              | `candidate` |
| причина                              | cause                 | —                              | `candidate` |
| Проектировщик (H1)                   | Architect             | —                              | `candidate` |
| Разработчик (H1)                     | Developer             | —                              | `candidate` |
| Технический писатель (H1)            | Technical writer      | —                              | `candidate` |
| Эксперт консилиума (H1)              | Council expert        | —                              | `candidate` |
| Исследователь (H1)                   | Researcher            | —                              | `candidate` |
| Инженер выпуска (H1)                 | Release engineer      | —                              | `candidate` |
| тестировщик (роль)                   | tester                | —                              | `candidate` |
| адресный                             | addressed             | —                              | `candidate` |
| каталог памяти                       | memory catalog        | —                              | `candidate` |
| самопроверка                         | self-verification     | —                              | `candidate` |
| перепроектирование                   | redesign              | —                              | `candidate` |
| незакоммиченное состояние            | uncommitted state     | —                              | `candidate` |
| чистка                               | cleaning              | —                              | `candidate` |
| авторизация                          | authorization         | —                              | `candidate` |
| состав выпуска                       | release scope         | composition                    | `candidate` |
| обзор                                | survey                | —                              | `candidate` |
| гипотеза                             | hypothesis            | —                              | `candidate` |
| воспроизведение                      | reproduction          | —                              | `candidate` |
| технические разрешения (host)        | technical permissions | —                              | `candidate` |
| обращение (вход /complain)           | submission            | —                              | `candidate` |
| экранирование                        | escaping              | —                              | `candidate` |
| результат записи                     | recording result      | outcome                        | `candidate` |

Примечания разведений G4: `специалист` → executor (specialist — алиас «эксперта», не использовать); `спавнить` → hire (spawn запрещён, прецедент G2 E3; наём — единственный глагол создания агентов); `ошибка (в артефакте, ревью)` → defect, дополняет §6b «ошибка (в ходе проверок) → failure»; `норма (обычное состояние)` → the norm (wolf-expert «node_modules-ссылки — норма»), `норма (правило)` → rule; `технические разрешения` — host-уровень (frontmatter permission), не «полномочия → mandate/rights» и не глагол permission; `composition` — запрещён: RU «состав выпуска» → release scope (прецедент G2 release-docs); `diagnosis` — запрещён для RU «диагностика» (канон diagnostics); для RU «разбор» (wolf-feedback, session-diagnosis) diagnosis — канон; строка «диагностика» — candidate (§6c), поэтому машинного запрета алиаса до её утверждения нет — разведение держат семантические ревью (находка G4-C1-R2, решение ведущего 2026-11-15).

## 6d. Кандидаты перевода G5 (плагины, 2026-11-15)

Термины кодовых комментариев и строк-инъекций плагинов (wolf-router, wolf-session-start). Все строки `candidate`. `spawn`/`spec`/`barrier`/`override`/`worker` — в «Исключениях» (технические употребления), строками не дублируются; «волна»/«выборка» не регистрировались — исторические маркеры разработки в комментариях (wave 1.1), не термины поставки.

| RU-термин            | EN-термин           | Запрещённые варианты (aliases) | Статус      |
| -------------------- | ------------------- | ------------------------------ | ----------- |
| барьер свежести      | freshness barrier   | —                              | `candidate` |
| недо-дедупликация    | under-deduplication | —                              | `candidate` |
| тест-шов             | test seam           | —                              | `candidate` |
| грабля               | pitfall             | —                              | `candidate` |
| потолок              | ceiling             | —                              | `candidate` |
| запечатанный         | sealed              | —                              | `candidate` |
| гвард                | guard               | —                              | `candidate` |
| отказ                | refusal             | —                              | `candidate` |
| диспетчерский контур | dispatching contour | —                              | `candidate` |
| воркер (worker-\*)   | worker              | —                              | `candidate` |
| Git-финал            | Git finale          | —                              | `candidate` |
| тихий скип           | silent skip         | —                              | `candidate` |

## Исключения (общие английские слова, не маркеры дрейфа)

AC REQ-04: «список исключений — в самом глоссарии». Эти алиасы — обычная
лексика кода, имён полей CLI, статусов протокола агентов и путей. Они
останутся в шаблонах и после перевода, поэтому не считаются нарушением
консистентности. Каждая строка: `` `alias` — основание ``.

- `assertion` — общетехнический термин тестирования (test-driven-development), не «claim».
- `entry` — поле кода и термин лоадера (`entry` в плагинах), не «note».
- `guide` — часть пути/имени файла (`migration-guide`, `docs/reference`), не «playbook».
- `freeze` — комментарий Python-хелпера о заморозке записи в логе (`kill/reap freezes the log`), не «protect».
- `hold` — обычный глагол «содержит, удерживает» (`the lead holds context`), не protect/keep.
- `trail` — часть термина `acceptance trail` (след приёмки), не «trace».
- `coordinator` — третья роль жалобного контура (wolf-feedback references), не lead/dispatcher; разведение §6a, употребление подтверждено ревью G2-C1-R2.
- `edge` — ребро графа памяти (wolf-council), не алиас «связь → relation»; разведение §6a.
- `supervisor` — руководитель-испытатель в writing-skills, не синоним lead; разведение §6a.
- `consultation` — «одиночная консультация» в wolf-council (RU «консультация» ≠ «консилиум» → council); разведение §6a.
- `removal` — буквальное удаление модуля в wolf-software-design («Removal check»), не алиас «устаревание → deprecation»; решение ведущего 2026-11-15, употребление сверено с RU-оракулом.
- `installation` — «установка» в перечне риск-линз wolf-review (RU «установке»), не алиас «инициализация → init»; понятия разведены решением ведущего 2026-11-15.
- `testing` — деятельность прогонов тестов (RU «тестирование», test-driven-development: «ради удобства тестирования»), не алиас «проверка → verification»; разведение: проверка→verification, тестирование→testing, решение ведущего 2026-11-15.
- `retention` — «хранение (данных)» в git-регламенте (§14.1 «Политика хранения» → Retention policy), не алиас «оставить (локальный вариант) → keep»; разведение решением ведущего 2026-11-15.
- `distribution` — статистическое распределение (wolf-user-report, таблица визуальных представлений), не алиас «доставка/поставка → delivery»; разведение решением ведущего 2026-11-15.
- `conversation` — RU «разговор» (mr-wolf: «сокращает разговор, не отменяет сверку»), не алиас «диалог → dialogue»; RU различает разговор/диалог, разведение решением ведущего 2026-11-15.
- `spawn` — запуск дочернего процесса (`child_process`/execFile: «CLI spawn», «inherited across spawns» в плагинах G5), не алиас «спавнить/нанимать (агента) → hire»; разведение: наём агентов — hire, процессы — spawn, решение ведущего 2026-11-15.
- `spec` — design-спека (ссылка на документ: «spec §5.4» в шапке плагинов G5), не алиас «требование → requirement»; разведение решением ведущего 2026-11-15.
- `barrier` — freshness barrier (механизм кэша wolf-router: живой поиск раз в сессию), не алиас «гейт → gate»; разведение решением ведущего 2026-11-15.
- `override` — модификатор TS и обычный глагол («the fallback search does not override the outcome»), не «замена версии записи → supersede»; разведение решением ведущего 2026-11-15.
- `embed` — обычный глагол «встраивает» (`the lead embeds conclusions`), не «injection».
- `overwrite` — обычный глагол «перезаписывает» в правилах проекта, не «take».
- `proof` — часть оборота `proof of success` (подтверждение результата), не «evidence».
- `statement` — обычное слово «формулировка, изложение» (`in one verifiable statement`), не «claim».
- `settle` — обычный глагол «уладить, разрешить» в общем смысле, не `resolve` upgrade.
- `identity` — имя функции в helper-скрипте (git identity), не «face».
- `limit` — SQL `LIMIT`, `LIMITS` в формате RESULT, не «boundary».
- `link` — системный вызов `os.link`, не «relation».
- `lock` — `git worktree lock`, `lockfile` в правилах проекта, не «protect/pin».
- `log` — имена каталогов и файлов отчётов (`report/log/script`), не «trace».
- `manager` — `package manager` в правилах проекта, не «lead».
- `observation` — тип факта в политике git, не «note».
- `permission` — ключ front-matter агентов (`permission:`), не «mandate».
- `policy` — имя файла политики (`git-collaboration-policy`), не «rule».
- `reference` — тип пути документации (`docs/reference`), не «relation».
- `registry` — `tag/registry/выпуск`, реестр образов CI, не «park».
- `replace` — операция замены экземпляра (`replace` через handoff), не «supersede».
- `resolution` — поле записи и статуса жалобы (`resolution=`), не «decision».
- `role` — поле протокола поручения (`truth_role`, `role` в task-pack), не «profile».
- `run` — `subprocess.run` и `npm run`, не «pass».
- `setup` — стадия теста (`setup/cleanup`), не «init».
- `snapshot` — вид проверки и заголовок передачи (`## Snapshot`), не «checkpoint».
- `suggestion` — значение `KIND(...|suggestion)` в формате FINDING, не «proposal».
- `summary` — раздел формата RESULT (`SUMMARY/VERDICT/...`), не «synthesis».
- `tag` — `git tag`, `release_tag`, не «facet».
- `target` — `target` в скриптах и `target`-уровень жалобы, не «goal».
- `update` — команда `wolf update`, событие протокола `UPDATE`, не «upgrade».
- `verify` — опция git (`rev-parse --verify`), не «validation».
- `version` — поле `schema_version`, ключи формата, не «release».
- `worker` — маркер модели в front-matter агентов (`{{model.worker}}`), не «executor».

## Без машинного EN-контроля (граница охвата гейта 4)

Строки, у которых не остаётся пригодного английского алиаса: любой кандидат —
либо канон другой строки, либо техническое употребление в коде (поле, команда,
путь), либо общее английское слово, которое законно встретится в переводе и
покраснит гейт на ровном месте. Английский дрейф здесь неотличим от канона
машинно — эти термины держатся циклами REQ-05 (семантическое ревью против
RU-оригинала) и ревью глоссария. Русские алиасы этих строк продолжают
работать и держатся гейтом 1 (0 кириллицы). Каждая строка:
`` `RU-термин` — причина ``.

- `правило` — `policy` занят именем файла политики (git-collaboration-policy).
- `плейбук` — `guide` — часть пути (`migration-guide`).
- `фасет` — `tag` — `git tag`/`release_tag`.
- `мандат` — `permission` — ключ front-matter агентов (`permission:`).
- `фрейм (рамка агента)` — `frame`/`skeleton` совпадают с техническим
  употреблением и с каноном другой строки.
- `обновление (проектов/CLI)` — `update` — команда `wolf update`.
- `проход обновления` — `run` — `npm run`/`subprocess.run`.
- `парк (проектов)` — `registry` — реестр образов CI.
- `ревью` — `review` — канон; иных термин-специфичных вариантов нет.
- `чекпоинт` — `snapshot` — заголовок передачи (`## Snapshot`) и вид проверки.
- `план` — `plan` — канон; `roadmap` — общая проектная лексика.
- `профиль (поручения)` — `role` — поле протокола поручения (`role:`).
- `валидация` — `verify` — опция git (`rev-parse --verify`).
- `граница` — `limit` — `LIMITS` формата RESULT и SQL `LIMIT`.
- `область (задачи)` — `scope` — канон; иных термин-специфичных вариантов нет.
- `разрешение (конфликта upgrade)` — `settle` ушёл в «Исключения»; канон `resolve` —
  команда/режим, не запрет; иных вариантов нет.
- `защитить (файл)` — `freeze`/`hold`/`lock` в «Исключениях» (обычные глаголы и
  `git worktree lock`); канон `protect` — свойство файла, не запрет.
- `запись (тип памяти)` — `record`/`entry`/`observation` заняты кодом
  (`record` в helper-скриптах, `entry` в лоадере плагинов).
- `релиз` — `version` — поле формата (`schema_version`); `rollout` — общее.
- `связь (между записями)` — `link`/`edge`/`reference` — технические употребления
  из «Исключений» (`os.link`, ребро графа памяти, `docs/reference`); EN-варианта
  без коллизии нет; контроль — гейт 1 (RU-термин в переводах) и ревью REQ-05.
- `сессия` — `conversation` ушёл в «Исключения» (RU «разговор» ≠ «диалог»,
  mr-wolf); `чат`/`диалог` — русские алиасы, держатся гейтом 1.
- `инициализация` — `setup` (стадия теста) и `installation` (риск-линза
  wolf-review) в «Исключениях»; русский алиас `установка` держится гейтом 1.
- `оставить (локальный вариант)` — `retention` (Retention policy git-регламента)
  и `hold` (обычный глагол) в «Исключениях»; русский алиас `сохранить` — гейт 1.
- `проверка` — `testing` в «Исключениях» (RU «тестирование» — деятельность
  прогонов), `validation (как перевод проверки)` — условный алиас (машинно
  неотличим от канона), русский алиас `контроль` держится гейтом 1.
- `замена (версии записи)` — `replace` (операция замены экземпляра) и
  `override` (модификатор TS, обычный глагол) в «Исключениях»; русский алиас
  `устаревание` держится гейтом 1; контроль — ревью REQ-05.
- `нанимать (исполнителя)` — `spawn` ушёл в «Исключения» (дочерний процесс
  ≠ наём агента); русские алиасы `спавнить`/`инстанцировать` держатся
  гейтом 1; контроль — ревью REQ-05.

## Орфографический канон (EN)

Зафиксировано до G2: смешанный регистр встречается и в `docs/site`, поэтому
правило принимается явно — оксфордская норма (British -ise/-our невозможна,
`behaviour` отклонён).

| Вариант                 | Канон                 | Запрещено  | Статус |
| ----------------------- | --------------------- | ---------- | ------ |
| authorized / authorised | **authorized** (−ize) | authorised | `-`    |
| behavior / behaviour    | **behavior** (−or)    | behaviour  | `-`    |
| artifact / artefact     | **artifact**          | artefact   | `-`    |
| canceled / cancelled    | **canceled**          | cancelled  | `-`    |

Основание: в `templates/` уже доминирует −ize/−or (authorized ×3, behavior ×3);
выбор фиксируется сейчас, пока G1 единственный переведённый слой и правка дешёвая.

## Решения по спорным терминам (утверждены владельцем 2026-11-12)

- «мандат» → **mandate**: подтверждено; в существующей EN-документации сайта
  термин не встречается, канон выбран по смыслу.
- «прокладка (связей плагина)» → **wiring**: подтверждено; RU-эквивалент
  в шаблонах не зафиксирован, термин взят из design-контракта волны.

## Журнал изменений

- 2026-11-14 — перевод G2 (T-16, блоки E1–E5): 27 файлов; в глоссарий добавлена
  §6a — 63 candidate-строки из отчётов переводчиков (после дедупликации), разведения
  edge/summary/policy/receiver/coordinator/supervisor зафиксированы примечаниями;
  шапка уточнена по замечанию ревьюера G1 (approved vs candidate).
- 2026-11-12 — утверждено владельцем: 80 строк `candidate` → `approved`,
  статус файла `approved`, спорные термины mandate/wiring подтверждены.
- 2026-11-12 — снята коллизия G0-цикла: строка «задача (поручение) → task»
  сужена до «задача (единица работы) → task», а «мандат» расширен до
  «мандат / поручение (акт назначения) → mandate» с алиасами assignment,
  delegation. Один EN-канон на оба русских смысла акта назначения.
- 2026-11-11 — начальная редакция: 80 терминов, все `candidate`.
