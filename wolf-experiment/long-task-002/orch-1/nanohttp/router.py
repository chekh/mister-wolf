"""router — маршрутизация с параметрами (spec.md §2)."""

from __future__ import annotations

from typing import Any
from urllib.parse import unquote

from .errors import HttpError


class RouteMatch:
    """Результат маршрутизации."""

    def __init__(self, handler: Any, params: dict[str, str]) -> None:
        self.handler = handler
        self.params = params


class RouteConflictError(HttpError):
    """Дубликат method+path."""

    def __init__(self, message: str = "Route conflict") -> None:
        super().__init__(409, "route_conflict", message)


class NotFoundError(HttpError):
    """Маршрут не найден."""

    def __init__(self, message: str = "Not found") -> None:
        super().__init__(404, "not_found", message)


class MethodNotAllowedError(HttpError):
    """Path совпал, method — нет."""

    def __init__(
        self,
        allowed: list[str] | None = None,
        message: str = "Method not allowed",
    ) -> None:
        super().__init__(405, "method_not_allowed", message)
        self.allowed: list[str] = sorted(allowed or [])


class Router:
    """Маршрутизатор: добавление и матчинг."""

    def __init__(self) -> None:
        self._routes: list[tuple[str, str, Any]] = []  # (method, path, handler)

    def add(self, method: str, path: str, handler: Any) -> None:
        """Зарегистрировать маршрут."""
        normalized = method.upper()
        for m, p, _ in self._routes:
            if m == normalized and p == path:
                raise RouteConflictError(
                    f"Duplicate route: {normalized} {path}"
                )
        self._routes.append((normalized, path, handler))

    def match(self, method: str, path: str) -> RouteMatch | None:
        """Найти маршрут; None если path не совпал, исключение если method не совпал."""
        normalized = method.upper()
        matching_methods: list[str] = []

        for m, p, handler in self._routes:
            params = _match_path(p, path)
            if params is not None:
                matching_methods.append(m)
                if m == normalized:
                    return RouteMatch(handler, params)

        if matching_methods:
            raise MethodNotAllowedError(allowed=matching_methods)

        return None


def _match_path(pattern: str, path: str) -> dict[str, str] | None:
    """Сопоставить шаблон с path по сегментам. Вернуть params или None."""
    pat_segments = pattern.split("/")
    path_segments = path.split("/")

    if len(pat_segments) != len(path_segments):
        return None

    params: dict[str, str] = {}
    for pat_seg, path_seg in zip(pat_segments, path_segments):
        if pat_seg.startswith(":"):
            name = pat_seg[1:]
            if not path_seg:  # пустой сегмент не захватывается
                return None
            params[name] = unquote(path_seg)
        else:
            if pat_seg != path_seg:
                return None

    return params
