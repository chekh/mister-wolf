# Fixture: wolf-pre-2.0.0 — срез репозитория mister-wolf до релиза 2.0.0

TF-1 «infra-hardening», кампания WEV-001. Инстанс — запускаемый TS-проект
(`npm ci` → `npm run check` работает), в котором одновременно живы все шесть
целевых дефектов (F4, F5+F6, F8, F13, F14+F16, F15 — закрыты в релизах
2.0.0–2.1.0). Git-история инстанса обезглавлена: фиксы недоступны агенту через
`git log` (спека §4.1, гейт E4 п.14).

## Срез

- **Коммит: `963750676909622d3d38b23b05d737be6ce80fef`** (9637506,
  `docs(spec): merge onboarding-pipeline-v2 rev.5 (approved) into main`),
  package.json version 1.1.0.
- Обоснование отклонения от `fa57bb3…` (указан в плане): фиксы F4 и F8 влиты в
  `bf63fab` («feat(onboarding): v2 pipeline — init без скана (F8),
  opencode-конфиг с первого прогона (F4)…»), который является предком
  `fa57bb3` → на `fa57bb3` дефекты F4/F8 уже закрыты и gate «все 6 RED»
  недостижим (проверено: `'no platform detected'` и `scanProject` отсутствуют
  в init-project.ts на `fa57bb3`). Правило спеки §4.1 — «последний коммит
  перед v2.0.0, на котором живы все шесть дефектов» — фактический последний
  такой коммит: **9637506 = bf63fab~1** (последний до вливания фиксов F4/F8).
  Признаки всех шести дефектов на срезе подтверждены grep-ами из
  `verify-fixtures.sh` (см. таблицу ниже).
- **Действие для lead:** обновить `instance_base_commit` в
  `environment-lock.json` (WA2) на `963750676909622d3d38b23b05d737be6ce80fef`
  до первого прогона (до Фазы B).

## Рецепт сборки (исполняется `build-instance.sh`)

Репо-источник — любой чекаут mister-wolf с тегами v2.x (скрипт вычисляет его
от своего расположения: 6 уровней вверх от `fixtures/` — до корня репо;
переопределяется аргументом `--repo <path>`).

1. **Срез:** `git archive 9637506… | tar -x -C <target>` — только
   tracked-файлы, без `.git` и `node_modules`.
2. **Фильтр волчьих артефактов** (конвенция `scripts/playground-reset.sh`) —
   удалить из target: `.opencode/`, `AGENTS.md`, `opencode.json`,
   `.opencode.json`, `.wolf/`, `docs/site/public`, `playground-lab/`,
   `.external-research/`. Контроль pristine ДО коммита: ни один из путей не
   существует. (`playground-lab/` в срезе 1.1.0 отсутствует по построению —
   фильтр защищает от будущих срезов.)
3. **Обезглавливание:** `rm -rf <target>/.git && git init && git add -A &&
   git commit -m "init: срез wolf-pre-2.0.0 без истории"` → в инстансе ровно
   один initial commit, история main недоступна.
4. **npm ci** (до 10 минут; `--no-audit --no-fund`). После него в инстансе
   работает `npm run check` (format:check + lint + build + test:run).
5. **Gate сборки:** `verify-fixtures.sh <target>` — все 6 пунктов дефектов
   обязаны быть RED; иначе сборка падает (F24-класс: сломанная фикстура).

## Руки

- **BASE** (Фаза A валидируется): шаги 1–5, волчьих артефактов нет, `wolf
  init` НЕ выполняется. Никаких pre-seeded заметок (П2 спеки).
- **WOLF** (Фаза B): те же шаги 1–5, затем `wolf init` пинованного релиза
  (`--wolf-tag v2.5.0` по умолчанию, из environment-lock). Живой `wolf init`
  при сборке НЕ исполняется до Фазы B (WB1): скрипт печатает инструкцию.
  Пин/проверка глобального бинаря — F12-контроль перед каждым повтором:
  `readlink -f "$(which wolf)"` сверяется с записью в environment-lock.json.

## Признаки дефектов и фиксы (источник — git-история main, не воображение)

| Пункт    | Файл (в инстансе)                            | RED-признак (дефект жив)                                     | Фикс-коммит | Признак фикса (GREEN)                              |
| -------- | -------------------------------------------- | ------------------------------------------------------------ | ----------- | -------------------------------------------------- |
| F4       | `src/app/use-cases/init-project.ts`          | содержит `'no platform detected'` (skipped-ветка: детекция платформ ДО рендера набора → первый init не пишет opencode.json) | bf63fab (2.0.0) | строки нет: конфиг пишется безусловно по факту рендера |
| F8       | `src/app/use-cases/init-project.ts`          | содержит `scanProject` (init безусловно сканирует документы) | bf63fab (2.0.0) | строки нет: init без скана                          |
| F15      | `src/adapters/platforms/opencode-adapter.ts` | НЕ содержит `subagent_depth` (writeConfig не мерджит глубину) | 8a077f7 (2.0.1) | `SUBAGENT_DEPTH`/`subagent_depth` в адаптере        |
| F5+F6    | `src/adapters/cli/commands/memory-init.ts`   | НЕ содержит `formatBaseSetLine` (лог init без имён скиллов, misleading-строки платформ) | 190ff6a (2.1.0) | `formatBaseSetLine`/`formatPlatformLine` (`[skill] имя → путь`, configFile+keys) |
| F13      | `src/adapters/cli/cli-entry.ts`              | НЕ содержит `safeCwd` (ENOENT uv_cwd сырым стеком из удалённого cwd) | 3bdc117 (2.0.1) | `safeCwd()` оборачивает `process.cwd()` в runCli    |
| F14+F16  | `scripts/bench/lib.sh` + `tests/setup.ts`    | lib.sh НЕ содержит `XDG_CONFIG_HOME` И tests/setup.ts отсутствует/без XDG (bench и vitest пишут в глобальный реестр) | 1dd71e6 (2.0.1, F14) + 190ff6a (2.1.0, F16) | XDG-изоляция в обоих сетапах |

Семантика verify: **RED = дефект жив (фикстура исправна)**; **GREEN = дефект
закрыт (фикстура сломана / чинилась)**. Exit 0 = все 6 RED. Этот же скрипт —
pre-run контроль живости (F24-класс, спека §11.3) перед каждым повтором
кампании.

Инстансы-расходники живут вне git (системный tmp, правило mem_20260901):
`/tmp/wolfeval-v1/…`; в git — только методика (этот рецепт и скрипты).

## Валидация (Фаза A)

Дата: 2026-09-05, worktree `.worktrees/wolfeval-phase-a`. Перед прогонами в
`build-instance.sh` исправлены два дефекта лаунчера, найденных этим же
прогоном (см. «Хронология» ниже): off-by-one в вычислении репо-источника и
литеральные кавычки в replacement параметрического раскрытия.

### Gate-прогон сборки (рука BASE)

Команда (из корня worktree):

```bash
bash playground-lab/benchmarks/wolfeval-v1/task-families/TF-1-infra-hardening/fixtures/build-instance.sh \
  /tmp/wolfeval-v1/wa3-gate --arm BASE
```

Результат: npm ci — 207 пакетов за ~10 с; gate `verify-fixtures` внутри сборки
— все шесть пунктов RED, **exit 0**. Ключевые строки вывода:

```text
==> gate: verify-fixtures (все 6 дефектов обязаны быть RED)
F4: RED — init-project.ts: skipped-ветка 'no platform detected' (детекция до рендера; первый init без платформенного конфига) [fix: bf63fab]
F8: RED — init-project.ts: init вызывает scanProject (авто-scan при init) [fix: bf63fab]
F15: RED — opencode-adapter.ts: subagent_depth отсутствует в рендере конфига [fix: 8a077f7]
F5+F6: RED — memory-init.ts: форматтеры лога init отсутствуют (без имён скиллов, misleading-строки) [fix: 190ff6a]
F13: RED — cli-entry.ts: safeCwd отсутствует — сырой ENOENT uv_cwd из удалённого cwd [fix: 3bdc117]
F14+F16: RED — lib.sh без XDG-изоляции; tests/setup.ts с XDG отсутствует — следы в глобальном реестре за прогон [fix: 1dd71e6 + 190ff6a]
---
FIXTURE ALIVE: 6/6 RED — все дефекты воспроизводятся, фикстура годна (F24-контроль пройден)
OK: инстанс собран (BASE) — /tmp/wolfeval-v1/wa3-gate
```

### Негативная самопроверка (мок-фикс F4, план WA3 шаг 4)

Копия собранного инстанса: `cp -R /tmp/wolfeval-v1/wa3-gate
/tmp/wolfeval-v1/wa3-negcheck`. В копии внесён минимальный мок-фикс F4,
имитирующий суть реального фикса bf63fab (конфиг пишется безусловно,
skipped-ветка исчезает): в `src/app/use-cases/init-project.ts` строка

```text
reason: 'no platform detected; use --platform opencode|claude',
```

заменена на

```text
reason: 'mock-fix: unconditional platform config',
```

(маркер `no platform detected` после замены в файле отсутствует — grep -F
находит 0 вхождений). Затем `verify-fixtures.sh /tmp/wolfeval-v1/wa3-negcheck`.
Вывод дословно:

```text
F4: GREEN — init-project.ts: безусловная запись платформенного конфига (фикс применён)
F8: RED — init-project.ts: init вызывает scanProject (авто-scan при init) [fix: bf63fab]
F15: RED — opencode-adapter.ts: subagent_depth отсутствует в рендере конфига [fix: 8a077f7]
F5+F6: RED — memory-init.ts: форматтеры лога init отсутствуют (без имён скиллов, misleading-строки) [fix: 190ff6a]
F13: RED — cli-entry.ts: safeCwd отсутствует — сырой ENOENT uv_cwd из удалённого cwd [fix: 3bdc117]
F14+F16: RED — lib.sh без XDG-изоляции; tests/setup.ts с XDG отсутствует — следы в глобальном реестре за прогон [fix: 1dd71e6 + 190ff6a]
---
FIXTURE BROKEN: GREEN-пункты: F4 — дефект(ы) закрыты или фикстура мутировала; прогон запрещён (F24)
```

**exit 1**, пункт F4 — GREEN, остальные пять — RED, итоговая строка
`FIXTURE BROKEN: GREEN-пункты: F4`. Вывод: проверки verify реально реагируют
на состояние кода, а не всегда-красные (требование плана WA3 шаг 4).

### Хронология: дефекты лаунчера, найденные gate-прогоном

| #   | Симптом                                            | Причина                                                                                                                                      | Фикс в build-instance.sh                                          |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | `ERROR: репо-источник не mister-wolf: …/playground-lab` | off-by-one: комментарий заявляет «6 уровней вверх», в пути было пять `..` → REPO = `playground-lab`, а не корень репо                        | шестой `..` в вычислении REPO                                     |
| 2   | `ERROR: pristine нарушен — остался .opencode`       | `${PRUNE_PATHS[@]/#/"$TARGET/"}` — bash трактует вложенные кавычки в replacement как литералы (zsh — нет): rm получал пути вида `"<target>".opencode` и молча удалял несуществующее | `${PRUNE_PATHS[@]/#/$TARGET/}` — без вложенных кавычек (вся конструкция уже внутри двойных кавычек) |

Оба дефекта пойманы контрольными точками самого скрипта (проверка
репо-источника и pristine-контроль) — харденинг лаунчера из предыдущей сессии
сработал как задумано.

### Инстансы (расходники, вне git)

| Путь                        | Состояние                        | Назначение                                    |
| --------------------------- | -------------------------------- | --------------------------------------------- |
| `/tmp/wolfeval-v1/wa3-gate` | годный (6/6 RED, npm ci выполнен) | шаблон для Фазы B; smoke WA5                  |
| `/tmp/wolfeval-v1/wa3-negcheck` | мок-фикс F4 (5/6 RED)            | негативный контроль для smoke WA5 (шаг 4)     |

Пустой каталог `/tmp/wolfeval-v1/wa3-selftest` (наследие отменённой сессии)
удалён 2026-09-05.
