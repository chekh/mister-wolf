---
slug: wave-2-20-0-upgrade-intentions
title: wave-2-20-0-upgrade-intentions — план
status: approved
created: 2026-10-24
baseline: 0574e7c
design: design.md (status approved)
---

# wave-2-20-0-upgrade-intentions — план

Волна 2.20.0 «Upgrade UX: намерения владельца и тихий апгрейд». Входы:
`requirements.md` (approved, CR-2026-10-25-01) — единственный источник AC;
`design.md` (review) — единственный источник контрактов; `test-plan.md` —
проверки и маппинг на файлы тестов. Baseline `0574e7c` (v2.19.0), ветка
`dev/wave-2-20-0-upgrade-intentions`.

Правила исполнения:

- задачи идут фазами по результату, не «одна задача на REQ»; каждая задача —
  обратимый шаг с собственным зелёным гейтом;
- новый behavior начинается с падающей проверки (test-driven-development);
  контракты берутся из design, а не переизобретаются в коде;
- TASK для исполнителя: цель, AC/REQ, baseline, allowlist записи, зависимости,
  проверки, ожидаемый RESULT. Коммит делает lead, не исполнитель.

## Фазы и зависимости

```
Ф1 ядро      T1 (protect-key) ─┬─> T3 (классификация) ─┬─> T4 (AGENTS.md)
             T2 (свидетель)  ─┘                       ├─> T5 (verify/project-step)
                                                       └─> T6 (имена в выводе)
Ф2 решения   T3,T5 ─> T7 (реестр + глаголы) ─> T8 (--show) ─> T9 (--review) ─> T10 (--yes) ─> T11 (--json)
Ф3 периферия T12 (init/doctor) — параллельно Ф1–Ф2; T13 (Protections + --here --check) после T5, T6 и T11
Ф4 гейт      T14 (интеграция, полный npm run check, e2e, regression-guard спайка)
Ф5 выпуск    T15 (документация и сайт + dogfood + релизный чек-лист)
```

T1 и T2 независимы (разные файлы) — можно параллельно; T12 не зависит ни от
чего, но правит `init-project.ts`, который T5/T10 не трогают. T8 → T9 → T10 идут
**последовательно**: они делят `memory-upgrade.ts` и `decisions.ts`; T13
мержится после T6 и T11 (общий `memory-upgrade.ts`) и после T3 (рендерер).

## Задачи

### Ф1 — ядро

- [ ] **T1. `protect-key.ts`: грамматика, нормализация, вставка/снятие.**
      Цель: единственная точка правды о ключе `protect` (design §4.1).
      Контракт: `parseProtect` (первый ключ, `true`/`false`/`X.Y.Z`/пусто и
      не-грамматика → held+`unrecognized`), `normalizeManaged` (снять все строки
      `/^protect\s*:/` внутри frontmatter, байт-в-байт остальное),
      `insertProtect` (последняя строка блока, EOL закрывающего `---`,
      структурная проверка (а)/(б)/(в) до записи, отказ без frontmatter),
      `removeProtect`. Регекса штампа здесь **нет** — `stripStampLines` живёт в
      `stamp.ts` и принадлежит T3 (design §3, §4.4).
      AC/REQ: REQ-05 AC4/AC5, REQ-06 AC4. Baseline: `src/adapters/render/stamp.ts:19`,
      `templates/base/agents/mr-wolf.md` (frontmatter есть).
      Allowlist: `src/domain/protect-key.ts` (новый),
      `tests/unit/domain/protect-key.test.ts` (новый).
      Проверки: `npx vitest run tests/unit/domain/protect-key.test.ts`,
      `npx tsc --noEmit`. RESULT: DONE с зелёными тестами грамматики
      (CRLF, нет frontmatter, ключ в теле, дубли, `false`, пусто, кавычки).

- [ ] **T2. Свидетель `{hash, origin, base}` + атомарная запись состояния.**
      Цель: свидетель помнит происхождение записи, чтобы `keep` не отменялся
      следующим проходом (design §4.2, ADR-8), и пишется атомарно (NFR-04).
      Контракт: `SyncEntry`, нормализация легаси-строк в `{origin:'render',
base:'0.0.0'|<stamp>}`, `saveSyncState` → `writeFileSync(tmp)` + `renameSync`;
      key-only чтение остальных потребителей (`platform-mismatch`,
      `memory-doctor`, `uninstall`) зафиксировано тестом — объект вместо строки их
      не ломает (ADR-8, design §6).
      AC/REQ: NFR-04, NFR-02 (кейс keep), REQ-06. Baseline:
      `src/adapters/render/sync-state.ts:9-38`,
      `src/adapters/fs/markdown-memory-store.ts:366`.
      Allowlist: `src/adapters/render/sync-state.ts`,
      `tests/unit/adapters/render/sync-state.test.ts` (новый).
      Проверки: `npx vitest run tests/unit/adapters/render/sync-state.test.ts`,
      `npx tsc --noEmit`. RESULT: DONE; старый state читается, новый пишется,
      после записи нет `*.tmp`.

- [ ] **T3. Классификация цели в рендерере: protect, исцеление, kept, режим take.**
      Цель: единый порядок правил 1–7 §4.3 в `syncBaseSet`/`inspectBaseSet`/
      `renderBaseSet` + порты (§4.6). Контракт: `protected`, штамп-исцеление как
      `action:'updated'` + reason, `kept` (правило 6.5), `takeMutated` с
      `BackupHook`, `RenderOutcome.backup|protected|kept`,
      `InspectOutcome.kept|keepBase|detail`, `InspectAction += 'protected'|'kept'`,
      `listProtections`, `renderFreshFile`; экспорт `stripStampLines` из
      `stamp.ts` (единственный регекс) и его использование в исцелении.
      **Порт целиком — здесь:** ни T5, ни T7, ни T13 `base-set-renderer.port.ts`
      не правят (design §4.6).
      AC/REQ: REQ-02, REQ-05 AC1/AC2/AC5, REQ-10 (механизм). Baseline:
      `opencode-renderer.ts:77,124,195,334`, `ports/base-set-renderer.port.ts:4,26,51`,
      `src/adapters/render/stamp.ts:19-30`.
      Зависимости: T1, T2. Allowlist: `src/adapters/render/opencode/opencode-renderer.ts`,
      `src/adapters/render/stamp.ts`,
      `src/ports/base-set-renderer.port.ts`,
      `tests/unit/adapters/render/opencode-renderer.test.ts`,
      `tests/unit/adapters/render/stamp.test.ts`,
      `tests/unit/use-cases/sync-base-set.test.ts`.
      Проверки: `npx vitest run tests/unit/adapters/render/opencode-renderer.test.ts tests/unit/adapters/render/stamp.test.ts tests/unit/use-cases/sync-base-set.test.ts`,
      `npx tsc --noEmit`. RESULT: DONE; ни одна ветка inspect не пишет; регекс
      штампа в проекте ровно один (`grep` по `wolf:rendered`).

- [ ] **T4. AGENTS.md: версионированный блок, agnostic-детект, без protect-гейта.**
      Цель: блок между маркерами обновляется при росте версии формата, текст вне
      блока сохраняется (design §4.5, REQ-03). Контракт: `findOnboardingBlock`
      (префикс `<!-- wolf:onboarding v<N> -->`, любая версия),
      `templateOnboardingVersion` из шаблона, замена только `[start,end)`,
      сломанные маркеры → `foreign`/skipped с причиной (и `InspectOutcome.detail`),
      protect-гейт в блочной ветке отсутствует (не поддерживается, design §4.5);
      `doctor` **уже** использует префикс (`doctor.ts:38`) — изменений в нём не
      требуется, файл остаётся в allowlist только для теста; шаблон получает
      маркер `v3`.
      Трактовка REQ-03 AC3 (L0): append-ветка выполняется только в `init`;
      `wolf upgrade` безштампованный AGENTS.md без блока не трогает
      (design §4.5).
      AC/REQ: REQ-03 AC1–AC4, NFR-02. Baseline: `opencode-renderer.ts:230,264,279,290`,
      `templates/base/AGENTS.md:1,32`, `src/app/use-cases/doctor.ts:38`.
      Зависимости: T3. Allowlist: `src/adapters/render/opencode/opencode-renderer.ts`,
      `templates/base/AGENTS.md`, `tests/integration/b0-init.test.ts`,
      `tests/integration/b0-sync.test.ts`, `tests/unit/use-cases/doctor.test.ts`
      (только тест: код `doctor.ts` уже соответствует, правки не нужны).
      Проверки: `npx vitest run tests/integration/b0-init.test.ts tests/integration/b0-sync.test.ts tests/unit/use-cases/doctor.test.ts`,
      `npx tsc --noEmit`. RESULT: DONE; init под v3 не дописывает второй блок.

- [ ] **T5. Verify-коды `protected`/`kept` и факты вне карты.**
      Цель: needs-decision не расширяется, защищённое и принятое видно
      (design §4.6). Контракт: `VerifyCode += 'protected'|'kept'`,
      `syncFact`/`fileVerdict` + хвост `verifyAgainstMap` для фактов вне карты,
      `project-step` проверяет protect/kept у orphan до drift-конфликта и
      прокидывает `backups` из исходов.
      AC/REQ: REQ-01 (исходы), REQ-05 AC1/AC2, REQ-10 AC1, NFR-01. Baseline:
      `verify-against-map.ts:12,27,88,100,127,173`, `project-step.ts:48,94,118`.
      Зависимости: T3. Allowlist: `src/app/use-cases/verify-against-map.ts`,
      `src/app/use-cases/project-step.ts`, `tests/unit/use-cases/verify-against-map.test.ts`,
      `tests/unit/use-cases/upgrade-projects.test.ts`.
      Проверки: `npx vitest run tests/unit/use-cases/verify-against-map.test.ts tests/unit/use-cases/upgrade-projects.test.ts`,
      `npx tsc --noEmit`. RESULT: DONE; `NEEDS_DECISION_CODES` не менялся.

### Ф2 — решения владельца

- [ ] **T6. Имена файлов в выводе прохода и `--check`.**
      Цель: каждый needs-decision/differ назван путём, счётчики сохранены
      (design §4.15, REQ-01 AC1–AC3). Контракт: `freshnessDetails` печатает все
      differ-пути; `stepDetailLines`/`projectsSection` берут строки из
      `verify.items`; лица — отдельной строкой по `owner_skill`; без усечения.
      AC/REQ: REQ-01. Baseline: `memory-upgrade.ts:217,503`,
      `upgrade-projects.ts:398`. Зависимости: T5.
      Allowlist: `src/adapters/cli/commands/memory-upgrade.ts`,
      `src/app/use-cases/upgrade-projects.ts`,
      `tests/integration/upgrade-check.test.ts`,
      `tests/unit/adapters/commands/memory-upgrade.check.test.ts`,
      `tests/unit/use-cases/upgrade-projects.test.ts`,
      `tests/integration/upgrade-park.test.ts`.
      Проверки: `npx vitest run tests/integration/upgrade-check.test.ts tests/unit/adapters/commands/memory-upgrade.check.test.ts tests/unit/use-cases/upgrade-projects.test.ts`,
      `npx tsc --noEmit`. RESULT: DONE; снапшоты обновлены, счётчики в тех же
      строках.

- [ ] **T7. Реестр решений и глаголы `--resolve`.**
      Цель: одна команда разрешает конфликт, нумерация стабильна (design §4.7,
      §4.8, REQ-06 AC1–AC4). Контракт: `collectDecisions` (read-only, порядок
      реестр → карта → AGENTS.md → алфавит), `applyResolution` с матрицей
      «глагол × класс цели», `backupLocalFile` (ADR-4), двухфазная валидация
      (все ошибки до первой записи), `--resolve` в CLI, дайджест + exit
      0/1/2.
      AC/REQ: REQ-06, REQ-05 AC3 (take на защищённом), NFR-05, NFR-06. Baseline:
      `memory-upgrade.ts:710`, новые модули. Зависимости: T3, T5.
      Allowlist: `src/app/use-cases/decisions.ts` (новый),
      `src/adapters/cli/commands/memory-upgrade.ts`,
      `src/app/use-cases/upgrade-projects.ts` (экспорт `planOf`/`ProjectPlan`/
      `PlanStatus`; второй реализации фильтра worktree/pinned/missing нет),
      `tests/unit/use-cases/decisions.test.ts` (новый),
      `tests/integration/upgrade-here.test.ts`,
      `tests/integration/upgrade-park.test.ts` (парк-уровневый сценарий
      `--resolve` без npm/re-exec),
      `tests/unit/adapters/commands/memory-upgrade.here.test.ts` (диспетчеризация
      `--resolve` в CLI; T9 дополняет тот же файл позже, мерж последовательный).
      Проверки: `npx vitest run tests/unit/use-cases/decisions.test.ts tests/integration/upgrade-here.test.ts tests/integration/upgrade-park.test.ts`,
      `npx tsc --noEmit`. RESULT: DONE; неизвестный номер/путь → exit 1 без
      записей; keep не отменяется следующим проходом (сквозной тест); порядок и
      нумерация реестра совпадают с планами прохода.

- [ ] **T8. `--show` и построчный diff.**
      Цель: осознанное снятие защиты (design §4.10, REQ-08 AC1/AC2).
      Контракт: `line-diff.ts` (LCS, лимиты входа/вывода, детерминизм),
      `--show <file|N>` read-only: protect, обе версии, diff локальный→эталон,
      подсказка `--resolve …=take`.
      AC/REQ: REQ-08. Baseline: `memory-upgrade.ts` (новый флаг), новые модули.
      Зависимости: T7 (последовательно, не параллельно с T9/T10). Allowlist:
      `src/domain/line-diff.ts` (новый),
      `src/adapters/cli/commands/memory-upgrade.ts`,
      `src/app/use-cases/decisions.ts`, `tests/unit/domain/line-diff.test.ts` (новый),
      `tests/unit/use-cases/decisions.test.ts`.
      Проверки: `npx vitest run tests/unit/domain/line-diff.test.ts tests/unit/use-cases/decisions.test.ts`,
      `npx tsc --noEmit`. RESULT: DONE; снапшот mtime/хэшей до/после `--show`
      идентичен; файл вне карты даёт `base: n/a`, exit 0.

- [ ] **T9. `--review`: TTY-цикл и non-TTY рецепт.**
      Цель: разбор по одному с diff и «ко всем похожим»; без TTY — готовый
      рецепт (design §4.9, REQ-07 AC1/AC2). Контракт: экран `[n/m]` с diff
      (≤ 40 строк), клавиши `t/k/p/v/s`, `a` с вопросом «ко всем N похожим?»,
      `q`; non-TTY — нумерованный список + `--resolve`-команда, exit 2, без
      записей.
      AC/REQ: REQ-07. Baseline: `memory-upgrade.ts:370` (образец TTY-вопроса).
      Зависимости: T8 (последовательно). Allowlist:
      `src/adapters/cli/commands/memory-upgrade.ts`,
      `src/app/use-cases/decisions.ts`,
      `tests/unit/use-cases/decisions.test.ts`,
      `tests/unit/adapters/commands/memory-upgrade.here.test.ts`,
      `tests/integration/upgrade-park.test.ts` (non-TTY рецепт на парке).
      Проверки: `npx vitest run tests/unit/use-cases/decisions.test.ts tests/unit/adapters/commands/memory-upgrade.here.test.ts tests/integration/upgrade-park.test.ts`,
      `npx tsc --noEmit`. RESULT: DONE; non-TTY не пишет ни байта; EOF
      завершает цикл с дайджестом; `diverged` печатается отдельной секцией и
      держит exit 2, но не нумеруется.

- [ ] **T10. `--yes`: тихий take с бэкапом, дайджест, подсказка `--review`.**
      Цель: CI-прогон без риска потери правок (design §4.12, REQ-10 AC1–AC3).
      Контракт: включение режима `takeMutated` в проходе (правило 6′ §4.3),
      бэкап → эталон → свидетель, дайджест «файл + путь бэкапа»,
      protect/pin/kept молча, conflict/diverged остаются → exit 2, hint
      `--review` в TTY без `--yes`.
      AC/REQ: REQ-10, NFR-05. Baseline: `memory-upgrade.ts:264-325`,
      `upgrade-projects.ts:164-200`, `project-step.ts:77`, `sync-base-set.ts:11-13`.
      Зависимости: T9 (последовательно). Allowlist:
      `src/adapters/cli/commands/memory-upgrade.ts`,
      `src/app/use-cases/upgrade-projects.ts`, `src/app/use-cases/project-step.ts`,
      `src/app/use-cases/sync-base-set.ts` (проброс `opts.takeMutated` в рендерер),
      `tests/integration/upgrade-park.test.ts`, `tests/unit/adapters/commands/upgrade-projects.test.ts`,
      `tests/unit/use-cases/sync-base-set.test.ts`.
      Проверки: `npx vitest run tests/integration/upgrade-park.test.ts tests/unit/adapters/commands/upgrade-projects.test.ts tests/unit/use-cases/sync-base-set.test.ts`,
      `npx tsc --noEmit`. RESULT: DONE; восстановление из бэкапа + `=protect`
      проходит как сценарий; опция доходит до рендерера без второго обёрточного слоя.

- [ ] **T11. `--json`: схема, сквозь re-exec, паритет с текстом.**
      Цель: стабильный машинный вывод (design §4.13, REQ-11 AC1–AC3), единая
      диспетчеризация флагов (design §4.18).
      Контракт: `wolf.upgrade/1` и `wolf.upgrade.check/1`, единственный JSON в
      stdout, `--json` в argv ребёнка **и** опция `--json` у дочерней команды
      `upgrade-projects` (иначе парковый `--json` теряется при re-exec), фаза 1
      молчит, `--json` без `--yes` — отменённый проход, `n` из `collectDecisions`;
      порядок разбора: проверка комбинаций → `--check` (сильнее `--here`) →
      `--show` → `--review` → `--resolve` → `--here` → npm+re-exec; новые режимы
      до npm-фазы не доходят.
      AC/REQ: REQ-11, NFR-01, NFR-06. Baseline:
      `memory-upgrade.ts:643,688,558,718`,
      `upgrade-projects.ts:79-96`.
      Зависимости: T10. Allowlist: `src/adapters/cli/commands/memory-upgrade.ts`,
      `src/adapters/cli/commands/upgrade-projects.ts`,
      `src/app/use-cases/decisions.ts`,
      `tests/unit/adapters/commands/memory-upgrade.check.test.ts`,
      `tests/unit/adapters/commands/upgrade-projects.test.ts`,
      `tests/integration/upgrade-park.test.ts`.
      Проверки: `npx vitest run tests/unit/adapters/commands/memory-upgrade.check.test.ts tests/unit/adapters/commands/upgrade-projects.test.ts tests/integration/upgrade-park.test.ts`,
      `npx tsc --noEmit`. RESULT: DONE; `JSON.parse(stdout)` при устаревшем CLI
      без мусора; парковый `--resolve 3=keep` не запускает npm-фазу и не теряет
      флаг; `n` совпадает с текстом.

### Ф3 — периферия

- [ ] **T12. init восстанавливает `mcp.wolf`, doctor подтверждает.**
      Цель: совет doctor становится выполнимым (design §4.14, REQ-04 AC1–AC3).
      Контракт: ветка «без `--platform`» — только для существующего конфига
      detected-платформы, через `adapter.writeConfig`; битый JSONC → `skipped`;
      идемпотентность (`unchanged`), doctor после init молчит.
      AC/REQ: REQ-04. Baseline: `init-project.ts:223,313-334`,
      `opencode-adapter.ts:94`, `doctor.ts:96-102`. Зависимости: нет.
      Allowlist: `src/app/use-cases/init-project.ts`, `tests/unit/use-cases/init-project.test.ts`,
      `tests/integration/b0-init.test.ts`, `tests/unit/use-cases/doctor.test.ts`.
      Проверки: `npx vitest run tests/unit/use-cases/init-project.test.ts tests/unit/use-cases/doctor.test.ts`,
      `npx tsc --noEmit`. RESULT: DONE; существующий кейс WP1 «конфига нет →
      не пишем» сохранён, новый кейс «конфиг есть, записи нет → пишем».

- [ ] **T13. Секция Protections и `--here --check` (read-only).**
      Цель: реестр защит виден всегда, `--check` в одиночном проекте ничего не
      пишет (design §4.11, §4.18, REQ-09 AC1–AC3, NFR-03).
      Контракт: `renderer.listProtections(root, base)` (read-only, каталоги
      base-set, включая вне-карты); `upgradeCheckHereAction` — инспекция только
      cwd (`inspectBaseSet` + `listProtections`) без реестра, npm-фазы,
      sync-state и бэкапов, exit 0; диспетчеризация `--check` раньше `--here` —
      из T11, здесь только ветка; секция Protections — последняя секция
      `--check`; строка `kept (local)` и `detail:` в деталях проекта; печать
      причины сломанных маркеров из `InspectOutcome.detail`.
      AC/REQ: REQ-09, NFR-03. Baseline: `memory-upgrade.ts:503,523,558,718`,
      `opencode-renderer.ts:195-260`.
      Зависимости: T3, T5, T6, T11. Allowlist:
      `src/adapters/cli/commands/memory-upgrade.ts`,
      `tests/unit/adapters/commands/memory-upgrade.check.test.ts`,
      `tests/integration/upgrade-check.test.ts`,
      `tests/integration/upgrade-here.test.ts`.
      Проверки: `npx vitest run tests/unit/adapters/commands/memory-upgrade.check.test.ts tests/integration/upgrade-check.test.ts tests/integration/upgrade-here.test.ts`,
      `npx tsc --noEmit`. RESULT: DONE; снапшот mtime+sha256 до/после `--check`
      идентичен (включая `wolf-sync-state.json`); `--here --check` не пишет и
      печатает Protections.

### Ф4 — гейт интеграции

- [ ] **T14. Интеграция и полный гейт.**
      Цель: волна сходится: порядок слияния T1→T2→T3→(T4,T5,T6)→T7→T8→T9→T10→T11,
      T12 в любой момент после T2, T13 после T6 и T11; проверить взаимодействия
      (проход + `--resolve` + `--json` + `--check` на одном парке-фикстуре).
      Конфликты: общий файл `memory-upgrade.ts` правят T6, T7, T8, T9, T10, T11,
      T13 — мерж строго последовательный, владелец интеграции lead; после каждого
      мержа точечные тесты затронутой задачи (не «все тесты»). `decisions.ts`
      делят T7→T8→T9→T10→T11 в том же порядке.
      Чекпоинты: после T5 (ядро), после T10 (поведение), после T11 (контракт
      вывода), после T13 (check-поверхность).
      Проверки: `npm run check` (english-surface, prettier, tsc, build, vitest);
      `npm run e2e` (правило проекта: E2E после плана); прогон парка-фикстуры
      из 3 проектов: `--check` → `--resolve` → `--json` → повторный проход
      (NFR-02); **regression-guard спайка R-01**: один живой
      `opencode run --agent <agent с protect>` в tmp-каталоге — ожидание 200 и
      отсутствие `protect` в теле запроса (design §5); при 400/появлении ключа —
      запись в troubleshooting, волна не блокируется (среда изменилась).
      Evidence: exit-коды, счётчики тестов и вывод guard-прогона в отчёт фазы.
      Allowlist: только уже перечисленные файлы задач + `tests/e2e/**` (если
      нужен сценарий), без новых зависимостей.

### Ф5 — выпуск

- [ ] **T15. Документация, сайт и релиз 2.20.0** (полный чек-лист ниже).

      **Allowlist T15** (кода не касается): `README.md`, `README.ru.md`,
      `CHANGELOG.md`, `package.json` (+ `package-lock.json` от `npm version`),
      `docs/site/**` (включая `docs/site/changelog/**` и `docs/reference/cli.md`
      как generated-артефакты), `AGENTS.md` — **только** как результат dogfood-шага
      (см. порядок, п. 3), `docs/dev/2026-10-24-wave-2-20-0-upgrade-intentions/**`
      (отчёт фазы выпуска). Любая правка `src/**` или `tests/**` на этом шаге —
      выход за scope: вернуть L0.

## Документация и сайт (обязательный раздел выпуска)

Методика: wolf-release-docs. Язык: EN-витрина и RU-внутренние пары; генераторы
не правятся вручную.

| Поверхность                                                               | Что сделать                                                                                                                                                                                                                                                  | Источник истины                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `README.md` / `README.ru.md`                                              | согласованная пара: одна фраза о `protect` и `--review`/`--resolve` в разделе обновления; рабочий пример «конфликт → `--review` → `protect`»                                                                                                                 | поведение после T7–T10, CLI help    |
| `docs/site/guide/upgrade.md` (новый EN) + `docs/site/ru/guide/upgrade.md` | страница обновления: план/подтверждение, `--check` (+ Protections), `--review`, `--resolve`, `--show`, `--yes` + бэкапы и восстановление, `--json` (схема и стабильность), `protect` (in-file, нормализация, `grep`), ограничения (orphan, diverged, нет GC) | design §4.7–§4.13                   |
| `docs/site/.vitepress/config.ts`                                          | пункты сайдбара EN/RU на новую страницу                                                                                                                                                                                                                      | конвенция навигации                 |
| `docs/site/guide/cli/platform.md` + RU                                    | раздел `wolf upgrade`: новые флаги, exit-модель без изменений, примеры                                                                                                                                                                                       | `docs/reference/cli.md` (generated) |
| `docs/site/guide/base-set.md` + RU                                        | штамп-исцеление, onboarding-блок v3 (что обновляется, что сохраняется), `protect`                                                                                                                                                                            | design §4.4, §4.5                   |
| `docs/site/guide/configuration.md` + RU                                   | `init` восстанавливает `mcp.wolf` в существующем конфиге; когда конфиг не создаётся                                                                                                                                                                          | design §4.14                        |
| `docs/site/guide/troubleshooting.md` + RU                                 | рецепты: `mutated` без нужды (`protect`/`keep`), сломанные onboarding-маркеры, битый frontmatter после ручной правки, восстановление из `.wolf/backup/upgrade/`                                                                                              | design §4.12, §4.17                 |
| `docs/reference/cli.md`                                                   | **не править вручную**: генерируется `node scripts/generate-cli-reference.mjs` внутри `npm run docs:build` (сначала `npm run build`)                                                                                                                         | генератор                           |
| `docs/site/changelog/**`                                                  | **не править вручную**: `node scripts/sync-changelog.mjs` внутри `npm run docs:build`                                                                                                                                                                        | CHANGELOG.md                        |
| `CHANGELOG.md`                                                            | секция `## [2.20.0] - <дата>`: Added/Changed/Fixed/Upgrade notes — пользовательский эффект, миграции, `protect` (в т.ч. «в model-запрос не попадает — проверено на v2.1.4»), бэкапы, ограничения (orphan, `diverged`, нет GC)                                | design §5, факты фазы               |
| `package.json`                                                            | `npm version 2.20.0` (единственный источник версии; голые миноры запрещены)                                                                                                                                                                                  | правило проекта                     |

Порядок выпуска (после зелёного T14):

1. **Dogfood:** `npm run build`, затем `node dist/bootstrap/cli.js upgrade --here`
   в самом репозитории Wolf (или установленным `wolf upgrade --here`): собственный
   `AGENTS.md` переходит с onboarding-блока v2 на v3, посторонний текст в файле
   сохраняется. Проверить глазами diff `AGENTS.md` (блок обновлён, остальное
   байт-в-байт) и `git status` — только ожидаемые файлы. Если блок не обновился,
   это дефект T4: вернуть в работу, не выпускать.
2. `npm version 2.20.0` (единственный источник версии) → `CHANGELOG.md` секция
   `## [2.20.0] - <дата>` (Added/Changed/Fixed/Upgrade notes: пользовательский
   эффект, миграции, `protect`, `--review`/`--resolve`, бэкапы; провайдерский риск
   `protect` — снят живым прогоном 2026-10-25, design §5) → `npm run docs:build`
   (генераторы `generate-cli-reference` и `sync-changelog` вызываются внутри —
   отдельно их не запускать) — сборка должна пройти.
3. README-пара и страницы сайта EN/RU — прочитать глазами нового пользователя и
   обновляющегося владельца; независимое ревью документации (мандат:
   фактическое соответствие продукту + полезность). Проверить, что в
   `docs/reference/cli.md` есть все новые флаги, а страница changelog совпадает с
   `CHANGELOG.md`.
4. `npm run check` и `npm run e2e` на финальном дереве — зелёные.
5. `git tag v2.20.0` на релизном коммите в `main` → `git push origin v2.20.0`
   (workflow `Publish`: сверка тега с `package.json`, checks, e2e, pack
   dry-run, npm trusted publishing).
6. GitHub Release `v2.20.0` с текстом из CHANGELOG (Added/Changed/Fixed/Upgrade
   notes) и ссылкой на docs.
7. Деплой сайта: push в `main`, затрагивающий `docs/site/**` или
   `package.json` (workflow `Deploy Docs`); проверить опубликованные страницы
   (upgrade EN/RU, changelog, cli reference) — сборка ≠ деплой.
8. Проверка npm: `npm view mister-wolf version` = `2.20.0`; сайт отдаёт новую
   версию в навбаре (`pkg.version`).
9. **Метрика успеха §1 requirements:** повторный `wolf upgrade --check` по тому
   же живому парку на 2.20.0 — 0 ложных needs-decision (штамп-дрейф, onboarding-
   блок и differ-счётчики больше не создают шума), каждый настоящий
   needs-decision назван путём, а `diverged` — отдельной секцией. Запись в live-
   проект (`--resolve`) — только с явного согласия владельца; read-only прогон
   согласия не требует. Результат (до/после, список путей) — в отчёт фазы выпуска.

Релиз считается завершённым только при опубликованных npm-пакете, GitHub
Release, теге и обновлённом сайте (правило проекта).

## Риски и замечания плана

- **Провайдерский риск `protect` (spike R-01) — снят живым прогоном 2026-10-25
  (design §5):** провайдер отвечает 200, ключ `protect` в тело model-запроса не
  попадает (ни у primary-, ни у subagent-агента, opencode v2.1.4). Остаточный
  риск — смена поведения будущей версии opencode; T14 держит один живой прогон
  как regression guard, при 400/появлении ключа — запись в troubleshooting, волна
  не блокируется.
- **Формулировка допущения §6 requirements** («игнорирует») уточняется L0 —
  код от этого не зависит (design §5, §8).
- **Общие файлы и порядок слияния (M-8):**
  `src/adapters/cli/commands/memory-upgrade.ts` правят T6 → T7 → T8 → T9 → T10 →
  T11 → T13; `src/app/use-cases/decisions.ts` — T7 → T8 → T9 → T10 → T11;
  `src/adapters/render/opencode/opencode-renderer.ts` — T3 → T4 (T13 рендерер не
  правит: `listProtections` реализует T3, T13 только печатает);
  `src/app/use-cases/upgrade-projects.ts` — T6 → T7 → T10 → T11. Мерж
  последовательный в этом порядке, владелец интеграции lead; после каждого мержа
  точечные тесты затронутой задачи (не полный прогон). Параллелить T8/T9/T10
  нельзя — они пишут одни файлы.
- **Pre-existing:** если `npm run check` красный до правок — фиксируется
  отдельно и не чинится в этой волне.
- **Миграция состояния:** старый `wolf-sync-state.json` читается как
  `origin:'render'`; читатели (кроме `loadSyncState`: `platform-mismatch`,
  `memory-doctor`, `uninstall`) используют только ключи, поэтому объект вместо
  строки их не ломает — T2 подтверждает тестом. **Откат к 2.19.0 после волны**
  увидит объекты как `mutated` по всем файлам свидетеля (сравнение
  `sha256(current) !== recorded`); данные не теряются, лечится удалением/
  восстановлением `.opencode/wolf-sync-state.json` или повторным апгрейдом.
