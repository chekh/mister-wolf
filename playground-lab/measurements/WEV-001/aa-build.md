# WEV-001 / A/A — протокол сборки клонов A1/A2 (WB1)

- Дата: 2026-09-05, worktree `.worktrees/wolfeval-phase-b` (ветка
  `feature/wolfeval-phase-b`, база main `214bd09`).
- Инстансы (расходники, вне git): `/tmp/wolfeval-v1/aa/A1`, `/tmp/wolfeval-v1/aa/A2`.
- Сборщик: `fixtures/build-instance.sh … --arm WOLF` (срез `9637506`,
  wolf-pre-2.0.0); XDG-песочницы клонов: `/tmp/wolfeval-v1/aa/xdg-A{1,2}`.

## F12-контроль и реставрация пинов (дрейф окружения до прогонов)

| Артефакт          | Lock (environment-lock.json) | Факт до WB1          | Действие                                   | После     |
| ----------------- | ---------------------------- | -------------------- | ------------------------------------------ | --------- |
| wolf (глобальный) | v2.5.0                       | 2.8.0 (`which wolf`) | `npm i -g mister-wolf@2.5.0` (реставрация) | 2.5.0 ✓   |
| opencode          | 1.18.27                      | 1.18.29              | `opencode upgrade 1.18.27`                 | 1.18.27 ✓ |

`readlink -f "$(which wolf)"` = `/usr/local/lib/node_modules/mister-wolf/dist/bootstrap/cli.js`
— путь соответствует lock, релиз после реставрации совпадает. Обе реставрации
обратимы и не меняют тройку (model, tools, release) — lock не редактировался.

## Pre-flight совместимости (риски ревьюера Фазы A)

1. **Память 1.1.0 ↔ 2.5.0**: на smoke-копии среза выполнен `wolf init` (2.5.0),
   затем `node dist/bootstrap/cli.js list` (CLI инстанса, 1.1.0) — память
   читается, 8 объектов, без ошибок. Совместимость подтверждена, фикстуры
   править не потребовалось.
2. **Формат `wolf list`**: строка `<id> [<type>] [<status>] <title>` идентична
   в 1.1.0 и 2.5.0 (diff `memory-list.ts` между `9637506` и `v2.5.0` — только
   резолв `--type`); парсер campaign-audit (`[active]`, `awk $1`) совместим.
3. **Изоляция сессий (важное отклонение от assumptions Фазы A)**:
   `--no-global` лаунчера (OPENCODE_CONFIG/OPENCODE_CONFIG_DIR на пустые)
   НЕ отсекает глобальные MCP-серверы машины (context7, rtk, codegraph,
   mr-wolf → main-repo dist) — проверено `opencode debug config` на 1.18.27
   и 1.18.29. Угрозы: непиннутый mr-wolf, мутация инстанта codegraph-ом,
   toolset вне lock. Решение БЕЗ правки пиннутого лаунчера: прогоны
   исполняются под `XDG_CONFIG_HOME=/tmp/wolfeval-v1/aa/xdg-<клон>` —
   verified `opencode debug config`: остаётся только проектный `mcp.wolf`
   (command `wolf mcp` → глобальный 2.5.0) и плагины wolf-router/
   wolf-session-start из инстанса. Требует того же решения в Фазе C (обе руки).

## Сборка и идентичность

Порядок: build-instance (срез → фильтр → обезглавливание → npm ci → gate) для
A1 и A2; затем `wolf init --model zai-coding-plan/glm-5.2 --platform opencode`
в каждом клоне под своим XDG-песочником (глобальный реестр
`~/.config/wolf/projects.yaml` не мутируется).

Доказательства идентичности:

- **До init**: tree-хэш initial commit `1bcb3cc27b8e96372b56ce3be15e1616e4c2d39c`
  в ОБОИХ клонах; `diff -r --exclude=.git --exclude=node_modules` — пусто.
- **Gate**: `verify-fixtures` внутри обеих сборок — 6/6 RED (FIXTURE ALIVE).
- **После init**: `diff -r --exclude=.git --exclude=node_modules --exclude=.wolf` —
  пусто (волчьи артефакты init — opencode.json, .opencode/, AGENTS.md —
  побайтово идентичны).
- **Память `.wolf`** (исключена из diff как волатильная по плану): seeded-набор
  7 объектов (5 playbook, 1 rule, 1 init-report) семантически идентичен —
  различия только в собственных `id`-суффиксах и `created_at` (per-init);
  init-report отличается названием клона в заголовке (`Init report: A1|A2`).

Вывод WB1: клоны идентичны до прогона на разрешённом планом уровне сравнения;
фикстура жива (6/6 RED); пины окружения восстановлены и зафиксированы. Расхождение
в волатильном — только ожидаемые id/таймстампы памяти.

## Композиция промпта сессий (фиксируется до прогонов WB2)

Промпт каждого запуска = `start_instruction` (arms.yaml `common`, дословно) +
перевод строки + дословный текст эпизода `instances/WEV-001/e<n>.md`. Состав
идентичен для обоих клонов; сами тексты эпизодов не редактировались
(task_set_hash действует).
