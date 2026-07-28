# Мастер-план: [Название фичи]

> Шаблон. Заполняется Начальником на старте, сохраняется в `docs/master-plans/YYYY-MM-DD-<feature>.md`.

**Дата:** YYYY-MM-DD
**Идея:** [Одно предложение — что строим]

---

## Стадия 1: Требования

| Параметр | Значение |
|---|---|
| Сложность | [механическая / структурная / рассудительная] |
| Модель | [provider/model] |
| Агент | [имя агента или "build"] |
| Вход | [идея пользователя / устная дискуссия] |
| Выход | `docs/superpowers/specs/YYYY-MM-DD-<feature>.md` |
| Гейт | **обязательный** — человек одобряет спеку |

Команда:
```bash
opencode run --agent [agent] --model [model] --auto \
  "Создай спеку для: [описание]. Формат: superpowers/writing-plans."
```

---

## Стадия 2: План реализации

| Параметр | Значение |
|---|---|
| Сложность | [механическая / структурная / рассудительная] |
| Модель | [provider/model] |
| Агент | [имя агента или "build"] |
| Вход | `docs/superpowers/specs/YYYY-MM-DD-<feature>.md` |
| Выход | `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` |
| Гейт | **обязательный** — человек одобряет план |

Команда:
```bash
opencode run --agent [agent] --model [model] --auto \
  "Создай план реализации по спеке @docs/superpowers/specs/YYYY-MM-DD-<feature>.md"
```

---

## Стадия 3: Авторефайн

| Параметр | Значение |
|---|---|
| Скрипт | `./tools/pipeline/autorefine.sh` |
| Цель | `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` |
| Раундов | [3] |
| Проверщики | [check-coverage, check-placeholders, check-types] |
| Гейт | **обязательный** — человек ревьюит изменения |

### Состав проверщиков

| Проверщик | Тип | Модель | Зачем |
|---|---|---|---|
| check-coverage | структурная | [model] | Каждое требование → таск |
| check-placeholders | механическая | [model] | Нет TBD / неполных шагов |
| check-types | структурная | [model] | Консистентность имён/типов |
| check-architecture | рассудительная | [model] | Границы модулей, зависимости |

> Добавлять architecture/security только для планов > 10 тасков.

Команда:
```bash
./tools/pipeline/autorefine.sh docs/superpowers/plans/YYYY-MM-DD-<feature>.md 3 \
  check-coverage check-placeholders check-types
```

---

## Стадия 4: Реализация

| Параметр | Значение |
|---|---|
| Сложность | [структурная / рассудительная] |
| Модель | [provider/model] |
| Агент | [build / executor] |
| Вход | `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` (refined) |
| Выход | изменения в коде + тесты |
| Гейт | **обязательный** — тесты проходят + человек |

Команда:
```bash
opencode run --agent build --model [model] --auto \
  "Реализуй план @docs/superpowers/plans/YYYY-MM-DD-<feature>.md"
```

---

## Примечания

- Между стадиями — git commit (идемпотентность, откат)
- Модели можно переопределить прямо здесь
- Стадию 3 можно пропустить для планов < 5 тасков
- После стадии 4 — `requesting-code-review` (superpowers skill)
