TASK: release-2.16.1 — финализация релиза Mr. Wolf 2.16.1. Thread: mem_20261011_2_16_1_integratsiya_ekspertnogo_paketa_s_b97a1b. Владелец дал команду «релизь» — все релизные действия разрешены. Ты действуешь в роли L1.

КОНТЕКСТ
- Волна принята: mem_20261011_volna_2_16_1_prinyata_l0_main_723c4b4_ge_90b0f0 (ACCEPTED по AC1–AC6)
- main = 723c4b4 (рабочая копия чистая), package.json = 2.16.1, CHANGELOG [2.16.1] на месте, changelog-страницы сайта синхронны (docs:build выполнен в волне)
- Гейты на 723c4b4 уже зелёные (check/vitest×2/e2e) — не перезапускай без изменения состояния; если состояние менялось — обязательный перепрогон
- Релизный чек-лист волны: docs/dev/ (найди план wave-2.16.1, раздел «Документация и сайт» + релизный чек-лист) — следуй ему; прецедент: последовательность релиза 2.16.0 (git log main --oneline | grep -i release/dogfood)
- Релизы тегами v*, trunk-based; npm publish стандартно; сайт деплоится его штатной командой (проверь package.json scripts / docs по деплою сайта)

РАБОТЫ (по порядку, чекпоинты)
1. Тег: git tag v2.16.1 на 723c4b4; push tag в origin
2. Push main в origin (без --force)
3. npm publish (пакет Wolf); проверь фактическую версию в реестре: npm view mr-wolf version (или штатное имя пакета) — должно быть 2.16.1
4. GitHub Release для v2.16.1 (gh release create, тело из CHANGELOG-записи 2.16.1)
5. Деплой сайта документации штатным способом проекта; проверь, что страница Changelog на сайте содержит 2.16.1
6. Обновление глобального wolf (штатно, как после 2.16.0) + dogfood-синки: wolf sync в проекте и коммит стампов по паттерну post-release (см. коммит 8baec9d для 2.16.0)
7. Закрыть blocker: wolf transition mem_20261011_produkt_detektor_neagregirovannykh_uroko_02f0ed completed
8. Уборка (finishing-a-development-branch): git worktree remove .worktrees/wave-2.16.1 и .worktrees/2.16.1-skills-analysis (только если чистые — git status в каждом), удалить ветки wave-2.16.1 и 2.16.1-skills-analysis. Не трогай прочие worktree
9. Финальная проверка: после всех пунктов — wolf recap локальной сборкой НЕ требуется; проверь, что глобальный wolf recap после обновления пакета не показывает баннер «вызовите Стюарда» (детектор исправлен в 2.16.1)

ОГРАНИЧЕНИЯ
- git push --force запрещён; npm publish --force запрещён
- Если npm/GitHub/деплой требуют отсутствующих креденшелов — верни BLOCKED с точным перечнем, чего не хватает, и что уже выполнено (не повторяй необратимые действия вслепую: перед повтором publish проверь npm view)
- Отчёт: .external_experts_review/2026-10-11-skills-superpowers/REPORT-2.16.1-release.md

ACCEPTANCE
- AC1: тег v2.16.1 → 723c4b4, в origin; GitHub Release создан
- AC2: npm-реестр показывает 2.16.1 (npm view, evidence)
- AC3: сайт задеплоен, Changelog-страница содержит 2.16.1 (evidence: url/проверка)
- AC4: глобальный wolf обновлён, dogfood-синки закоммичены по прецеденту, баннер Стюарда отсутствует в recap
- AC5: blocker закрыт; worktree/ветки убраны; рабочая копия чистая
- AC6: RESULT по контракту + список выполненных действий с evidence по каждому
