# SCENARIOS — библиотека сценариев полигона

Переиспользуемые карты прогонов: шаги, чек-листы, ожидания. Площадка — расходный
инстанц; сценарии живут здесь и переживают reset. CLI для площадок:
`node dist/bootstrap/cli.js` из cwd `playground/` (см. README-PLAYGROUND.md).

Расширенный каталог (2026-09-03): группы U/M/T/L/S/W/RT/X/R/G — см. оглавление ниже.

- U — установка и дистрибуция;
- M — память и поиск;
- T — трёхуровневая агентская схема;
- L — проверка обучения;
- S — Стюард;
- W — лица воркеров;
- RT — проверка роутинга wolf-router;
- X — доказательные измерения эффективности;
- R — отказоустойчивость;
- G — сводный регресс-чеклист перед релизами.

## Сценарий 1 (главный): первый `wolf init`

Инициализация памяти и базового набора на pristine-проекте. Перед запуском
нужен свежий билд: `npm run build` в main-репо.

```bash
cd /Users/chekh/Development/mister-wolf/playground
node /Users/chekh/Development/mister-wolf/dist/bootstrap/cli.js init
```

Команда идемпотентна и неинтерактивна (`--help`: опции `--platform <ids>`
для явного списка платформ, `--recreate` для пересоздания повреждённого
config). Существующие файлы не перезаписывает (wx-политика).

### Чек-лист проверки результата

| # | Проверка | Команда (cwd = playground) | Ожидание |
|---|---|---|---|
| 1 | Агенты | `ls .opencode/agents \| wc -l` | **6** (mr-wolf, executor-lead, steward, worker-*) |
| 2 | Скиллы | `ls .opencode/skills \| wc -l` | **13** |
| 3 | Команды | `ls .opencode/command \| wc -l` | **3** (analyze-doc, complain, doc-review) |
| 4 | Плагины | `ls .opencode/plugins \| wc -l` | **2** (wolf-router.ts, wolf-session-start.js) |
| 5 | Playbook'и seeded | `node ../dist/bootstrap/cli.js list --type playbook` | **6**, status active, `review_state: accepted` |
| 6 | Штампы рендера | `grep -r "wolf:rendered" .opencode/ \| wc -l` | > 0, у каждого отрендеренного файла |
| 7 | opencode.json | `cat opencode.json` | создан init'ом |

После проверки закоммитить артефакты init'а в git площадки — так появится
второй коммит «wolf init из локального билда», и diff до/после останется
воспроизводимым.

## Сценарии 2–7 (после init)

### 2. Живая сессия: инъекции recap/call и прогон агента

```bash
cd playground
node ../dist/bootstrap/cli.js call    # call-injections по умолчанию
node ../dist/bootstrap/cli.js brief   # agent brief: правила, треды, блокеры
opencode run "Прочитай README.md и назови 3 главные возможности Mr. Wolf"
```

Плагин wolf-session-start подхватит площадку как отдельный проект
(память = `playground/.wolf/`); brief показывает seeded playbook'и и пустые
блокеры (scan выполняется при init).

### 3. /doc-review на реальном файле снапшота

```bash
opencode run "/doc-review docs/guide/user-guide.md"
```

Ревью идёт по методике playbook'а analyze-doc из памяти площадки,
файл — реальный документ снапшота.

### 4. /solve — executor-поток на микрозадаче

```bash
opencode run "/solve В README.md нет ссылки на SECURITY.md — добавь ссылку в подходящий раздел"
```

solve-classify разложит микрозадачу → solve-pack → executor → ревью.

### 5. Жалобный контур: /complain и воркер-путь → Стюард → supersede

Владелец жалуется на правило/playbook:

```bash
opencode run "/complain Правило X из playbook'а worker-implementer мешает: требует TDD на однострочных правках"
```

Прямой CLI-путь (тот же контракт: about/rule/evidence/proposal):

```bash
node ../dist/bootstrap/cli.js complain \
  --about "skill:wolf-execute" \
  --rule "шаг верификации требует полного npm run check" \
  --evidence "правка 1 строки README — check гоняет 707 тестов 18с" \
  --proposal "порог: check для кода, prettier-only для *.md"
```

Путь объекта: `complaint` (status open) → триаж → Стюард (агент steward +
playbook complaint-protocol) → мутация playbook'а → `supersede` старой
версии. SLA тикает с момента подачи.

### 6. wolf sync после правки штампованного файла

Штампованные файлы (маркер `wolf:rendered`) управляются Wolf. Правка руками
→ расхождение с базой → ре-рендер:

```bash
# правим штампованный файл, затем:
node ../dist/bootstrap/cli.js sync   # re-render stamped only, память не тронута
```

### 7. Наблюдение триажа и SLA (память площадки)

```bash
node ../dist/bootstrap/cli.js search "жалоб" --type complaint
node ../dist/bootstrap/cli.js search "complaint" --status open
node ../dist/bootstrap/cli.js list --type complaint
```

Видно: статус (open/triaged/…), возраст → SLA, связи с playbook'ами.

# РАСШИРЕННЫЙ КАТАЛОГ

Конвенции команд каталога:

- cwd `playground/`: CLI = `node ../dist/bootstrap/cli.js <cmd>`;
- cwd main-репо: `node dist/bootstrap/cli.js <cmd>`;
- группа U (глобальный пакет): `npm i -g mister-wolf@latest`, бинар `wolf <cmd>`;
- временные каталоги: `mktemp -d` (системный tmp разрешён);
- измерения (группа X): сырьё — `playground-lab/measurements/<exp-id>/`, выжимка —
  карта эксперимента по шаблону `../templates/experiment-card.md` (путь
  относительно registry/).

## Группа U — установка и дистрибуция

cwd main-репо (не площадки).

### U1. Установка/обновление глобального пакета (бывш. протокол U1)

**Цель:** чистый цикл установки/обновления.

**Шаги:**

```bash
# cwd main-репо
npm rm -g mister-wolf && npm i -g mister-wolf@latest
npm ls -g mister-wolf   # без «->» в строке: не симлинк (регрессия F1)
wolf --version
```

**Ожидания/чек-лист:**

- бинарь из реестра, версия = latest;
- в мануал — ожидаемый вес установки.

### U2. Downgrade/upgrade памяти

**Цель:** обратная совместимость схем памяти между версиями.

**Шаги:**

```bash
# cwd main-репо
npm i -g mister-wolf@2.1.0
# прогон на памяти, записанной 2.2.1:
wolf brief
wolf search "<тема>"
npm i -g mister-wolf@latest   # обратно
```

**Ожидания/чек-лист:**

- чтение без миграций/ошибок;
- схема совместима.

### U3. init на чужом проекте

**Цель:** детекция платформ вне wolf-снапшота.

**Сетап:** временный каталог с одним README.md:

```bash
TMP=$(mktemp -d) && cd "$TMP" && echo "# alien project" > README.md
```

**Шаги:**

```bash
wolf init --help
wolf init --platform opencode
```

**Ожидания/чек-лист:**

- рендер базового набора;
- корректный отчёт made/found/needs-fix;
- AGENTS.md создан.

### U4. npx-путь (блокер isNpxRun)

**Цель:** воспроизвести открытый блокер релиза 1.0.0 — isNpxRun() не
срабатывает (blocker mem_20260830_defekt_reliza_1_0_0_isnpxrun_ne_srabatyv_833af0).

**Шаги:**

```bash
TMP=$(mktemp -d) && cd "$TMP"
npx mister-wolf@latest init
# проверить, не пишет ли MCP-конфиг туда, куда не должен
```

**Ожидания/чек-лист:**

- поведение задокументировано;
- если дефект жив — находка в реестр F17+ (registry/findings.md).

### U5. Изоляция окружений WOLF_HOME/XDG

**Цель:** две площадки не видят память друг друга.

**Шаги:**

```bash
A=$(mktemp -d); B=$(mktemp -d)
cd "$A" && WOLF_HOME="$A" wolf init
cd "$B" && WOLF_HOME="$B" wolf init
# одинаковый запрос в обоих:
WOLF_HOME="$A" wolf search "<запрос>"
WOLF_HOME="$B" wolf search "<запрос>"
```

**Ожидания/чек-лист:**

- памяти изолированы (регрессия F14/F16-класса).

## Группа M — память и поиск

cwd `playground/`, после init.

### M1. FTS после фиксов 2.1.0 (регрессия F9/F10)

**Цель:** поиск не стеношумит и не молчит.

**Шаги:**

```bash
node ../dist/bootstrap/cli.js search "md"
node ../dist/bootstrap/cli.js search "supersede"
node ../dist/bootstrap/cli.js list --type document
```

**Ожидания/чек-лист:**

- `search "md"` — НЕ стеношум, результат << всех документов;
- `search "supersede"` — контентный, находит;
- `list --type document` — заведомо невалидный/алиасный тип (зонд): ожидание —
  подсказка валидных типов/алиасов, не молчаливая пустота.

Связь: F9, F10.

### M2. init-scan лёгкий (регрессия F8)

**Цель:** init не тянет тяжёлый scan.

**Шаги:**

```bash
# pristine площадка:
node ../dist/bootstrap/cli.js init
ls .wolf/memory/*doc* 2>/dev/null | wc -l   # doc-файлов нет, только seeded
# полный scan — отдельной командой вручную:
node ../dist/bootstrap/cli.js scan
```

**Ожидания/чек-лист:**

- после init: 0 doc-файлов, только seeded.

Связь: F8.

### M3. Supersede-цепочка

**Цель:** поиск видит только актуальную версию цепочки.

**Шаги:**

```bash
# трижды add --type decision, связывая supersede-цепочкой v1→v2→v3:
node ../dist/bootstrap/cli.js add --type decision --title "<v1>" --body "<текст>"   # запомнить id
node ../dist/bootstrap/cli.js add --type decision --title "<v2>" --body "<текст>"
node ../dist/bootstrap/cli.js add --type decision --title "<v3>" --body "<текст>"
node ../dist/bootstrap/cli.js supersede <id-v1> <id-v2>
node ../dist/bootstrap/cli.js supersede <id-v2> <id-v3>
node ../dist/bootstrap/cli.js search "<тема>"
node ../dist/bootstrap/cli.js get <id-v1>
```

**Ожидания/чек-лист:**

- `search` по теме — находит только актуальную;
- `get <старый-id>` — помечен superseded_by.

### M4. Правила proposed→accepted→recap (регрессия F11)

**Цель:** принятое правило попадает в инъекции следующей сессии.

**Шаги:**

```bash
node ../dist/bootstrap/cli.js add --type rule --title "<правило>" --body "<текст>"   # status proposed
node ../dist/bootstrap/cli.js transition <id> accepted
node ../dist/bootstrap/cli.js brief
node ../dist/bootstrap/cli.js recap
```

**Ожидания/чек-лист:**

- правило в Active rules/инъекциях следующей сессии.

Связь: F11.

### M5. Стресс 1000+ объектов

**Цель:** деградация на большой памяти — не ступень-функция.

**Шаги:**

```bash
# скриптом наполнить tmp-память 1000 объектов (add в цикле)
time node ../dist/bootstrap/cli.js search "<X>"   # до и после наполнения
time node ../dist/bootstrap/cli.js brief           # до и после наполнения
```

**Ожидания/чек-лист:**

- latency до/после задокументирована.

## Группа T — трёхуровневая агентская схема

### T1. subagent_depth при init (регрессия F15)

**Цель:** init проставляет глубину 2.

**Шаги:**

```bash
# pristine площадка:
node ../dist/bootstrap/cli.js init
grep subagent_depth opencode.json
```

**Ожидания/чек-лист:**

- значение **2** (не платформенный дефолт 1).

Связь: F15.

### T2. Живой прогон глубины 2

**Цель:** boss-координатор → executor-lead → worker-implementer реально спавнит.

**Сетап:** после init, сессия opencode в playground.

**Шаги:**

- задача микрореализации через mr-wolf (например «в README.md добавь
  ссылку на SECURITY.md»);
- в отчёте сессии проверить: executor-lead отчитывается о спавне worker-*,
  worker-отчёт вернулся через lead, ревью не self.

**Ожидания/чек-лист:**

- трёхуровневый трейс в отчётах;
- находки — в реестр.

### T3. Антицикл ретраев

**Цель:** BLOCKED-воркер не зацикливается.

**Шаги:**

- диспетчеризовать заведомо провальную задачу (например «исправь тест
  в отсутствующем файле tests/does-not-exist.ts»);
- наблюдать lead'а.

**Ожидания/чек-лист:**

- ≤1 повторный диспетч, затем эскалация наверх (правило
  mem_20260824__b29ad5);
- в памяти — blocker.

## Группа L — проверка обучения

### L1. Урок → следующая сессия

**Цель:** урок попадает в инъекции и меняет поведение без подсказки.

**Шаги:**

```bash
# в сессии площадки:
node ../dist/bootstrap/cli.js add --type lesson --title "<кратко>" --body "<конкретный урок про проект>"
# открыть НОВУЮ сессию:
node ../dist/bootstrap/cli.js brief
node ../dist/bootstrap/cli.js call
```

**Ожидания/чек-лист:**

- урок в инъекциях/brief;
- агент ссылается на него без подсказки.

### L1v2. Урок, НЕ выводимый из кода (port-trap)

**Цель:** количественная дельта от урока со знанием, которое нельзя
получить чтением кода инстанса (ловушка внешнего окружения).

**Сетап:** одинаковый аппарат в двух руках (саботажник порта + чек-файл
как «аппаратное допущение»); WOLF-MEM с уроком-рецептом, NO-MEM чистый.
Требования к ловушке: (a) невидима в исходниках; (b) детерминирована;
(c) с уроком 1 шаг, без — диагностика с нуля; (d) аппарат идентичен.
Прогон EXP-20260904-l1v2 (`experiments/2026-09-04-l1v2-port-trap.md`):
честный ноль — итерации 2=2, вес +7.7% у WOLF-MEM, 0/6 контакта с уроком
(`wolf call` → no injections, поиск памяти не выполнялся). Дизайн-урок:
выразительный фейл теста (с рецептом) обесценивает невыводимое знание —
для контраста ловушка должна фейлиться невыразительно.

**Ожидания/чек-лист:**

- калибровка ловушки в обеих руках (красный/зелёный);
- счёт итераций check, вес, время, контакт с уроком (grep лога);
- честный ноль — валидный вердикт.

### L2. Жалоба → поведение меняется

**Цель:** обучение на жалобе.

**Шаги:**

- `/complain` на реальное правило seeded playbook'а → триаж;
- Стюард мутирует playbook → суперсид;
- повторить исходную задачу.

**Ожидания/чек-лист:**

- новый прогон следует мутированной версии (старое поведение не
  воспроизводится).

Связь: сценарий 5.

### L3. Эволюция playbook'а

**Цель:** версия playbook'а растёт, поиск видит актуальную.

**Шаги:**

```bash
node ../dist/bootstrap/cli.js list --type playbook   # версия растёт
node ../dist/bootstrap/cli.js search "<тема playbook'а>"
```

- 2–3 итерации мутаций одного playbook'а (через Стюарда).

**Ожидания/чек-лист:**

- поиск находит актуальную версию;
- эталон сравнения — суперсид-цепочка analyze-doc в main.

## Группа S — Стюард

### S1. Bootstrap-свёртка (бывш. dogfood сценарий 2)

**Цель:** Стюард сворачивает наивные черновики в accepted-объекты.

**Шаги:**

```bash
# на свежей памяти:
node ../dist/bootstrap/cli.js bootstrap   # 3 наивных черновика
```

- Стюард по протоколу docs/guide/steward-bootstrap.md сверяет с фактами,
  переписывает тела, принимает.

**Ожидания/чек-лист:**

- accepted-объекты;
- решение записано, thread закрыт;
- идемпотентность повторного bootstrap.

### S2. Полный жалобный путь со SLA (расширение сценария 5)

**Цель:** путь complaint → triaged/closed замкнут, SLA виден.

**Шаги:**

```bash
node ../dist/bootstrap/cli.js list --type complaint   # статус triaged/closed
```

- complaint → проверить SLA-поля (возраст тикает) → триаж Стюардом →
  supersede.

**Ожидания/чек-лист:**

- SLA виден в listing'е;
- путь замкнут.

### S3. Стюард-ревью правил

**Цель:** принятые правила видны в recap.

**Шаги:**

- 3 наивных правила от bootstrap → свёртка (S1) → `wolf recap`.

**Ожидания/чек-лист:**

- recap показывает принятые правила (стыковка с M4);
- невидимость = BUG в реестр.

## Группа W — лица воркеров

Смена лиц исполнителей: воркер тянет лицо из своего playbook'а.

### W1. Воркер подтягивает своё лицо

**Цель:** лицо из памяти, не дефолтное поведение.

**Шаги:**

- в живой сессии (T2) проверить: worker-implementer перед задачей выполнил
  `wolf search "worker-implementer playbook"` (наибольшая версия);
- в отчёте видны черты лица (дисциплина статуса DONE/DONE_WITH_CONCERNS
  и т.п.).

### W2. Лица различаются по ролям

**Цель:** роли не подменяют друг друга.

**Шаги:**

- сравнить поведение worker-implementer vs worker-reviewer на одной
  артефактной ситуации.

**Ожидания/чек-лист:**

- ревьюер НЕ делает работу сам;
- имплементер НЕ self-ревьюит (связка с T2);
- лица из разных playbook'ов.

### W3. Смена лица после мутации

**Цель:** новый воркер получает обновлённое лицо.

**Шаги:**

- Стюард мутирует playbook воркера (L2);
- спавнить НОВОГО воркера той же роли.

**Ожидания/чек-лист:**

- новый воркер получает обновлённое лицо (наибольшая версия);
- старое поведение исчезает.

## Группа RT — проверка роутинга wolf-router

Плагин `.opencode/plugins/wolf-router.ts` — слой доставки №1: перехватывает
`experimental.chat.system.transform`, ищет маркер `agent-id: <id>` в ТЕЛЕ
рамки агента (frontmatter в system-промпт не попадает), подтягивает playbook
из памяти (`search --type playbook --hide-superseded` → `get` → гвард
`owner_skill` → максимальная version) и инжектит тело в system-промпт.
Miss → fallback слой №2: рамка сама зовёт `wolf search`. Маршрут = сами
playbook-объекты: секции роутинга в `.wolf/config.yaml` нет (факт сверки
2026-09-03). Кэш 2.5с живёт в процессе сессии — между сессиями не мешает.
Лог `.wolf/router.log` создаётся лениво при первой попытке доставки; формат
строки (эталон живого поведения — main `.wolf/router.log`):
`<ISO> agent-id=<id> playbook=hit|miss injected=yes|no`.

Провизионинг (важно): копия плагина на площадке резолвит CLI от своей
локации — `playground/dist/bootstrap/cli.js`; init его не создаёт (билд
живёт в main-репо). Без линка на dist любая живая сессия площадки даст
`playbook=miss` по любой agent-id — дегенерация, не проверка роутинга
(сетап см. RT2).

### RT1. Роутер установлен и активен

**Цель:** после init плагин на месте, конфиг базовый, лога ещё нет.

**Шаги:**

```bash
ls .opencode/plugins               # 2 файла: wolf-router.ts, wolf-session-start.js
ls .wolf/router.log                # No such file — ленивое создание
grep -n "rout" .wolf/config.yaml   # пусто: секции роутинга в конфиге нет
```

- базовый init (сценарий 1), без мутаций конфига после.

**Ожидания/чек-лист:**

- `.opencode/plugins` = **2** файла (wolf-router.ts, wolf-session-start.js);
- регистрация = само наличие файла: opencode подхватывает
  `.opencode/plugins/*` автоматически, отдельной записи в opencode.json нет
  (сверка по opencode-renderer.ts: плагин копируется, в конфиг не пишется);
- `.wolf/router.log` отсутствует до первой сессии с маркером agent-id.

### RT2. Живая маршрутизация playbook по agent-id

**Цель:** сессия с агентом, у фрейма которого маркер `agent-id:` в теле,
получает свой playbook инжектом в system-промпт.

**Шаги:**

```bash
ls dist >/dev/null 2>&1 || ln -s ../dist dist   # провизионинг: плагин зовёт CLI от своей локации
node ../dist/bootstrap/cli.js list --type playbook   # взять active-playbook, его owner_skill
grep "^agent-id:" .opencode/agents/*.md              # маркер в ТЕЛЕ фрейма
grep "^model:" .opencode/agents/*.md                 # модель задаёт frontmatter фрейма
```

- живая сессия opencode в playground с этим агентом (сетап T2), тривиальный
  запрос;
- `cat .wolf/router.log` на площадке.

**Ожидания/чек-лист:**

- в логе `<ISO> agent-id=<id> playbook=hit injected=yes` — формат строк по
  эталону main `.wolf/router.log`;
- инжект идемпотентен: заголовок уже в system-промпте → второй вставки нет;
- факт сверки: модель сессии задаёт frontmatter `model:` фрейма агента
  (правило памяти LLM routing v2 определяет целевую модель по умолчанию);
  флага/опции `auto` в плагине НЕТ — не выдумывать в прогонах.

### RT3. Смена маршрута через память

**Цель:** маршрут управляется playbook-объектом (owner_skill + version):
новая версия → доставляется новое тело, без правки конфига.

**Шаги:**

```bash
# новая версия playbook агента (v2); steps — обязательное поле типа (string[]):
node ../dist/bootstrap/cli.js add --type playbook --title "Playbook: <agent-id>" \
  --body "<новое тело>" --set owner_skill=<agent-id> --set version=v2 \
  --set "steps=[шаг-1,шаг-2]"
# НОВАЯ сессия с агентом (кэш 2.5с живёт в старом процессе — не мешает):
cat .wolf/router.log
# откат маршрута на v1:
node ../dist/bootstrap/cli.js supersede <id-v2> <id-v1>
```

- флаги сверены по `--help` (add: extra-поля через повторяемый `--set k=v`,
  массив через `[a,b]`; supersede: два позиционных id);
- требует провизонинга dist из RT2 — иначе hit недостижим.

**Ожидания/чек-лист:**

- роутер берёт максимальную version среди не-superseded (v2 > v1);
- после supersede доставляется снова v1;
- маршрут меняется только объектами памяти — конфиг не трогаем.

### RT4. Недоступный маршрут

**Цель:** agent-id без playbook — miss зафиксирован, сессия не роняется.

**Шаги:**

```bash
# фрейм-призрак: копия любого seeded-фрейма с несуществующим agent-id:
sed 's/^agent-id: .*/agent-id: rt-ghost/' .opencode/agents/<agent>.md \
  > .opencode/agents/rt-ghost.md
# живая сессия с rt-ghost, тривиальный запрос, затем:
cat .wolf/router.log
```

- поведение по исходнику плагина: playbook не найден → инжекта нет, но
  сессия жива — весь transform в try/catch (плагин не имеет права уронить
  сессию), fallback слой №2: рамка сама зовёт `wolf search`.

**Ожидания/чек-лист:**

- в логе `<ISO> agent-id=rt-ghost playbook=miss injected=no`;
- miss именно по ghost-id (после провизонинга RT2): без dist-линка miss
  даст и валидный agent-id — это дегенерация окружения, не проверка;
- сессия отвечает штатно (miss пользователю не виден);
- тихого провала нет: miss зафиксирован в router.log.

### RT5. Маршрутизация моделей

**Цель:** выбор модели агентов управляется init-конфигурацией (`--model` →
routing-объект памяти → frontmatter фреймов), без ручной правки конфигов.

**Шаги:**

```bash
# pristine площадка; не-TTY без --model — жёсткая ошибка (exit≠0, memory-init.ts:208):
node ../dist/bootstrap/cli.js init --model zai-coding-plan/glm-5.3
grep -rn "^model:" .opencode/agents/   # подставленные значения во frontmatter
grep -n "model" opencode.json          # пусто: opencode.json модель не хранит
node ../dist/bootstrap/cli.js sync     # первая строка: models: primary=… worker=… (routing object <id>)
# смена модели — повторный init (routing-объект superseded, фреймы обновятся diff-веткой):
node ../dist/bootstrap/cli.js init --model <other-provider/modelID>
grep -rn "^model:" .opencode/agents/
```

- живая сессия на площадке (сетап T2), тривиальный запрос → метаданные
  сессии показывают модель из frontmatter; затем повторить после смены —
  новая сессия на новой модели;
- факт сверки (memory-init.ts:227): запрашивается ОДНА модель,
  `worker = primary` (Q7); worker-implementer рендерится из
  `{{model.worker}}`, фреймы mr-wolf / worker-researcher /
  worker-reviewer / executor-lead — из `{{model.primary}}`
  (templates/base/agents/*.md); steward — исключение: захардкоженная
  константа `model: zai-coding-plan/glm-5.3` (steward.md:4), от
  `--model` не зависит — прогон с другой моделью его не меняет;
- факт сверки (init-project.ts:136, model-routing.ts): значение доезжает
  через routing-объект памяти (type=rule, теги wolf-routing+models, body
  `primary:`/`worker:`) — рендер только подставляет; тот же --model →
  unchanged, иной → superseded;
- агент видит уже подставленное `model: <id>` во frontmatter своего фрейма:
  плейсхолдер `{{model.*}}` живёт только в шаблонах фреймов, в рендере
  AGENTS.md его нет (grep templates/base/AGENTS.md пуст) — не выдумывать;
- канонический путь смены модели: повторный `wolf init --model <id>`;
  альтернатива — supersede routing-объекта + `wolf sync` (memory-sync.ts:24:
  sync берёт модели из routing-объекта; легаси без него — omit model-строк).

**Ожидания/чек-лист:**

- после init: каждый штампованный фрейм несёт `model: <providerID/modelID>`,
  остатков `{{model.` в `.opencode/agents/` нет;
- init-отчёт содержит строку `routing: agent models — created (primary …)`;
- модель отсутствует в opencode.json — места хранения: frontmatter фреймов +
  routing-объект `.wolf/`;
- сессия обслужена моделью из frontmatter (дополняет RT2: RT2 — факт
  live-сессии, RT5 — откуда значение попадает в frontmatter при рендере);
- после смены модели повторным init: routing-объект superseded, фреймы
  updated (diff-ветка §4.5), новая сессия — на новой модели.

## Группа X — доказательные измерения эффективности

Главная цель полигона. Общая методика (обязательна для всех карточек группы):

- эксперимент оформляется картой EXP-* по шаблону
  `../templates/experiment-card.md`;
- сырьё — `playground-lab/measurements/<exp-id>/`;
- метрика — весовые токены: `input + 0.1 × cache_read + 5 × output`
  (правило тёплого координатора mem_20260824__d072b4);
- плюс: время, число итераций/правок, чек-лист качества;
- токены — из статистики сессий opencode;
- N ≥ 3 прогона на вариант, медиана.

### X1. A/B: variant-wolf vs variant-baseline

**Цель:** дорожит ли Wolf итерации/токены.

**Сетап:** два одинаковых экземпляра площадки в tmp:

- baseline = снапшот кода БЕЗ wolf init и волчьих артефактов;
- wolf = тот же + `wolf init`.

**Шаги:**

- одна и та же микрозадача (реализация + правка по проекту) в обоих, N=3;
- снять токены/время/итерации.

**Ожидания/чек-лист:**

- таблица сравнения в карте;
- результат — в main-память Wolf (cwd main-репо, правило mem_20260901), тег playground.

### X2. С памятью vs без (на ту же задачу)

**Цель:** количественная дельта от релевантной памяти.

**Сетап:** wolf-инстанс, в памяти заранее — релевантный урок/решение
о проекте.

**Шаги:**

- задача, где урок критичен;
- прогон с пустой памятью (subdir) и с наполненной.

**Ожидания/чек-лист:**

- количественная дельта (токены на повторные ошибки).

### X3. Тёплый координатор vs холодные сессии

**Цель:** подтверждение/опровержение правила mem_20260824__d072b4.

**Сетап:** цепочка из 3 последовательных подзадач:

- вариант A — одна сессия ведёт все 3;
- вариант B — 3 свежие сессии.

**Шаги:**

- сравнить суммарные весовые токены (кеш-рёды по 0.1×).

**Ожидания/чек-лист:**

- вывод зафиксирован в карте эксперимента.

## Группа R — отказоустойчивость

### R1. Повреждённый config

**Цель:** внятная ошибка и целая память при сломанном config.

**Шаги:**

```bash
# сломать .wolf/config.yaml (невалидный YAML), затем:
node ../dist/bootstrap/cli.js brief
node ../dist/bootstrap/cli.js init --recreate
```

**Ожидания/чек-лист:**

- `brief` на невалидном config — внятная ошибка;
- после `--recreate` память цела (объекты на месте).

### R2. Кириллица/юникод

**Цель:** кириллические slug и эмодзи не ломают контур.

**Шаги:**

```bash
node ../dist/bootstrap/cli.js add --type lesson --title "кириллический-слаг 🐺" --body "<текст>"
node ../dist/bootstrap/cli.js search "кириллический"
node ../dist/bootstrap/cli.js supersede <старый-id> <новый-id>   # id с кириллицей
```

**Ожидания/чек-лист:**

- поиск находит, id валидны (регрессия кириллических supersede-id).

## Группа G — сводный регресс-чеклист перед релизами

Карточка-таблица (не шаги). Прогонять выборочно перед каждым релизом;
фиксы 2.0.x–2.1.0 не должны откатываться.

### G1. Сводный регресс-чеклист релиза

| Дефект | Проверка | Ожидание |
|---|---|---|
| F4 | init пишет платформенный конфиг | с первого раза |
| F5 | лог init | показывает имена скиллов |
| F6 | сообщения init | нет misleading-сообщений |
| F7 | вывод init | упоминает opencode.json |
| F12 | релизный смоук | в изолированном префиксе |
| F16 | vitest | XDG-изоляция |

