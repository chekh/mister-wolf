"""Маршрутизация (спека LONG-002, §2)."""
from __future__ import annotations

from typing import Callable
from urllib.parse import unquote

from .ctx import Ctx, Response
from .errors import HttpError


class RouteConflictError(HttpError):
    """Дубликат method+path при добавлении маршрута (409)."""

    def __init__(self, message: str = "route conflict") -> None:
        super().__init__(409, "route_conflict", message)


class NotFoundError(HttpError):
    """Маршрут не найден (404). Кидается app-диспетчером, не роутером."""

    def __init__(self, message: str = "not found") -> None:
        super().__init__(404, "not_found", message)


class MethodNotAllowedError(HttpError):
    """Path совпал, метод — нет (405).

    Attributes:
        allowed: отсортированные методы, зарегистрированные для этого path.
    """

    def __init__(
        self, allowed: list[str] | None = None, message: str = "method not allowed"
    ) -> None:
        self.allowed: list[str] = sorted(allowed or [])
        super().__init__(405, "method_not_allowed", message)


class RouteMatch:
    """Результат сопоставления: обработчик + параметры пути."""

    def __init__(self, handler: Callable[[Ctx], Response], params: dict[str, str]) -> None:
        self.handler = handler
        self.params = params


class _Route:
    """Внутренняя запись маршрута: метод, паттерн, обработчик, сегменты."""

    __slots__ = ("method", "pattern", "handler", "segments")

    def __init__(self, method: str, pattern: str, handler: Callable[[Ctx], Response]) -> None:
        self.method = method
        self.pattern = pattern
        self.handler = handler
        self.segments = pattern.split("/")

    def match(self, path: str) -> dict[str, str] | None:
        """Вернуть словарь параметров при совпадении, иначе None.

        Сегменты сравниваются точно: то же количество, литералы равны,
        ``:param`` захватывает любой непустой сегмент (значение percent-decode).
        Регистр path чувствителен, никакой нормализации слэшей.
        """
        parts = path.split("/")
        if len(parts) != len(self.segments):
            return None
        params: dict[str, str] = {}
        for segment, part in zip(self.segments, parts):
            if len(segment) > 1 and segment.startswith(":"):
                if not part:  # пустой сегмент :param не захватывает
                    return None
                params[segment[1:]] = unquote(part)
            elif segment != part:
                return None
        return params


class Router:
    """Таблица маршрутов: add/match по методу и паттерну пути."""

    def __init__(self) -> None:
        self._routes: list[_Route] = []

    def add(self, method: str, path: str, handler: Callable[[Ctx], Response]) -> None:
        """Зарегистрировать маршрут; дубликат method+path — RouteConflictError."""
        normalized = method.upper()  # метод нечувствителен к регистру
        for route in self._routes:
            if route.method == normalized and route.pattern == path:
                raise RouteConflictError(f"route {normalized} {path} already registered")
        self._routes.append(_Route(normalized, path, handler))

    def match(self, method: str, path: str) -> RouteMatch | None:
        """Найти маршрут.

        Возвращает RouteMatch; None — path не зарегистрирован вовсе;
        MethodNotAllowedError — path есть, но с другим методом.
        NotFoundError намеренно НЕ кидается (404 — ответственность app).
        """
        normalized = method.upper()
        allowed: set[str] = set()
        for route in self._routes:
            params = route.match(path)
            if params is None:
                continue
            if route.method == normalized:
                return RouteMatch(route.handler, params)
            allowed.add(route.method)
        if allowed:
            raise MethodNotAllowedError(
                sorted(allowed), f"method {normalized} not allowed for {path}"
            )
        return None
