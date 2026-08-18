"""SwiftFrame — целевой API-фреймворк (явная регистрация + middleware).

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
        names = re.findall(r"\{(\w+)\}", pattern)
        rx = "^" + re.sub(r"\{\w+\}", r"([^/]+)", pattern) + "$"
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
