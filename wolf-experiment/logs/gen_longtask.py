#!/usr/bin/env python3
"""gen_longtask.py — генератор стартовой кодовой базы long-task (фикстура LONG-001).

Детерминированно создаёт long-task-base/:
  - frameworks/miniframe.py (текущий фреймворк, декораторный стиль)
  - frameworks/swiftframe.py (целевой фреймворк, явная регистрация + middleware)
  - app/ (factory, config, utils, 15 доменных модулей по 3 эндпоинта = 45)
  - tests/ (фреймворк-агностичные интеграционные тесты, ~107 шт.)

Тесты гоняются через: cd long-task-base && python3 -m unittest discover -s tests -t .
"""
from __future__ import annotations

import shutil
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent / "long-task-base"

DOM = [
    dict(d="users", fields=[("name", "str", 3), ("email", "str", 5), ("age", "int", 0), ("status", "str", 2), ("logins", "int", 0)], unique="email"),
    dict(d="products", fields=[("sku", "str", 3), ("title", "str", 3), ("price", "int", 0), ("currency", "str", 3), ("stock", "int", 0)], unique="sku"),
    dict(d="orders", fields=[("ref", "str", 3), ("customer", "str", 2), ("total", "int", 0), ("channel", "str", 2), ("items", "int", 0)], unique="ref"),
    dict(d="sessions", fields=[("token", "str", 8), ("user", "str", 2), ("ttl", "int", 1), ("scope", "str", 2), ("refreshes", "int", 0)], unique="token"),
    dict(d="inventory", fields=[("sku", "str", 2), ("warehouse", "str", 2), ("qty", "int", 0), ("bin", "str", 2), ("reserved", "int", 0)], unique="sku"),
    dict(d="notifications", fields=[("topic", "str", 2), ("message", "str", 1), ("priority", "int", 1), ("lang", "str", 2), ("attempts", "int", 0)], unique="topic"),
    dict(d="reports", fields=[("code", "str", 2), ("title", "str", 2), ("period", "str", 2), ("owner", "str", 2), ("weight", "int", 0)], unique="code"),
    dict(d="searches", fields=[("query", "str", 2), ("scope", "str", 2), ("limit", "int", 1), ("locale", "str", 2), ("hits", "int", 0)], unique="query"),
    dict(d="billings", fields=[("invoice", "str", 3), ("customer", "str", 2), ("amount", "int", 0), ("method", "str", 2), ("attempts", "int", 0)], unique="invoice"),
    dict(d="shipments", fields=[("tracking", "str", 5), ("carrier", "str", 2), ("weight", "int", 0), ("mode", "str", 2), ("parcels", "int", 0)], unique="tracking"),
    dict(d="coupons", fields=[("code", "str", 3), ("discount", "int", 1), ("uses", "int", 0), ("tier", "str", 2), ("days", "int", 0)], unique="code"),
    dict(d="reviews", fields=[("ref", "str", 2), ("author", "str", 2), ("stars", "int", 1), ("status", "str", 2), ("votes", "int", 0)], unique="ref"),
    dict(d="tickets", fields=[("num", "str", 2), ("subject", "str", 3), ("urgency", "int", 1), ("queue", "str", 2), ("escalations", "int", 0)], unique="num"),
    dict(d="webhooks", fields=[("url", "str", 5), ("event", "str", 3), ("retries", "int", 0), ("format", "str", 2), ("failures", "int", 0)], unique="url"),
    dict(d="profiles", fields=[("login", "str", 3), ("display", "str", 2), ("karma", "int", 0), ("plan", "str", 2), ("badges", "int", 0)], unique="login"),
]

MINIFRAME = '''"""MiniFrame — текущий API-фреймворк (декораторный стиль路由).

Используется всеми эндпоинтами до миграции. После миграции на swiftframe
этот модуль остаётся в репозитории как исторический, но app/ его не импортирует.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable

Param = dict[str, str]


@dataclass
class Request:
    method: str
    path: str
    body: dict


@dataclass
class Response:
    status: int = 200
    payload: Any = None


Handler = Callable[..., Response]
ErrorHandler = Callable[[Exception], Response]


class MiniApp:
    """Приложение MiniFrame: маршруты через декораторы, ошибки через хук."""

    def __init__(self, name: str = "miniframe-app") -> None:
        self.name = name
        self._routes: list[tuple[str, str, Handler]] = []
        self._error_handler: ErrorHandler | None = None

    def route(self, method: str, path: str) -> Callable[[Handler], Handler]:
        """Декоратор регистрации обработчика: @app.route("GET", "/users")."""

        def deco(fn: Handler) -> Handler:
            self._routes.append((method.upper(), path, fn))
            return fn

        return deco

    def error_handler(self, fn: ErrorHandler) -> ErrorHandler:
        """Декоратор регистрации хука ошибок: @app.error_handler."""
        self._error_handler = fn
        return fn

    def _match(self, method: str, path: str) -> tuple[Handler | None, Param]:
        for m, pattern, fn in self._routes:
            if m != method.upper():
                continue
            names = re.findall(r"\\{(\\w+)\\}", pattern)
            if not names:
                if pattern == path:
                    return fn, {}
                continue
            rx = "^" + re.sub(r"\\{\\w+\\}", r"([^/]+)", pattern) + "$"
            found = re.match(rx, path)
            if found:
                return fn, dict(zip(names, found.groups()))
        return None, {}

    def handle(self, method: str, path: str, body: dict | None = None) -> Response:
        """Точка входа тестового клиента: диспетчеризация запроса."""
        fn, params = self._match(method, path)
        if fn is None:
            return Response(404, {"error": "not_found", "message": f"route not found: {method} {path}"})
        try:
            return fn(params=params, body=body or {})
        except Exception as exc:  # noqa: BLE001 - хук решает статус
            if self._error_handler is not None:
                return self._error_handler(exc)
            raise

    def _dispatch_error(self, exc: Exception, status: int) -> Response:
        if self._error_handler is not None:
            return self._error_handler(exc)
        return Response(status, {"error": "unhandled", "message": str(exc)})
'''

SWIFTFRAME = '''"""SwiftFrame — целевой API-фреймворк (явная регистрация + middleware).

Отличия от miniframe, ради которых затевается миграция:
  - маршруты регистрируются явно: app.add(method, pattern, handler);
  - обработчик получает один объект запроса: handler(req) c req.params/req.body;
  - ответы строятся хелперами ok()/created()/fail(), а не конструктором;
  - есть middleware-цепочка app.use(fn) (например, логирование вызовов);
  - хук ошибок регистрируется методом on_error(), не декоратором.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable

Param = dict[str, str]


@dataclass
class Request:
    method: str
    path: str
    body: dict
    params: Param = field(default_factory=dict)


@dataclass
class Reply:
    status: int = 200
    payload: Any = None


def ok(data: Any = None, status: int = 200) -> Reply:
    """Успешный ответ."""
    return Reply(status, data)


def created(data: Any) -> Reply:
    """Ответ 201 Created."""
    return Reply(201, data)


def fail(status: int, code: str, message: str) -> Reply:
    """Ответ с ошибкой."""
    return Reply(status, {"error": code, "message": message})


Handler = Callable[[Request], Reply]
Middleware = Callable[[str, str, Callable[[], Reply]], Reply]
ErrorHandler = Callable[[Exception], Reply]


class SwiftApp:
    """Приложение SwiftFrame."""

    def __init__(self, name: str = "swiftframe-app") -> None:
        self.name = name
        self._table: dict[tuple[str, str], tuple[Handler, Param]] = {}
        self._middleware: list[Middleware] = []
        self._error_handler: ErrorHandler | None = None

    def add(self, method: str, pattern: str, handler: Handler) -> None:
        """Явная регистрация маршрута: app.add("GET", "/users/{id}", get_user)."""
        names = re.findall(r"\\{(\\w+)\\}", pattern)
        rx = "^" + re.sub(r"\\{\\w+\\}", r"([^/]+)", pattern) + "$"
        self._table[(method.upper(), rx)] = (handler, dict.fromkeys(names))

    def use(self, middleware: Middleware) -> None:
        """Подключить middleware (оборачивает диспетчеризацию)."""
        self._middleware.append(middleware)

    def on_error(self, fn: ErrorHandler) -> None:
        """Хук ошибок: on_error(lambda exc: fail(400, "x", str(exc)))."""
        self._error_handler = fn

    def _match(self, method: str, path: str) -> tuple[Handler | None, Param]:
        for (m, rx), (handler, names) in self._table.items():
            if m != method.upper():
                continue
            found = re.match(rx, path)
            if found:
                params = dict(zip(names, found.groups()))
                return handler, params
        return None, {}

    def handle(self, method: str, path: str, body: dict | None = None) -> Reply:
        """Точка входа тестового клиента (контракт совместим с miniframe)."""
        core: Callable[[], Reply] = lambda: self._dispatch(method, path, body or {})  # noqa: E731
        for mw in reversed(self._middleware):
            core = self._wrap(mw, method, path, core)
        return core()

    def _wrap(self, mw: Middleware, method: str, path: str, core: Callable[[], Reply]) -> Callable[[], Reply]:
        return lambda: mw(method, path, core)

    def _dispatch(self, method: str, path: str, body: dict) -> Reply:
        handler, params = self._match(method, path)
        if handler is None:
            return Reply(404, {"error": "not_found", "message": f"route not found: {method} {path}"})
        req = Request(method=method.upper(), path=path, body=body, params=params)
        try:
            return handler(req)
        except Exception as exc:  # noqa: BLE001
            if self._error_handler is not None:
                return self._error_handler(exc)
            raise

    def _error(self, exc: Exception, status: int) -> Reply:
        if self._error_handler is not None:
            return self._error_handler(exc)
        return Reply(status, {"error": "unhandled", "message": str(exc)})
'''

ERRORS = '''"""Доменные ошибки API (общие для обоих фреймворков)."""
from __future__ import annotations


class ApiError(Exception):
    """Базовая ошибка: фреймворковый хук переводит её в HTTP-статус."""

    status = 500
    code = "api"

    def __init__(self, domain: str, detail: str = "") -> None:
        super().__init__(f"{self.code} in {domain}: {detail}")
        self.domain = domain
        self.detail = detail


class ValidationError(ApiError):
    status, code = 400, "validation"


class ConflictError(ApiError):
    status, code = 409, "conflict"


class NotFoundError(ApiError):
    status, code = 404, "not_found"


class ForbiddenError(ApiError):
    status, code = 403, "forbidden"
'''

VALIDATION_HEAD = '''"""Схемы валидации доменов и универсальный валидатор."""
from __future__ import annotations

from typing import Any

from app.utils.errors import ValidationError

# Спецификации полей: (ключ, тип, ограничение) — ограничение:
# min_len для str, ge (>=) для int.
'''

VALIDATOR = '''

def validate(body: dict[str, Any], spec: list[tuple[str, str, int]], *, partial: bool = False) -> dict[str, Any]:
    """Проверяет body против spec; partial=True пропускает отсутствующие ключи."""
    out: dict[str, Any] = {}
    for key, kind, limit in spec:
        if key not in body:
            if partial:
                continue
            raise ValidationError("request", f"missing field: {key}")
        value = body[key]
        if kind == "str":
            if not isinstance(value, str) or len(value.strip()) < limit:
                raise ValidationError("request", f"field {key}: str with min length {limit} required")
        elif kind == "int":
            if not isinstance(value, int) or isinstance(value, bool) or value < limit:
                raise ValidationError("request", f"field {key}: int >= {limit} required")
        else:  # pragma: no cover - фикстура использует только str/int
            raise ValidationError("request", f"unsupported kind {kind}")
        out[key] = value
    return out
'''

STORE = '''"""In-memory хранилище доменов (общее для всех эндпоинтов)."""
from __future__ import annotations

from typing import Any

from app.utils.errors import NotFoundError

_DATA: dict[str, dict[int, dict[str, Any]]] = {}
_SEQ: dict[str, int] = {}


def _domain(name: str) -> dict[int, dict[str, Any]]:
    return _DATA.setdefault(name, {})


def insert(domain: str, item: dict[str, Any]) -> dict[str, Any]:
    """Вставляет запись с новым автоинкрементным id."""
    seq = _SEQ.get(domain, 0) + 1
    _SEQ[domain] = seq
    stored = {"id": seq, **item}
    _domain(domain)[seq] = stored
    return stored


def get_or_404(domain: str, item_id: int) -> dict[str, Any]:
    """Возвращает запись или NotFoundError."""
    found = _domain(domain).get(item_id)
    if found is None:
        raise NotFoundError(domain, f"id={item_id}")
    return found


def find_by(domain: str, key: str, value: Any) -> dict[str, Any] | None:
    """Ищет первую запись с равным значением ключа (для unique-проверок)."""
    for item in _domain(domain).values():
        if item.get(key) == value:
            return item
    return None


def update(domain: str, item_id: int, changes: dict[str, Any]) -> dict[str, Any]:
    """Частично обновляет запись."""
    item = get_or_404(domain, item_id)
    item.update(changes)
    return item
'''

RESPONSE = '''"""Хелперы ответов в терминах miniframe (после миграции — в терминах swiftframe)."""
from __future__ import annotations

from typing import Any

from frameworks import miniframe as mf


def ok(payload: Any, status: int = 200) -> mf.Response:
    """Успешный ответ miniframe."""
    return mf.Response(status, payload)


def created(payload: Any) -> mf.Response:
    """Ответ 201 miniframe."""
    return mf.Response(201, payload)
'''

ACCESS = '''"""RBAC: роли и права по доменам (общие для обоих фреймворков)."""
from __future__ import annotations

from app.utils.errors import ForbiddenError

ALLOWED: dict[tuple[str, str], set[str]] = {
    ("*", "read"): {"admin", "editor", "viewer"},
    ("*", "create"): {"admin", "editor"},
    ("*", "update"): {"admin", "editor"},
}


def require(domain: str, action: str, body: dict) -> str:
    """Проверяет роль из body['_actor_role'] (по умолчанию admin)."""
    role = str(body.get("_actor_role", "admin"))
    allowed = ALLOWED.get((domain, action), ALLOWED.get(("*", action), set()))
    if role not in allowed:
        raise ForbiddenError(domain, f"role={role} cannot {action}")
    return role
'''

IDS = '''"""Безопасный парсинг идентификаторов маршрута."""
from __future__ import annotations

from app.utils.errors import NotFoundError


def to_id(domain: str, raw: str) -> int:
    """Преобразует сегмент пути в int; невалидный — NotFoundError (404)."""
    try:
        return int(raw)
    except ValueError as exc:
        raise NotFoundError(domain, f"invalid id={raw!r}") from exc
'''

CLOCK = '''"""Часы приложения (изоляция времени для тестов)."""
from __future__ import annotations

from datetime import datetime, timezone

_NOW: datetime | None = None


def now() -> str:
    """ISO-таймстемп (переопределяется в тестах при необходимости)."""
    if _NOW is not None:
        return _NOW.isoformat()
    return datetime.now(tz=timezone.utc).isoformat()


def freeze(moment: datetime | None) -> None:
    """Фиксирует/освобождает время."""
    global _NOW
    _NOW = moment
'''

LOGGING_HOOK = '''"""Middleware логирования вызовов для swiftframe (подключается после миграции)."""
from __future__ import annotations

from typing import Callable

from frameworks.swiftframe import Reply

_LOG: list[tuple[str, str]] = []


def log_call(method: str, path: str, core: Callable[[], Reply]) -> Reply:
    """Логирует (method, path) и передаёт управление дальше."""
    _LOG.append((method, path))
    return core()


def last_calls() -> list[tuple[str, str]]:
    """Возвращает журнал вызовов (для отладки/тестов)."""
    return list(_LOG)
'''

CONFIG = '''"""Конфигурация приложения (фикстура long-task)."""
from __future__ import annotations

APP_NAME = "long-task-api"
VERSION = "1.0.0"
FRAMEWORK = "miniframe"  # после миграции: "swiftframe"
'''

FACTORY = '''"""Фабрика приложения: собирает miniframe-приложение из доменных модулей."""
from __future__ import annotations

from frameworks import miniframe as mf
from app.utils import errors

_MODULES = [
    "app.api.users", "app.api.products", "app.api.orders", "app.api.sessions",
    "app.api.inventory", "app.api.notifications", "app.api.reports",
    "app.api.searches", "app.api.billings", "app.api.shipments",
    "app.api.coupons", "app.api.reviews", "app.api.tickets",
    "app.api.webhooks", "app.api.profiles",
]


def _register_error_hook(app: mf.MiniApp) -> None:
    @app.error_handler
    def hook(exc: Exception) -> mf.Response:
        if isinstance(exc, errors.ApiError):
            return mf.Response(exc.status, {"error": exc.code, "message": str(exc)})
        return mf.Response(500, {"error": "internal", "message": str(exc)})


def create_app() -> mf.MiniApp:
    """Создаёт приложение со всеми доменами."""
    import importlib

    app = mf.MiniApp("long-task-api")
    _register_error_hook(app)

    @app.route("GET", "/health")
    def health(params: dict[str, str], body: dict) -> mf.Response:
        return mf.Response(200, {"status": "ok", "version": "1.0.0"})

    for module_name in _MODULES:
        module = importlib.import_module(module_name)
        module.register(app)
    return app
'''

API_TEMPLATE = '''"""Домен @@D@@: эндпоинты на miniframe (миграция на swiftframe затронет файл)."""
from __future__ import annotations

from frameworks import miniframe as mf
from app.utils import access, ids
from app.utils.clock import now
from app.utils.errors import ConflictError
from app.utils.store import find_by, get_or_404, insert, update as store_update
from app.utils.validation import FIELDS_@@D2@@, validate

DOMAIN = "@@D@@"


def register(app: mf.MiniApp) -> None:
    """Регистрирует маршруты домена @@D@@."""

    @app.route("POST", f"/{DOMAIN}")
    def create(params: dict[str, str], body: dict) -> mf.Response:
        """Создаёт запись: RBAC -> валидация -> unique-проверка -> вставка (201)."""
        access.require(DOMAIN, "create", body)
        data = validate(body, FIELDS_@@D2@@, partial=False)
        if find_by(DOMAIN, "@@UNIQUE@@", data["@@UNIQUE@@"]) is not None:
            raise ConflictError(DOMAIN, f"duplicate @@UNIQUE@@={data['@@UNIQUE@@']}")
        stamp = now()
        item = insert(DOMAIN, {**data, "revision": 1, "created_at": stamp, "updated_at": stamp})
        return mf.Response(201, item)

    @app.route("GET", f"/{DOMAIN}/{{id}}")
    def get_one(params: dict[str, str], body: dict) -> mf.Response:
        """Возвращает запись по id (404 при отсутствии/невалидном id)."""
        access.require(DOMAIN, "read", body)
        item = get_or_404(DOMAIN, ids.to_id(DOMAIN, params["id"]))
        return mf.Response(200, item)

    @app.route("PATCH", f"/{DOMAIN}/{{id}}")
    def patch_one(params: dict[str, str], body: dict) -> mf.Response:
        """Частично обновляет запись: RBAC -> валидация -> 404 -> update (+revision)."""
        access.require(DOMAIN, "update", body)
        changes = validate(body, FIELDS_@@D2@@, partial=True)
        item_id = ids.to_id(DOMAIN, params["id"])
        current = get_or_404(DOMAIN, item_id)
        item = store_update(DOMAIN, item_id, {**changes, "revision": current["revision"] + 1, "updated_at": now()})
        return mf.Response(200, item)
'''

TEST_TEMPLATE = '''"""Интеграционные тесты домена @@D@@ (фреймворк-агностичные: только handle())."""
from __future__ import annotations

import unittest

from app.factory import create_app

APP = create_app()


def call(method: str, path: str, body: dict | None = None) -> tuple[int, object]:
    res = APP.handle(method, path, body or {})
    return res.status, res.payload


def valid_body(suffix: str = "x1") -> dict:
    return {
@@VALID_BODY@@
    }


class Test@@C@@(unittest.TestCase):
    def test_create_ok(self) -> None:
        status, payload = call("POST", "/@@D@@", valid_body())
        self.assertEqual(status, 201)
        self.assertIn("id", payload)
        self.assertIn("created_at", payload)

    def test_create_missing_field_400(self) -> None:
        body = valid_body()
        body.pop("@@MISSING@@")
        status, payload = call("POST", "/@@D@@", body)
        self.assertEqual(status, 400)
        self.assertEqual(payload["error"], "validation")

    def test_create_wrong_type_400(self) -> None:
        body = valid_body()
        body["@@INTKEY@@"] = @@BADVAL@@
        status, _ = call("POST", "/@@D@@", body)
        self.assertEqual(status, 400)

    def test_create_conflict_409(self) -> None:
        call("POST", "/@@D@@", valid_body("dup"))
        status, payload = call("POST", "/@@D@@", valid_body("dup"))
        self.assertEqual(status, 409)
        self.assertEqual(payload["error"], "conflict")

    def test_get_ok(self) -> None:
        status, payload = call("GET", "/@@D@@/1")
        self.assertEqual(status, 200)
        self.assertEqual(payload["id"], 1)

    def test_get_missing_404(self) -> None:
        status, payload = call("GET", "/@@D@@/99999")
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"], "not_found")

    def test_patch_ok(self) -> None:
        status, payload = call("PATCH", "/@@D@@/2", {"@@PATCHKEY@@": @@PATCHVAL@@})
        self.assertEqual(status, 200)
        self.assertIn("updated_at", payload)

    def test_patch_invalid_400(self) -> None:
        status, _ = call("PATCH", "/@@D@@/2", {"@@INTKEY@@": @@BADVAL@@})
        self.assertEqual(status, 400)

    def test_create_forbidden_403(self) -> None:
        body = {**valid_body("rbac"), "_actor_role": "viewer"}
        status, payload = call("POST", "/@@D@@", body)
        self.assertEqual(status, 403)
        self.assertEqual(payload["error"], "forbidden")

    def test_patch_empty_body_ok(self) -> None:
        status, payload = call("PATCH", "/@@D@@/1", {})
        self.assertEqual(status, 200)
        self.assertIn("revision", payload)

    def test_get_non_numeric_id_404(self) -> None:
        status, payload = call("GET", "/@@D@@/not-a-number")
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"], "not_found")


if __name__ == "__main__":
    unittest.main()
'''

TEST_HEALTH = '''"""Смоук-тесты приложения (фреймворк-агностичные)."""
from __future__ import annotations

import unittest

from app.factory import create_app


class TestHealth(unittest.TestCase):
    def test_health(self) -> None:
        res = create_app().handle("GET", "/health")
        self.assertEqual(res.status, 200)
        self.assertEqual(res.payload["status"], "ok")

    def test_unknown_route_404(self) -> None:
        res = create_app().handle("GET", "/nope")
        self.assertEqual(res.status, 404)


if __name__ == "__main__":
    unittest.main()
'''

SEEDER = '''

def _seed() -> None:
    """Наполняет хранилище стартовыми записями (по 2 на домен)."""
    for spec in DOM:
        for suffix in ("alpha", "beta"):
            item: dict[str, object] = {}
            for key, kind, _limit in spec["fields"]:
                item[key] = f"{spec['d']}-{key}-{suffix}" if kind == "str" else 7
            stamp = "2026-01-01T00:00:00+00:00"
            insert(spec["d"], {**item, "created_at": stamp, "updated_at": stamp})
'''


def valid_body_lines(spec: dict) -> str:
    rows = []
    for key, kind, _limit in spec["fields"]:
        if kind == "str":
            rows.append(f'        "{key}": f"@{spec["d"]}-{key}-{{suffix}}",')
        else:
            rows.append(f'        "{key}": 7,')
    # суффикс в строках должен проходить min_len: префикс уже длинный
    return "\n".join(rows)


def fields_constant(spec: dict) -> str:
    name = "FIELDS_" + spec["d"].upper()
    rows = [f"{name}: list[tuple[str, str, int]] = ["]
    for key, kind, limit in spec["fields"]:
        rows.append(f'    ("{key}", "{kind}", {limit}),')
    rows.append("]")
    return name, "\n".join(rows)


def main() -> None:
    if BASE.exists():
        shutil.rmtree(BASE)
    (BASE / "frameworks").mkdir(parents=True)
    (BASE / "app" / "utils").mkdir(parents=True)
    (BASE / "app" / "api").mkdir(parents=True)
    (BASE / "tests").mkdir(parents=True)
    (BASE / "tests" / "__init__.py").write_text("")

    (BASE / "frameworks" / "__init__.py").write_text("")
    (BASE / "frameworks" / "miniframe.py").write_text(MINIFRAME)
    (BASE / "frameworks" / "swiftframe.py").write_text(SWIFTFRAME)

    (BASE / "app" / "__init__.py").write_text("")
    (BASE / "app" / "config.py").write_text(CONFIG)
    (BASE / "app" / "factory.py").write_text(FACTORY)
    (BASE / "app" / "utils" / "__init__.py").write_text("")
    (BASE / "app" / "utils" / "errors.py").write_text(ERRORS)
    validation = [VALIDATION_HEAD]
    for spec in DOM:
        _name, block = fields_constant(spec)
        validation.append(block + "\n")
    validation.append(VALIDATOR)
    (BASE / "app" / "utils" / "validation.py").write_text("\n".join(validation))
    store_full = '"""In-memory хранилище."""\nfrom __future__ import annotations\n' \
                 + STORE.split('"""In-memory хранилище доменов (общее для всех эндпоинтов)."""')[1]
    # проще: STORE уже полный, сеедер добавим отдельным модулем
    (BASE / "app" / "utils" / "store.py").write_text(
        STORE.replace('"""In-memory хранилище доменов (общее для всех эндпоинтов)."""',
                      '"""In-memory хранилище доменов (общее для всех эндпоинтов)."""')
    )
    (BASE / "app" / "utils" / "seed.py").write_text(
        '"""Стартовое наполнение хранилища (вызывается фабрикой тестов один раз)."""\n'
        + "from __future__ import annotations\n\nfrom app.utils.store import insert\n\n"
        + _seed_source()
    )
    (BASE / "app" / "utils" / "response.py").write_text(RESPONSE)
    (BASE / "app" / "utils" / "clock.py").write_text(CLOCK)
    (BASE / "app" / "utils" / "logging_hook.py").write_text(LOGGING_HOOK)
    (BASE / "app" / "utils" / "access.py").write_text(ACCESS)
    (BASE / "app" / "utils" / "ids.py").write_text(IDS)

    # фабрика должна сеять ДО создания эндпоинтов: импорт seed в factory не менялся —
    # сеем на первом create_app через регистрацию в tests? Надёжнее: сеем в factory.
    factory = FACTORY.replace(
        "def create_app() -> mf.MiniApp:\n    \"\"\"Создаёт приложение со всеми доменами.\"\"\"\n    import importlib\n",
        "def create_app() -> mf.MiniApp:\n    \"\"\"Создаёт приложение со всеми доменами (с сеедом данных).\"\"\"\n"
        "    import importlib\n\n    from app.utils import seed\n    seed.run_once()\n",
    )
    (BASE / "app" / "factory.py").write_text(factory)

    for spec in DOM:
        (BASE / "app" / "api" / f"{spec['d']}.py").write_text(
            API_TEMPLATE
            .replace("@@D@@", spec["d"])
            .replace("@@D2@@", spec["d"].upper())
            .replace("@@UNIQUE@@", spec["unique"])
        )
        int_field = next(((k, kind) for k, kind, _ in spec["fields"] if kind == "int"), None)
        if int_field:
            int_key, bad_val = int_field[0], '"not-an-int"'
        else:
            int_key = spec["fields"][0][0]
            bad_val = "999"
        patch_key = next(k for k, kind, _ in spec["fields"] if kind == "str")
        (BASE / "tests" / f"test_{spec['d']}.py").write_text(
            TEST_TEMPLATE
            .replace("@@D@@", spec["d"])
            .replace("@@C@@", "".join(p.capitalize() for p in spec["d"].split("_")))
            .replace("@@VALID_BODY@@", valid_body_lines(spec))
            .replace("@@MISSING@@", spec["fields"][0][0])
            .replace("@@INTKEY@@", int_key)
            .replace("@@BADVAL@@", bad_val)
            .replace("@@PATCHKEY@@", patch_key)
            .replace("@@PATCHVAL@@", f'f"patched-{{suffix}}"'.replace("{suffix}", "1"))
        )
    (BASE / "tests" / "test_health.py").write_text(TEST_HEALTH)
    print("generated:", BASE)


def _seed_source() -> str:
    out = ["_DONE = False", "", "def run_once() -> None:", '    """Идемпотентно сеет данные."""', "    global _DONE", "    if _DONE:", "        return", "    _DONE = True"]
    for spec in DOM:
        for suffix in ("alpha", "beta"):
            parts = [f'"{k}": ' + (f'"{spec["d"]}-{k}-{suffix}"' if kind == "str" else "7") for k, kind, _ in spec["fields"]]
            out.append(f'    insert("{spec["d"]}", {{{", ".join(parts)}, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"}})')
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    main()
