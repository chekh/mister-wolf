# Проверки пакета

База: e93d73350626990a3ffa5cf68efcf1a447de2278 (2.27.1).
Дата: 2026-11-04, Europe/Moscow. Node v24.22.1, npm 11.9.0.

| Проверка | Результат |
| --- | --- |
| git apply --check на чистой базе | PASS |
| git apply --reverse --check на изменённом дереве | PASS |
| git diff --check | PASS |
| Frontmatter трёх новых SKILL.md через js-yaml | PASS |
| node scripts/generate-update-map.mjs --verify | PASS: 57 файловых целей, 6 лиц |
| Адресный набор: delivery, work-strategy, update-map, conveyor, intake | PASS: 21 тест |
| Полный npm run check | PASS: english-surface, format, lint, build, test |
| Полный набор тестов | 227 файлов; 2090 passed, 4 skipped |

Полный гейт запущен как `env -u NO_COLOR -u WOLF_NO_COLOR npm run check`:
в окружении задан NO_COLOR=1, несовместимый с существующим тестом TTY-подсветки.
Проверка цвета и runtime-код не изменялись. Счётчики полного init обновлены
для трёх новых навыков; тесты не ослаблялись.

Полное машинное применение/откат проверены на указанной базе.
На другом HEAD требуется повторная проверка.
Поведенческий пилот с моделями не запускался. Проверки не доказывают
сокращение токенов, времени или числа переделок.

Рабочий патч содержит 14 файлов: 3 новых навыка, 8 обновлённых шаблонов,
update-map, новый тест доставки и обновлённый интеграционный тест полного init.
Версия пакета, CHANGELOG и release tag не менялись; удалённых commits/push нет.
