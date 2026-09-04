# Справочник CLI

Быстрый индекс всех 39 команд `wolf`. Каждая строка ведёт на описание команды; заголовки разделов — на страницы разделов.

## Память

| Команда                                                         | Что делает                              | Страница                       |
| --------------------------------------------------------------- | --------------------------------------- | ------------------------------ |
| [`wolf add`](/ru/guide/cli/memory#wolf-add)                     | Добавить объект памяти                  | [Память](/ru/guide/cli/memory) |
| [`wolf list`](/ru/guide/cli/memory#wolf-list)                   | Список объектов памяти                  | [Память](/ru/guide/cli/memory) |
| [`wolf get`](/ru/guide/cli/memory#wolf-get)                     | Получить объект по id                   | [Память](/ru/guide/cli/memory) |
| [`wolf search`](/ru/guide/cli/memory#wolf-search)               | Поиск по объектам памяти (FTS)          | [Память](/ru/guide/cli/memory) |
| [`wolf supersede`](/ru/guide/cli/memory#wolf-supersede)         | Заменить объект памяти другим           | [Память](/ru/guide/cli/memory) |
| [`wolf transition`](/ru/guide/cli/memory#wolf-transition)       | Сменить статус жизненного цикла объекта | [Память](/ru/guide/cli/memory) |
| [`wolf rebuild-index`](/ru/guide/cli/memory#wolf-rebuild-index) | Перестроить SQLite-индекс поиска        | [Память](/ru/guide/cli/memory) |

## Сессии и контекст

| Команда                                                         | Что делает                                                        | Страница                                            |
| --------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| [`wolf scan`](/ru/guide/cli/sessions-context#wolf-scan)         | Сканировать проект и сохранить снимок контекста                   | [Сессии и контекст](/ru/guide/cli/sessions-context) |
| [`wolf brief`](/ru/guide/cli/sessions-context#wolf-brief)       | Бриф агента по последнему scan + памяти                           | [Сессии и контекст](/ru/guide/cli/sessions-context) |
| [`wolf recap`](/ru/guide/cli/sessions-context#wolf-recap)       | Сводка активной памяти: правила, треды, блокеры, вопросы, решения | [Сессии и контекст](/ru/guide/cli/sessions-context) |
| [`wolf call`](/ru/guide/cli/sessions-context#wolf-call)         | Получить активные call-инъекции (cold-start)                      | [Сессии и контекст](/ru/guide/cli/sessions-context) |
| [`wolf insights`](/ru/guide/cli/sessions-context#wolf-insights) | Эвристический анализ памяти (Level 1, без LLM)                    | [Сессии и контекст](/ru/guide/cli/sessions-context) |
| [`wolf session`](/ru/guide/cli/sessions-context#wolf-session)   | Сессии и чекпоинты                                                | [Сессии и контекст](/ru/guide/cli/sessions-context) |
| [`wolf diff`](/ru/guide/cli/sessions-context#wolf-diff)         | Изменения треда с чекпоинта                                       | [Сессии и контекст](/ru/guide/cli/sessions-context) |
| [`wolf solve`](/ru/guide/cli/sessions-context#wolf-solve)       | Собрать solve pack для проблемы памяти                            | [Сессии и контекст](/ru/guide/cli/sessions-context) |

## Управление работой

| Команда                                                                | Что делает            | Страница                                            |
| ---------------------------------------------------------------------- | --------------------- | --------------------------------------------------- |
| [`wolf thread`](/ru/guide/cli/work-management#wolf-thread)             | Рабочие треды         | [Управление работой](/ru/guide/cli/work-management) |
| [`wolf decision`](/ru/guide/cli/work-management#wolf-decision)         | Решения               | [Управление работой](/ru/guide/cli/work-management) |
| [`wolf blocker`](/ru/guide/cli/work-management#wolf-blocker)           | Блокеры               | [Управление работой](/ru/guide/cli/work-management) |
| [`wolf info-request`](/ru/guide/cli/work-management#wolf-info-request) | Запросы информации    | [Управление работой](/ru/guide/cli/work-management) |
| [`wolf article`](/ru/guide/cli/work-management#wolf-article)           | Статьи (знания)       | [Управление работой](/ru/guide/cli/work-management) |
| [`wolf rule`](/ru/guide/cli/work-management#wolf-rule)                 | Правила               | [Управление работой](/ru/guide/cli/work-management) |
| [`wolf relation`](/ru/guide/cli/work-management#wolf-relation)         | Связи между объектами | [Управление работой](/ru/guide/cli/work-management) |

## Мышление и совет

| Команда                                                       | Что делает                                    | Страница                                           |
| ------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------- |
| [`wolf think`](/ru/guide/cli/thinking-council#wolf-think)     | Структурированные последовательности мышления | [Мышление и совет](/ru/guide/cli/thinking-council) |
| [`wolf council`](/ru/guide/cli/thinking-council#wolf-council) | Операции совета                               | [Мышление и совет](/ru/guide/cli/thinking-council) |

## Самообучение

| Команда                                                           | Что делает                                                                                        | Страница                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------- |
| [`wolf learn`](/ru/guide/cli/learning#wolf-learn)                 | Контур самообучения: digest паттернов, здоровье сигнального лога, draft propose/validate/activate | [Самообучение](/ru/guide/cli/learning) |
| [`wolf effectiveness`](/ru/guide/cli/learning#wolf-effectiveness) | Панель эффективности памяти: rules holdout, tool economy, доставка, шум, роутинг                  | [Самообучение](/ru/guide/cli/learning) |
| [`wolf complain`](/ru/guide/cli/learning#wolf-complain)           | Записать жалобу на поведение агента/методики                                                      | [Самообучение](/ru/guide/cli/learning) |

## Аналитика

| Команда                                                    | Что делает                                                                                                                                   | Страница                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| [`wolf analytics`](/ru/guide/cli/analytics#wolf-analytics) | Аналитика эффективности: ledger'ы памяти/инструментов/правил, воронка, агенты, steward view, консилиумы, выбросы, готовность к экспериментам | [Аналитика](/ru/guide/cli/analytics) |
| [`wolf dashboard`](/ru/guide/cli/analytics#wolf-dashboard) | Консольный дашборд: health, ledgers, trends                                                                                                  | [Аналитика](/ru/guide/cli/analytics) |

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
| [`wolf run`](/ru/guide/cli/platform#wolf-run)             | Запустить opencode с моделью из routing-объекта Wolf                | [Платформа и обслуживание](/ru/guide/cli/platform) |
