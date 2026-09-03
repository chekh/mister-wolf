# Полигон испытаний playground-lab — план реализации

> **Исполнителям:** REQUIRED-СКИЛЛ: используй wolf-sdd (рекомендуется) ИЛИ wolf-execute
> для поэтапной реализации этого плана. Шаги оформлены чекбоксами (`- [ ]`) для трекинга.

**Цель:** создать постоянную зону полигона испытаний `playground-lab/`, мигрировать туда находки/сценарии/протоколы, поглотить `scenario-lab/`, отфильтровать шум reset-снапшота.

**Архитектура:** работа только с markdown/bash/git — кода TypeScript нет. Три зоны: `playground/` — расходный pristine-инстанс; `playground-lab/` — постоянный материал (карты, реестры, методика, скрипты); память Wolf — индекс состояния (обновляет координатор после мержа, НЕ воркеры). Спека: `docs/superpowers/specs/2026-09-03-playground-lab-design.md`.

**Стек:** bash, markdown, git, wolf CLI (`node dist/bootstrap/cli.js` — только в финальных шагах координатора).

**Важно всем задачам:**
- План из двух фаз. **Фаза A — worktree** `.worktrees/playground-lab`
  (`git worktree add .worktrees/playground-lab -b feature/playground-lab`),
  задачи 1, 2, 6, 7 (только трекаемые файлы), затем мерж в main.
  **Фаза B — cwd main-репо, прямые коммиты в main**, задачи 3, 4, 5, 8:
  их объекты (`playground/*`, `.wolf/orchestration/*`) НЕ трекаются git и
  физически существуют только в рабочей копии main; в worktree их нет.
  Задача 8 (reset) выполняется только после мержа Фазы A — нужен новый
  reset-скрипт из задачи 7.
- НЕ запускать `wolf`-команды записи из worktree (память пишется в cwd;
  воркер в worktree записал бы не в ту память).
- Коммитить после каждой задачи.
- Задача 8 (reset) уничтожает текущее содержимое `playground/` — выполнять
  только после задачи 5 (материал MANUAL-NOTES перенесён).

---

### Задача 1: Скелет playground-lab — README, шаблон карты, каталоги (Фаза A, worktree)

**Файлы:**
- Create: `playground-lab/README.md`
- Create: `playground-lab/templates/experiment-card.md`
- Create: `playground-lab/experiments/.gitkeep`
- Create: `playground-lab/registry/.gitkeep` (будет удалён в задачах 3–4, когда появятся файлы)
- Create: `playground-lab/measurements/.gitkeep`
- Create: `playground-lab/archive/.gitkeep` (удалится при git mv в задаче 6)

- [ ] **Шаг 1: Создать каталоги**

```bash
mkdir -p playground-lab/templates playground-lab/experiments playground-lab/registry playground-lab/measurements playground-lab/archive playground-lab/scripts
touch playground-lab/experiments/.gitkeep playground-lab/registry/.gitkeep playground-lab/measurements/.gitkeep playground-lab/archive/.gitkeep
```

- [ ] **Шаг 2: Написать `playground-lab/README.md`**

````markdown
# Playground Lab — полигон испытаний Mr. Wolf

Постоянная зона проекта для тестирования, испытаний и проверки гипотез на
расходной pristine-площадке `playground/`. Методика — эволюция сценарной
лаборатории `archive/scenario-lab/` (кампания разработки концепта, завершена).

## Три зоны и что где живёт

| Зона | Роль | Что можно |
|---|---|---|
| `playground/` | расходный pristine-инстанс (свой git) | запускать сценарии, ломать, reset |
| `playground-lab/` | постоянный материал проекта (git main-репо) | карты, реестры, измерения, скрипты |
| память Wolf (`.wolf/` main-репо) | индекс состояния | experiment-объекты, уроки, решения |

**Правило:** в `playground/` не остаётся ничего ценного. Протокол и материалы
переносятся в лабораторию сразу по завершении эксперимента — reset имеет право
их стереть. Память Wolf индексирует (гипотеза, статус, путь к карте), но не
хранит протоколы — как document-ref.

## Сущности

- **Эксперимент** — карта `experiments/YYYY-MM-DD-<slug>.md`, id
  `EXP-ГГГГММДД-<slug>`. Жизненный цикл: `planned → running → analyzed →
  concluded`. Шаблон: `templates/experiment-card.md`.
- **Находка** — строка в `registry/findings.md`. Формат: таблица
  `ID | Дата | Сценарий | Тип | Описание | Статус`; F-нумерация сквозная.
  Статусы: `open → in-brief → fixed / rejected / documented`.
- **Сценарий** — переиспользуемая карта прогона в `registry/scenarios.md`:
  шаги, чек-лист, ожидания.
- **Измерение** — сырые данные в `measurements/<exp-id>/`; выжимка с
  интерпретацией — в карту. Весовые токены: input + 0.1×cache_read + 5×output
  (правило mem_20260824__d072b4); плюс время, итерации.

## Граница с памятью Wolf

1. Старт эксперимента → `wolf add --type experiment` (гипотеза одной строкой,
   путь к карте, статус `running`). Выполняется в cwd main-репо.
2. Завершение → `wolf transition` + уроки/решения в память с тегом
   `playground`; находки, требующие действия владельца, — blocker/open-question.
3. Карта и сырьё остаются здесь, в git.

## Скрипты

- `scripts/verify-pristine.sh` — чиста ли площадка (запускать перед экспериментом).
- Пересоздание: `scripts/playground-reset.sh [--force]` из корня main-репо
  (pristine, без wolf init — init всегда первый эксперимент свежей площадки).
````

- [ ] **Шаг 3: Написать `playground-lab/templates/experiment-card.md`**

````markdown
# EXP-<ГГГГММДД>-<slug>: <короткое имя>

- Статус: planned <!-- planned | running | analyzed | concluded -->
- Дата: <ГГГГ-ММ-ДД>
- Гипотеза: <одно проверяемое утверждение>

## Сетап
<!-- варианты инстанса площадки; для сравнительных опытов — по строке на вариант -->
| Вариант | Агенты/конфигурация | Отличие от базового |
|---|---|---|
| baseline | без Wolf | — |
| variant-wolf | base-set Wolf (wolf init) | + |

## Метод измерения
<!-- какие метрики и как снимаются: весовые токены (input + 0.1×cache_read + 5×output),
     время, число итераций/правок; инструменты фиксации -->

## Сценарии
<!-- ссылки на карты из registry/scenarios.md -->

## Ожидаемое поведение
<!-- что наблюдаем, если гипотеза верна (дисциплина scenario-lab: expected_visible_behavior) -->

## Протокол
<!-- ход прогона, наблюдения, отклонения; сырьё (логи, счётчики) — в measurements/<exp-id>/ -->

## Находки
<!-- F-id из registry/findings.md, по одному на строку, с контекстом -->

## Вердикт
<!-- подтверждена / опровергнута + следствия;
     уроки и решения по итогам — в память Wolf с тегом playground -->
````

- [ ] **Шаг 4: Проверка структуры**

```bash
find playground-lab -type f | sort
```

Ожидание: README.md, templates/experiment-card.md, четыре .gitkeep (experiments, registry, measurements, archive), scripts/ пуст.

- [ ] **Шаг 5: Закоммитить**

```bash
git add playground-lab
git commit -m "feat(playground-lab): скелет полигона — методика и шаблон карты эксперимента"
```

---

### Задача 2: Скрипт verify-pristine.sh (Фаза A, worktree)

**Файлы:**
- Create: `playground-lab/scripts/verify-pristine.sh`

- [ ] **Шаг 1: Написать скрипт**

```bash
#!/usr/bin/env bash
# playground-lab/scripts/verify-pristine.sh — чиста ли площадка?
# Pristine = нет wolf-артефактов, нет шума снапшота, git площадки чист.
# Exit 0 — pristine; exit 1 — грязная или отсутствует.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLAYGROUND="$REPO_ROOT/playground"

if [[ ! -d "$PLAYGROUND" ]]; then
  echo "MISSING: playground/ не существует — нужен reset (scripts/playground-reset.sh)"
  exit 1
fi

fail=0
for p in .wolf .opencode AGENTS.md opencode.json .opencode.json .wolfrc \
         docs/site/public playground-lab; do
  if [[ -e "$PLAYGROUND/$p" ]]; then
    echo "DIRTY: остался $p"
    fail=1
  fi
done

if [[ -n "$(git -C "$PLAYGROUND" status --porcelain 2>/dev/null)" ]]; then
  echo "DIRTY: незакоммиченные изменения в git площадки"
  fail=1
fi

if [[ "$fail" -eq 0 ]]; then
  echo "PRISTINE: площадка чиста — можно запускать эксперимент"
fi
exit "$fail"
```

- [ ] **Шаг 2: Сделать исполняемым**

```bash
chmod +x playground-lab/scripts/verify-pristine.sh
```

- [ ] **Шаг 3: Проверить на текущей (грязной) площадке**

```bash
playground-lab/scripts/verify-pristine.sh; echo "exit=$?"
```

Ожидание: `DIRTY: остался .wolf` (площадка после прошлых экспериментов), exit=1.
Если вывод иной — остановиться и разобраться, не двигаться дальше вслепую.

- [ ] **Шаг 4: Закоммитить**

```bash
git add playground-lab/scripts/verify-pristine.sh
git commit -m "feat(playground-lab): verify-pristine — проверка чистоты площадки"
```

---

### Задача 3: Миграция реестра находок (Фаза B, cwd main-репо)

**Файлы:**
- Move: `.wolf/orchestration/playground-issues.md` → `playground-lab/registry/findings.md`
  (файл НЕ трекается git — обычный `mv`; `.wolf/` в git — только SKILL.md)

- [ ] **Шаг 1: Проверить, что файл не трекается**

```bash
git ls-files .wolf/orchestration/playground-issues.md
```

Ожидание: пустой вывод. Если файл внезапно трекается — использовать `git mv` вместо `mv`.

- [ ] **Шаг 2: Перенести файл**

```bash
mv .wolf/orchestration/playground-issues.md playground-lab/registry/findings.md
```

- [ ] **Шаг 3: Обновить шапку реестра**

В `playground-lab/registry/findings.md` заменить первые 5 строк (старая шапка)
на:

```markdown
# FINDINGS — реестр проблем, найденных на полигоне

Живой реестр дефектов и трения из догфудинга `playground/` (расходный
pristine-инстанс). Сырой протокол сценариев — черновик `playground/MANUAL-NOTES.md`
до переноса в карты экспериментов. F-нумерация сквозная с момента основания.
Статусы: `open` → `in-brief` (диспетчено) → `fixed` / `rejected` (с причиной).
```

Таблицу F1–F16 и раздел «Принятые решения по находкам» не менять.

- [ ] **Шаг 4: Закоммитить**

```bash
git add playground-lab/registry/findings.md
git commit -m "feat(playground-lab): реестр находок переехал из .wolf/orchestration"
```

---

### Задача 4: Библиотека сценариев + облегчение README-PLAYGROUND (Фаза B, cwd main-репо)

**Файлы:**
- Create: `playground-lab/registry/scenarios.md`
- Modify: `playground/README-PLAYGROUND.md` (сократить; файл переживает reset — правим до reset)
- Delete: `playground-lab/registry/.gitkeep`

- [ ] **Шаг 1: Создать `playground-lab/registry/scenarios.md`**

Скопировать из `playground/README-PLAYGROUND.md` секции сценариев (заголовок
«## Сценарий 1 (главный): первый `wolf init`» и всё ДО заголовка
«## Сравнение с эталоном», НЕ включая его) в новый файл под шапкой:

```markdown
# SCENARIOS — библиотека сценариев полигона

Переиспользуемые карты прогонов: шаги, чек-листы, ожидания. Площадка — расходный
инстанс; сценарии живут здесь и переживают reset. CLI для площадок:
`node dist/bootstrap/cli.js` из cwd `playground/` (см. README-PLAYGROUND.md).
```

Содержимое сценариев перенести дословно, поправив только внутренние ссылки:
пути вида `node ../dist/bootstrap/cli.js` сохранить (cwd площадки неизменен);
упоминания «см. README-PLAYGROUND.md» оставить валидными.

- [ ] **Шаг 2: Сократить `playground/README-PLAYGROUND.md`**

Заменить содержимое целиком на:

````markdown
# Mr. Wolf Playground (pristine)

Расходная площадка полигона (см. `../playground-lab/README.md`): чистый снапшот
кода, память пустая, Wolf НЕ установлен, `.opencode/` и `.wolf/` отсутствуют.
Первый эксперимент всегда — `wolf init`.

Это **независимый git-репозиторий** внутри `mister-wolf/playground/`
(главный репо его игнорирует). Начальный коммит: «init: чистый снапшот кода
без wolf-артефактов».

> **Память.** Координационная память проекта — `mister-wolf/.wolf/` (main-репо).
> Память площадки появится только после `wolf init` — `playground/.wolf/`.
> Сценарии выполняются с cwd = `playground/` и пишут ТОЛЬКО в память площадки.

CLI — локальный билд main-репо: `node ../dist/bootstrap/cli.js` (из площадки).

**Сценарии и чек-листы — в `../playground-lab/registry/scenarios.md`.**
Постоянный материал (карты экспериментов, реестр находок, измерения) — в
`../playground-lab/`; здесь его быть не должно, reset стирает всё кроме этого
файла.

## Пересоздать площадку (pristine)

Из корня main-репо (НЕ из площадки):

```bash
scripts/playground-reset.sh          # спросит подтверждение
scripts/playground-reset.sh --force  # без вопросов
```

Скрипт удаляет ТОЛЬКО `playground/`, снимает снапшот main, исключает
wolf-артефакты и шум (`.opencode/`, `AGENTS.md`, `opencode.json`,
`.opencode.json`, `.wolf/`, `docs/site/public`, `playground-lab/`), делает
git init + начальный коммит. `wolf init` НЕ выполняется — он первый
эксперимент свежей площадки.
````

- [ ] **Шаг 3: Убрать пустой маркер и закоммитить**

```bash
rm playground-lab/registry/.gitkeep
git add playground-lab/registry/scenarios.md playground/README-PLAYGROUND.md
git commit -m "feat(playground-lab): библиотека сценариев; README-PLAYGROUND облегчён до запуска/reset"
```

---

### Задача 5: Образец карты эксперимента + measurements + обнуление MANUAL-NOTES (Фаза B, cwd main-репо)

**Файлы:**
- Create: `playground-lab/experiments/2026-09-01-onboarding-v2.md`
- Create: `playground-lab/measurements/2026-09-01-onboarding-v2/protocol.md`
- Modify: `playground/MANUAL-NOTES.md` (обнулить до роли черновика)

- [ ] **Шаг 1: Создать `playground-lab/experiments/2026-09-01-onboarding-v2.md`**

````markdown
# EXP-20260901-onboarding-v2: онбординг v2 на площадке

- Статус: concluded
- Дата: 2026-09-01
- Гипотеза: двухшаговый онбординг v2 (init с флагами + bootstrap) проходим
  владельцем на pristine-площадке без ручной починки артефактов.

## Сетап
| Вариант | Конфигурация | Отличие от базового |
|---|---|---|
| onboarding-v2-impl | глобальный wolf = npm link на ветку onboarding-v2-impl | ветка с фиксом онбординга (F4, F8) |

## Метод измерения
Чек-лист прогона (PASS/FAIL по пунктам), ручная верификация артефактов init
(состав рендера, идемпотентность, память не тронута). Метрики токенов не
снимались.

## Сценарии
Сценарий 3 из `playground/README-PLAYGROUND.md` (редакция 2026-09-01):
онбординг v2 — init без флагов, init повторный, диалог первой сессии, sync.

## Ожидаемое поведение
- init без флагов в не-TTY → exit 1 + подсказка флагов
- init с первого раза пишет opencode.json + default_agent, не сеет документы
- повторный init — 0 created, память не тронута
- сигнал онбординга гаснет после bootstrap, новая сессия его не поднимает

## Протокол
Полный маршрут владельца исполнен координатором — ALL PASS:
Q11 (exit 1 + подсказки) ✓; init: opencode.json + default_agent=mr-wolf
с первого раза (F4 закрыт) ✓, 0 doc-файлов (F8 закрыт) ✓, AGENTS.md создан ✓,
шаблон `{{model.primary}}` с подставленной моделью ✓; Q1: повторный init
0 created, память (8 объектов) не тронута ✓; диалог первой сессии: mr-wolf
сам предлагает bootstrap, исполняет, верифицирует `wolf call` ✓; новая сессия
онбординг не поднимает ✓; sync: «content identical» ✓.
Сырой протокол: `../measurements/2026-09-01-onboarding-v2/protocol.md`.

## Находки
- Наблюдение (не дефект): командный хинт «node dist/bootstrap/cli.js bootstrap
  (в dogfood-репо)» контекстно неточен для чужого проекта; агент сам исправился.
- Наблюдение (уточнение спеки): сигнал гаснет при выполненном bootstrap, а не
  при «thread completed» — UX удобнее буквы Q4, зафиксировать в спеке.

## Вердикт
Гипотеза подтверждена. Онбординг v2 принят (релиз 2.0.0). Наблюдения переданы
в спеку онбординга; отдельный код не требуется.
````

- [ ] **Шаг 2: Создать `playground-lab/measurements/2026-09-01-onboarding-v2/protocol.md`**

Перенести дословно содержимое секций «Сценарий 3» и «Сценарий 4» из
`playground/MANUAL-NOTES.md` (весь текст между `## Сценарий 3:` и концом
файла) под шапкой:

```markdown
# Сырой протокол — EXP-20260901-onboarding-v2

Источник: playground/MANUAL-NOTES.md до reset 2026-09-03. Не редактируется —
историческая запись прогона.
```

- [ ] **Шаг 3: Обнулить `playground/MANUAL-NOTES.md`**

Заменить содержимое целиком на:

```markdown
# MANUAL-NOTES — черновой протокол площадки

Черновик наблюдений во время прогона. Постоянного материала здесь быть НЕ
должно: после эксперимента протокол переносится в playground-lab
(выжимка — в карту `experiments/`, сырьё — в `measurements/<exp-id>/`).
Reset площадки имеет право стереть этот файл.

Реестр находок: `../playground-lab/registry/findings.md`.
Сценарии: `../playground-lab/registry/scenarios.md`.
```

- [ ] **Шаг 4: Закоммитить**

```bash
git add playground-lab/experiments/2026-09-01-onboarding-v2.md playground-lab/measurements/2026-09-01-onboarding-v2/protocol.md playground/MANUAL-NOTES.md
git commit -m "feat(playground-lab): образец карты эксперимента (онбординг v2); MANUAL-NOTES объявлен черновиком"
```

---

### Задача 6: Поглощение scenario-lab (Фаза A, worktree)

**Файлы:**
- Move (git mv): `scenario-lab/` → `playground-lab/archive/scenario-lab/` (26 трекаемых файлов)
- Delete: `playground-lab/archive/.gitkeep` (маркер не нужен после mv)
- Modify: `docs/superpowers/specs/2026-08-31-base-sets-design.md:156` (строка «Не берём: mr-wolf-scenario-lab …»)
- Modify (вне репо): `~/.config/opencode/superpowers/skills/mr-wolf-scenario-lab/SKILL.md`

- [ ] **Шаг 1: Переместить каталог с историей**

```bash
mkdir -p playground-lab/archive
git mv scenario-lab playground-lab/archive/scenario-lab
rm playground-lab/archive/.gitkeep
git status --short | head -30
```

Ожидание: 26 переименований `scenario-lab/… → playground-lab/archive/scenario-lab/…`,
раздел «Принятые решения» реестра не задет.

- [ ] **Шаг 2: Поправить упоминание в спеке base-sets**

В `docs/superpowers/specs/2026-08-31-base-sets-design.md` найти строку
(≈156): `**Не берём**: \`mr-wolf-scenario-lab\` (машино-специфичные абсолютные пути),`
и дописать в конец строки: `материал лаборатории заархивирован в playground-lab/archive/scenario-lab (2026-09-03)`.

- [ ] **Шаг 3: Обновить глобальный скилл**

В `~/.config/opencode/superpowers/skills/mr-wolf-scenario-lab/SKILL.md`:

1. Заменить все три вхождения пути
   `/Users/chekh/Development/mister-wolf/scenario-lab/`
   на `/Users/chekh/Development/mister-wolf/playground-lab/archive/scenario-lab/`
   (строки ≈12, ≈145, ≈154: REQUIRED REFERENCES, references, workspace).

```bash
grep -n "scenario-lab" ~/.config/opencode/superpowers/skills/mr-wolf-scenario-lab/SKILL.md
```

Ожидание после правки: каждое упоминание пути содержит `playground-lab/archive/scenario-lab`.

2. Сразу после frontmatter (после закрывающего `---`) вставить баннер:

```markdown
> **КАМПАНИЯ ЗАВЕРШЕНА (2026-09-03).** Сценарная лаборатория поглощена полигоном
> испытаний: материал — `playground-lab/archive/scenario-lab/`, действующая
> методика опытов — `playground-lab/README.md`. Скилл оставлен для истории;
> для новых испытаний используй полигон.
```

- [ ] **Шаг 4: Закоммитить (репо; правка скилла вне git)**

```bash
git add playground-lab/archive docs/superpowers/specs/2026-08-31-base-sets-design.md
git commit -m "feat(playground-lab): поглощение scenario-lab — архив кампании концепта"
```

---

### Задача 7: Reset-скрипт — фильтр шума снапшота (Фаза A, worktree)

**Файлы:**
- Modify: `scripts/playground-reset.sh:62-67` (блок исключений) и `:71-77` (контроль pristine)

- [ ] **Шаг 1: Расширить список исключений**

В `scripts/playground-reset.sh` заменить блок:

```bash
# pristine: выкинуть wolf-артефакты, пришедшие из снапшота main
rm -rf "$PLAYGROUND/.opencode" \
       "$PLAYGROUND/AGENTS.md" \
       "$PLAYGROUND/opencode.json" \
       "$PLAYGROUND/.opencode.json" \
       "$PLAYGROUND/.wolf"
```

на:

```bash
# pristine: выкинуть wolf-артефакты и шум снапшота main
# (vitrina — тяжёлые ассеты; playground-lab — мета-инструментарий главного репо)
rm -rf "$PLAYGROUND/.opencode" \
       "$PLAYGROUND/AGENTS.md" \
       "$PLAYGROUND/opencode.json" \
       "$PLAYGROUND/.opencode.json" \
       "$PLAYGROUND/.wolf" \
       "$PLAYGROUND/docs/site/public" \
       "$PLAYGROUND/playground-lab"
```

- [ ] **Шаг 2: Расширить контроль pristine**

Заменить:

```bash
for p in .opencode .wolf AGENTS.md opencode.json .opencode.json .wolfrc; do
```

на:

```bash
for p in .opencode .wolf AGENTS.md opencode.json .opencode.json .wolfrc \
         docs/site/public playground-lab; do
```

- [ ] **Шаг 3: Обновить шапку скрипта**

В комментарии-шапке (строки 1–12) пункт 3 дополнить: после
«`.wolf/` (в main трекается SKILL.md)» добавить строку
`#      + шум: docs/site/public (ассеты витрины), playground-lab/ (полигон)`.

- [ ] **Шаг 4: Закоммитить**

```bash
git add scripts/playground-reset.sh
git commit -m "feat(playground): reset исключает docs/site/public и playground-lab из снапшота"
```

---

### Задача 8: Верификация reset и verify-pristine (Фаза B, cwd main-репо; после мержа Фазы A)

**Файлы:** изменений нет — только проверка. Выполнять строго после задачи 5
и после мержа Фазы A (нужен новый reset-скрипт из задачи 7).

- [ ] **Шаг 1: Пересоздать площадку**

```bash
scripts/playground-reset.sh --force
```

Ожидание: `OK: площадка пересоздана (pristine) — <worktree>/playground`.
Скрипт удаляет только `playground/` — README площадки восстановится из бэкапа.

- [ ] **Шаг 2: Проверить pristine вручную**

```bash
ls playground/.wolf playground/.opencode playground/AGENTS.md playground/opencode.json playground/docs/site/public playground/playground-lab 2>&1 | true
git -C playground log --oneline
git -C playground status --porcelain
```

Ожидание: все перечисленные пути отсутствуют (каждый — «No such file or
directory»); один коммит «init: чистый снапшот кода без wolf-артефактов»;
статус чист.

- [ ] **Шаг 3: Проверить verify-pristine на чистой площадке**

```bash
playground-lab/scripts/verify-pristine.sh; echo "exit=$?"
```

Ожидание: `PRISTINE: площадка чиста — можно запускать эксперимент`, exit=0.

- [ ] **Шаг 4: Убедиться, что init остаётся первым экспериментом**

`wolf init` НЕ запускать. Проверить отсутствие волчьих следов:

```bash
ls -a playground | grep -c "^\.wolf$"
```

Ожидание: `0` (grep ничего не нашёл; grep -c печатает 0).

---

## Финал — выполняет координатор в main-репо (НЕ воркер в worktree)

1. Мерж worktree `feature/playground-lab` → `main` (Фаза A), удаление worktree
   (`.worktrees/playground-lab`). Затем Фаза B (задачи 3, 4, 5, 8).
2. `playground-lab/scripts/verify-pristine.sh` → PRISTINE, exit 0
   (канонический reset уже выполнен в задаче 8).
3. `npm run check` — зелёный.
4. Память Wolf (cwd = main-репо):
   - `wolf transition mem_20260903_poligon_ispytaniy_playground_lab_dizayn_825d04 <статус реализовано>`
   - обновить work-thread dogfooding (mem_20260901_dogfooding_ploshchadki):
     wolf add с новыми путями (реестр → playground-lab/registry/findings.md,
     сценарии → registry/scenarios.md, протокол-черновик → MANUAL-NOTES),
     старые пути пометить перенесёнными.
5. Отчёт координатору: перечисленные команды + выводы (для приёмки по §8 спеки).
