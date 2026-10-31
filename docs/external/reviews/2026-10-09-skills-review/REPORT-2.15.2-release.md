# REPORT: Волна 2.15.2 — экспертная редакция скиллов + согласованности + релиз

## Metadata

- Дата: 2026-10-09
- Исполнитель: executor-lead (L1), сессия релиза 2.15.2
- Бриф: исполнить утверждённую владельцем волну (5 поправок STAGE 1 + 9 согласованностей STAGE 2 + тесты + релиз 2.15.2)
- Ветка: skills-expert-patch-2026-10-09 (worktree .worktrees/skills-expert-patch-2026-10-09, база патча 4e4603a)
- Merge: main b1b3922; фикс релиза e5ba195; тег v2.15.2 → e5ba195
- Статус: **DONE** (полностью, включая публикацию)

## Summary

Все 5 поправок STAGE 1 и все 9 согласованностей STAGE 2 внесены; guard/render-тесты
перезаякорены на новую редакцию; npm run check exit 0; E2E 46 файлов / 182 теста —
зелёные; релиз 2.15.2 опубликован: npm latest = 2.15.2, сайт задеплоен,
changelog-страница синхронна. По пути найден и закрыт root-cause релизного
конвейера (sync-changelog не держал prettier-стабильность вывода).

## Changes

### STAGE 1 — 5 поправок скиллов (A1)

1. **using-skills: детерминированный триггер.** Было «Загружай явно названный или
   содержательно применимый скилл» → после:
   «Обязательные процессные скиллы запускай по типу ситуации, а не по оценке
   применимости: новая или изменённая потребность — wolf-brainstorm; баг или
   неожиданное поведение — wolf-debug; заявление о завершении —
   verification-before-completion. Загружай явно названный скилл; если сомневаешься,
   применим ли скилл, — загрузи и проверь, а неподходящий скилл использовать не обязан.»
   (break-glass дословно; grep «содержательно применимый» = 0).
2. **using-skills: протокол ошибки масштаба.** После: «Одобренный ранее scope повторно
   не спрашивай; это правило не отменяет протокол ошибки масштаба: если в ходе
   LITE/FIX вскрылись новые контракты, второй компонент или неочевидная причина —
   остановись и передай L1 на переклассификацию в FULL; режим меняет только L1.»
3. **wolf-review: триггер security-линзы.** После: «…Запускай линзу, когда документ
   затрагивает перечисленное; решение о пропуске security-линзы зафиксируй в review.md.»
4. **test-driven-development: код-первый = задокументированное отклонение.** После:
   «…для нового поведения код-первый — задокументированное отклонение, которое L1
   обязан провести через ревью качества тестов (минимум DONE_WITH_CONCERNS), а не
   молчаливая норма.»
5. **verification-before-completion: сверка evidence + красный флаг.** После: «Перед
   вердиктом приёмщик сверяет revision и dirty-digest из evidence с фактическим
   состоянием (например, git rev-parse HEAD); evidence без revision по умолчанию
   неактуален. Отчёт исполнителя — не доказательство.»

Пункты UNRESOLVED и git-у-L1 — accept без правок (по брифу, не тронуты).

### STAGE 2 — 9 согласованностей (A2)

| № | Файл(ы) | Суть |
|---|---|---|
| 1 | templates/base/playbooks/worker-reviewer-playbook.md | v2: узкий мандат (6 зон не принудительны), шкала Critical/Major/Minor, VERDICT + INCONCLUSIVE, «отметь вне-мандатное, а не молчи», «SUMMARY и VERDICT сами по себе не доказательство» |
| 2 | templates/base/playbooks/worker-implementer-playbook.md | task_id + RESULT DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED + EVIDENCE-контракт; «Воркер не коммитит; git-операции — зона L1» |
| 3 | templates/base/agents/mr-wolf.md | «L0 принимает по ACCEPTANCE-критериям и актуальности evidence, а не по цитате отчёта; сам проверки не запускает — независимый запуск поручает L1» |
| 4 | templates/base/agents/worker-reviewer.md | INCONCLUSIVE в VERDICT-контракте; «Чужую зону не разрабатывай; существенную находку вне мандата отметь отдельно для маршрутизации» |
| 5 | AGENTS.md + templates/base/AGENTS.md + wolf-router.ts (FALLBACK_PLAYBOOK, FULL_BODY) | `--type blocker` → «thread со статусом blocked (wolf thread add + wolf transition <id> blocked)» по фактической таксономии CLI (проверено `wolf add --help`: типы rule/lesson/decision/thread/complaint/tool/note); CLI-пути: «установленный `wolf`, или `node <путь-к-repo-wolf>/dist/bootstrap/cli.js` в репо Wolf» |
| 6 | 13 файлов (рамки steward/worker-implementer/worker-researcher + playbooks ×4 + команды ×3 + файлы W2) | «наибольшая версия» → фактический механизм: актуальный (не суперседенный) playbook через `--hide-superseded` + гвард owner_skill; канона нет — fallback-контур плагина. Код-резолвер (wolf-router.ts) уже реализует гварды — fallback подтверждён тестами (wolf-router-plugin 20/20, включая 3 теста fallback-инъекции) |
| 7 | templates/base/skills/using-git-worktrees/SKILL.md + wolf-sdd/SKILL.md | Выбран **task-local** workflow (факт: `createCliContainer(process.cwd())`, walk-up отсутствует; worktree имеет собственный .wolf/): «Память Wolf — task-local; состояние переноси через wolf-handoff, а не шаринг .wolf/» |
| 8 | templates/base/agents/executor-lead.md + playbooks/executor-lead-playbook.md | В состав промпта воркера добавлены «назначенную методику (имена скиллов) и common-контракты TASK/RESULT/EVIDENCE/ACCEPTANCE, если платформа не доставляет using-skills автоматически; L2 сам каталог скиллов не перебирает» |
| 9 | templates/opencode/plugins/wolf-session-start.js + plugin-injection.test.ts | Инъекция синхронизирована с новой редакцией: старый 1%-текст удалён (grep «1%-» = 0), тела H2/WORKER_BODY = полномочия L0/L1/L2, детерминированные процессные триггеры, break-glass (дословно синхронен скиллу), маршрут, FULL/LITE/FIX + протокол ошибки масштаба, контракты; тесты перезаякорены (12/12) |

**Финальная согласованность скиллы↔рамки↔playbook'и:** встречных предписаний нет.
git у L1: wolf-sdd «Воркер не коммитит; L1 фиксирует результат» ↔ рамка
worker-implementer «не коммитит» ↔ рамка executor-lead (коммиты при поручении) —
согласовано. Узкий мандат: wolf-review «отметь вне-мандатное для маршрутизации» ↔
рамка L2 (та же формула) ↔ playbook v2 — согласовано; старая формула «не собирай»
удалена. Единственная шкала Critical/Major/Minor в playbook+рамке (W2 устраняет
внутренний рассинхрон ЛИЦО reviewer-рамки — задокументированное отклонение в его
отчёте, принято).

### STAGE 3 — тесты и проверки

- conveyor-skills-guard.test.ts: 7 падений → инварианты новой редакции
  (UNRESOLVED, VERDICT-троица, artifact revision, «Воркер не коммитит», task-local,
  TASK из using-skills, [x] ставит L1, RED/GREEN и др.).
- intake-skill-guard.test.ts: маркеры → «Получи действующее разрешение», «Откат и
  обновление», «закрепления версии» и др.
- base-set-init.test.ts: маркеры отрендеренных агентов → новая редакция.
- plugin-injection.test.ts: GOVERNANCE-маркеры нового тела (12/12).
- cli-reference-guard и generate-agent-brief p90: на main зелёные; в worktree —
  средовые/flaky (cli.md не протух — diff пуст; p90=60.2ms изолированно); в финальном
  прогоне зелёные без правок.

### STAGE 4 — релиз

- Коммиты ветки: 926f8c0 (согласованности+скиллы+тесты, 28 файлов +230/−122),
  fc15a17 (CHANGELOG, версия, бэклог, changelog-страницы сайта).
- Merge в main: b1b3922 (--no-ff), main после пуша: e9ee3c3..b1b3922, затем fix e5ba195.
- Тег v2.15.2 → e5ba195 (аннотированный, стиль v2.15.1).
- Push: main + тег; CI: Publish (npm) — success; Deploy Docs — success; CI — success.
- npm: `npm view mister-wolf version` → 2.15.2, dist-tags.latest → 2.15.2.
- Сайт: https://chekh.github.io/mister-wolf/changelog — [2.15.2] в шапке страницы (EN+RU).

## Task Decomposition

| Подзадача | Класс | Исполнитель |
|---|---|---|
| STAGE 1: 5 поправок в 4 SKILL.md | MEDIUM (4 файла, утверждённые формулировки) | W1 worker-implementer |
| STAGE 2 пп.1–4, 8: playbook'и + рамки (6 файлов) | MEDIUM | W2 worker-implementer |
| STAGE 2 пп.5–7, 9 + «наибольшая версия» (16 файлов, плагины) | MEDIUM | W3 worker-implementer |
| STAGE 3: guard-тесты + npm check + e2e | MEDIUM (итеративно) | W4 worker-implementer |
| Релиз: CHANGELOG/версия/merge/тег/публикация + фикс конвейера | SIMPLE→MEDIUM (коммиты у L1) | сам (L1) |

Классификация зафиксирована до исполнения (в промптах диспетчеризации).

## Workers Used

W1–W4 (worker-implementer), параллельная волна W1/W2/W3, затем W4. Все 4 отчёта
приняты с первого предъявления; жалоб на приёмке нет (wolf list --type complaint
--status open — пусто на каждой приёмке). Отклонение W2 (доп. консистентизация
шкалы в ЛИЦО worker-reviewer-рамки) — в границах согласованностей, принято.

## Validation Results (A1–A7)

- **A1** ✓ — 5 поправок, цитаты «после» выше; git diff ветки: ровно предписанные файлы.
- **A2** ✓ — таблица выше; встречных предписаний нет (git-у-L1 и узкий мандат сверены).
- **A3** ✓ — `npm run check` exit 0: «Test Files 154 passed (154), Tests 1147 passed
  (1147)», english-surface OK (82 files), prettier/lint/build OK. Подтверждён лично L1
  на финальном состоянии (19:11, worktree fc15a17) и CI на main/теге.
- **A4** ✓ — `npm run e2e`: 46 файлов / 182 теста, exit 0 (включая base-set, init-cli,
  skill-intake, scaffold, router-fallback — render/init/sync-механизмы);
  `npm run docs:build` exit 0; changelog-страницы EN+RU содержат 2.15.2.
- **A5** ✓ — CHANGELOG.md: запись [2.15.2] - 2026-10-09; package.json = 2.15.2
  (npm version --no-git-tag-version); сайт собран и опубликован (Deploy Docs success,
  страница проверена webfetch); changelog-страница синхронна (генератор из CHANGELOG).
- **A6** ✓/отклонение — main содержит merge b1b3922; тег v2.15.2 существует и указывает
  на e5ba195 (merge + релизный фикс, см. Concerns №1) — опубликованный артефакт = тег.
- **A7** ✓ — версии только через `npm version` (выполнено); CHANGELOG при релизе
  (есть); актуальность доков/сайта (backlog.md актуализирован, сайт опубликован);
  E2E после плана (182/182); релиз завершён с опубликованными доками и сайтом.

## Concerns / Risks

1. **Тег на фикс-коммите, не на merge.** CI Publish упал на format:check —
   перегенерированные changelog-страницы содержали prettier-нечистую строку из
   секции 2.15.1 (`council-*`; при 2.15.1 коммитилась отформатированная вручную
   версия — латентный дефект генератора). Root-cause закрыт: sync-changelog.mjs
   теперь прогоняет вывод через prettier (коммит e5ba195); тег перенесён на e5ba195.
   npm publish на старом теге НЕ успел выполниться (падение на шаге check), поэтому
   перенос неподвижного тега — штатный ремонт без переписывания истории; force-push
   веток не применялся. Отклонение от буквы A6 («тег на merge-коммите») осознанное:
   тег = ровно то, что опубликовано.
2. **Порядок docs:build до npm run check** — урок релиза: при коммите генерируемых
   файлов check нужно гонять ПОСЛЕ генерации. На будущее зафиксировано в этом отчёте.
3. **Память Wolf (догфуд) не мутировала** (по SAFETY-брифу): пост-релизные
   memory-операции остаются координатору/Стюарду — supersede playbook'а линз v1
   (mem_20260901) на файловую v2; обновление сеяного playbook'а executor-lead
   (формулировка «наибольшей версии» в памяти против нового файла).
4. **Термин «маршрутизация»** остаётся двусмысленным (процессная маршрутизация в
   using-skills vs routing доставки playbook'ов) — редакционное решение за владельцем
   (анализ A, п.6), в scope волны не входило.

## FRICTION

- 4× vitest — (1) `npx vitest run tests/e2e` не находит e2e-файлы и прямой npx-прогон
  даёт ложные падения (npm_command=exec → isNpxRun() → CLI не пишет конфиги); штатный
  путь — `npm run e2e`; (2) прогон e2e ~945s превышает дефолтный таймаут 900s.
- 1× rtk_run_command — обёртка не приняла `git -C`; обход через параметр cwd.
- 1× CI Publish — format:check на сгенерированных страницах (закрыто root-фиксом).
- 1× gh/net — транзиентные TLS/EOF при запросах к GitHub API; ретрай прошёл.
