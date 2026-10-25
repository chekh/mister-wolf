---
slug: wave-2-20-0-upgrade-intentions
title: wave-2-20-0-upgrade-intentions — цикл исправлений после ревью фазы 2 + живой спайк
status: final
created: 2026-10-25
task_id: wave-2-20-0-docs-fix-1
thread: mem_20261024_upgrade_ux_namereniya_vladeltsa_i_tikhiy_e6daf7
baseline: 0574e7c
branch: dev/wave-2-20-0-upgrade-intentions
mode: FULL (только документация)
---

# Цикл исправлений после ревью фазы 2

## Metadata

- task_id: `wave-2-20-0-docs-fix-1`; тред
  `mem_20261024_upgrade_ux_namereniya_vladeltsa_i_tikhiy_e6daf7`.
- Вход: `phase2-review-report.md` (`VERDICT: CHANGES_REQUIRED`,
  `SUMMARY: 1 critical / 9 major / 9 minor`), решения L0 от 2026-10-25
  (M-1, M-5, M-6, m-3, m-7, m-8, m-9), `requirements.md` (approved — текст не
  менялся), `design.md`, `plan.md`, `test-plan.md`, отчёты фаз 0/1.
- Ревизия: worktree `.worktrees/wave-2-20-0-upgrade-intentions`, ветка
  `dev/wave-2-20-0-upgrade-intentions`, HEAD `0574e7c` (v2.19.0).
- Методики: receiving-code-review (обработка находок), wolf-design / wolf-plan /
  wolf-testplan (правка оснований), wolf-release-docs (T15), using-skills,
  verification-before-completion. Только документы: код, тесты, `templates/**` не
  менялись, коммитов нет.

## Summary

- **Спайк провайдера выполнен до правок M-1 (решение владельца 2026-10-25).**
  Провайдер отвечает **200**, и ключ `protect` **вообще не попадает в тело
  model-запроса** (opencode v2.1.4; primary- и subagent-агенты). Ветка «400 →
  вернуть механизм на L0» не сработала: риск R-01 для v2.1.4 снят, остаточный
  риск — будущая версия opencode, T14 переведён в regression guard.
- **Все 19 находок ревью закрыты**: C-1, M-1…M-9, m-1…m-9. Решения L0 внесены
  как есть (M-5 init-only, M-6 diverged без глагола, m-9 сужение AGENTS.md×
  protect, m-3 doctor без правки, m-7 dogfood+метрика+allowlist, m-8 append-only
  журнал).
- **Независимое пере-ревью изменённых оснований** (свежий контекст,
  `opencode run --agent worker-reviewer`): цикл 1 — `0 critical / 1 major /
2 minor` (все 19 прежних closed, 3 новых), цикл 2 — `0 / 1 / 4` (новые
  закрыты, один остаток в сценарии), цикл 3 — **`APPROVED`, `0 / 0 / 0`**.
  Логи: `phase3-review-cycle1.txt`, `phase3-review-cycle2.txt`,
  `phase3-review-cycle3.txt`.
- Проверки: `prettier --check` — чисто; `git status` — только папка артефакта
  (плюс pre-existing изменения слоя скиллов, см. «Отклонения»); live-конфиг
  `~/.config/opencode` не изменён (mtime и `ls -la` идентичны); объекты в памяти
  Wolf спайком не созданы; жалоб в триаже — 0.

## Живой спайк провайдера (шаг 1 брифа)

### Окружение и изоляция

- macOS (darwin), `opencode v2.1.4`
  (`/Users/chekh/.opencode/bin/opencode`, `opencode --version` → exit 0).
- Провайдер `company` (`@ai-sdk/openai-compatible`,
  `https://router.ratway.ru:8443/v1`); модель — `company/fast` (самый дешёвый
  настроенный алиас; для сравнения тем же прогоном проверена `company/code`).
- Изоляция: `mktemp -d` в системном tmp (`$TMPDIR/wolf-spike.*`,
  `$TMPDIR/wolf-protect-spike.*`); cwd — tmp-проект; live-проекты не участвуют.
- Live-конфиг только читается: `ls -la ~/.config/opencode` до/после — **diff
  пуст**; mtimes `opencode.json` (2026-10-20T20:10:14), `~/.config/opencode`
  (2026-10-24T01:35:45), `AGENTS.md` (2026-10-20T20:44:24) не изменились.
- Чтобы увидеть тело запроса, между opencode и роутером поднят локальный
  capture-proxy (`http://127.0.0.1:8787/v1` → `https://router.ratway.ru:8443`,
  TLS до провайдера настоящий); в tmp-проекте — `opencode.json` с подменой
  **только** `provider.company.options.baseURL`. Прокси логирует тело и статус
  апстрима, авторизацию редактирует.
- Фикстура: `.opencode/agent/spike-protect.md` — frontmatter `protect: true`,
  `mode: primary`, `model: company/fast`, `tools: {"*": false}`, промпт
  «Reply with OK and nothing else.»; контроль — тот же файл без `protect`;
  отдельный прогон — `mode: subagent` с `protect: true`, вызванный primary-агентом
  через task.

### Команды и результат

```
$ opencode run --standalone --agent spike-protect "Reply with OK"
OK
exit=0

# capture-proxy, тот же запрос (requests.log):
#1 POST /v1/chat/completions  model=fast  bytes=8192  upstream=200
   body keys: model, messages, stream, stream_options, max_completion_tokens
   occurrences of "protect" in body: 0
   system[0]: "Reply with OK and nothing else.\n# Your Model..."   # агент загружен

# subagent-вариант (protect: true, mode: subagent, вызов через task):
#4 POST /v1/chat/completions  model=fast  bytes=8236  upstream=200
   occurrences of "protect" in body: 0

# контроль без ключа: тот же состав полей, ответ 200 ("OK")
```

Что проверено:

1. **Ключ действительно ушёл бы в запрос, если бы клиент его пробрасывал** —
   перехват стоит на пути реального запроса; тело и статус апстрима в одном
   логе, поэтому «200 без ключа» и «200 с ключом» различимы.
2. **Агент загружен** — системный промпт начинается с текста агента; значит
   отсутствие `protect` в теле не объясняется тем, что opencode не взял агента.
3. **Не воспроизводится прежний вывод спайка**: `opencode debug agents` в
   v2.1.4 на изолированной фикстуре возвращает `[]`; утверждение design §5
   «`request.body={"protect":true}`» как evidence снято и заменено перехватом.
   Уточнение внесено и в `phase1-design-plan-report.md`.
4. Провайдерская нестабильность (не про `protect`): первый POST к роутеру может
   вернуть `503` с вложенным `429 (gemini/gemini-flash-latest: monthly spending
limit)` — модель титула сессии; opencode повторяет запрос, итоговый ответ
   `200`. Зафиксировано, чтобы повтор спайка не читался как «400 из-за ключа».
5. Спайк не создал объектов в памяти Wolf: `wolf search "wolf-protect-spike"` →
   `0 results`; `wolf list --type complaint --status open` → пусто; `wolf add`
   в ходе спайка не вызывался.

**Ограничение:** живой прогон проверяет **agent**-файлы. Для skills/commands
прямой замер не делался (read-only перечисления в v2.1.4 нет); в дизайне это
зафиксировано как ограничение, а не как проверенный факт.

## Changes

| Файл                           | Что изменено                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design.md`                    | §3 владелец регекса (`stamp.ts`); §4.4 единственный `stripStampLines`; §4.5 трактовка L0 init-only + `detail` для сломанных маркеров + запрет `protect` у AGENTS.md; §4.6 `InspectOutcome.detail`, `InspectAction += protected\|kept`, владелец порта T3, класс проекта; §4.7 `collectDecisions().diverged`, экспорт `planOf`; §4.8 `--resolve` до npm-фазы, `--yes` несовместим; §4.9 секция `steward zone`, exit с `diverged`; §4.10 `--show` вне карты; §4.11 `--here --check` read-only + место секции + AGENTS.md×protect снят; §4.13 `diverged[]`, `mode:'show'`, `--json` в TTY, `--json --resolve`; §4.14 одно условие идемпотентности; **§4.15** причины `detail`; §4.16 матрица (here-check, review non-TTY 0/2, diverged, exit 1 для комбинаций); **§4.18 диспетчеризация и re-exec**; §5 живой спайк 2026-10-25 и regression guard; §6 ADR-8 читатели и откат; §7 семантика вместо «дословно»; §8 остаточные вопросы; §10 append-only журнал + раунды 5–7 |
| `plan.md`                      | Граф: T8→T9→T10→T11 последовательно, T13 после T6/T11; T1 без регекса; T3 владелец порта и `stamp.ts`; T4 doctor «изменений не требуется» + init-only; T6 allowlist; T7 экспорт `planOf` + парк-тесты; T8/T9 порядок; T10 `sync-base-set.ts`; T11 диспетчеризация/argv/`--json` у ребёнка; T13 `--here --check`; T14 regression guard + конфликты; T15 dogfood, метрика §1, allowlist, `docs:build`; риски (спайк снят, откат `mutated`, общие файлы)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `test-plan.md`                 | R03-7 (upgrade не меняет AGENTS.md без блока); R03-5 `detail`; R04-7 кастомный `default_agent`; R05-4 oracle `parseProtect`; R06-6/9 (матрица + диспетчеризация); R07-5 `diverged`/exit, R07-6 чистый парк; R08-5 вне карты; R09-5 `--here --check`; N01-3 diverged и отменённые режимы; N03-1 here-check; R11-5/7/8 (`--json --resolve`, TTY, argv); ручная проверка спайка = regression guard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `phase1-design-plan-report.md` | «дословно» → «сокращённые сводки + per-finding с ревью №5»; уточнение спайка (debug не воспроизводится, ключ не в теле); счётчики сценариев R03/R04/R06…R11, N01                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

`requirements.md` не редактировался (смысл REQ/NFR сохранён; проверено чтением
цитат REQ-03 AC3, REQ-09, NFR-01, NFR-03).

## Task Decomposition

| Класс   | Признаки                                               | Решение                                                                                                                                                                                                               |
| ------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MEDIUM  | 4 файла документации, 19 находок, кросс-док контрактов | По таблице «3+ файла → воркеры». Фактически исполнено lead'ом: правки взаимозависимы (один контракт в трёх документах), разделение дало бы рассинхрон. Независимость обеспечена внешним `worker-reviewer` (3 прогона) |
| TRIVIAL | спайк-скрипт/фикстура (tmp, вне репозитория)           | сам                                                                                                                                                                                                                   |

Декомпозиция «на воркеров» не дала ни одной независимой подзадачи: каждая
находка требует синхронной правки design + plan + test-plan (например M-3 —
§4.18 в дизайне, allowlist T11 в плане, R06-9/R11-8 в тест-плане). Поэтому работа
исполнена одним автором, а независимость — ревьюером со свежим контекстом.

## Workers Used

| Роль            | Прогон | Мандат                                             | Результат                |
| --------------- | ------ | -------------------------------------------------- | ------------------------ |
| worker-reviewer | #1     | все 19 находок + новые противоречия + исполнимость | `CHANGES_REQUIRED 0/1/2` |
| worker-reviewer | #2     | закрытие NEW-1…NEW-3                               | `CHANGES_REQUIRED 0/1/4` |
| worker-reviewer | #3     | пять точек остатка (маппинги + exit-тайбрейк)      | **`APPROVED 0/0/0`**     |

Спавн через `opencode run --standalone --agent worker-reviewer` (внешний
процесс): инструмент субагентов платформенно недоступен на глубине 1
(`Subagent depth limit reached`), что уже фиксировалось в phase1-отчёте. Лимит
воркеров (5) не превышен: 3 прогона.

## Закрытие находок

| ID  | Что сделано (кратко)                                                                                                              | Evidence                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| C-1 | `--here --check` — отдельный read-only режим; `--check` сильнее `--here`; владелец T13; сценарий R09-5 + N03-1                    | design §4.11 «Режимы `--check`», §4.16, §4.18; plan T13; test-plan R09-5/N03-1               |
| M-1 | Живой спайк до реализации: 200, ключ не в теле; §5 переписан, T14 = regression guard                                              | design §5 «Живой прогон провайдера»; plan T14; test-plan «Ручные проверки»; phase1 уточнение |
| M-2 | Единственный владелец регекса — `stamp.ts` (`stripStampLines`); из T1 убран, `stamp.ts` в allowlist T3                            | design §3, §4.4; plan T1/T3                                                                  |
| M-3 | §4.18: порядок разбора, несовместимые комбинации, argv ребёнка `[--json]`, опция у `upgrade-projects`, владелец T11               | design §4.18, §4.13; plan T11; test-plan R06-9/R11-8                                         |
| M-4 | non-TTY `--review`: 0 без решений/diverged, 2 при наличии                                                                         | design §4.9, §4.16; test-plan R07-6                                                          |
| M-5 | Трактовка L0: append-ветка только в `init`; upgrade безштампованный AGENTS.md не трогает                                          | design §4.5; plan T4; test-plan R03-7                                                        |
| M-6 | `diverged` — отдельный список/секция `steward zone`, exit 2, глагола нет; отменённые режимы = 0                                   | design §4.7, §4.9, §4.13, §4.16; test-plan R07-5/N01-3                                       |
| M-7 | Порт целиком T3; `sync-base-set.ts` в T10; `planOf`/`PlanStatus` экспортируются (T7)                                              | design §4.6, §4.7; plan T3/T7/T10                                                            |
| M-8 | T8→T9→T10→T11 последовательно; T13 после T6/T11 (рендерер не правит); T15 allowlist                                               | plan граф, T14 «Конфликты», T15                                                              |
| M-9 | `InspectOutcome.detail`, `InspectAction += protected\|kept`, причина в `--check` структурно                                       | design §4.5, §4.6, §4.11, §4.15; plan T3/T13; test-plan R03-5                                |
| m-1 | Четыре key-only читателя state; откат = `mutated` по всем файлам, лечение описано                                                 | design ADR-8; plan риски; test-plan T2-контракт                                              |
| m-2 | Одно условие идемпотентности в `writeConfig`, `canonical` удалён                                                                  | design §4.14; test-plan R04-7                                                                |
| m-3 | `doctor.ts:38` уже префикс — «изменений не требуется», файл в allowlist только для теста                                          | plan T4                                                                                      |
| m-4 | Oracle R05-4 — `parseProtect().held`, grep отвергнут                                                                              | test-plan R05-4                                                                              |
| m-5 | `.opencode/skills/`, полный путь `src/adapters/render/sync-state.ts`, «семантика 0/1/2» вместо «дословно»                         | design §3, §4.9, §7, §4.17                                                                   |
| m-6 | Определены: `--show` вне карты, `--json` в TTY, `--json --resolve`, место секции Protections, `action` protected/kept             | design §4.6, §4.10, §4.11, §4.13; test-plan R08-5/R11-5/R11-7                                |
| m-7 | T15: dogfood `wolf upgrade --here` в репозитории Wolf, метрика §1, allowlist, генераторы через `docs:build`                       | plan T15, порядок выпуска п.1/п.9                                                            |
| m-8 | Журнал §10 append-only (ID/evidence/ответы), раунды 5–7; phase1 не называет перечни дословными                                    | design §10; phase1-design-plan-report.md                                                     |
| m-9 | `protect` у AGENTS.md не поддерживается (отказ «нет frontmatter»); exit 1 — только ошибки аргументов/комбинаций (0/2 не меняются) | design §4.5, §4.8, §4.11, §8, §4.18; test-plan R06-6                                         |

## Validation Results

- `npx prettier --check "docs/dev/2026-10-24-wave-2-20-0-upgrade-intentions/*.md"`
  → `Prettier: All files formatted correctly`, exit 0.
- `git status --short` → `?? docs/dev/2026-10-24-wave-2-20-0-upgrade-intentions/`
  плюс **pre-existing** изменения слоя скиллов (`.opencode/skills/using-skills`,
  `wolf-execute`, `wolf-sdd` + untracked `wolf-draft/`); они появились от
  plugin-inject Wolf (mtime 2026-10-25T02:05+03:00, системное сообщение о новых
  скиллах), в пакет документов не входят и мною не правились.
- `git diff --stat 0574e7c -- src tests templates package.json package-lock.json`
  → пусто (кода нет).
- `~/.config/opencode`: `ls -la` до/после — diff пуст; mtimes не изменились.
- Память Wolf: `wolf search "wolf-protect-spike"` → 0; `wolf list --type
complaint --status open` → пусто (0 жалоб, триаж не требуется).
- `opencode --version` → `opencode v2.1.4`.
- Живой парк не прогонялся (`--check`/`--resolve` по live-проектам не
  запускались): проверки ограничены tmp-фикстурами и чтением кода.

## Вердикты пере-ревью (дословно)

```
цикл 1: VERDICT: CHANGES_REQUIRED / SUMMARY: 0 critical / 1 major / 2 minor
        NEW-1 (minor): порядок слияния T13×рендерер
        NEW-2 (major): exit для diverged-only парка в «отменённых» режимах
        NEW-3 (minor): маппинг park-тестов против allowlist T7/T9

цикл 2: VERDICT: CHANGES_REQUIRED / SUMMARY: 0 critical / 1 major / 4 minor
        NEW-1 closed; NEW-3 not-closed (маппинг here.test вне allowlist T7),
        NEW-2 not-closed (R07-5 требовал exit 2 для bare `--json`),
        + 2 minor того же класса (R01-1, R07-3/4 ↔ allowlist)

цикл 3: VERDICT: APPROVED / SUMMARY: 0 critical / 0 major / 0 minor
        все пять точек ok, новых находок нет
```

Полные логи — `phase3-review-cycle1.txt`, `phase3-review-cycle2.txt`,
`phase3-review-cycle3.txt` (stdout `worker-reviewer`, exit 0).

## Отклонения

1. **Третий узкий проход ревью сверх лимита «2 цикла».** Лимит считался как
   «фикс + повтор» на находку: NEW-2 закрывался дважды (первая правка оказалась
   неполной), поэтому остаток проверялся третьим узким прогоном. Основание:
   остаток — одна строка сценария и маппинги тестов (механика, не архитектура);
   остановка на частично закрытом major дала бы ложный `partial`. Если L0 считает
   лимит жёстким — вердикты всех трёх циклов приложены, решение за L0.
2. **MEDIUM исполнен lead'ом, не воркерами** (см. Task Decomposition): правки
   взаимозависимы, независимость дал внешний ревьюер. Субагенты платформенно
   недоступны на глубине 1 (`Subagent depth limit reached`).
3. **Спайк изменил фактическое основание M-1**: вместо «ключ уходит в request.body»
   доказано обратное. Это не «переписывание AC»: требования не менялись, риск
   снят более сильным evidence; ветка «400 → L0» не понадобилась.
4. **`.opencode/skills/**`dirty** — не наши правки (plugin-inject), в scope
брифа не входят; в`git status` видны и могут быть приняты за наши.

## Остаточные риски

- **Будущая версия opencode** может начать пробрасывать неизвестные ключи агента
  провайдеру → потенциальный 400 у файлов с `protect`. T14 держит regression
  guard; при срабатывании — troubleshooting + `--resolve …=keep`, волна не
  блокируется.
- **skills/commands** не проверены живым прогоном (только agent-файлы): у них тот
  же frontmatter-парсер, но прямой замер отложен (ограничение зафиксировано).
- **`diverged` не адресуем** — это осознанное решение L0; пользователь видит
  состояние и exit 2, но закрыть его может только Стюард. Если это окажется
  болезненным в живом парке — вопрос к L0, не дефект реализации.
- **Откат к 2.19.0** даёт `mutated` по всем файлам свидетеля (данные целы, лечится
  удалением/восстановлением state или повторным апгрейдом) — описано в ADR-8 и
  плане.
- **Требования untracked**: «текст REQ/NFR не менялся» проверяемо только
  косвенно (нет git-истории папки) — та же ограниченность, что в фазе 2.

## FRICTION / COMPLAINT

- **FRICTION (evidence, не инструмент):** первичный спайк фазы 0/1 опирался на
  вывод `opencode debug agents` и утверждал `request.body={"protect":true}`.
  В v2.1.4 этот вывод не воспроизводится (`[]`), а перехват реального запроса
  показал обратное. Это стоило отдельного цикла проверки и правки §5.
  Системного дефекта правила нет: playbook требует evidence, а не debug-вывод;
  зафиксирован урок `mem_20261024_wire_povedenie_provaydera_podtverzhdaets_3fe3f3`
  («wire-поведение подтверждается перехватом запроса»).
- **COMPLAINT:** нет. Предписание playbook'а не противоречило брифу и не давало
  систематически неверного результата; случай — разовая ошибка интерпретации
  evidence, а не дефект правила.
