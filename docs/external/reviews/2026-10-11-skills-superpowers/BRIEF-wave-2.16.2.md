TASK: wave-2.16.2 — версионная дисциплина в AGENTS.md + ремонт платформы v1→v2 в wolf doctor + wolf uninstall. FULL. Thread: mem_20261012_2_16_2_versionnaya_distsiplina_pereezd_o_87915b.

Ты действуешь в роли L1 (executor-lead): фиксируешь режим (FULL), ведёшь документы через wolf scaffold artifact, декомпозируешь, управляешь исполнителями, интегрируешь. Коммиты в ветке волны и merge в main после гейтов — разрешены. Запрещено: тег v*, npm publish, деплой сайта, push --force.

УТВЕРЖДЁННЫЕ ВЛАДЕЛЬЦЕМ ВХОДЫ
- Решения: mem_20261012_2_16_2_resheniya_vladeltsa_doctor_repair_28e792
- Новое правило (уже active): mem_20261012_nomer_versii_vsegda_polnyy_x_y_z_v_plana_85fa36
- Проект: /Users/chekh/Development/mister-wolf (TypeScript, vitest; валидация npm run check). main = e44e5f8, чистый.

ТРЕБОВАНИЯ (утверждены владельцем; оформи в requirements.md по штатному шаблону FULL через wolf scaffold artifact 2.16.2-platform-lifecycle или подобный slug)
- REQ-1 Версионная дисциплина: формулировка правила («Номер версии всегда полный X.Y.Z — в планах, тредах, волнах, тегах и разговоре…» — полный текст в памяти) добавить в AGENTS.md шаблона и установленного проекта (оба, штатной доставкой base-set). AC: AGENTS.md содержит правило; sync-доставка покрыта существующими тестами стампов.
- REQ-2 Ремонт платформы: wolf doctor детектит несоответствие «установлено под OpenCode v1, рантайм v2» и зеркально (детект версии OpenCode уже есть с 2.14.1); wolf doctor --repair перерендеривает плагин и запись в opencode.json под детектированную версию (repair-зона doctor уже есть с 2.16.0). AC: e2e-фикстура «установлено под v1 → рантайм v2 → doctor сообщает → --repair чинит → плагин/MCP работают»; идемпотентность повторного repair; --dry-run показывает план.
- REQ-3 wolf uninstall: план + подтверждение (паттерн careful re-init из 2.16.0); удаляет только штампованные Wolf файлы (.opencode/ агенты/скиллы/команды/плагины, записи в конфигах платформ, которые писал Wolf — OpenCode, Claude Code; критерий принадлежности — штампы wolf-sync-state); .wolf/ по умолчанию сохраняется с явным сообщением, --purge стирает; финальная подсказка npm uninstall -g mister-wolf. AC: после uninstall в конфигах и .opencode/ нет следов Wolf, чужой контент нетронут; с --purge .wolf/ удалена; dry-run по умолчанию без изменений; идемпотентность.
- NFR: идемпотентность; без подтверждения ничего не удалять; чужие (нештампованные) файлы не трогать никогда; поведение на отсутствующих конфигах — честный skip с причиной.

ИССЛЕДОВАНИЕ ДО ДИЗАЙНА (обязательно): как init 2.14.1+ пишет плагин/конфиг для v1 и v2 (dual-файл, формат opencode.json), что именно ломается при апгрейде v1→v2 у пользователя; текущий состав doctor checks и --repair; реестр штампов wolf-sync-state.json (кто пишет/читает); переиспользуй careful re-init (planInit, --yes) для uninstall-подтверждения. Контейнерный smoke (tests/container/opencode-v2/) — паттерн для e2e.

ДИСЦИПЛИНА
- wolf-design → wolf-plan → wolf-testplan по FULL (документы в docs/dev/<date>-<slug>/); план содержит раздел «Документация и сайт» + полный релизный чек-лист (правило mem_20260929); версия волны — 2.16.2 (полный номер, новое правило)
- TDD: новое поведение — RED до реализации
- Гейты: npm run check; npx vitest run --maxWorkers=2 --minWorkers=1; npx vitest run; npm run e2e — exit-коды в отчёт
- Независимое ревью до merge: отдельный чистый контекст (opencode run или воркер), мандаты соответствие + качество; findings циклом с IDs
- Версия: npm version 2.16.2 --no-git-tag-version (тег запрещён до релиза) + CHANGELOG [2.16.2] + docs:build (синк changelog-страниц сайта); сайт/публикация НЕ деплоить
- Worktree: .worktrees/wave-2.16.2 от main e44e5f8
- Число скиллов теперь 19 — не регрессировать счётчики

ACCEPTANCE (по отчёту)
- AC1: REQ-1/2/3 реализованы по утверждённым формулировкам; requirements/design/plan/test-plan на месте и согласованы с реализацией
- AC2: AC из требований подтверждены evidence: e2e v1→v2 repair зелёный, uninstall сценарии (default/purge/dry-run/чужой контент) покрыты тестами
- AC3: гейты зелёные на итоговом main после merge (check, vitest×2, e2e), exit-коды
- AC4: независимое ревью проведено (оба мандата), findings закрыты/обоснованы
- AC5: main содержит волну; package.json = 2.16.2; CHANGELOG [2.16.2]; тег/publish/deploy НЕ выполнялись
- AC6: RESULT + ACCEPTANCE-пакет

Отчёт: .external_experts_review/REPORT-2.16.2-implementation.md (создай папку при необходимости). FRICTION/COMPLAINT — по формату.
