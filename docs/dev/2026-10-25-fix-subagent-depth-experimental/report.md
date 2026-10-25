# Отчёт: `subagent_depth` под `experimental` (opencode v2) — 2.20.1

Metadata

- task_id: fix-subagent-depth-experimental
- режим: LITE (один адаптер + тесты/доки), версия не поднималась
- база: `main` @ 70eb5a1 (2.20.0), ветка `fix/2.20.1-subagent-depth-experimental`, worktree `.worktrees/patch-2-20-1-subagent-depth`
- дата: 2026-10-25

## Summary

Wolf 2.20.0 писал глубину субагентов в верхнеуровневый `subagent_depth`. Схема
`https://opencode.ai/config.json` (opencode v2.1.4) помечает этот ключ `deprecated`
(description: «Maximum subagent nesting depth. Defaults to 1, which prevents subagents
from launching subagents.») и действует только `experimental.subagent_depth`
(`integer`, `minimum: 0`). Следствие в живом парке: платформа игнорировала ключ,
действовал дефолт 1, и `subagent` из `executor-lead` падал с
`Subagent depth limit reached (1)` всю волну 2.20.0.

Фикс: `writeConfig` пишет `experimental.subagent_depth: 2`, сохраняет остальные поля
`experimental` и остальной JSON, никогда не создаёт deprecated-ключ, не перезаписывает
чужое значение (только `reason`) и мигрирует собственное легаси-значение `2` в
`experimental`. `removeWolfKeys` (uninstall) удаляет только точные наши значения в новом
месте (и легаси), опустевший объект `experimental` убирает.

## Changes

Файл → строка → поведение (финальные номера строк):

| Файл                                                                           | Строки                                   | Что изменилось                                                                                                                                                         |
| ------------------------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/adapters/platforms/opencode-adapter.ts`                                   | 20–36                                    | `SD_KEY = 'subagent_depth'` + `depthIsOurs()` (действующее место); прежний `SUBAGENT_DEPTH = 2` сохранён                                                               |
| то же                                                                          | 106–185                                  | `writeConfig`: таблица веток глубины (см. ниже), reason-канал, `keys()` читает действующее место, unchanged-гейт `mcpOk && da!==undefined && !setDepth && !dropLegacy` |
| то же                                                                          | 177–182                                  | запись: `experimental.subagent_depth = 2` в существующий объект (или новый), `delete cfg.subagent_depth` только при `dropLegacy`                                       |
| то же                                                                          | 200–245                                  | `removeWolfKeys`: `experimental.subagent_depth === 2` → удалить, пустой `experimental` → удалить объект; легаси `subagent_depth === 2` → удалить; чужое не трогается   |
| `src/ports/platform-adapter.port.ts`                                           | 46–56                                    | контракт адаптера: глубина — `experimental.subagent_depth`, легаси — deprecated                                                                                        |
| `src/app/use-cases/repair-platform.ts`                                         | 73                                       | план ремонта: `experimental.subagent_depth`                                                                                                                            |
| `src/app/use-cases/init-project.ts`                                            | 478, 484                                 | тексты подсказок init называют актуальный путь                                                                                                                         |
| `tests/unit/adapters/platforms/opencode-adapter.test.ts`                       | 240–418, 424–495                         | новый блок «subagent_depth в experimental (opencode v2)»: 12 кейсов; `removeWolfKeys` OC-K1/K1b/K1c/K1d/K2                                                             |
| `tests/unit/use-cases/init-project.test.ts`                                    | 575                                      | фикстура R04-7 переведена на `experimental.subagent_depth` (интент теста — конфликт `default_agent`)                                                                   |
| `tests/e2e/init-cli.e2e.ts`                                                    | 50–52                                    | `experimental.subagent_depth === 2`, верхнеуровневого нет                                                                                                              |
| `tests/e2e/platform-repair.e2e.ts`                                             | 117–118                                  | то же после `doctor --repair`                                                                                                                                          |
| `tests/e2e/uninstall.e2e.ts`                                                   | 67–68                                    | после uninstall `experimental` удалён целиком (пустым не остаётся)                                                                                                     |
| `docs/site/guide/configuration.md`, `docs/site/ru/guide/configuration.md`      | секция «Platform configs and `mcp.wolf`» | таблица «где живёт каждый ключ», deprecated-оговорка, авто-миграция, поведение uninstall                                                                               |
| `docs/site/{,ru/}guide/getting-started.md`, `docs/site/{,ru/}guide/upgrade.md` | —                                        | перечисление ключей приведено к `experimental.subagent_depth`                                                                                                          |
| `CHANGELOG.md`                                                                 | 7–11                                     | новый `## [Unreleased]` → `### Fixed`                                                                                                                                  |

### Таблица веток конфига → результат (`writeConfig`)

`exp` = `experimental.subagent_depth`, `legacy` = верхнеуровневый `subagent_depth`;
«наше» = число ≥ 2.

| Состояние конфига                               | Результат                                                                                                                                                                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ни `exp`, ни `legacy`                           | `written`: `experimental.subagent_depth = 2`; deprecated-ключ не создаётся                                                                                                                                        |
| `exp` = 2 (или ≥2), `legacy` нет                | `unchanged`, записи нет                                                                                                                                                                                           |
| `exp` = 2, `legacy` = 2                         | `written`: легаси-ключ удалён, reason `removed deprecated top-level subagent_depth=2 (ignored by opencode v2)`                                                                                                    |
| `exp` ≥2, `legacy` ≠ 2                          | `unchanged`: легаси сохранён, reason `... is deprecated and ignored by opencode v2; experimental.subagent_depth is used`                                                                                          |
| `exp` = 1 / `0` / не-число                      | `unchanged`: чужое значение не трогается, reason `experimental.subagent_depth=<v> is taken; … set >=2`                                                                                                            |
| `legacy` = 2, `exp` нет                         | `written` (миграция): `experimental.subagent_depth = 2`, легаси удалён, reason `migrated subagent_depth to experimental.subagent_depth`                                                                           |
| `legacy` = 1 / любое ≠ 2, `exp` нет             | `unchanged`: ничего не пишется, reason `top-level subagent_depth=<v> is taken; the key is deprecated and ignored by opencode v2 — set experimental.subagent_depth >=2`                                            |
| `experimental` не объект                        | `unchanged` для глубины (mcp/default_agent мерджатся как раньше): reason `experimental is not an object; subagent_depth is not written — set experimental.subagent_depth: 2 manually`; объект не перезаписывается |
| после миграции / после записи — повторный вызов | `unchanged`, файл байт-в-байт                                                                                                                                                                                     |

## Task Decomposition

| Класс  | Признаки                                                                          | Исполнитель                   |
| ------ | --------------------------------------------------------------------------------- | ----------------------------- |
| MEDIUM | ~85 строк логики адаптера + 12 unit-кейсов + 4 e2e/unit-фикстуры + 6 файлов доков | воркеры по таблице playbook'а |

Фактически исполнено в одной сессии без спавна: подзадача связная (один метод + его
тесты), фрагментация дала бы конфликт правок в одном файле и потерю контекста TDD-цикла.
Отклонение зафиксировано здесь; лимит воркеров не расходовался, независимое ревью
получено отдельным агентом (`worker-reviewer`, см. Validation).

## Workers Used

| Агент                                               | Задача                                                       | Итог                                              |
| --------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| `worker-reviewer` (opencode v2.1.4, `--standalone`) | независимое ревью диффа `main...HEAD` против 8 пунктов брифа | `APPROVED`, 0 critical / 0 major / 0 minor, 2 nit |

## Validation Results

TDD: сначала падающие тесты (16 падений: `tests/unit/adapters/platforms/opencode-adapter.test.ts`,
`tests/unit/use-cases/init-project.test.ts`), затем реализация до зелёного.

| Проверка               | Команда                                                                                                                                                                                     | Результат                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| точечные unit          | `npx vitest run tests/unit/adapters/platforms/opencode-adapter.test.ts tests/unit/use-cases/init-project.test.ts tests/unit/init-log-format.test.ts tests/unit/use-cases/uninstall.test.ts` | exit 0 — 4 files / 104 tests passed (адаптер 44)                                                                                                                                                       |
| типы                   | `npx tsc --noEmit` (в составе `npm run check`)                                                                                                                                              | exit 0                                                                                                                                                                                                 |
| полный гейт            | `npm run check`                                                                                                                                                                             | exit 0 — english-surface + format:check + lint + tsc + vitest: **215 files / 1899 tests passed**                                                                                                       |
| e2e init-cli           | `env -u npm_command -u npm_lifecycle_event node node_modules/vitest/vitest.mjs run --config tests/e2e/vitest.config.ts tests/e2e/init-cli.e2e.ts`                                           | exit 0 — 6/6 passed                                                                                                                                                                                    |
| e2e platform-repair    | то же с `tests/e2e/platform-repair.e2e.ts`                                                                                                                                                  | exit 0 — 3/3 passed                                                                                                                                                                                    |
| e2e uninstall          | то же с `tests/e2e/uninstall.e2e.ts`                                                                                                                                                        | exit 0 — 4/4 passed                                                                                                                                                                                    |
| идемпотентность вживую | два `init --full --platform opencode` на tmp-проекте с легаси `subagent_depth: 2`                                                                                                           | run 1: `opencode.json: written (…) — migrated subagent_depth to experimental.subagent_depth`; run 2: `unchanged`; `sha256` файла до/после идентичен (`ce26b422…ff52`)                                  |
| чужое значение вживую  | `init` на tmp-проекте с `subagent_depth: 1`                                                                                                                                                 | `unchanged (mcp.wolf, default_agent=mr-wolf) — top-level subagent_depth=1 is taken; the key is deprecated and ignored by opencode v2 — set experimental.subagent_depth >=2`; файл байт-в-байт нетронут |
| чистота дерева         | `git status --short` после коммитов                                                                                                                                                         | пусто                                                                                                                                                                                                  |

e2e запускались по одному, без параллельных прогонов. Замечание по окружению: если
запускать e2e через `npx`/`npm exec`, `npm_command=exec` включает npx-try-out внутри
`wolf init` и три кейса `init-cli` падают с exit 1 — это артефакт вызова, он
воспроизводится на чистом `main` (проверено до правок) и снимается запуском без
`npm_command` (команда в таблице).

### Вердикт ревью (дословно)

```
VERDICT: APPROVED

SUMMARY: 0 critical / 0 major / 0 minor

**SUMMARY:** Реализация точно соответствует контракту брифа: `writeConfig` пишет глубину только в `experimental.subagent_depth`, чужие значения никогда не перезаписываются (включая не-объектный `experimental` — безопасный отказ с reason вместо потери данных), легаси-`2` мигрирует с удалением deprecated-ключа, идемпотентность байт-в-байт держится. `removeWolfKeys` удаляет только точные наши значения и не оставляет пустой `experimental`. Тесты покрывают всю таблицу веток и ассертят записанный файл, а не только возвращаемый объект; e2e ожидания усилены (добавлен assert «верхнеуровневый ключ не пишется»), ничего не ослаблено. Заявленное поведение сверено с живой схемой https://opencode.ai/config.json: `experimental.subagent_depth` — `integer, minimum 0`, верхнеуровневый — `deprecated: true`, «Defaults to 1» — посылка фикса верна. Докдифф EN/RU согласован, CHANGELOG под `[Unreleased] → ### Fixed`.

**FINDINGS:**
- `[nit]` src/adapters/platforms/opencode-adapter.ts:134 — ветка «experimental не-объект» не проверяет легаси-ключ (комбинация `experimental:"nope"` + `subagent_depth:2` не мигрирует, reason не упоминает легаси). Поведение безопасно (отказ без записи — правильно при не-объектном experimental), но комбинация не покрыта тестом — при желании добавить один кейс.
- `[nit]` src/adapters/platforms/opencode-adapter.ts:32 — `depthIsOurs` принимает нецелые ≥2 (например `2.5`) как «наши» (`unchanged` без reason), а схема платформы требует `integer`. Чужое нецелое не трогаем — корректно, но reason-канал молчит о невалидном для схемы значении; можно ужесточить до `Number.isInteger`.
```

### Commits

- `c6e0b28` — `fix(2.20.1): subagent_depth under experimental (opencode v2)`
- `1baa320` — `docs(2.20.1): subagent_depth lives under experimental`
- `docs/dev/2026-10-25-fix-subagent-depth-experimental/report.md` — этот отчёт

## Отклонения

1. **Одна сессия вместо спавна воркеров** (см. Task Decomposition): связная правка одного
   метода + его тестов; ревью — независимым агентом. Лимит воркеров не израсходован.
2. **`action` при одновременном ремонте `mcp.wolf` и миграции** — `replaced`, не `written`:
   сохранён приоритет существующего контракта (`replaced` = перезаписана запись `mcp.wolf`);
   причина миграции при этом в `reason`. В брифе миграция описана как `written` — этот
   случай (одновременный ремонт mcp) пересечением двух правил и разрешён в пользу
   более сильного сигнала. Чистая миграция даёт ровно `written`.
3. **Изменены ожидания существующих тестов** — только по причине смены пути ключа:
   `CANONICAL`-фикстуры и `OC-K1` в unit, фикстура `R04-7` в `init-project.test.ts`,
   три e2e-ассерта. Формат вывода (`keys`, счётчики) не менялся; ни одна проверка не
   ослаблена — e2e усилены дополнительным assert отсутствия верхнеуровневого ключа.

## Риски

- **Чужое верхнеуровневое значение (≠2) блокирует запись глубины** (конфликт, только
  reason): пользователь с `subagent_depth: 3` на верхнем уровне останется с эффективной
  глубиной 1, пока сам не перенесёт ключ. Это осознанный компромисс контракта «чужое не
  перезаписываем»; reason называет и путь, и требуемое значение.
- **Нецелые значения `exp`** (`2.5`) считаются совместимыми (`>= 2`), хотя схема требует
  `integer`; `2.5` платформа отвергнет сама. Унаследовано от прежней логики (`>=`), не
  регресс (nit ревью, не исправлялся — вне scope брифа).
- **`experimental` не-объект + легаси `2`**: миграция не выполняется, Wolf отказывается
  писать и просит поправить вручную (защита от потери данных). Покрыто reason-каналом,
  отдельным тестом не закреплено (nit ревью).
- **Комментарии в `opencode.jsonc`** по-прежнему теряются при перезаписи — известный
  документированный trade-off адаптера, фикс его не меняет.
