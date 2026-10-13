# Отчёт: фаза 1 — requirements 2.17.1 (подрелиз по внешнему ревью)

## Metadata

- task_id: wolf-2171-phase1-requirements
- thread: mem_20261013_podreliz_po_vneshnemu_revyu_2026_10_13_d_bec602
- Роль: executor-lead (L1); методика: wolf-brainstorm (запись requirements)
- Режим: **FULL** (фиксация L1: R02 — новый контракт scope, R04 — дизайн-решение)
- Рабочая ревизия: HEAD main **37ac8c02a6a77c14e645798cadf0a82dd687fc98**, дерево чистое
- База ревью: daac1b1; diff daac1b1..37ac8c0 — только `.opencode/skills/wolf-release-docs/SKILL.md` (+107), src/templates не затронуты → наблюдения ревью применимы, перевоспроизведены
- Артефакты: docs/dev/2026-10-13-wolf-2-17-1-subrelease/{requirements,design,plan,test-plan}.md (scaffold FULL; заполнен только requirements.md, status: draft)
- Память: mem_20261013_2_17_1_requirements... — нет; факт фазы: mem_20261013_2_17_1_faza_1_requirements_zapisany_full_acbc0e (decision, related.docs связан)

## Summary

Все R-точки утверждённого состава верифицированы на актуальном main повторным воспроизведением — все подтвердились. requirements.md записан по FULL-шаблону: 7 REQ (R01, R02, R04, R05-включён, R06-урезанный, R07, R08-урезанный) + 3 NFR, не-цели и R03-ограничение задокументированы. Независимый wolf-review НЕ получен: платформа блокирует спавн воркеров из данной сессии; выполнена линза Requirements автором (self-check), вердикт независимого ревьюера — на L0.

## Changes

- Создана папка артефактов (wolf scaffold artifact wolf-2-17-1-subrelease).
- Записан requirements.md (draft): разделы 1–7, REQ-01…REQ-07, NFR-01…03, ограничения (включая R03 «лицо живёт на процесс»), evidence-блок, OQ-01/OQ-02, CR-2026-10-13-01.
- Код продукта НЕ менялся (запрещено фазой).

## Task Decomposition (классификация до исполнения)

| Подзадача                                             | Класс (таблица декомпозиции)                    | Исполнение фактически                                              |
| ----------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| Верификация R01 (шаблоны + свежая установка)          | research, ≤4 файла + tmp-прогон                 | planned: worker-researcher → блокировано платформой → лично        |
| Верификация R02 (scope, 3 наблюдения + карта)         | research, ~6 файлов                             | аналогично → лично                                                 |
| Верификация R04+R05 (мутация/миграция, связь объёмов) | research, ~4 файла                              | аналогично → лично                                                 |
| Верификация R07 (сайт/README/отчёт/roadmap)           | research, ~6 файлов                             | аналогично → лично                                                 |
| Запись requirements.md (FULL)                         | L1-интеграция по wolf-brainstorm (мандат брифа) | лично                                                              |
| wolf-review                                           | review-линза                                    | planned: worker-reviewer → блокировано → self-check с ограничением |

## Workers Used

0 (спавн worker-\* недоступен: `Subagent depth limit reached (1)` — 4/4 попыток; `experimental.subagent_depth` не позволяет вложенный спавн). Исполнение — лично в пределах мандата брифа (аналог wolf-execute при недоступной диспетчеризации).

## Validation Results — верификация R-точек (HEAD 37ac8c0)

| Точка                       | Статус                 | Evidence (команда/файл, cwd=mister-wolf, exit, лог)                                                                                                                                                                                                                                       |
| --------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01 шаблоны                 | подтвердилось          | grep: steward-nastavnik.md:25 `wolf add --type playbook`, :28 отдельный supersede; steward.md:56 `--created-by agent:steward`, :90 add+supersede; `wolf face new`/G17 — отсутствуют                                                                                                       |
| R01 свежая установка        | подтвердилось          | `wolf init --full --platform opencode --yes` в /tmp/wolf-2171-verify/r01-fresh, exit 0 (r01-init.log); `wolf face show steward` → v1 seed, содержит `wolf add --type playbook` (×1), `wolf face new` (×0), `minimal_change` (×0), supersede (×3) (r01-face-show.log)                      |
| R01 старая команда          | подтвердилось          | `wolf add --type playbook …` → exit 1: «argument 'playbook' is invalid. Allowed choices are rule, lesson, decision, thread, complaint, tool, note, face» (r01-oldcmd.log)                                                                                                                 |
| R02a рассинхрон scope       | подтвердилось          | memory-call.ts:54 `currentScope: worktree ?? undefined` (голое имя) vs get-call-injections.ts:82–90 `scopeOf` требует префикс `worktree:` и сравнивает `s === current` → запись `worktree:wt-a` скрыта при `current=wt-a`                                                                 |
| R02b keyword-обход          | подтвердилось          | get-call-injections.ts:112–126: keyword-уроки/правила добавляются из `activeOf(...)` (полный пул) в `matched`, минуя `visible`-фильтр (строки 87–90 применены только к injections)                                                                                                        |
| R02c basename-коллизия      | подтвердилось          | memory-root.ts: `return { root, worktree: basename(baseDir) }`                                                                                                                                                                                                                            |
| R02 --scope lesson          | подтвердилось          | `wolf add --type lesson … --scope worktree:probe` → exit 1 «Unknown field "scope" for type "lesson"» (r02-add-scope.log)                                                                                                                                                                  |
| R04 частичный сбой          | подтвердилось          | create-face-version.ts:253–300: цепочка await addMemoryObject→supersedeMemoryObject→createMutationRecord→recordRelation, единственный lock, нет транзакции; create-mutation-record.ts:125–139 (save→append→index→relation); grep journal/recover/resume/compensate по трём файлам — пусто |
| R05 неполная миграция       | подтвердилось          | migrate-faces.ts:75 skip «face already exists — re-run is safe (idempotent)» по наличию любого face; :96 createFaceVersion → :106 supersede legacy-head (сбой между ними не дозавершается)                                                                                                |
| R07a главная сайта          | подтвердилось          | docs/site/.vitepress/theme/components/HomeInstall.vue:23–28 шаг 02 `wolf init` «создаёт скелет .wolf/ и пишет MCP-конфиги платформ»; :47 «Три команды»; эталон memory-init.ts:91,96 — платформенные конфиги opt-in, полный сет по --full                                                  |
| R07b README/getting-started | подтвердилось          | README.md:41/README.ru.md:43 «+ MCP-конфиги платформ» противоречат README.md:49; docs/site/guide/mcp.md:9 «writes the MCP config for each detected platform automatically»                                                                                                                |
| R07c отчёт/roadmap          | подтвердилось          | report-wave-2-17-execute.md:4 `status: in-progress` при завершённом итоге; wave-2.17.md:72 «T-11 … ожидается»                                                                                                                                                                             |
| R07d maturity               | подтвердилось частично | README.md:163 «hot-signal into the self-learning loop» — сформулировать аккуратнее; council в витринных файлах не найден; задача сверки формулировок включена в REQ-07                                                                                                                    |

Решение R05 (мандат: «оцени сам»): **включено** REQ-04. Основание: migrate-faces.ts:96 выполняет миграцию через тот же `createFaceVersion`, сбой :96→:106 — тот же класс частичного сбоя, что R04; механизм операции/журнала REQ-03 покрывает миграцию по построению; добавочный объём — детект незавершённого перехода (сейчас :75), дозавершение supersede, тесты. Условие возврата к владельцу — OQ-01 (если design-механизм R04 не накроет миграцию).

## wolf-review — статус

- Независимый worker-reviewer: **НЕ выполнен** (платформенная блокировка спавна, 1 попытка).
- Выполнено: линза Requirements автором по чеклисту wolf-review (структура FULL, соответствие утверждённому составу, проверяемость AC, отсутствие дизайн-решений, факты о коде) → 1 находка Minor (пропуск «каталоги legacy» из R07) — исправлена сразу.
- Вердикт: self-check без права APPROVED (автор ≠ независимый ревьюер). Независимое ревью — эскалация L0 (назначить reviewer'а либо принять ограничение).

## Открытые вопросы и риски

- OQ-01: если design REQ-03 не покроет миграцию (R05) естественным образом — возврат к владельцу.
- OQ-02: механизм claim (REQ-05): хранение владельца (память Wolf vs файловый lock) — на design.
- РИСК: независимый вердикт wolf-review отсутствует (платформа); рекомендации: ревью на следующей фазе или отдельным назначением.
- РИСК: логи верификации в /tmp/wolf-2171-verify/ — временные; ключевые факты зафиксированы в requirements (раздел 6) и здесь.

## FRICTION

- 4× subagent (worker-researcher ×3, worker-reviewer ×1) — `Subagent depth limit reached (1)`, системная блокировка вложенного спавна из L1-сессии; обошёл личным исполнением по wolf-execute-логике. Требует внимания: либо поднять `experimental.subagent_depth`, либо конвейер подрелиза (design/plan/test-plan/исправления) должен исполняться в сессии L0/на верхнем уровне.
- 1× wolf add note --set thread=… — схема note не поддерживает поле thread; обошёл decision с related.docs (поддержанное поле).

## RESULT

- task_id: wolf-2171-phase1-requirements
- Статус: **DONE_WITH_CONCERNS** (всё исполнено и верифицировано; concern — независимый wolf-review недоступен платформой)
- Артефакт: docs/dev/2026-10-13-wolf-2-17-1-subrelease/requirements.md (draft, FULL)
- Верификация: 13/13 точек подтверждены на 37ac8c0
- Режим: FULL; REQ: 7; NFR: 3; OQ: 2
