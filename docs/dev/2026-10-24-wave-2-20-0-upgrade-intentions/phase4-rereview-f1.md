---
slug: wave-2-20-0-upgrade-intentions
title: wave-2-20-0-upgrade-intentions — пере-ревью исправлений Ф1 (M-1, m-2, m-4, m-7, m-8.1, контракты)
status: complete
created: 2026-10-25
task: wave-2-20-0-rereview-f1
thread: mem_20261024_upgrade_ux_namereniya_vladeltsa_i_tikhiy_e6daf7
branch: dev/wave-2-20-0-upgrade-intentions
reviewed_range: 47abbfa..c7f69fb
---

# Пере-ревью Ф1-fix — независимая проверка изменённых оснований

VERDICT: APPROVED
SUMMARY: 0 critical / 0 major / 2 minor

## Metadata

- task_id: `wave-2-20-0-rereview-f1`; мандат — только изменённые основания после
  `phase4-review-f1.md`: M-1, m-2, m-4, m-7, m-8.1 и контрактные строки
  design §4.3/§4.5/§4.8/§4.12 + plan.md (T7/T10/T14, m-9).
- Проверенная ревизия: `c7f69fb` (HEAD), диапазон `47abbfa..c7f69fb`;
  воспроизведение M-1 — на dist, собранном из `47abbfa` в отдельном temp worktree.
- Self-оценка исполнителя (`phase4-review-f1.md` «Обработка находок», E15–E20)
  как источник не использовалась: гейт, пробы и тесты прогнаны заново.
- Ничего не правил и не коммитил; единственный записанный файл — этот вердикт.

## Вердикт и основание

**APPROVED**: все шесть пунктов мандата подтверждены фактически (пробами на
собранном dist, полным гейтом и чтением кода), регрессий и ослабленных ассертов
не найдено. Обе находки — minor-косметика в краевых случаях кода M-1-фикса,
не блокируют приёмку.

## Проверка по пунктам мандата

1. **M-1 — закрыт (воспроизведён до и после).** На dist `47abbfa` (реальные
   `templates/base`, реальный шаблон 2.19.0 из `6b7682e`, легаси-свидетель
   строкой-хэшем): `init → updated "onboarding block 2 → 3"`, штамп остаётся
   `2.19.0`, `witnessOk=false`, `sync → skipped mutated`, `inspect → mutated`.
   На HEAD: штамп `2.20.0`, свидетель `{origin:'render', base:'2.20.0'}` по
   нормализованному контенту, `witnessOk=true`, повторный `init` — `skipped`
   no-op, `sync → skipped identical`, `inspect → identical`. Guard локального
   текста: текст вне блока сохраняется, блок обновляется, свидетель остаётся
   старым (`base 2.19.0`, старый хэш) → следующий проход честно даёт
   `skipped mutated`, файл не тронут. Ложного свидетеля нет.
2. **m-2 — закрыт.** `syncBaseSet` use-case пробрасывает `SyncBaseSetOptions`
   без трансформаций (тест pass-through: тот же объект); в рендерере
   `syncAgentsMd` получил `backup`: правило 6′ «бэкап → эталон → свидетель»
   (проба: на момент хука на диске ещё локальная версия), правило 7 бэкапит при
   отсутствии свидетеля; без хука — прежний `skipped mutated`, файл цел.
   На `47abbfa` тот же сценарий с хуком оставлял `skipped mutated` (хук не
   вызывался) — поведение изменилось ровно на заявленное.
3. **m-4 — закрыт.** `project-step.ts`: protect-файл из `confirmedRemovals`
   не удаляется — исход `skipped`+`protected` с подсказкой
   `wolf upgrade --resolve <путь>=keep`, в сверку идёт кодом `protected`
   (не error/removed, вне needs-decision, exitKind `done`); любое фактическое
   удаление — `backupLocalFile` (`.wolf/backup/upgrade/<date>/<rel>`, коллизия
   → `-2<ext>` без перезаписи, идемпотентность — второй прогон без копии) до
   `unlink`; путь — в `ProjectReport.backups`. Fail-safe сверки не ослаблен:
   removed-цель без факта — по-прежнему `error` (тест сохранён).
4. **m-7 — закрыт.** CRLF-файл с блоком v2: на `47abbfa` проба даёт смешанные
   EOL (`noLoneLf=false`); на HEAD блок целиком в EOL файла, текст выше/ниже
   байт-в-байт, повторный проход — `skipped`, файл не меняется.
5. **m-8.1 — закрыт.** Тест «m-8.1: kept для AGENTS.md» покрывает sync
   (skipped+kept, файл цел) и inspect (`kept` + `keepBase`).
6. **Контракты — противоречий нет.** design §4.3 (правило 5 выше 6.5 — решение
   L0 + тест m-5; protect «не удаляет, а держит» — совпадает с кодом), §4.5
   (init на штампованном с блоком: штамп к текущей базе, свидетель по
   нормализованному контенту, guard) — дословно соответствует
   `restampAgents`/`recordAgentsBase`; §4.8 (новая строка матрицы removed +
   абзац «protect × удаление») и §4.12 (бэкап удаления «всегда», место функции
   `project-step.ts`, переиспользование T7) — соответствуют коду и plan T7;
   plan T10 (allowlist расширен на `opencode-renderer.ts` + его тесты, проброс
   `opts.takeMutated`) — соответствует факту правки; plan T7 (m-1/m-3), T14
   (m-6), «db40309 known-red, bisect: skip» — на месте, как заявлено;
   test-plan R03-4/R03-8/R03-9/R05-8 мапятся на реально существующие кейсы
   (R05-8 частично на будущий `decisions.test.ts` — это T7, ожидаемо).

Обязательные фактические проверки: `git log/diff --stat` (E1/E2); полный
`npm run check` — свежий прогон, exit 0, 212 файлов / 1797 тестов (E3);
`npm run lint` — exit 0 (E4); M-1 — собственное воспроизведение до/после
(E5–E7); ветки записи/удаления без бэкапа — новых нет: `syncAgentsBlock`
меняет только зону wolf (блок+штамп), take/правило 7 — бэкап при наличии хука,
удаление — бэкап до unlink; правило 7 без хука (до T10) — прежняя паритет-ветка
2.19.0, достижимость не изменилась, задокументирована (отклонение №3 отчёта);
ассерты — только добавления, ожидания существующих тестов не менялись (E10).

## Находки

### rr-1 (minor). `restampAgents` ставит штамп выше YAML-frontmatter — расходится с размещением `insertStamp`

- Location: `src/adapters/render/opencode/opencode-renderer.ts:363-368`
  (`return \`${line}${fileEol(content)}${stripStampLines(content)}\``).
- Нарушение: собственная конвенция проекта — `insertStamp`
  (`src/adapters/render/stamp.ts:32-39`) кладёт штамп ПОСЛЕ frontmatter,
  сохраняя `---` первой строкой; `frontmatter()` в `protect-key.ts:52-53`
  требует `---` в нулевой строке. Если у штампованного AGENTS.md с блоком
  пользовательский frontmatter сверху (штамп после `---`), init 2.20.0
  перенесёт штамп на первую строку — frontmatter перестанет быть первой
  строкой для любых парсеров (включая будущие потребители wolf). Данные не
  теряются, ложного свидетеля нет (файл ≠ эталону → свидетель не пишется,
  остаётся честный `mutated`), цикла нет. До фикса (47abbfa) штамп оставался
  на месте — т.е. это новое поведение фикса, но только в краевом случае.
- Evidence: чтение кода (оба файла); сценарий детерминирован
  (`parseStamp` ищет штамп по всему файлу, `stripStampLines` снимает все
  штамп-строки, препенд — безусловно).
- Рекомендация: в `restampAgents` повторить размещение `insertStamp`
  (если `stripStampLines(content)` начинается с `---\n` — штамп после
  закрывающего `---`, с EOL файла); тест на файле frontmatter+штамп+блок.

### rr-2 (minor). `fileEol` определяет EOL всего файла по первой строке

- Location: `src/adapters/render/opencode/opencode-renderer.ts:74-78`.
- Нарушение: нет (в design §4.5 зафиксировано «блок получает EOL файла»);
  наблюдение о крае: файл со смешанными EOL (первая строка LF, тело CRLF)
  получит LF-блок. Для реального случая m-7 (Windows checkout, однородный
  CRLF) фикс верен — подтверждено пробой.
- Evidence: probe C (однородный CRLF) — `noLoneLf=true`; смешанный вариант —
  вывод из кода (`content.indexOf('\n')`).
- Рекомендация: оставить как есть (YAGNI) и при желании зафиксировать
  допущение «EOL файла = EOL первой строки» комментарием в §4.5.

## Ограничения

- Реальный CLI `wolf upgrade` с `--yes`/`--resolve` не запускался — их ещё нет
  (T7/T10); поведение проверено на классе рендерера (dist обеих ревизий) и
  юнит/интеграционными тестами внутри `npm run check`.
- Security-линза: изменений границ доверия в диапазоне нет (новая запись —
  бэкап-копии в `.wolf/backup/upgrade/` внутри корня проекта).
- Жалобный контур (W1–W4): срабатываний нет — правила мандата применимы и не
  противоречили брифу.

## Evidence

| #   | Claim                                 | Command / procedure                                                                                                                                         | cwd | revision            | exit / result                                                                                                                                       |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Диапазон и состав коммитов            | `git log --oneline 47abbfa..HEAD`                                                                                                                           | wt  | `c7f69fb`           | 3 коммита: `55c8a79`, `4e4232e`, `c7f69fb`                                                                                                          |
| E2  | Состав изменений                      | `git diff 47abbfa..HEAD --stat`                                                                                                                             | wt  | `c7f69fb`           | 14 файлов, +1082/−51; src/ — 4 файла (renderer, project-step, sync-base-set, verify-against-map)                                                    |
| E3  | Полный гейт (свежий прогон)           | `npm run check`                                                                                                                                             | wt  | `c7f69fb`           | **exit 0**, 212 файлов / **1797 passed** (+17 к Ф1)                                                                                                 |
| E4  | Типы                                  | `npm run lint` (`tsc --noEmit`)                                                                                                                             | wt  | `c7f69fb`           | exit 0                                                                                                                                              |
| E5  | M-1 воспроизведён на исходной ревизии | `git worktree add … 47abbfa` + `npm run build`; `node probe-m1.mjs <dist@47abbfa>` (реальные шаблоны, шаблон 2.19.0 из `6b7682e`, легаси-свидетель строкой) | tmp | `47abbfa` (dist)    | init → `updated "onboarding block 2 → 3"`, штамп `2.19.0`, `witnessOk=false`, sync → `skipped mutated`, inspect → `mutated`                         |
| E6  | M-1 закрыт                            | тот же probe на HEAD dist (`setVersion 2.20.0`)                                                                                                             | tmp | `c7f69fb` (dist)    | штамп `2.20.0`, свидетель `{render, 2.20.0}`, `witnessOk=true`, повтор init `skipped`, sync `skipped identical`, inspect `identical`                |
| E7  | Guard: локальный текст вне блока      | probe B (обе ревизии)                                                                                                                                       | tmp | `47abbfa`/`c7f69fb` | localKept=true, блок v3, свидетель остался старый (`base 2.19.0`, старый хэш), sync → `skipped mutated`, файл цел                                   |
| E8  | m-7: CRLF-блок                        | probe C (обе ревизии)                                                                                                                                       | tmp | `47abbfa`/`c7f69fb` | old `noLoneLf=false` (дефект воспроизведён); new `noLoneLf=true`, above/below байт-в-байт, повтор — `skipped`                                       |
| E9  | m-2: take-on-mutated для AGENTS.md    | probe D (обе ревизии)                                                                                                                                       | tmp | `47abbfa`/`c7f69fb` | old: хук не вызван, `skipped mutated`; new: хук при диске ещё локальном (`diskStillLocal=true`) → `updated`+backup, файл=эталон, свидетель `render` |
| E10 | Ассерты не ослаблены                  | `git diff 47abbfa..HEAD -- tests/`                                                                                                                          | wt  | `c7f69fb`           | только добавленные кейсы и импорты; изменённых ожиданий нет                                                                                         |
| E11 | Рабочее дерево чистое                 | `git status --short`                                                                                                                                        | wt  | `c7f69fb`           | только pre-existing `.opencode/skills/**`                                                                                                           |

cwd: wt — worktree ветки; tmp —
`/private/var/folders/…/T/opencode/rereview-f1` (probe-скрипт, dist-сборки,
проектные фикстуры; временный worktree `47abbfa` удалён после probes).

## Следует в Ф2 (не блокирует)

- rr-1: placement штампа при frontmatter — маленькая правка в `restampAgents`
  - тест; удобнее всего в задаче T4-остатков или T10 (рендерер уже в allowlist).
- rr-2: комментарий-допущение в design §4.5 при ближайшей правке документа.
