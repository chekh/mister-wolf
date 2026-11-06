---
slug: patch-2-32-2-expert-read-channel
title: patch-2-32-2-expert-read-channel — требования и журнал изменений (fix-профиль)
status: draft
created: 2026-11-06
---

# patch-2-32-2-expert-read-channel — требования и журнал изменений (fix-профиль)

## 1. Контекст и проблема

6 ноября 2026 в проекте `Resadviser/trading-signal` консилиум по методике
`wolf-council` (три `worker-expert`) вышел packet-only: каждый вызов чтения
вернул `permission.rejected` / «Permission denied: read». Одна позиция из трёх
отсутствовала, одна осталась частичной — кодового подтверждения инвентаризации
зон не получили.

Причина (диагностика `mem_20261106_council-packet-only-diagnosis-20261106_1c939d`,
confidence 0.95): профиль `worker-expert` — `*|*|deny` плюс единственное
исключение `read packet/*`, а каталога `packet/` в проектах нет. Правило мёртвое.
Резолвер прав хозяина — last-match-wins, поэтому правила агента перекрывают
глобальный allow. Перечень путей текстом в TASK выдачей прав не является;
per-spawn выдачи allowlist хост не поддерживает.

Контрфакт: после добавления read-правил в project-local
`.opencode/agents/worker-expert.md` контрольная проба прочитала абсолютный путь
(ACCESS_OK). Опровергнутые гипотезы: модель/tool-use (у соседних
`worker-researcher` того же родителя и модели 112 и 70 успешных tool-вызовов,
0 ошибок) и изоляция конфигурации.

Воспроизведено в этом репозитории до правки: `opencode run --agent worker-expert`
→ `{"tool":"read","state":{"status":"error","error":"Permission denied: read"}}`.

Решение владельца `mem_20261106_expert-read-channel-fix-release-2-32-2_0f7dde`:
эксперты консилиума должны иметь рабочий read-канал в границах проекта;
исправить и выпустить фикс-релиз 2.32.2. Дефект поведения исправляется
действующим контуром (правка базового набора + штатная мутация живого лица
Стюардом), а не новым продуктовым исследованием.

Эффект на проект: без правки любой консилиум по коду либо теряет кодовую часть
позиций, либо вынуждает L1 вручную править project-local профиль агента в каждом
парке — то есть выдавать права в обход базового набора.

## 2. Функциональные требования

### REQ-01. Read-канал эксперта в границах проекта по умолчанию

`templates/base/agents/worker-expert.md` выдаёт рабочий read-канал: чтение файлов
проекта, включая код, и discover-инструменты (`glob`/`grep`), иначе эксперт не
найдёт нужный файл. Мёртвое правило `read packet/*` удалено.

AC-01.1. `opencode debug agents` в проекте показывает у `worker-expert`
эффективные allow для `read`/`glob`/`grep`. Проверено: `read src/…` → allow,
`glob *` → allow, `grep *` → allow.

AC-01.2. Живая проба: спавн `worker-expert` с TASK «прочитай адресный файл
проекта и верни строку N» возвращает факт содержимого (саму строку), а не
описание намерения. Проверено на `src/domain/face-body.ts:57`.

AC-01.3. Выдача находится в базовом наборе, а не в project-local правке: у всех
проектов после `wolf upgrade` канал работает без ручных действий.

### REQ-02. Границы канала не расширяются

Запись, shell, субагенты, webfetch/websearch, браузер, скиллы и чтение вне
проекта остаются запрещены. Env-файлы остаются под `ask`-защитой: широкое
read-allow не должно открывать их молча.

Границу чтения образуют две половины, и обе обязательны: `external_directory`
отклоняет пути вне проекта (это проверяет host), а symlink host при этой
проверке НЕ разрешает — ссылка внутри проекта, ведущая наружу, читается как
внутренний путь. Поэтому изоляция дополнительно требует аудита ссылок до
запуска: ни одна ссылка внутри проекта не должна разрешаться за его пределы.
Аудит проверяет именно разрешение наружу, а не факт наличия ссылки: в любом
Node-проекте есть ссылки `node_modules/.bin`, и правило «ни одной ссылки»
сделало бы канал непригодным всегда.

AC-02.1. `opencode debug agents` показывает deny для `edit`/`shell`/`subagent`/
`webfetch`/`websearch`/`browser`/`skill` и для `external_directory`.

AC-02.2. Живая проба: попытка записи, shell, чтения вне проекта и субагента
отклонена; инструменты записи/shell/субагентов в наборе сессии отсутствуют,
`external_directory` даёт явный отказ.

AC-02.3. Ask-правила `*.env` и `*.env.*` размещены ПОСЛЕ широкого read-allow
в том же массиве (last-match-wins — порядок и есть защита); живая проба чтения
`.env.probe-guard` и `sub.env` отклонена ask-защитой, содержимое не утекло.

AC-02.4. Методика, рамка профиля и документация называют обе половины границы
и требуют аудита разрешения ссылок; документация не обещает границу, которую
host не обеспечивает.

### REQ-03. Обязательная функциональная проба канала в методике консилиума

`templates/base/skills/wolf-council/SKILL.md` добавляет пробу перед первым
раундом, отдельную от symlink-аудита, и явно фиксирует, что перечень путей
в TASK не является выдачей прав.

AC-03.1. Проба успешна только при факте содержимого; `permission.rejected`,
отсутствие tool-вызова, `NEEDS_CONTEXT`/`LIMITS` — канал не tool-enabled.

AC-03.2. Аудит symlink и функциональная проба названы разными проверками, одна
другую не заменяет.

AC-03.3. Явно сказано: «перечень путей в TASK выдачей прав не является».

### REQ-04. Признак канала в отчёте эксперта

Профиль `expert` в `templates/base/skills/using-skills/references/contracts.md`
требует первой строкой RESULT назвать фактический `channel`
(`packet-only` | `tool-enabled` | `denied`); при `channel != tool-enabled`
`isolation_limits` обязателен. В `wolf-council` SKILL.md `isolation_limits`
обязателен для синтеза при нетool-enabled позиции.

AC-04.1. Контракты и методика содержат требуемые формулировки; `channel` не
меняет статусы RESULT.

AC-04.2. `channel` в opinion-payload (`src/app/use-cases/record-council.ts`) —
опциональное аддитивное поле; исторические envelope без него валидны,
v2-схема и `question_revision` не изменены, миграций нет.

### REQ-05. Живое лицо и seed-шаблон согласованы

Живое лицо `owner_skill=worker-expert` (`mem_20261106_worker_expert_playbook_v1_ogranichennaya_c91491`,
v1) поднято до v2 штатным `wolf face new` с G17-полями и атрибуцией
`agent:steward`; seed-шаблон приведён к тому же содержанию. Другие лица не тронуты.

AC-05.1. `wolf face history worker-expert` → v2 active, v1 superseded;
`wolf face list` показывает, что `mr-wolf`, `steward`, `executor-lead` и прочие
воркеры сохранили прежние версии.

AC-05.2. Тело v2 совпадает с seed-шаблоном по смыслу (read-канал, `channel`,
деградация), `wolf doctor` не сообщает расхождений.

### REQ-06. Рендер проекта и карта обновления

AC-06.1. `.opencode/agents/worker-expert.md` в репозитории содержит новые права
(после `wolf sync`).

AC-06.2. `update-map.json` помечает `base/agents/worker-expert.md`,
`base/skills/wolf-council/SKILL.md`, `base/skills/using-skills/references/contracts.md`
и `base/playbooks/worker-expert-playbook.md` как `changed`;
`node scripts/generate-update-map.mjs --verify` проходит.

### REQ-07. Документация EN/RU

AC-07.1. `docs/site/guide/council.md` + RU-пара описывают read-канал по
умолчанию, packet-only как осознанную деградацию, функциональную пробу и поле
`channel`.

AC-07.2. `docs/site/guide/base-set.md` + RU-пара: строка `worker-expert` и
`worker-expert-playbook` соответствуют новому поведению.

AC-07.3. `docs/site/guide/troubleshooting.md` + RU-пара: новый симптом «эксперт
не может прочитать код».

AC-07.4. README-пара не расходится с новым поведением; generated-страницы
(CLI reference, changelog) вручную не правились.

## 3. Журнал изменений (CR) — содержание фикса

Append-only. Каждая запись: дата, что/почему, кем утверждено, downstream-перегенерации.

- CR-2026-11-06-01: профиль `worker-expert` — мёртвое `read packet/*` заменено
  широким read-allow по проекту плюс `glob`/`grep`; deny на запись/shell/
  субагентов/сеть/внешние каталоги сохранён; `*.env` ask-правила перенесены
  ПОСЛЕ широкого allow. Почему: packet-only был дефектом конфигурации, а не
  осознанным режимом (диагностика 1c939d, решение 0f7dde). Утвердил владелец.
  Downstream: `wolf sync` проектного набора, `update-map.json`.
- CR-2026-11-06-02: `wolf-council` — обязательная функциональная проба канала
  перед первым раундом (отдельно от symlink-аудита) + явный запрет считать
  перечень путей в TASK выдачей прав; `isolation_limits` обязателен для синтеза
  при нетool-enabled позиции. Почему: символ-аудит проверял изоляцию, но не
  работоспособность чтения (SKILL.md:43-48 до правки). Утвердил владелец.
  Downstream: `wolf sync`, `update-map.json`.
- CR-2026-11-06-03: профиль `expert` в `contracts.md` — `channel` первой строкой
  RESULT, `isolation_limits` обязателен при деградации; opinion-payload получил
  опциональное `channel`. Почему: синтез должен видеть, какие факты не
  подтверждены чтением. Утвердил владелец. Downstream: схема `record-council.ts`,
  тесты обратной совместимости.
- CR-2026-11-06-04: живое лицо `worker-expert` v1 → v2 (`wolf face new`,
  `WOLF_ACTOR=agent:steward`, G17) и согласование seed-шаблона. Почему: лицо
  предписывало packet-only по умолчанию. Утвердил владелец. Downstream:
  seed-шаблон `templates/base/playbooks/worker-expert-playbook.md`.
- CR-2026-11-06-05: документация EN/RU (council, base-set, troubleshooting,
  README-пара) и гард-тесты `tests/unit/worker-expert-channel.test.ts` +
  блок `channel` в `tests/unit/council-record.test.ts`. Почему: новое поведение
  должно быть проверяемым и описанным. Утвердил владелец. Downstream: нет
  (generated-страницы пересобираются `docs:build`).
- CR-2026-11-06-07 (правка по переревью): шаблоны восстановлены после порчи
  prettier — `model: {{model.primary}}` превратился в `model: { { model.primary } }`,
  YAML читал это как объект, и OpenCode выбрасывал агента из каталога
  («Agent not found: worker-expert»); ни один гейт этого не ловил, потому что
  тесты рендера используют синтетические строки. Добавлен
  `tests/unit/render-integrity-real-templates.test.ts` (рендер РЕАЛЬНЫХ шаблонов
  тем же `substitute()` в omit/model/no-context; проверено красным на испорченном
  плейсхолдере). Снята неоднозначность «`external_directory` запрещает вне проекта
  (Location и main-чекоут)»: прямой доступ в main-чекоут отклоняется, он входит
  только в сравнение при аудите ссылок; добавлено, что аудит точечный.
  Уточнено, что аудит проверяет разрешение наружу, а не факт ссылки.
  Почему: обещание границы должно совпадать с фактическим поведением host, а
  поставка не должна ломаться от форматирования. Утвердил владелец (в рамках
  решения 0f7dde). Downstream: `wolf sync`, `update-map.json`, живое лицо v4,
  тесты.
