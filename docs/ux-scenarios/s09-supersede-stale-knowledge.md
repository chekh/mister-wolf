# S09: Устаревшее знание — заместить через supersede

## User story

Команда меняет подход, и старое решение/статья/правило больше не актуальны. Нужно явно заметить, что старое замещено новым, не удаляя историю.

## Контекст

- Есть активный объект, который вводит агентов в заблуждение.
- Новый объект уже создан или создается вместе с supersedure.

## Триггер

> «Этот article про Phase 2 CLI больше не актуален. У нас теперь flat namespace.»

## Пошаговый поток

1. Пользователь создает новый объект (или использует существующий):

   ```bash
   wolf article add \
     --title "Flat CLI namespace guide" \
     --thread thread_001 \
     --summary "All commands live under `wolf` directly, no `wolf memory` prefix." \
     --body "..."
   ```

2. Замещает старый:

   ```bash
   wolf supersede article_phase2_cli_20260628 article_flat_cli_20260703
   ```

3. Mr. Wolf:
   - переводит старый article в статус `superseded`;
   - записывает `superseded_by: article_flat_cli_20260703`;
   - добавляет relation в `relations.jsonl`;
   - обновляет FTS5-индекс.

4. При поиске старый объект все еще находится, но помечен как superseded:
   ```text
   article_phase2_cli_20260628 [article] Phase 2 CLI guide [SUPERSEDED]
   article_flat_cli_20260703 [article] Flat CLI namespace guide [ACTIVE]
   ```

## Ожидаемый результат

- История сохранена.
- Агенты видят, что старое больше не актуально.
- Поиск не врет, выдавая устаревшее как текущее.

## Покрываемые команды

- `wolf supersede`
- `wolf article add`
- `wolf search`
- `wolf list --stale`

## Открытые вопросы

- Нужно ли автоматически предлагать supersede, если создан похожий объект?
- Должен ли supersede быть однонаправленным или поддерживать цепочки?
- Как `recall` и `call` исключают superseded-объекты по умолчанию?
