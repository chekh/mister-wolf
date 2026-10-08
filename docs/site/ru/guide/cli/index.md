# Справочник CLI

Быстрый индекс команд `wolf`: видимый слой плюс advanced plumbing (скрыт из `--help`). Каждая строка ведёт на описание команды; заголовки разделов — на страницы разделов.

Доставка playbook'ов агентам opencode — плагин `wolf-router`, инъецирующий актуальный playbook в system-промпт, — разобрана отдельно: [Доставка](/ru/guide/delivery).

## Память

| Команда                                                         | Что делает                                  | Страница                       |
| --------------------------------------------------------------- | ------------------------------------------- | ------------------------------ |
| [`wolf add`](/ru/guide/cli/memory#wolf-add)                     | Добавить объект памяти                      | [Память](/ru/guide/cli/memory) |
| [`wolf list`](/ru/guide/cli/memory#wolf-list)                   | Список объектов памяти                      | [Память](/ru/guide/cli/memory) |
| [`wolf get`](/ru/guide/cli/memory#wolf-get)                     | Получить объект по id                       | [Память](/ru/guide/cli/memory) |
| [`wolf search`](/ru/guide/cli/memory#wolf-search)               | Поиск по объектам памяти (FTS)              | [Память](/ru/guide/cli/memory) |
| [`wolf edit`](/ru/guide/cli/memory#wolf-edit)                   | Править заголовок и/или текст объекта       | [Память](/ru/guide/cli/memory) |
| [`wolf archive`](/ru/guide/cli/memory#wolf-archive)             | Заархивировать объект памяти                | [Память](/ru/guide/cli/memory) |
| [`wolf supersede`](/ru/guide/cli/memory#wolf-supersede)         | Заменить объект памяти другим (plumbing)    | [Память](/ru/guide/cli/memory) |
| [`wolf transition`](/ru/guide/cli/memory#wolf-transition)       | Сменить статус жизненного цикла (plumbing)  | [Память](/ru/guide/cli/memory) |
| [`wolf rebuild-index`](/ru/guide/cli/memory#wolf-rebuild-index) | Перестроить SQLite-индекс поиска (plumbing) | [Память](/ru/guide/cli/memory) |
| [`wolf update`](/ru/guide/cli/memory#wolf-update)               | Обновить triage-поля объекта (plumbing)     | [Память](/ru/guide/cli/memory) |

## Сессии и контекст

| Команда                                                       | Что делает                                                        | Страница                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| [`wolf scan`](/ru/guide/cli/sessions-context#wolf-scan)       | Сканировать проект и сохранить снимок контекста (plumbing)        | [Сессии и контекст](/ru/guide/cli/sessions-context) |
| [`wolf brief`](/ru/guide/cli/sessions-context#wolf-brief)     | Бриф агента по последнему scan + памяти                           | [Сессии и контекст](/ru/guide/cli/sessions-context) |
| [`wolf recap`](/ru/guide/cli/sessions-context#wolf-recap)     | Сводка активной памяти: правила, треды, блокеры, вопросы, решения | [Сессии и контекст](/ru/guide/cli/sessions-context) |
| [`wolf call`](/ru/guide/cli/sessions-context#wolf-call)       | Получить активные call-инъекции (cold-start)                      | [Сессии и контекст](/ru/guide/cli/sessions-context) |
| [`wolf session`](/ru/guide/cli/sessions-context#wolf-session) | Итоговые сводки сессий (plumbing)                                 | [Сессии и контекст](/ru/guide/cli/sessions-context) |
| [`wolf diff`](/ru/guide/cli/sessions-context#wolf-diff)       | Изменения треда с чекпоинта (plumbing)                            | [Сессии и контекст](/ru/guide/cli/sessions-context) |
| [`wolf solve`](/ru/guide/cli/sessions-context#wolf-solve)     | Собрать solve pack для проблемы памяти (plumbing)                 | [Сессии и контекст](/ru/guide/cli/sessions-context) |

## Управление работой

| Команда                                                                                                                                            | Что делает                                                                   | Страница                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| [`wolf thread`](/ru/guide/cli/work-management#wolf-thread)                                                                                         | Рабочие треды                                                                | [Управление работой](/ru/guide/cli/work-management) |
| [`wolf decision`](/ru/guide/cli/work-management#wolf-decision)                                                                                     | Решения                                                                      | [Управление работой](/ru/guide/cli/work-management) |
| [`wolf rule`](/ru/guide/cli/work-management#wolf-rule)                                                                                             | Правила                                                                      | [Управление работой](/ru/guide/cli/work-management) |
| [`wolf lesson`](/ru/guide/cli/memory#wolf-add), [`wolf complaint`](/ru/guide/cli/memory#wolf-add), [`wolf note`](/ru/guide/cli/memory#wolf-add), … | Типовые неймспейсы, генерируемые из таксономии: `add`, `list` с флагами типа | [Память](/ru/guide/cli/memory)                      |
| [`wolf relation`](/ru/guide/cli/work-management#wolf-relation)                                                                                     | Связи между объектами                                                        | [Управление работой](/ru/guide/cli/work-management) |
| [`wolf complain`](/ru/guide/cli/work-management#wolf-complain)                                                                                     | Жалоба на правило/playbook/агента                                            | [Управление работой](/ru/guide/cli/work-management) |

## Мышление

| Команда                                                   | Что делает                                    | Страница                                   |
| --------------------------------------------------------- | --------------------------------------------- | ------------------------------------------ |
| [`wolf think`](/ru/guide/cli/thinking-council#wolf-think) | Структурированные последовательности мышления | [Мышление](/ru/guide/cli/thinking-council) |

## Аналитика

| Команда                                                                 | Что делает                                                                                                                 | Страница                             |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| [`wolf analytics`](/ru/guide/cli/analytics#wolf-analytics)              | Аналитика эффективности: ledger'ы памяти/инструментов/правил, воронка, агенты, steward view, консилиумы, выбросы, кампании | [Аналитика](/ru/guide/cli/analytics) |
| [`wolf task-eval`](/ru/guide/cli/analytics#скрытые-синонимы-deprecated) | Записать вердикт по задаче в сигнальный лог — acceptance-метрики, coverage (скрытый plumbing)                              | [Аналитика](/ru/guide/cli/analytics) |

## Платформа и обслуживание

| Команда                                                   | Что делает                                                          | Страница                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------- |
| [`wolf init`](/ru/guide/cli/platform#wolf-init)           | Инициализировать память Mr. Wolf для проекта                        | [Платформа и обслуживание](/ru/guide/cli/platform) |
| [`wolf bootstrap`](/ru/guide/cli/platform#wolf-bootstrap) | Сканировать проект и создать черновую стартовую память              | [Платформа и обслуживание](/ru/guide/cli/platform) |
| [`wolf mcp`](/ru/guide/cli/platform#wolf-mcp)             | Запустить MCP-сервер (stdio)                                        | [Платформа и обслуживание](/ru/guide/cli/platform) |
| [`wolf scaffold`](/ru/guide/cli/platform#wolf-scaffold)   | Создать рамку платформы opencode (agent\|skill\|command) + playbook | [Платформа и обслуживание](/ru/guide/cli/platform) |
| [`wolf tool`](/ru/guide/cli/platform#wolf-tool)           | Библиотекарь инструментов                                           | [Платформа и обслуживание](/ru/guide/cli/platform) |
| [`wolf taxonomy`](/ru/guide/cli/platform#wolf-taxonomy)   | Таксономия памяти                                                   | [Платформа и обслуживание](/ru/guide/cli/platform) |
| [`wolf migrate`](/ru/guide/cli/platform#wolf-migrate)     | Разовая миграция layout                                             | [Платформа и обслуживание](/ru/guide/cli/platform) |
| [`wolf validate`](/ru/guide/cli/platform#wolf-validate)   | Проверить целостность хранилища                                     | [Платформа и обслуживание](/ru/guide/cli/platform) |
| [`wolf doctor`](/ru/guide/cli/platform#wolf-doctor)       | Проверить все зарегистрированные проекты                            | [Платформа и обслуживание](/ru/guide/cli/platform) |
| [`wolf sync`](/ru/guide/cli/platform#wolf-sync)           | Перерендерить базовый набор Wolf (память не трогается)              | [Платформа и обслуживание](/ru/guide/cli/platform) |
| [`wolf upgrade`](/ru/guide/cli/platform#wolf-upgrade)     | Обновить глобальную установку wolf до последней npm-версии          | [Платформа и обслуживание](/ru/guide/cli/platform) |
