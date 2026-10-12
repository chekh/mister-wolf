---
slug: wave-2-16-2-platform-lifecycle
title: Волна 2.16.2 — дизайн (doctor repair v1→v2, uninstall, версионное правило)
status: approved
created: 2026-10-12
---

# Дизайн волны 2.16.2

Baseline: main e44e5f8. Требования: requirements.md (approved). Исследование: код src/app/use-cases/{doctor,init-project,repair-storage}.ts, src/adapters/{render/opencode/opencode-renderer.ts, render/sync-state.ts, render/stamp.ts, platforms/opencode-adapter.ts, platforms/claude-adapter.ts, cli/commands/memory-doctor.ts, cli/commands/memory-init.ts}, templates/base/AGENTS.md, tests/container/opencode-v2/.

## 1. Глоссарий

См. requirements.md §3. Дополнительно: **runtime** — версия OpenCode из `opencode --version` (parseOpencodeVersion: v1 ≥ 1.18.29, v2 = major ≥ 2, иначе unsupported/absent/unparseable).

## 2. Результаты исследования (вход в дизайн)

1. Плагины dual с 2.14.1 (v1-хуки + v2-native entry в одном файле); init НЕ пишет
   разный контент под v1/v2 — версия только репортится (init-project.ts:205-223, 387-407).
2. Значит «установлено под v1» = штамп set плагина < 2.14.1 (v1-only рендер старой
   версией Wolf); такой плагин не работает в рантайме v2 (основание hotfix 2.14.1).
3. Wolf-ключи opencode.json: mcp.wolf, default_agent=mr-wolf, subagent_depth≥2 — одинаковы
   для v1/v2; opencode-adapter.writeConfig идемпотентен (unchanged/written/replaced).
4. Claude Code: .mcp.json, ключ mcpServers.wolf (claude-adapter.ts:39-66: writeConfig
   39-53, removeWolf 55-66).
5. Штампы: parseStamp (stamp.ts); свидетель рендера: .opencode/wolf-sync-state.json
   (sync-state.ts, sha256 по rel-пути, введён 2.11.0); mutated-skip защищает локальные правки.
6. `wolf doctor --repair` сегодня = repairStorage (перестройка индекса) в cwd;
   `--dry-run` только вместе с --repair (memory-doctor.ts:56-88).
7. careful re-init: planInit (read-only план, live-гейт) + --yes в memory-init.ts.
8. Орикон-сканирование syncBaseSet: roots .opencode/{agents,skills,command,plugins},
   orphaned = штампованные вне текущего набора (opencode-renderer.ts:169-183).

## 3. Компоненты и ответственность

### C1. AGENTS.md-шаблон (REQ-01)
- templates/base/AGENTS.md — добавить пункт правила версий (полный X.Y.Z) в «Указатели».
- Доставка — существующий syncBaseSet (штампованный AGENTS.md обновится «updated»).
- Ответственность: контент-правка, без кода. Покрытие: существующие тесты стампов +
  тест на содержание маркер-фразы правила (запятая-инвариант «2.16.2», не «2.16»).

### C2. Doctor mismatch-детект (REQ-02, детект)
- Новый модуль src/app/use-cases/platform-mismatch.ts.
- Контракт:
  ```ts
  interface PlatformMismatch {
    platform: string;            // 'opencode'
    runtime: PlatformVersionInfo;   // из adapter.detectVersion
    installedSet: string | null; // min set= по штампам плагинов; null — штампов нет
    issue: string;               // человекочитаемая строка для doctor issues
  }
  detectPlatformMismatch(deps, projectRoot): Promise<PlatformMismatch | null>
  ```
- Логика: только для adapter.detect && typeof adapter.detectVersion === 'function';
  installedSet = min set по записям wolf-sync-state, относящимся к .opencode/plugins/**
  (с cross-check parseStamp на файле; запись без штампа исключается). По скану диска,
  включая сироты, installedSet НЕ считается: сироты syncBaseSet не перерендеривает,
  и ремонт по ним зациклился бы (F-02). Mismatch: runtime=v2 && installedSet < DUAL_SINCE
  ('2.14.1') → issue «opencode: installed under v1 (set <2.14.1), runtime v2 — run wolf
  doctor --repair». Детект однонаправлен по конструкции: dual-шаблоны работают в обоих
  рантаймах, поэтому «v2-рендер на v1» mismatch'ем не является; зеркальное правило
  активируется константой, когда появится v2-only выпуск (ADR-1).
- runDoctor не меняется (issue строка добавляется в существующий issues[] на call-site
  через deps платформенных адаптеров — расширение DoctorDeps: detectMismatch?).

### C3. Doctor --repair платформы (REQ-02, repair)
- Новый use-case src/app/use-cases/repair-platform.ts:
  ```ts
  repairPlatform(deps, projectRoot, { dryRun }): Promise<{ plan: string[]; actions: string[] }>
  ```
- Предусловие-гвард (F-01): ремонт выполняется только при adapter.detect(projectRoot)
  (конфиг платформы или каталог .opencode существуют) И наличии wolf-sync-state/штампов;
  иначе — skip-строка: «no opencode install» (нет ни конфига, ни .opencode) либо
  «no wolf-managed content in .opencode» (установка есть, штампов/state нет) — различаем
  случаи (F-10); никаких записей (синк на проекте без установки создал бы .opencode —
  недопустимый side-effect doctor --repair).
- Действия: (1) syncBaseSet(projectRoot) — перерендер штампованных файлов под текущие
  шаблоны (mutated-skip сохраняет чужие правки); (2) opencode-adapter.writeConfig —
  канонизация mcp.wolf/default_agent/subagent_depth. --dry-run: план через существующий
  механизм sync (без записей — dry-режим рендера не существует, поэтому plan = mismatch-
  report + перечисление файлов-кандидатов, чтение без записи).
- Отчёт repair включает orphaned[] из syncBaseSet со строкой-рекомендацией
  (удалить вручную или wolf uninstall) — repair сироты не трогает (F-02).
- CLI memory-doctor --repair: сначала repairPlatform, затем repairStorage (обе зоны
  в одном отчёте). Идемпотентность: sync второй раз → «content identical», writeConfig
  → «unchanged».

### C4. wolf uninstall (REQ-03)
- Новый use-case src/app/use-cases/uninstall.ts + CLI src/adapters/cli/commands/memory-uninstall.ts.
- planUninstall(deps, baseDir): read-only → UninstallPlan { entries: {target, kind, reason}[], purgeEntries, keptForeign }.
  Первичный источник — wolf-sync-state (.opencode/wolf-sync-state.json): rel-пути
  штампованных файлов Wolf, cross-check parseStamp на файле. Fallback (F-03): state
  отсутствует/пуст (легаси < 2.11.0) → скан по штампу четырёх каталогов
  .opencode/{agents,skills,command,plugins}; штамп = wolf-owned по определению.
  Корневые AGENTS.md/CLAUDE.md исключаются всегда (F-04): marker-append может содержать
  чужой контент — skip-entry «kept by design (may contain user content)».
  Файл со штампом, но без записи в state (fallback-скан не нашёл из-за непустого state) —
  skip «stamped but unrecorded — not in sync-state» (консервативно, NFR-02).
  Конфиги: opencode (ключи mcp.wolf; default_agent только при === mr-wolf; subagent_depth
  только при === 2 — точные значения, не диапазон: чужую пользовательскую настройку
  subagent_depth=5 не удаляем, F-07), claude (.mcp.json mcpServers.wolf); сам wolf-sync-state.json.
- executeUninstall(deps, plan, { purge, yes }): без yes — только печать плана (dry-run по
  умолчанию), exit 0. С yes: удаление файлов из plan (только штампованные), вычистка
  wolf-ключей конфигов (adapter.removeWolf + наши default_agent/subagent_depth при точном
  нашем значении), удаление пустых каталогов .opencode/{agents,skills,command,plugins}
  (rmdir, если пусты — чужое не трогаем), удаление wolf-sync-state.json.
  --purge: + rm -rf .wolf (после yes). Финальная подсказка: `npm uninstall -g mister-wolf`
  (+ строка «AGENTS.md wolf-блок не удалялся — remove manually if unwanted»).
- Отсутствующий конфиг/файл → entry kind 'skip' с причиной. Идемпотентность: второй
  запуск → пустой план, «nothing to remove», exit 0.

### C5. CLI-регистрация
- cli-entry.ts: команда uninstall в реестр (влияет на --help и cli-reference → docs:build).

## 4. Контракты (сводно)

- DoctorDeps += `detectMismatch?: (path: string) => Promise<string[]>` — строки issues;
  runDoctor остаётся чистым над deps (юнит-фейки не ломаются).
- UninstallPlan/PlatformMismatch — типы в use-case модулях, без изменений схем памяти.
- Изменения конфигов платформ — только через существующие adapter API (writeConfig/removeWolf);
  удаление наших default_agent/subagent_depth — новая опциональная операция адаптера
  `removeWolfKeys?` (opencode: оба ключа при нашем значении; claude: нет ключей).

## 5. ADR

### ADR-1: детект по штампу set, а не по истории установок
- Контекст: «под чем установлено» нигде не фиксируется машиночитаемо; dual-шаблоны с
  2.14.1 совместимы с обоими рантаймами.
- Альтернативы: (а) фиксировать версию рантайма при init в новом поле sync-state —
  не работает для уже установленных проектов, расширяет контракт; (б) детект по штампам
  существующих плагинов — работает для всех проектов без миграции.
- Выбор: (б), порог DUAL_SINCE='2.14.1'. Зеркальный кейс (v2-рендер на v1-рантайме)
  симметричен конструкцией; сегодня v2-only выпуска нет — правило задействуется константой.
- Последствия: старые проекты (< 2.14.1) при рантайме v2 получают точное сообщение и
  repair; риск — false negative невозможен (штамп всегда пишется), false positive нет
  (min set < 2.14.1 действительно v1-only).
- Проверка допущения: тест на плагин set=2.14.0 (v1-only) → mismatch; set=2.14.1 → clean.

### ADR-2: uninstall владеет wolf-sync-state, fallback — штамп
- Контекст: бриф фиксирует критерий принадлежности — штампы wolf-sync-state; установки
  старее 2.11.0 (введение T010 sync-state) state не имеют.
- Выбор: primary — записи sync-state с cross-check штампа на файле; при отсутствии/пустоте
  state — fallback-скан по штампу в четырёх каталогах .opencode (легаси-проекты).
  Семантика удаления: удаляется файл, если (есть запись в state И файл штампован) ИЛИ
  (state пуст/отсутствует И файл штампован). Штампованный файл при непустом state без
  записи — не удаляется (консервативный skip с причиной). AGENTS.md/CLAUDE.md не удаляются
  никогда (чужой контент в marker-append).
- Последствия: ручные копии штампованных файлов при непустом state не удаляются —
  осознанно (NFR-02); uninstall покрывает и легаси-установки; false positive по штампу
  невозможен — штамп ставит только рендер Wolf.
- Проверка допущения: юнит-тесты «чужой файл в .opencode/plugins — не тронут» и
  «легаси без sync-state: штампованные файлы попадают в план».

### ADR-3: --repair расширяется платформенной зоной до storage-зоны
- Контекст: repair-зона doctor существует (repairStorage, cwd).
- Выбор: `wolf doctor --repair` = repairPlatform(cwd) + repairStorage(cwd), общий отчёт,
  --dry-run покрывает обе. Порядок фиксирован (рендер не зависит от storage).
- Последствия: однострочный путь ремонта для пользователя; риск — проект без .opencode:
  repairPlatform честно репортит skip (no opencode install).

## 6. Отказные сценарии, идемпотентность, observability

- opencode CLI недоступен (absent) → детект mismatch пропускается с skip-причиной
  (NFR «честный skip»); repair всё равно канонизирует конфиг (безопасно, идемпотентно).
- Битый wolf-sync-state → uninstall план = пустой + предупреждение («no sync-state —
  nothing identified as wolf-owned in .opencode»); fallback-скан применяется только при
  отсутствующем или пустом (не битом) state: битый state не даёт права считать чужие
  файлы своими (консервативно, F-11); конфиг-ключи чистятся по ours()-критерию.
- Частичный сбой (файл read-only) → действие с ошибкой попадает в отчёт с причиной,
  остальные продолжаются; exit-код 1 при любой ошибке удаления.
- Observability: построчные отчёты в стиле sync (file — action (reason)); маскирование
  секретов не требуется (пути/ключи, не значения).

## 7. Trust boundary

Удаление выполняется только по файлам внутри projectRoot, идентифицированным sync-state +
штамп (или fallback-штамп при пустом state); конфиги — только наши ключи с ТОЧНЫМ нашим
значением (mcp.wolf/mcpServers.wolf; default_agent === mr-wolf; subagent_depth === 2 —
пользовательскую повышенную настройку не трогаем, F-07). Никаких путей из пользовательского
ввода кроме --purge (константный .wolf в projectRoot). Чужой контент неприкосновенен (NFR-02).

## 8. Покрытие REQ/NFR

- REQ-01 → C1; REQ-02 → C2+C3+ADR-1/3; REQ-03 → C4+C5+ADR-2; NFR-01/02 → §6, ADR-2.
- Не требуется дизайна: миграции памяти, конкурентность (однопоточные CLI-операции).

## 9. Ревью

- Ревью 1 (2026-10-12, worker-reviewer, чистый контекст): NEEDS_CHANGES — F-01..F-08,
  все ACCEPTED и внесены (гвард repairPlatform, installedSet по sync-state, fallback
  штампа для легаси, исключение AGENTS.md, точные значения ключей, правка формулировок
  и ссылок).
- Ревью 2 (2026-10-12, worker-reviewer, fix-верификация): F-01..F-06 подтверждены
  закрытыми; F-09 (дубль пункта §2), F-10 (различение skip-строк гварда), F-11 (битый
  state без fallback) — ACCEPTED и внесены. Дизайн готов к планированию/исполнению.
