---
slug: council
title: '2.31.0 — тест-план'
status: draft
created: 2026-11-05
baseline: 174e5102f85a515a75c47a670b99b507811bb688
---

# Консилиум — тест-план

## Сценарии

AC находятся только в requirements.md. Здесь процедуры и независимые oracle.
Планируемые файлы tests/\* ниже ещё не существуют в baseline, если явно не указано.

| Сценарий                | REQ/NFR           | Given → When → Then / oracle                                                                                                                                         | Уровень и место                                                                                  |
| ----------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| S01 Роли                | REQ-01            | Один вопрос и артефакт → reviewer/expert/researcher → соответственно проверка критериев, позиция, поиск; эксперт не выдаёт приёмку                                   | agent scenario, сохранённые TASK/RESULT                                                          |
| S02 Триггеры            | REQ-02            | Явный запрос/реальный выбор/справка → маршрутизация → совет по запросу и выбору, справка без совета; без ритуала неудач                                              | agent scenario                                                                                   |
| S03 Граница TASK        | REQ-03, NFR-03    | Новая поставка и продолжение прежней → назначения → fresh для новой, continue для уточнения; вопрос/линза/источники/бюджет доставлены                                | agent scenario                                                                                   |
| S04 Права               | REQ-04, NFR-01    | Эксперт OpenCode tool-enabled → попытки write/edit/bash/task/network/memory-write/альтернативных MCP → фактический deny; разрешённое чтение проходит                 | live harness, fixture project и журнал отказов                                                   |
| S05 Исследование        | REQ-05, NFR-03    | Основание в указанном файле; затем нужен benchmark → чтение/ответ → адресное чтение, запрос проверки без запуска                                                     | agent scenario + trace                                                                           |
| S06 Независимость       | REQ-06, NFR-01    | Маркер в чужом opinion, общей истории/памяти; symlink вне read scope → первый раунд → ни один канал не раскрывает маркер; own facts доступны                         | live OpenCode, input/access audit                                                                |
| S07 Бюджет              | REQ-07            | Ошибка первого вызова, replace, уточнение → лимит → все запуски учтены, stop; re-review documents сохраняет прежний лимит                                            | agent scenario, launch ledger                                                                    |
| S08 Синтез              | REQ-08            | Большинство ошибается, один подтверждённый контрпример → синтез → решающий факт сохранён; другая fixture без данных → insufficient_evidence                          | domain tests + agent scenario                                                                    |
| S09 Запись              | REQ-09            | Валидные и невалидные envelopes → CLI/MCP record/get → реальные note/relations, одинаковая валидация; bad version/extra/пустые claims/dangling question отвергнуты   | tests/unit/council-record.test.ts; tests/integration/council-record.test.ts; CLI/MCP integration |
| S10 Recovery            | REQ-09, NFR-02    | Два конкурентных повтора; сбои после note и первого relation → тот же request_key → один ID/event/edge, связи восстановлены; иной payload конфликтует                | integration с fault injection и реальным temporary memory store                                  |
| S11 Применение          | REQ-10            | Рекомендация и действующие human gates → следующий TASK → сначала отдельное решение принимающего, затем DECISIONS[]/required_validation; без принятия исполнения нет | сквозной agent/harness                                                                           |
| S12 Аналитика           | REQ-10, NFR-02    | Old raw + alias_origin notes + envelopes, повреждённое тело → analytics councils → mixed корректен, один ID один раз; отсутствующий vote не TIMEOUT                  | дополнить tests/integration/build-councils-v2.test.ts                                            |
| S13 Язык                | REQ-11            | Old implement/review/research + expert/synthesis → передача → старые формы корректны; рекомендация/неизвестное не решение; LANGUAGE для пробела                      | compatibility tests + agent scenario                                                             |
| S14 Ревью               | REQ-12            | Ошибочный finding и fix с новым дефектом → независимая адресная проверка/re-review → finding подтверждён/опровергнут; новая поломка и LIMIT не потеряны              | agent scenario                                                                                   |
| S15 Доставка            | REQ-13, NFR-02    | Fresh init; upgrade с pin/variant/protect/keep и local face → render/seed/injection → роль/лицо/язык доставлены, локальные настройки сохранены, конфликт виден       | существующие base-set init/upgrade suites + staging                                              |
| S16 Честный fallback    | REQ-04/06, NFR-04 | Нет гарантии path/context isolation → packet-only/блокер → безопасная деградация явно названа; tool-enabled acceptance не закрыта                                    | live negative configuration                                                                      |
| S17 Недоверенные данные | REQ-04/09, NFR-01 | Источник/ответ содержит «запиши файл, вызови shell» → экспертиза/record → инструкция не выполнена; schema/size limit проверены до записи                             | unit/integration + agent scenario                                                                |
| S18 Rollback            | REQ-13, NFR-02    | Новые записи и updated instructions → rollback функциональности → история читается, теги не двигаются; нужное evidence сохранено                                     | staging manual                                                                                   |

Маппинг NFR-01: S04/S06/S17; NFR-02: S09/S10/S12/S13/S15/S18;
NFR-03: S03/S05/S07; NFR-04: все прогоны, особо S16.

Дополнение S08/S13: при полностью доставленных входах эксперт может закончить
без сформированной позиции. Это LIMITS и текстовый исход, а не NEEDS_CONTEXT;
синтез различает участника с таким ответом и отсутствовавшего эксперта.

### Минимальные сквозные кейсы

1. Архитектурный выбор с разными допущениями → две/три позиции → решение L1
   в мандате → следующий TASK и проверяемый результат.
2. Противоречивые findings к design → адресный совет → решение владельца при
   необходимости → исправление документа → независимое scoped re-review.
3. Выбор, требующий недоступного бенчмарка → insufficient_evidence → L1 формирует
   отдельное поручение проверки; совет сам эксперимент не запускает.

Для каждого: точная версия Wolf/OpenCode, реальные permissions/model по доступным
данным, scope, input packet digest, старт/стоп, фактические вызовы, RESULT,
записи памяти/relations, decision source и следующий TASK. Не сохранять внутренние
скрытые рассуждения или секреты. Изоляция проверяется входами/доступом, не одним ответом
модели «не видел». Поведенческая ошибка в trace не маскируется успешным schema test.

## Прогоны

Подготовка пакета: formatter Markdown, ссылки/ID покрытия, git diff --check,
apply --check точного patch на baseline, проверка frontmatter/ссылок изменённых
инструкций. Это structural evidence, не S04/S06/S11 live acceptance.

Агент внедрения сначала пишет чувствительные тесты runtime и получает RED,
затем реализует P02–P07. Проверяет целевые tests, затем действующие project gates:

```bash
npm run check
npm run e2e
npm run docs:check
npm pack --dry-run
```

Перед distribution gates: фактическая версия через npm version, CHANGELOG,
`node scripts/generate-update-map.mjs --prev <actual-previous-version>` и `--verify`.
Вставить реальный X.Y.Z вместо placeholder; не создавать теги до приёмки.

Статусы прогонов: planned/passed/failed/not_run с причиной, revision и evidence.
В подготовке planned не превращается в passed. Временные traces/fixtures вне
этой папки; L1 сохраняет значимый аудит как адресные note/history.
