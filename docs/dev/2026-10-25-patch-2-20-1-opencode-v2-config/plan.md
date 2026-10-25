# План: патч 2.20.1 — Wolf ↔ конфиг opencode v2 (пункты 6.1–6.5)

Metadata

- task_id: `patch-2-20-1-opencode-v2-config`
- thread: `mem_20261025_patch_2_20_1_subagent_depth_pod_experime_aa8af3`
- основание: `docs/dev/2026-10-25-opencode-v2-config-audit/audit.md` §6 (утверждено владельцем)
- база: `main` @ `38aceab`; ветка `fix/2.20.1-opencode-v2-config`, worktree `.worktrees/patch-2-20-1-opencode-v2-config`
- режим: FULL; версия не поднимается, merge/тег/публикация — отдельным релизным шагом

## Решения уровня плана (в рамках аудита)

1. **Знание о ключах — в адаптере, doctor остаётся generic.** Проверки 6.1/6.4 (знает только
   opencode) добавляются опциональным методом порта `configIssues?(projectRoot)` —
   тем же приёмом, что уже принятые `detectVersion?` / `removeWolfKeys?`. `doctor` вызывает
   метод, если он есть; иначе работает текущая generic-проверка (`cfg.mcp ?? cfg.mcpServers`).
   Импорт opencode-специфики в `src/app/use-cases/doctor.ts` не добавляется.
2. **Реестр — единственный источник путей.** `src/adapters/platforms/opencode-config-keys.ts`
   отдаёт: канонический путь v2, легаси-пути, форму записи, метки ключей для логов и
   get/set/delete-хелперы с прунингом пустых объектов. Строковые литералы путей
   (`'mcp.wolf'`, `'mcp.servers'`, `'default_agent'`, `'subagent_depth'`) в
   `src/adapters/platforms/**` и `src/app/use-cases/**` живут только в реестре.
3. **Метки ключей меняются вместе с формой записи.** После 6.3 Wolf пишет `mcp.servers.wolf`,
   поэтому лог-метка `mcp.wolf` → `mcp.servers.wolf`; тесты/e2e, сверяющие метку, обновляются.
4. **Минимальная версия opencode не меняется: v1 ≥ 1.18.29 и v2.** Нативная форма
   `mcp.servers` принимается с 1.18.29 (hoist `v2-compat.ts` — аудит §6.3), т.е. порог
   `parseOpencodeVersion` уже покрывает её. В документацию и CHANGELOG — явная строка.
5. **Ownership MCP — два разных действия.** _Запись_ (`init` / `doctor --repair`)
   канонизирует **слот wolf**: нативная `mcp.servers.wolf` с другой командой — ручная
   dev-запись, она заменяется канонической (`replaced` + reason) по контракту порта
   («replaced — существующая запись wolf перезаписана, в т.ч. ручная dev-запись»).
   _Удаление_ (`uninstall`, `removeWolf`) и снятие легаси при записи трогают только
   «наше»: `type: local` + точная команда `[wolf, mcp]`, независимо от формы
   (`enabled: true` / `disabled: false`) и лишних полей. Чужой легаси `mcp.wolf`
   (иная команда) при записи не удаляется — только сообщается; чужие серверы и ключи
   не трогаются. `doctor` проверяет наличие и форму, а не команду: ручную dev-запись
   он не «лечит» советом запустить `init`.

## Задачи

### T1 — 6.2 + 6.3: реестр ключей и нативная форма MCP (воркер, MEDIUM)

Зависимости: нет. Allowlist записи:

- `src/adapters/platforms/opencode-config-keys.ts` (новый)
- `src/adapters/platforms/opencode-adapter.ts`
- `src/app/use-cases/repair-platform.ts` (только строка плана)
- `src/app/use-cases/init-project.ts` (только строки сообщений, если нужны)
- `src/adapters/cli/commands/memory-doctor.ts` (только если метки ключей в выводе)
- `tests/unit/adapters/platforms/opencode-config-keys.test.ts` (новый)
- `tests/unit/adapters/platforms/opencode-adapter.test.ts`
- `tests/unit/use-cases/init-project.test.ts` (ожидания `CANONICAL`)
- `tests/e2e/init-cli.e2e.ts`, `tests/e2e/platform-repair.e2e.ts`, `tests/e2e/uninstall.e2e.ts`,
  `tests/e2e/distribution.e2e.ts`, `tests/integration/b0-init.test.ts`

Работа: реестр (канонический путь, легаси-пути, форма, get/set/delete + прунинг);
адаптер читает/пишет/удаляет через реестр; MCP пишется нативно
`{type:'local', command:[…], disabled:false}` без `codemode`; легаси `mcp.wolf` нашего
образца при записи мигрируется, чужой — сохраняется + reason; `doctor` (generic-путь) и
`removeWolfKeys` понимают обе формы; идемпотентность (`unchanged` без записи файла).
Тесты: инвариант «путь записи == канонический v2» по каждому ключу реестра; grep-тест на
отсутствие строковых литералов путей вне реестра; обе формы в doctor/uninstall/init;
пользователь сам мигрировал (`mcp.servers.wolf` есть, `mcp.wolf` нет) → не «missing»,
uninstall удаляет, init не пишет второй ключ; повторный init/repair → `unchanged`.

Проверки: точечный `npx vitest run` по затронутым файлам, `npx tsc --noEmit`.

### T2 — 6.1 + 6.4: doctor валидирует ключи и предупреждает о смешанном frontmatter (воркер, MEDIUM)

Зависимости: T1 (реестр, метки, reader обеих форм).

Allowlist записи:

- `src/ports/platform-adapter.port.ts` (опциональный `configIssues?`)
- `src/adapters/platforms/opencode-adapter.ts` (`configIssues` для opencode)
- `src/app/use-cases/doctor.ts` (вызов опционального метода)
- `tests/unit/use-cases/doctor.test.ts`
- `tests/unit/adapters/platforms/opencode-adapter.test.ts`

Работа: `configIssues(projectRoot)` у opencode — (а) `default_agent === 'mr-wolf'` иначе
issue с подсказкой; (б) `experimental.subagent_depth >= 2` иначе issue; (в) наличие
deprecated верхнеуровневого `subagent_depth` → issue «ignored by opencode v2, migrate»;
(г) deprecated `mcp.wolf` при отсутствии нативного → issue «legacy form, migrate»;
(д) смешанный frontmatter managed-агента (`permissions|request|system|disabled` рядом с
`permission|temperature|mode`) → предупреждение о том, что V1-поля игнорируются.
Сообщения — в стиле текущих `issues` (короткая строка + действие). `--json` не ломать.
Тесты: пять ветвей 6.1 (всё ок; нет ключа; `1`; deprecated сверху; наш легаси `2` сверху +
правильный `experimental`), детект/молчание 6.4.

### T3 — 6.5: маркер `wolf tool expose` после frontmatter (lead, TRIVIAL)

Allowlist: `src/app/use-cases/tool-librarian.ts`, `tests/unit/use-cases/tool-librarian.test.ts`.
Тест: frontmatter первым, `name`/`description` парсятся yaml-ом, маркер ниже блока.

### T4 — документация продукта (воркер, SIMPLE)

Зависимости: T1–T3 (поведение зафиксировано).

Allowlist: `CHANGELOG.md`, `docs/site/guide/configuration.md`, `docs/site/ru/guide/configuration.md`,
`docs/site/guide/troubleshooting.md`, `docs/site/ru/guide/troubleshooting.md`,
`docs/site/guide/cli/platform.md`, `docs/site/ru/guide/cli/platform.md`.
`docs/reference/cli.md` — только генератором (`npm run docs:build`), руками не править.

### T5 — гейт, интеграция, независимое ревью (lead)

`npm run check`; e2e последовательно `init-cli`, `platform-repair`, `uninstall`,
`upgrade-park-modes`, `doctor-secrets`; `npm run docs:build`; `git status` чистый;
ревью `opencode run --standalone --agent worker-reviewer` по диффу (фокус 6.3 и 6.2).

## Порядок и параллельность

T1 → T2 → T4; T3 — параллельно T1 (другие файлы). Ревью — после зелёного гейта.

## Критерии приёмки (из брифа L0)

- [ ] AC1 — 6.1: doctor ловит все три расхождения, включая deprecated-ключ
- [ ] AC2 — 6.2: единый реестр + инвариант «путь записи == канонический v2» + grep-тест
- [ ] AC3 — 6.3: обе формы читаются/удаляются, пишется нативная, легаси мигрируется, чужое целое, идемпотентность
- [ ] AC4 — 6.4: предупреждение + документация EN/RU
- [ ] AC5 — 6.5: frontmatter первым, тест парсит `description`
- [ ] AC6 — `npm run check`, e2e-набор, `docs:build` зелёные с числами
- [ ] AC7 — ревью без critical/major
- [ ] AC8 — отчёт и план отражают факт, ветка готова к релизу
