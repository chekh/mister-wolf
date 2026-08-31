---
layout: home

hero:
  name: Mr. Wolf
  text: Память проекта, которая переживает сессию
  tagline: Local-first память для AI-агентов — CLI + MCP, без облака.
  actions:
    - theme: brand
      text: Начать работу
      link: /ru/guide/getting-started
    - theme: alt
      text: Справочник CLI
      link: /ru/guide/cli
    - theme: alt
      text: GitHub
      link: https://github.com/chekh/mister-wolf

features:
  - title: Локальное хранение
    details: 'Вся память живёт в .wolf/ внутри проекта: markdown-объекты, связи, SQLite-индекс. Данные не покидают машину, облако не нужно.'
    link: /ru/guide/configuration
  - title: CLI + MCP
    details: Бинарь wolf с полным набором команд и MCP-сервер с 21 инструментом (mr-wolf_*). Одна и та же память — из терминала и от агента.
    link: /ru/guide/mcp
  - title: Call-инъекции
    details: 'wolf call собирает актуальные правила, уроки и блокеры в начало сессии: --for для темы, --thread для треда, --compact для бюджета символов.'
    link: /ru/guide/core-concepts
  - title: Lifecycle и governance
    details: 25 типов объектов, 16 статусов, supersede-цепочки версий и оси governance (memory_class, truth_role, lifetime) — чтобы память не превращалась в шум.
    link: /ru/guide/core-concepts
  - title: Правила, треды, блокеры
    details: 'Рабочие процессы — тоже память: work-thread, decision, blocker, rule, info-request создаются командами wolf и читаются агентами через MCP.'
    link: /ru/guide/cli
  - title: Самообучение
    details: 'wolf learn: паттерны ошибок → draft урока → Sandbox Replay Holdout → активация с гейтом. Знания проверяются, а не выдумываются.'
    link: /ru/guide/cli
---

## Почему

AI-агенты решают задачи, но их опыт испаряется вместе с сессией. Mr. Wolf — local-first слой памяти для AI-кодинга: единая точка правды проекта, в которую агенты пишут опыт и из которой получают контекст. Не оркестратор и не ещё один агент — субстрат под любого агента. Накопление вместо испарения: решения, уроки, инструменты и процессы остаются в проекте после сессии и делают следующую задачу дешевле.

| Проблема                            | Проявление                       |
| ----------------------------------- | -------------------------------- |
| Контекст теряется между сессиями    | агент начинает с нуля            |
| Опыт не переиспользуется            | повторные задачи решаются заново |
| Документы живут отдельно от агентов | единой точки правды нет          |
| Накопленное становится шумом        | память растёт, ценность падает   |

Как подключить Wolf к проекту — в [Начале работы](/ru/guide/getting-started).
