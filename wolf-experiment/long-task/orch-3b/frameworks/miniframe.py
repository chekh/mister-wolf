"""MiniFrame — текущий API-фреймворк (декораторный стиль路由).

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
            names = re.findall(r"\{(\w+)\}", pattern)
            if not names:
                if pattern == path:
                    return fn, {}
                continue
            rx = "^" + re.sub(r"\{\w+\}", r"([^/]+)", pattern) + "$"
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
