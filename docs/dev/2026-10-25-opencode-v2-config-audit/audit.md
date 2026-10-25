# Аудит: проекция Mr.Wolf ↔ конфигурация opencode v1 → v2

Metadata

- task_id: `opencode-v2-config-audit`
- дата: 2026-10-25
- база: `main` @ `b238850` (2.20.1 в main), CLI установлен 2.20.0, дерево чистое
- режим: исследование + отчёт (код и конфиги не изменялись; пробы — в `$TMPDIR`)
- исполнитель: L1 `executor-lead`; подзадачи — 4 × `worker-researcher`
- назначение: вход для 2.20.1 — закрыть **класс** «Wolf пишет/валидирует ключ по
  v1-схеме, платформа читает по v2-пути», а не один ключ `subagent_depth`

## Сводка

| Показатель                        | Значение                                                     |
| --------------------------------- | ------------------------------------------------------------ |
| проверено позиций (ключ/контракт) | 20 в таблице §3 + 4 в §3.1 = **24**                          |
| живых проб на opencode 2.1.4      | **13** (§5)                                                  |
| расхождений, требующих работ      | **5**: 2 blocker (§6.1, §6.2) + 3 «нужно» (§6.3, §6.4, §6.5) |
| отложено / на решение владельца   | **3** (§6.6, §6.7, §6.8)                                     |
| явно «не трогать»                 | **7** позиций (§7)                                           |
| не подтверждено фактически        | 7 пунктов (§9), ни один не блокирует планирование            |

Топ-3 для 2.20.1: (1) `doctor` валидирует `default_agent` + `experimental.subagent_depth` и
предупреждает о deprecated-пути; (2) реестр ключей платформы + тест-инвариант «записанный
путь == канонический путь v2»; (3) MCP: читать/удалять обе формы (`mcp.wolf` и
`mcp.servers.wolf`) и писать нативную.

## 0. Контекст: почему это не разовый баг

2.20.0 писал глубину субагентов в верхнеуровневый `subagent_depth`. Схема
`https://opencode.ai/config.json` (v2.1.4) помечает этот ключ `deprecated: true`, а
`packages/core/src/config/normalize.ts:45` держит его в `unsupportedTopLevel` →
значение **игнорируется** с warning «configuration normalization diagnostic», действует
дефолт `1`. Итог: `executor-lead` не мог спавнить воркеров всю волну.

Ключевой вывод аудита: публикуемая `config.json` — **не схема V2**, а объединение
V2 + замороженного V1 (`packages/schema/script/config-schema.ts:9-11`). Поэтому
«ключ есть в схеме» ≠ «ключ действует». Это и есть корень класса проблемы.

## 1. Метод и источники

| #   | Источник                                                                                                  | Версия / дата                                             | Что даёт                                                                                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | `https://opencode.ai/config.json`                                                                         | 65 484 B, GET 2026-10-25                                  | публикуемая JSON-схема (смесь V2 + V1 с `deprecated: true`)                                                                                                                                                            |
| S2  | тег `v2.1.4` репозитория `anomalyco/opencode` (ex `sst/opencode`, 301)                                    | 2026-10-25                                                | `packages/schema/src/config*.ts`, `packages/schema/script/config-v1.json`, `packages/core/src/config/normalize.ts`, `packages/core/src/config/plugin/{agent,command,mcp}.ts`, `packages/core/src/v1/config/migrate.ts` |
| S3  | тег `v1.19.4`, commit `148842ef7cb1bc34192b3fff57d0f9721ab9c801`                                          | 2026-10-22 (последняя 1.x)                                | `packages/core/src/v1/config/*.ts` (Effect-схемы), `packages/opencode/src/config/{config,agent,command,plugin,v2-compat}.ts`                                                                                           |
| S4  | тег `v1.18.29`                                                                                            | —                                                         | `packages/opencode/src/config/v2-compat.ts` — **минимальная поддерживаемая Wolf v1**: что она принимает из v2-форм                                                                                                     |
| S5  | npm `opencode-ai@1.19.4` (`npm pack`, распаковка в `$TMPDIR`)                                             | 1.19.4                                                    | схемы в пакете **нет** (обёртка + платформенные бинарники) → v1-схема только из git-тега                                                                                                                               |
| S6  | документация `https://opencode.ai/v2/docs/{config,migrate-v1,agents,mcp-servers,skills,commands,plugins}` | GET 2026-10-25                                            | прозаические правила миграции (verbatim-цитаты ниже)                                                                                                                                                                   |
| S7  | живая установка                                                                                           | `opencode v2.1.4` (`/Users/chekh/.opencode/bin/opencode`) | пробы (см. §5)                                                                                                                                                                                                         |

Отдельно зафиксировано: `/usr/local/bin/opencode` — **другая** установка (brew,
1.18.20), в PATH побеждает 2.1.4. Это объясняет, почему «на этой машине v1 ещё жив».

## 2. Что Mr.Wolf пишет и читает (по коду, не по памяти)

Полная таблица с построчными ссылками — `$TMPDIR/wolf-audit/w1-code-surface.md`.
Здесь — сжатая версия; `W` = пишет, `R` = читает, `V` = валидирует «наше/чужое».
Таблица фиксирует **текущее** состояние (`b238850`); целевые изменения — §6.

| Ключ / путь                                                                                                                           | Где пишется                                                                           | Где читается / валидируется                                                                       | Зачем                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `mcp.wolf.{type,command,enabled}`                                                                                                     | `src/adapters/platforms/opencode-adapter.ts:109-112`                                  | `:192-195`, `:211-215`, `src/app/use-cases/doctor.ts:99-101`                                      | регистрация MCP-сервера `wolf`                          |
| `default_agent`                                                                                                                       | `opencode-adapter.ts:176`                                                             | `:115-119` (конфликт), `:217-220` (снятие)                                                        | дефолтный агент платформы                               |
| `experimental.subagent_depth`                                                                                                         | `opencode-adapter.ts:177-181`                                                         | `:163-164`, `:222-227`                                                                            | глубина субагентов (L0→L1→L2)                           |
| верхнеуровневый `subagent_depth` (legacy)                                                                                             | `opencode-adapter.ts:182` (только удаление нашего значения)                           | `:125`, `:135-152`                                                                                | миграция нашего `2` в `experimental`                    |
| `.opencode/agents/*.md`: `description`, `mode`, `model`, `temperature`, `permission.{task,bash,edit,"wolf_*","mr-wolf_*"}`, `protect` | `templates/base/agents/*.md:2-10`, `src/app/use-cases/scaffold-agent.ts:67-78`        | `src/adapters/render/opencode/opencode-renderer.ts:114-119` + `src/adapters/render/sync-state.ts` | роли L0/L1/L2, штампы, ownership                        |
| `.opencode/commands/*.md`: `description`, `agent`                                                                                     | `templates/base/commands/*.md:2-3`                                                    | те же                                                                                             | команды `/complain` и др.                               |
| `.opencode/skills/<name>/SKILL.md`: `name`, `description`                                                                             | `templates/base/skills/*/SKILL.md:2-3`; `src/app/use-cases/tool-librarian.ts:222-226` | `opencode-renderer.ts` + sync-state                                                               | скиллы                                                  |
| `.opencode/plugins/**` (файлы; ключ конфига **не** пишется)                                                                           | `opencode-renderer.ts:121-130`                                                        | discovery платформы                                                                               | router + session-start                                  |
| `.opencode/wolf-sync-state.json`                                                                                                      | `src/adapters/render/sync-state.ts:28,74-91`                                          | `:49-72`; `src/adapters/cli/commands/memory-doctor.ts:68-73`; `uninstall.ts:11-18`                | свидетельство последнего рендера (mutated/kept/rewrite) |
| файл конфига: `<root>/opencode.json(c)`                                                                                               | `opencode-adapter.ts:80-86`                                                           | `:62-68` (detect)                                                                                 | выбор/детект конфига                                    |

Чего Wolf **не** пишет и не читает (проверено grep по `src`): `mcp.servers`, `disabled`,
`environment`, `url`, `headers`, `oauth`, `plugins`/`plugin` (как ключ), `permissions`
(plural), `instructions`, `agents`/`commands`/`skills` (как ключи), `tools`, `update`,
`providers`. То есть поверхность Wolf узкая: один файл конфига, три ключа в нём,
frontmatter агентов/команд/скиллов и каталог плагинов.

## 3. Таблица расхождений v1 ↔ v2

Вердикты: `ok` — форма одна в обеих ветках; `deprecated` — работает, но объявлено
устаревшим; `переехал` — сменился путь; `изменил семантику`; `покрытие` — не про
схему, а про то, что Wolf не проверяет.

| #   | Ключ / контракт                                       | v1 (1.19.4, min 1.18.29)                                                                                                              | v2 (2.1.4)                                                                                                                                                                                         | Вердикт                  | Влияние на Wolf                                                                                                                                                                                                                                                                                                                                                                           | Что делать                                                                                                                                                  |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `mcp.<name>` (плоская запись) vs `mcp.servers.<name>` | нативно: плоская мапа, `enabled`, `timeout` числом (`core/src/v1/config/mcp.ts:6-23,44-60`)                                           | плоская форма **`deprecated: true`** (`config.json: properties.mcp.additionalProperties.deprecated`); нативно `mcp.servers.<n>` + `disabled` + `timeout{startup,catalog,execution}`                | deprecated               | сейчас работает: `migrate-v1:141-142` — «recognizes mixed V1 and V2 members within mcp»; **ломается после пользовательской миграции**: `doctor` даст false-«wolf entry missing», `uninstall` не удалит `mcp.servers.wolf`, `init` допишет второй ключ                                                                                                                                     | читать/удалять **обе** формы; писать нативную (см. §6.3)                                                                                                    |
| 2   | `mcp.<name>.enabled` ↔ `.disabled`                    | `enabled: boolean`                                                                                                                    | `disabled: boolean` (инверсия)                                                                                                                                                                     | переехал                 | при переходе на нативную форму легко инвертировать знак                                                                                                                                                                                                                                                                                                                                   | писать `disabled: false`, не `enabled: true`                                                                                                                |
| 3   | `default_agent`                                       | есть (`core/src/v1/config/config.ts:80-83`)                                                                                           | есть (`Config.Info`)                                                                                                                                                                               | ok                       | —                                                                                                                                                                                                                                                                                                                                                                                         | не трогать                                                                                                                                                  |
| 4   | `experimental.subagent_depth`                         | в схеме v1 **нет**, но 1.18.29+ поднимает его в верхнеуровневый (`v2-compat.ts:196-204`)                                              | нативно, `integer ≥ 0`, default 1                                                                                                                                                                  | ok (2.20.1 верно)        | действует на обеих ветках — правильный общий путь                                                                                                                                                                                                                                                                                                                                         | не трогать; закрыто в 2.20.1                                                                                                                                |
| 5   | верхнеуровневый `subagent_depth`                      | нативно (`config.ts:84-86`, default 1)                                                                                                | **игнорируется** + warning (`normalize.ts:45`; `migrate-v1:504` «use experimental.subagent_depth instead»)                                                                                         | переехал                 | причина инцидента 2.20.0                                                                                                                                                                                                                                                                                                                                                                  | уже мигрируется (`opencode-adapter.ts:135-152`); оставить как legacy-снятие                                                                                 |
| 6   | `permission` в frontmatter агента                     | нативно: `task`, `bash`, `edit`, произвольные ключи (`v1/config/permission.ts:5-36`)                                                  | **deprecated**, транслируется: `task→subagent`, `bash→shell`, `write/patch→edit`, прочие ключи (`wolf_*`, `mr-wolf_*`) сохраняются как есть (`migrate.ts:17-33`; `Permission.Rule.action: string`) | deprecated, но безопасно | трансляция **подтверждена живьём** для `.md`-агентов (§5d); **риск тихой потери правил**: файл, где появится `permissions`/`request`/`system`/`disabled`, читается как V2, и V1-поля игнорируются (`core/config/plugin/agent.ts:190-194`; `migrate-v1: "Agent files"`) → `permission.task: deny` исчезает. А JSON-карта `agents` в конфиге теряет v1-поля **молча, без warning** (§5 P10) | **не** переводить на `permissions`: в v1 это `InvalidError` (`v2-compat.ts:93-113`); добавить doctor-предупреждение о смешанном frontmatter + строку в доку |
| 7   | `temperature` в frontmatter                           | влияет на сэмплинг                                                                                                                    | уезжает в `request.body` («kept but **not sent** to the model», `migrate-v1:224`) → **не влияет**; живьём: у `executor-lead` в `request.body.temperature: 0.2` (§5e)                               | изменил семантику        | значения `0.2/0.3` в 6 шаблонах декоративны                                                                                                                                                                                                                                                                                                                                               | решить владельцу: убрать (честно) или оставить; сэмплинг — на model variant                                                                                 |
| 8   | каталог команд `.opencode/command/` vs `commands/`    | читаются оба (`opencode/src/config/command.ts:15-30`)                                                                                 | читаются оба, `commands/` предпочтителен (`migrate-v1: "Command files"`)                                                                                                                           | deprecated (каталог)     | работает; при ручном переносе пользователем sync-state хранит старые пути → возможны дубли                                                                                                                                                                                                                                                                                                | отложить (миграция = риск дублей)                                                                                                                           |
| 9   | `.opencode/agents/`                                   | предпочтителен                                                                                                                        | предпочтителен                                                                                                                                                                                     | ok                       | —                                                                                                                                                                                                                                                                                                                                                                                         | не трогать                                                                                                                                                  |
| 10  | `.opencode/skills/<id>/SKILL.md`                      | с 1.14.x, `name`+`description` обязательны в frontmatter                                                                              | ID берётся из пути, frontmatter опционален; без `description` скилл не показывается модели (`/v2/docs/skills:179,185`)                                                                             | изменил семантику        | `wolf tool expose` ставит `<!-- generated from tool:… -->` **до** `---` (`tool-librarian.ts:222-226`) → нештатный формат. Живьём загрузку **не** ломает (§5 P12), но парсинг `description` из такого файла не подтверждён                                                                                                                                                                 | перенести комментарий под frontmatter (1 строка, риск нулевой)                                                                                              |
| 11  | ключ конфига `plugin` vs `plugins`                    | `plugin`: `string` \| `[spec, options]` (`v1/config/plugin.ts:8`); `plugins` в v1 отбрасывается с diagnostic (`v2-compat.ts:117-118`) | `plugins`: `string` \| `{package, options}`; `plugin` deprecated                                                                                                                                   | переехал                 | Wolf ключ **не пишет** — discovery из `.opencode/plugins/` работает в обеих ветках                                                                                                                                                                                                                                                                                                        | не трогать                                                                                                                                                  |
| 12  | plugin API                                            | `export const X: Plugin = async (input) => hooks`                                                                                     | `default { id, setup, server }`                                                                                                                                                                    | изменил API              | шаблоны Wolf — dual-entry (`templates/opencode/plugins/wolf-router.ts:414`, `wolf-session-start.js:231`); в этой сессии оба работают на 2.1.4                                                                                                                                                                                                                                             | не трогать (проверено живьём)                                                                                                                               |
| 13  | `tools` (ключ конфига)                                | deprecated с 1.1.1 → `permission`                                                                                                     | deprecated → `permissions` (`normalize.ts:549-560`)                                                                                                                                                | deprecated               | Wolf не пишет; наличествует в пользовательском конфиге                                                                                                                                                                                                                                                                                                                                    | не трогать (не наш ключ)                                                                                                                                    |
| 14  | `instructions`                                        | `string[]`                                                                                                                            | `string[]`                                                                                                                                                                                         | ok                       | Wolf не пишет, но пишет `AGENTS.md`, на который ссылается конфиг                                                                                                                                                                                                                                                                                                                          | не трогать                                                                                                                                                  |
| 15  | `mode` агента                                         | `primary\|subagent\|all`                                                                                                              | `primary\|subagent\|all`                                                                                                                                                                           | ok                       | `mode: primary` / `mode: all` в шаблонах валидны                                                                                                                                                                                                                                                                                                                                          | не трогать                                                                                                                                                  |
| 16  | ключ `skills`                                         | объект `{paths,urls}`                                                                                                                 | массив строк                                                                                                                                                                                       | переехал                 | Wolf не пишет                                                                                                                                                                                                                                                                                                                                                                             | не трогать                                                                                                                                                  |
| 17  | `update`                                              | нет ключа (`autoupdate`)                                                                                                              | `update: "disable"\|"notify"\|"auto"`                                                                                                                                                              | добавился                | Wolf не пишет                                                                                                                                                                                                                                                                                                                                                                             | не трогать                                                                                                                                                  |
| 18  | расположение конфига                                  | `<root>/opencode.json(c)`                                                                                                             | ещё `<root>/.opencode/opencode.json(c)` и `~/.config/opencode/` (`/v2/docs/config:109-118`; root мержится раньше, `.opencode` — позже, т.е. перекрывает)                                           | покрытие                 | сервер/ключ в `.opencode/opencode.jsonc` для Wolf невидим                                                                                                                                                                                                                                                                                                                                 | читать обе локации (позже)                                                                                                                                  |
| 19  | JSONC-комментарии                                     | допускаются                                                                                                                           | допускаются                                                                                                                                                                                        | не версия, а поведение   | любая запись Wolf стирает комментарии (`opencode-adapter.ts:57-58,183`)                                                                                                                                                                                                                                                                                                                   | оставить (задокументированный shortcut)                                                                                                                     |
| 20  | валидация записанного                                 | —                                                                                                                                     | —                                                                                                                                                                                                  | покрытие                 | `doctor` проверяет **только** `mcp.wolf` (`doctor.ts:96-102`): `default_agent` и `experimental.subagent_depth` не проверяются → инцидент 2.20.0 не был диагностируем                                                                                                                                                                                                                      | blocker для 2.20.1 (см. §6.1)                                                                                                                               |

### 3.1 Что НЕ является конфигом, но версионно

- **Формат MCP-записи**: `command` — массив в **обеих** ветках (v1 `mcp.ts:6-23`, v2
  `Mcp.LocalConfigEncoded.required[type,command]`). Строковая форма — это Claude
  (`mcpServers`, `claude-adapter.ts:15-16`), не opencode. Регрессии нет.
- **`codemode`**: есть только в v2; в v1 `normalizeServer` выдаёт `unsupported`
  (`v2-compat.ts` normalizeServer) → при переходе на нативную форму **не писать**.
- **`oauth`**: v1 camelCase (`clientId`, `callbackPort`), v2 snake_case
  (`client_id`, `callback_port`). Wolf OAuth не пишет.
- **Плагины**: v1-реализация в v2 не работает (`migrate-v1: "Plugins"`), но шаблоны Wolf
  dual — подтверждено работой этой сессии.

## 4. Итог по уже закрытому (2.20.1)

`experimental.subagent_depth` — единственный путь, действующий и в v1.18.29+ (compat-подъём
`v2-compat.ts:196-204`), и в v2.1.4 (`schema/src/config/experimental.ts`). Решение 2.20.1
корректно и **не требует** ветвления по версии платформы. Остальные ключи проекции Wolf
проверены ниже; из них ни один не ломает запуск на v2, но пять требуют работ
(2 blocker + 3 «нужно», §6).

## 5. Живые пробы на opencode 2.1.4

Методика (воспроизводимая): на каждую пробу — изолированный глобальный конфиг
`<probe>/base/opencode/opencode.json`, отдельный проект `<probe>/proj` и **свой** сервер:

```
XDG_CONFIG_HOME=<probe>/base opencode serve --hostname 127.0.0.1 --port <free> \
    --print-logs --log-level debug > <probe>/serve.log 2>&1 &
curl -u "opencode:<pw>" http://127.0.0.1:<port>/api/{config,agent,command,skill,mcp,plugin}
```

Модели не вызывались, пакеты не ставились, сеть не использовалась. Живой
`~/.config/opencode/opencode.json` не изменялся: sha256
`7e83d1557e4aba310c30617ef653cde5c513cfe15fd2aa140e38b8363c59b9e7`, mtime `1792946188`
— до и после совпадают.

**Ловушка изоляции (важно для будущих проверок):** `opencode debug config`,
`opencode debug agents`, `opencode mcp list` ходят в фоновый сервис
(`127.0.0.1:49374`) и показывают **живой** конфиг даже при `XDG_CONFIG_HOME=<tmp>`;
для изоляции годятся только `/api/*` собственного `serve`. Дамп «эффективного»
смёрженного конфига отсутствует (`/api/config/effective` → 404): наблюдаемы
(1) нормализованный `info` каждого документа, (2) WARN-строки лога, (3) `/api/{agent,command,skill,mcp}`.

| #   | Проба                                                                                                | Команда / канал                                                                                                       | Наблюдение (дословно)                                                                                                                                                                                                                                                                                                | Вердикт                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| a   | верхнеуровневый `subagent_depth: 2`                                                                  | `serve` + `grep WARN serve.log`                                                                                       | `level=WARN message="configuration normalization diagnostic" source=…/p3/base/opencode/opencode.json path=$.subagent_depth kind=unsupported action="omitted unsupported legacy setting"`; в `/api/config` `info` остался только `$schema`                                                                            | **ключ игнорируется**, глубина остаётся дефолтной 1 — подтверждено                                    |
| a′  | `experimental.subagent_depth: 2`                                                                     | то же                                                                                                                 | WARN: 0; `info` = `{"$schema":…,"experimental":{"subagent_depth":2}}`                                                                                                                                                                                                                                                | **принят** — подтверждено                                                                             |
| b   | плоская `mcp.wolf = {type:"local", command:[…], enabled:true}` (ровно как `opencode-adapter.ts:111`) | `serve` + `/api/config`                                                                                               | диагностик 0; `info.mcp` = `{"servers":{"wolf":{"type":"local","command":[…],"disabled":false}}}`; при `enabled:false` → `disabled:true`, процесс не спавнится                                                                                                                                                       | **работает, тихо мигрирует**; deprecation-warning'а нет                                               |
| c   | нативная `mcp.servers.wolf` + `disabled:false`                                                       | то же                                                                                                                 | WARN: 0; документ не изменён; поведение спавна то же, что в (b)                                                                                                                                                                                                                                                      | **работает**, эквивалент (b)                                                                          |
| d   | `permission.task` в `.md`-агенте                                                                     | `opencode debug agents` (живой проект, read-only; канал намеренно живой — цель реальные шаблоны Wolf, а не синтетика) | `executor-lead`: `permissions: [{action:"subagent",resource:"*",effect:"deny"},{action:"subagent",resource:"worker-*",effect:"allow"}]`; `worker-implementer`: `{action:"subagent",…deny}`, `{action:"shell",…allow}`, `{action:"edit",…allow}`, `{action:"wolf_*",resource:"*",deny}`, `{action:"mr-wolf_*",…deny}` | **правило применяется**, `task→subagent`, `bash→shell`, wildcard-действия сохранены                   |
| e   | `temperature: 0.2` в frontmatter                                                                     | `opencode debug agents` + `/api/config`                                                                               | у `executor-lead` `request.body = {"temperature":0.2}`, у `mr-wolf` — `0.3`; документация: `request.body` «kept but **not sent** to the model» (`migrate-v1:224`)                                                                                                                                                    | **в запрос не уходит** (по документации); фактическая проверка требует вызова модели — не выполнялась |
| f   | SKILL.md с комментарием **до** `---` (как пишет `wolf tool expose`)                                  | `serve` + DEBUG-лог загрузчика                                                                                        | `message="skill source loaded" … skills="[\"normal\",\"with-comment\"]"` — оба файла загружены; каталоги `skill/` и `skills/` сканируются оба                                                                                                                                                                        | загрузку **не ломает**; распознан ли `description` — не проверено                                     |
| g   | каталоги команд `command/` и `commands/`                                                             | `/api/command`                                                                                                        | `init,review,alpha,beta` — файлы из **обоих** каталогов                                                                                                                                                                                                                                                              | оба работают, WARN нет                                                                                |
| h   | контроль: неизвестный ключ верхнего уровня                                                           | `serve` + `/api/config`                                                                                               | `totally_unknown_key` и `watcher.bogusSub` отброшены **молча**, WARN 0                                                                                                                                                                                                                                               | **отсутствие warning'а не доказывает, что ключ принят**                                               |
| i   | `agents: {…}` в JSON-конфиге с v1-полями                                                             | `serve` + `/api/config`                                                                                               | от `{description,mode,temperature,top_p,maxSteps,disable,prompt,permission,tools}` остаётся только `{description,mode}`; WARN 0; `permission`/`tools` агента **потеряны**                                                                                                                                            | асимметрия: конфиг-карта `agents` теряет v1-поля молча, а `.md`-файлы транслируются (проба d)         |
| j   | `plugin` (v1) / кортеж `[spec,{opt}]`                                                                | `serve` + `/api/config`                                                                                               | тихо → `plugins:[{package,options}]`, WARN 0                                                                                                                                                                                                                                                                         | v1-форма принята                                                                                      |
| k   | `permission`-мапа верхнего уровня                                                                    | `serve` + `/api/config`                                                                                               | тихо → `permissions[]`: `edit:"ask"`→`{action:"edit"}`, `bash`→`shell`, `task`→`subagent`, `wolf_*` сохранён как `resource`                                                                                                                                                                                          | принято без warning                                                                                   |
| l   | `tools:{write,edit,bash,webfetch}`                                                                   | `serve` + `/api/config`                                                                                               | тихо → 4 правила `permissions` (`write` и `edit` оба → `action:"edit"`), deprecation-warning'а нет                                                                                                                                                                                                                   | принято                                                                                               |

Вывод §5: ни одно из расхождений §3, кроме уже исправленного `subagent_depth`, **не ломает
запуск** — v2 нормализует v1-формы молча. Риск лежит не в «не работает сейчас», а в
(1) отсутствии диагностики (`h`: молчание ≠ приём), (2) будущих разрывах при пользовательской
миграции конфигов и (3) тихой потере прав в конфиг-карте `agents` (`i`).

## 6. Приоритеты для 2.20.1

### Blocker

**6.1. `doctor` валидирует все ключи, которые пишет адаптер.**
Сейчас проверяется только `mcp.wolf` (`src/app/use-cases/doctor.ts:96-102`), а
`default_agent` и `experimental.subagent_depth` — нет. Проверка: `default_agent === 'mr-wolf'`,
`experimental.subagent_depth >= 2`, и отдельно — **наличие deprecated верхнеуровневого
`subagent_depth`** → issue «ignored by opencode v2, migrate». Обоснование: именно отсутствие
этой проверки сделало 2.20.0 невидимым до живого прогона волны; `doctor` — единственный
канал, который видит расхождение у пользователя. Риск работ: низкий (чтение конфига +
сообщение), риск без работ: класс продолжает воспроизводиться молча (проба `h`:
платформа о таком не предупредит в TUI).

**6.2. Реестр ключей платформы + инвариант вместо точечного теста.**
Сейчас пути ключей размазаны строковыми литералами по адаптеру/doctor/init и проверяются
точечно (2.20.1 добавил `tests/unit/adapters/platforms/opencode-adapter.test.ts:259` —
`expect(cfg.subagent_depth).toBeUndefined()`). Нужен единый список
`ключ → канонический путь v2 → форма (v1/v2/обе) → как проверяется`, из которого читают
адаптер, doctor и тесты; тест-инвариант: «записанный путь каждого ключа реестра == канонический
путь v2 из `https://opencode.ai/config.json`». Обоснование: без реестра следующий ключ снова
уедет незамеченным — ровно это и просил закрыть бриф. Риск: средний объём (рефактор без
смены поведения), поэтому обязателен `npm run check` и отсутствие изменения байтов конфига
на текущих сценариях.

### Нужно

**6.3. MCP: читать/удалять обе формы; писать нативную.**
`mcp.servers.wolf` принимается v1.18.29+ (hoist `v2-compat.ts:244-298`, инверсия
`disabled→enabled` :329-331) и нативна в v2 — миграция безопасна для обеих веток. Требования:
писать `{type:'local', command:[…], disabled:false}` **без** `codemode` (в v1 он `unsupported`);
при записи удалять легаси `mcp.wolf` (та же схема, что сделана для `subagent_depth`, иначе
`conflict`-диагностика v1 при обоих ключах); `doctor`/`uninstall`/`init` учитывают **обе**
формы. Риск сейчас: после того как пользователь сам мигрирует конфиг, `doctor` даст
false-«wolf entry missing», `uninstall` не удалит сервер, `init` допишет второй ключ.
Риск работ: средний (правка ownership-логики) → нужен тест на обе формы.

**6.4. Предупреждение о смешанном frontmatter managed-агента.**
Если в наш `.md`-агент попадёт `permissions|request|system|disabled`, файл читается как V2 и
V1-поля (`permission.task: deny`) исчезают (`core/config/plugin/agent.ts:190-194`;
`migrate-v1: "Agent files"`). Проверка в `doctor`/`repair` + строка в документации «не
смешивать форматы в одном файле». Риск: низкий; без проверки возможна тихая потеря запрета
на спавн субагентов.

**6.5. `wolf tool expose`: комментарий-маркер после frontmatter.**
`tool-librarian.ts:222-226` ставит `<!-- generated from tool:… -->` первой строкой. Проба `f`:
загрузку в v2 это не ломает, но формат нештатный (доки требуют frontmatter в начале файла;
в v1 `name`/`description` обязательны), а распознавание `description` из такого файла не
подтверждено. Фикс — перестановка двух строк, риск нулевой.

### Позже / требует решения владельца

- **6.6. `temperature` (0.2/0.3) в 6 шаблонах** — решение владельца: убрать (честно: в v2 не
  влияет, проба `e`) или оставить как безвредный рудимент. Сэмплинг в v2 задаётся model variant.
- **6.7. Чтение `.opencode/opencode.json(c)`** — v2 мержит root-файлы раньше, `.opencode` позже
  (`/v2/docs/config:109-118`), т.е. `.opencode` перекрывает. Решение владельца: расширять ли
  поверхность чтения (иначе сервер, настроенный там, для Wolf невидим).
- **6.8. Миграция `.opencode/command/` → `commands/`** — оба каталога работают (проба `g`);
  перенос создаёт риск дублей из sync-state. Решение владельца, не в 2.20.1.

## 7. Что не трогать (с причинами)

| Что                                                                            | Причина                                                                                                                                                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ключ `plugins`/`plugin` в конфиге                                              | Wolf его не пишет: плагины подхватываются discovery из `.opencode/plugins/` в обеих ветках. Если бы писал — v1-форма `plugin` тоже принимается v2 без warning (проба `j`) |
| `permissions` (v2-native) в frontmatter агентов                                | в v1.18.29 это `InvalidError` (`v2-compat.ts:93-113`) → сломает весь v1-парк; текущая v1-форма транслируется корректно (проба `d`)                                        |
| `tools`, `instructions`, `mode`, `skills`, `update`, `provider`, `small_model` | либо идентичны в обеих ветках, либо не наш scope; v2 нормализует legacy молча (`migrate-v1:138-144`)                                                                      |
| `codemode`, `oauth`, `protocol` в MCP                                          | v2-only расширения, Wolf их не использует; `codemode` в v1 — `unsupported`                                                                                                |
| JSONC-комментарии при rewrite                                                  | сознательный shortcut (`opencode-adapter.ts:57-58`), сохранение = AST-редактор; YAGNI до запроса                                                                          |
| верхнеуровневый `subagent_depth` как путь записи                               | уже закрыто 2.20.1; ключ оставить только в коде как legacy-снятие                                                                                                         |
| `mode: all` / `mode: primary`                                                  | enum одинаков в обеих ветках                                                                                                                                              |

## 8. Мигратор пользовательских конфигов и regression-тест

- **Мигратор — не нужен.** v2 нормализует v1-формы (плоский `mcp.<n>`, `permission`, `tools`,
  `plugin`, верхнеуровневый `agent`) тихо, без warning и без потери значений — проверено пробами
  `b`, `j`, `k`, `l`. Мигратор обязателен ровно там, где нормализация **отсутствует** —
  `subagent_depth` (`normalize.ts:45`); он уже написан (`opencode-adapter.ts:135-152`).
  Отдельно нужен не мигратор, а **двухформенный читатель** MCP (§6.3) — это совместимость
  чтения/удаления, а не переписывание чужого конфига.
- **Regression-тест на путь ключа — да, нужен**, в двух слоях: (1) инвариант по реестру
  (§6.2) — падает при записи любого ключа в неканонический путь; (2) тест `doctor` —
  deprecated-путь в конфиге даёт issue. Точечный тест 2.20.1 (`cfg.subagent_depth` `undefined`)
  оставить как регресс-замок конкретного инцидента.

## 9. Ограничения аудита

1. **Рантайм-значение `experimental.subagent_depth`** (реально ли 2) и срабатывание
   wildcard-правила `wolf_*` без вызова модели не наблюдаемы. Косвенное подтверждение, что
   глубина действует: в этой сессии L1 (executor-lead) успешно спавнил четырёх
   `worker-researcher` — при глубине 1 это невозможно.
2. **`temperature` не уходит в запрос** — вывод по документации (`migrate-v1:224`), не по
   перехвату провайдерского запроса; живой провайдер не вызывался.
3. **Файловые агенты через `/api/agent`** не наблюдались ни в одной из проб (W4): канал
   подтверждён только через `opencode debug agents` на живом проекте (§5d), т.е. на реальных
   шаблонах Wolf, а не на синтетических файлах.
4. **`/api/mcp` пуст** при любой форме записи → «остался ли сервер в списке MCP» судили по
   нормализованному `info` и факту спавна процесса.
5. **Приоритет root-файла против `.opencode/opencode.json(c)`** при конфликте одинаковых
   `mcp`-ключей не проверялся живьём (только по доке `v2/docs/config:116-118`).
6. **Релизных заметок v2 нет** (в GitHub Releases последний — `v1.19.4`, теги `v2.x` без
   записей), поэтому переименования подтверждены кодом `v2-compat.ts`/`migrate.ts` и живьём,
   а не прозой changelog.
7. Пробы велись через `serve` + `/api`; TUI-путь не проверялся (риск расхождения невелик,
   но не нулевой).
