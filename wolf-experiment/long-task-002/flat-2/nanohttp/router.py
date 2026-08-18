"""Маршрутизация (спека LONG-002, раздел 2).

Паттерны: сегменты через '/', литерал или ':param'. Метод регистронеза-
висим, path — чувствителен (трейлинг-слэш — отдельный path). Значения
параметров percent-decode. match() возвращает None на «нет path»,
кидает MethodNotAllowedError на «path есть, метод нет»; NotFoundError
match НЕ кидает — это ответственность app-диспетчера.
"""

from typing import Callable, Optional
from urllib.parse import unquote

from .ctx import Ctx, Response
from .errors import HttpError


class RouteConflictError(HttpError):
    """Дубликат method+path при add (409)."""

    def __init__(self, message: str = "route already exists") -> None:
        super().__init__(409, "route_conflict", message)


class NotFoundError(HttpError):
    """Ресурс не найден (404); кидается app-диспетчером при match() is None."""

    def __init__(self, message: str = "resource not found") -> None:
        super().__init__(404, "not_found", message)


class MethodNotAllowedError(HttpError):
    """Path совпал, метод — нет (405); .allowed — отсортированные методы."""

    def __init__(self, allowed: "list[str] | tuple[str, ...]" = (), message: str = "method not allowed") -> None:
        super().__init__(405, "method_not_allowed", message)
        self.allowed: list[str] = sorted(allowed)


class RouteMatch:
    """Результат совпадения: handler и захваченные params (percent-decoded)."""

    def __init__(self, handler: Callable[[Ctx], Response], params: dict[str, str]) -> None:
        self.handler = handler
        self.params = params


class Router:
    """Таблица маршрутов: add/register + match по сегментам."""

    def __init__(self) -> None:
        self._routes: dict[tuple[str, str], Callable[[Ctx], Response]] = {}

    def add(self, method: str, path: str, handler: Callable[[Ctx], Response]) -> None:
        """Зарегистрировать маршрут; дубликат method+path — RouteConflictError."""
        key = (method.upper(), path)
        if key in self._routes:
            raise RouteConflictError(f"{key[0]} {path}")
        self._routes[key] = handler

    def match(self, method: str, path: str) -> Optional[RouteMatch]:
        """Найти маршрут: RouteMatch | None; 405 при чужом методе для path."""
        normalized = method.upper()
        segments = path.split("/")
        matched_patterns: dict[str, list[str]] = {}
        found: Optional[tuple[Callable[[Ctx], Response], dict[str, str]]] = None
        for (route_method, pattern), handler in self._routes.items():
            params = self._match_segments(pattern.split("/"), segments)
            if params is None:
                continue
            matched_patterns.setdefault(pattern, []).append(route_method)
            if route_method == normalized and found is None:
                found = (handler, params)
        if found is not None:
            return RouteMatch(found[0], found[1])
        if matched_patterns:
            allowed = {m for methods in matched_patterns.values() for m in methods}
            raise MethodNotAllowedError(allowed)
        return None

    @staticmethod
    def _match_segments(pattern: list[str], segments: list[str]) -> Optional[dict[str, str]]:
        """Сегментное сравнение: то же число сегментов, литералы равны,
        :param захватывает любой непустой сегмент (percent-decode)."""
        if len(pattern) != len(segments):
            return None
        params: dict[str, str] = {}
        for pat, seg in zip(pattern, segments):
            if len(pat) > 1 and pat.startswith(":"):
                if not seg:
                    return None
                params[pat[1:]] = unquote(seg)
            elif pat != seg:
                return None
        return params
