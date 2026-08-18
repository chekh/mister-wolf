# Спецификация фреймворка nanohttp (LONG-002)

Построить минималистичный веб-фреймворк **nanohttp** с нуля: маршрутизация,
middleware, dependency injection, валидация, обработка ошибок, логирование.
Только стандартная библиотека Python. Тесты — unittest, интеграционные.

## Структура (обязательная)

```
nanohttp/            # пакет (создан, пустой __init__.py)
  __init__.py        # должен реэкспортировать весь публичный API (см. прил. A)
  ctx.py             # контекст запроса/ответа
  router.py          # маршрутизация
  middleware.py      # цепочка middleware
  di.py              # DI-контейнер
  validation.py      # валидация схем
  errors.py          # иерархия ошибок + error handler
  logger.py          # логгер
  app.py             # приложение (сборка полного lifecycle)
tests/               # тесты (создан, пустой __init__.py)
  test_ctx.py, test_router.py, test_middleware.py, test_di.py,
  test_validation.py, test_errors.py, test_logger.py, test_app.py
```

Прогон: из корня итерации `python3 -m unittest discover -s tests -t .`
(все тесты зелёные). Импорт в тестах: `from nanohttp import ...`.

---

## 1. Context (`ctx.py`)

### API
- `Request(method: str, path: str, query: dict[str, str] | None = None,
  headers: dict[str, str] | None = None, body: dict | None = None)`
  — атрибуты `method`, `path`, `query`, `headers`, `body` (дефолты `{}`).
- `Response(status: int = 200, body: Any = None, headers: dict | None = None)`
  — атрибуты `status`, `body`, `headers` (дефолт `{}`).
- `Ctx(request: Request)` — обёртка: `.request`, `.response` (создаётся
  `Response()` автоматически), `.params: dict` (заполняется роутером),
  `.state: dict` (общее хранилище middleware ↔ handler, пустое при старте).

### Поведение
- `Ctx` создаёт `Response()` с дефолтами при конструировании.
- `state` и `params` — независимые словари.

---

## 2. Router (`router.py`)

### API
- `Router()`:
  - `.add(method: str, path: str, handler: Callable[[Ctx], Response]) -> None`
  - `.match(method: str, path: str) -> RouteMatch | None`, где `RouteMatch`
    — объект с `.handler` и `.params: dict[str, str]`.
- Ошибки: `RouteConflictError` (дубликат method+path при `add`),
  `NotFoundError` (нет совпадения), `MethodNotAllowedError`
  (path совпал, method нет; атрибут `.allowed: list[str]` — отсортированные
  методы этого path).

### Поведение
- Паттерн: сегменты через `/`, каждый — литерал или `:param` (имя = сегмент
  без двоеточия). Пример: `/users/:id/posts/:postId`.
- Совпадение — точное по сегментам: тот же число сегментов, литералы равны,
  `:param` захватывает любой непустой сегмент.
- Значения параметров **percent-decode** (`urllib.parse.unquote`).
- Регистр метода нечувствителен (`add("get",...)` == `"GET"`), регистр path
  ЧУВСТВИТЕЛЕН (без нормализации, трейлинг-слэш — отдельный path).
- `match` возвращает `None` на «нет такого path вообще»; кидает
  `MethodNotAllowedError` если path есть с другим методом; кидает
  `NotFoundError` — НЕ должен (404 — ответственность app-диспетчера:
  `match()==None` → app кидает NotFoundError).

---

## 3. Middleware (`middleware.py`)

### API
- Тип `Middleware = Callable[[Ctx, Callable[[], Response]], Response]`
  (сигнатура `(ctx, next)`).
- `MiddlewareChain()`:
  - `.use(mw: Middleware) -> None` — добавить в конец;
  - `.execute(ctx: Ctx, endpoint: Callable[[Ctx], Response]) -> Response` —
    прогнать цепочку, на конце — `endpoint`.

### Поведение (луковичная модель)
- Порядок: регистрация → вызов; первый зарегистрированный — внешний.
- Middleware может НЕ вызывать `next()` (short-circuit) — вернуть ответ;
  тогда внутренние и endpoint не выполняются.
- Всё после `next()` выполняется при разворачивании (код после вызова
  `next()` у внешнего выполняется ПОСЛЕ внутреннего).
- Исключение из внутреннего middleware/endpoint ловится `try/except`
  вокруг `next()` во внешнем (обычный Python — ничего специального).
- Пустая цепочка: `execute` сразу зовёт `endpoint`.

---

## 4. DI Container (`di.py`)

### API
- `Container()`:
  - `.register_value(name: str, value: Any) -> None`
  - `.register(name: str, factory: Callable[..., Any]) -> None`
    (factory-режим: новый объект на каждый resolve)
  - `.singleton(name: str, factory: Callable[..., Any]) -> None`
    (один объект на контейнер, лениво)
  - `.resolve(name: str) -> Any`
  - `.scope() -> Container` — дочерний контейнер
- Ошибки: `ResolutionError` (имя не зарегистрировано),
  `CircularDependencyError` (цикл в графе зависимостей).

### Поведение
- **Внедрение по сигнатуре**: если factory имеет параметры (кроме
  self/cls), каждый параметр резолвится из контейнера по имени параметра
  (inspect.signature). `register_value`-значения и результаты других
  фабрик — одинаково.
- `.singleton`: factory вызывается при ПЕРВОМ resolve, результат
  кэшируется; повторный resolve — тот же объект (`is`).
- `.register`: factory вызывается на КАЖДЫЙ resolve (новые объекты).
- Цикл `A→B→A` (A регистрируется фабрикой с параметром b, B — с
  параметром a): `resolve("A")` → `CircularDependencyError` (стек резолва
  отслеживается, не бесконечная рекурсия).
- `.scope()`: дочерний видит регистрации родителя; собственная регистрация
  в дочернем ЗАТЕНЯЕТ родительскую (override); singleton-кэш дочернего
  отдельный от родительского.

---

## 5. Validation (`validation.py`)

### API
- `Field(kind: str, *, required: bool = True, default=None,
  min_len: int | None = None, ge: int | None = None, le: int | None = None,
  choices: list | None = None)`
  — kind ∈ `{"str","int","bool","email"}`.
- `validate(data: dict, schema: dict[str, Field]) -> dict` — возвращает
  очищенную копию (только ключи схемы).
- `ValidationError(Exception)` с атрибутом
  `.errors: list[dict]` (элементы `{"field": str, "message": str}`).

### Правила
- `required=True`, ключа нет → ошибка «missing field»; `required=False`
  и ключа нет → подставить `default` (даже None) в результат.
- `str`: isinstance str и (min_len is None или len(s) >= min_len).
- `int`: isinstance int **и не bool**; `ge`/`le` проверяются после типа.
- `bool`: isinstance bool.
- `email`: isinstance str, ровно один `@`, непустые части слева/справа,
  правая содержит точку.
- `choices`: значение (после проверки kind) должно быть в списке.
- Несколько ошибок собираются в ОДИН ValidationError (все поля).
- Ошибки валидации НЕ бросаются для неизвестных ключей data (игнорируются).

---

## 6. Errors (`errors.py`)

### API
- `HttpError(Exception)` — базовая: `.status: int`, `.code: str`,
  `.message: str`; конструктор `(status: int, code: str, message: str)`.
- Подклассы (фикс. статусы/коды): `NotFoundError(404,"not_found")`,
  `MethodNotAllowedError(405,"method_not_allowed")`,
  `ValidationError(400,"validation")` — НО у validation-ошибки конструктор
  без статуса/кода (см. §5), поэтому иерархия: `ValidationError` наследует
  `HttpError` с переопределённым `__init__(errors: list[dict])` и
  атрибутами status=400, code="validation"; `RouteConflictError(409,
  "route_conflict")`, `ResolutionError(500,"resolution")`,
  `CircularDependencyError(500,"circular_dependency")`.
- `ErrorHandler()`:
  - `.on(exc_type: type[BaseException], handler: Callable[[Ctx, BaseException], Response]) -> None`
  - `.handle(ctx: Ctx, exc: BaseException) -> Response`

### Поведение
- Поиск обработчика: точный тип → иначе по MRO (ближайший базовый сначала).
- Нет совпадения → fallback: `Response(500, {"error": "internal",
  "message": str(exc)})`.
- Тело ошибок — uniform JSON-подобный dict: `{"error": <code>,
  "message": <msg>}`; у ValidationError добавляется `"details": errors`.

---

## 7. Logger (`logger.py`)

### API
- `Logger()` с уровнями `DEBUG < INFO < WARN < ERROR`:
  - `.configure(level: str) -> None` (глобальный порог, дефолт `"INFO"`)
  - `.debug/.info/.warn/.error(msg: str, **fields) -> None`
  - `.records() -> list[dict]` — снимок записей (для тестов)
- Модульная функция `log_middleware(logger: Logger) -> Middleware`:
  логирует каждый запрос: level INFO, msg `"{method} {path}"`,
  fields: `status`, `duration_ms` (int >= 0) после выполнения next().

### Поведение
- Записи ниже порога НЕ попадают в records (но метод вызов не падает).
- records возвращает копию (мутация снятия не влияет).
- Глобальный дефолтный инстанс `default_logger`.

---

## 8. App (`app.py`) — полный lifecycle

### API
- `NanoApp()`:
  - `.add(method, path, handler)` / шорткаты `.get(path, h)`, `.post`, `.patch`, `.delete`
  - `.use(mw)` — middleware (порядок: регистрация)
  - `.on(exc_type, handler)` — делегирует ErrorHandler
  - `.container` — `Container` (публичный атрибут; приложения регистрируют зависимости)
  - `.logger` — `Logger` (публичный)
  - `.handle(method: str, path: str, query=None, headers=None, body=None) -> Response`

### Lifecycle `handle()`
1. `ctx = Ctx(Request(...))`.
2. `match = router.match(...)`; `None` → кинуть `NotFoundError` (404);
   `MethodNotAllowedError` проходит как есть (405); `ctx.params` ← match.params.
3. `chain.execute(ctx, endpoint=handler)`.
4. Ответ handler'а вернуть наружу.
5. Любое исключение по пути → `error_handler.handle(ctx, exc)` → Response.
6. Приложение по умолчанию: `use(log_middleware(default_logger))` —
   логирование ВСЕГДА первое (внешнее), зарегистрированное пользователем — внутри.

### Интеграционные требования (проверяются тестами)
- Полный цикл: request → router (params) → middleware → handler → response.
- Валидация в handler: `ValidationError` из handler'а → 400 + details.
- DI в handler: handler — фабрика/замыкание, берущее зависимость из
  `app.container.resolve(...)` (например, репозиторий) — работает.
- Ошибка в пользовательском middleware ловится error-обработчиком (500
  или кастомный `on(ValueError, ...)`), лог-запись о запросе всё равно
  появляется.
- `state` из middleware доступен в handler (общий словарь).
- 404/405 проходят через error-обработчик с правильными статусами.

---

## Пример использования (обязателен к работоспособности)

```python
from nanohttp import NanoApp, Response, ValidationError, Field, validate

app = NanoApp()

def make_user_repo():
    return {"users": {}, "next_id": 1}

app.container.singleton("user_repo", make_user_repo)

def create_user(ctx):
    schema = {"name": Field("str", min_len=2), "age": Field("int", ge=0, le=150)}
    try:
        data = validate(ctx.request.body, schema)
    except ValidationError:
        raise
    repo = app.container.resolve("user_repo")
    uid = repo["next_id"]; repo["next_id"] += 1
    repo["users"][uid] = data
    return Response(201, {"id": uid, **data})

app.post("/users", create_user)
resp = app.handle("POST", "/users", body={"name": "Ann", "age": 33})
assert resp.status == 201
```

---

## Приложение A: чеклист публичного API (машиносчитаемо)

% спецификации = (найдено grep'ом классов/функций в nanohttp/) / 40.
Каждый пункт — `class X` или `def x` в соответствующем модуле:

ctx.py: (1) class Request; (2) class Response; (3) class Ctx;
router.py: (4) class Router; (5) def add; (6) def match; (7) class RouteMatch;
  (8) class RouteConflictError; (9) class NotFoundError; (10) class MethodNotAllowedError;
middleware.py: (11) class MiddlewareChain; (12) def use; (13) def execute;
di.py: (14) class Container; (15) def register_value; (16) def register;
  (17) def singleton; (18) def resolve; (19) def scope; (20) class ResolutionError;
  (21) class CircularDependencyError;
validation.py: (22) class Field; (23) def validate; (24) class ValidationError;
errors.py: (25) class HttpError; (26) class ErrorHandler; (27) def on; (28) def handle;
  (29) class RouteConflictError в errors (или реэкспорт); (30) class NotFoundError (реэкспорт/определение);
logger.py: (31) class Logger; (32) def configure; (33) def debug; (34) def info;
  (35) def warn; (36) def error; (37) def records; (38) def log_middleware;
app.py: (39) class NanoApp; (40) def handle.

## Приложение B: обязательные тесты (машиносчитаемо, 56)

% тестов = (найдено `def <name>` в tests/) / 56. Все должны быть зелёными.

test_ctx.py: test_ctx_creates_default_response; test_state_and_params_independent;
  test_request_defaults_empty_dicts; test_response_defaults;
test_router.py: test_match_literal; test_match_params_decoded; test_no_match_returns_none;
  test_duplicate_route_conflict; test_wrong_method_raises_405_with_sorted_allowed;
  test_case_insensitive_method; test_case_sensitive_path; test_trailing_slash_distinct;
  test_empty_segment_not_matched; test_params_values;
test_middleware.py: test_order_before; test_order_after; test_short_circuit;
  test_endpoint_called_when_empty_chain; test_error_propagates_to_outer;
  test_outer_catches_inner_exception; test_chain_returns_endpoint_response;
  test_next_returns_response;
test_di.py: test_resolve_value; test_factory_new_each_resolve; test_singleton_cached;
  test_singleton_lazy; test_unknown_raises_resolution; test_circular_raises;
  test_kwargs_injected_by_signature; test_scope_sees_parent; test_scope_override_shadows;
test_validation.py: test_missing_required; test_optional_default; test_str_min_len;
  test_int_rejects_bool; test_int_ge_le; test_bool_kind; test_email_valid_invalid;
  test_choices; test_multiple_errors_collected;
test_errors.py: test_mro_exact_first; test_base_class_fallback; test_no_handler_500;
  test_validation_details_in_body; test_http_error_attrs; test_on_registers;
test_logger.py: test_level_filtering; test_records_copy; test_log_middleware_fields;
  test_default_logger;
test_app.py: test_full_lifecycle; test_404_unknown_path; test_405_wrong_method;
  test_validation_error_400_details; test_di_injected_handler; test_state_shared;
  test_error_in_middleware_handled; test_request_logged_always;
  test_route_conflict_409_surfaced; test_example_from_spec_works.

## Приёмка итерации

1. `python3 -m unittest discover -s tests -t .` — все зелёные (56/56).
2. Приложение A: ≥90% пунктов ORCH-цель; <80% у FLAT = провал FLAT по H1.
3. Независимый ревью архитектуры (VERDICT: APPROVED|CHANGES).
