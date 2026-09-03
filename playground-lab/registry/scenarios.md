# SCENARIOS — библиотека сценариев полигона

Переиспользуемые карты прогонов: шаги, чек-листы, ожидания. Площадка — расходный
инстанц; сценарии живут здесь и переживают reset. CLI для площадок:
`node dist/bootstrap/cli.js` из cwd `playground/` (см. README-PLAYGROUND.md).

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

