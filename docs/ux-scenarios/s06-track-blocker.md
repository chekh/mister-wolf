# S06: Блокер — зафиксировать и разрешить

## User story

Работа остановлена из-за внешней или внутренней проблемы. Пользователь хочет зафиксировать блокер, его влияние и обходной путь, а потом отметить разрешение.

## Контекст

- Блокер связан с thread или независим.
- Нужно отслеживать, что мешает, и что можно сделать в обход.

## Триггер

> «Мы не можем продолжать, пока не получим доступ к production API.»

## Пошаговый поток

1. Пользователь создает blocker:

   ```bash
   wolf blocker add \
     --title "No access to production payment API" \
     --impact "Cannot verify integration with payment gateway" \
     --workaround "Use mock server and test credentials" \
     --thread thread_001
   ```

2. Mr. Wolf создает `blocker` со статусом `active`.

3. Blocker появляется в `wolf thread brief thread_001` и `wolf recall`.

4. Когда доступ получен, пользователь разрешает blocker:

   ```bash
   wolf blocker resolve blocker_001 --by decision_006
   ```

5. Mr. Wolf:
   - переводит blocker в `resolved`;
   - создает relation `decision_006 resolves blocker_001`;
   - авто-триггерит `session-summary` (если прошло >5 минут с последнего).

## Ожидаемый результат

- В памяти зафиксирована проблема, влияние и обходной путь.
- Разрешение связано с артефактом, который его снял.
- Сессия не начинается с «а почему мы не сделали интеграцию?».

## Покрываемые команды

- `wolf blocker add`
- `wolf blocker list`
- `wolf blocker resolve`
- `wolf thread brief`

## Открытые вопросы

- Нужен ли `blocker` обязательно привязывать к thread?
- Что делать, если обходной путь превращается в постоянное решение?
- Должен ли resolve создавать автоматический `session-summary`?
