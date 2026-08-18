"""Маршрутизация (спека §2).

Ошибки RouteConflictError / NotFoundError / MethodNotAllowedError
импортируются из .errors (каноническое определение там).
"""

from __future__ import annotations

from typing import Callable
from urllib.parse import unquote

from .ctx import Ctx, Response
from .errors import (
    MethodNotAllowedError,
    NotFoundError,
    RouteConflictError,
)


class RouteMatch:
    """Результат маршрутизации: .handler и .params: dict[str, str]."""

    def __init__(self, handler: Callable[[Ctx], Response], params: dict[str, str]) -> None:
        self.handler = handler
        self.params = params


class Router:
    """.add(method, path, handler) / .match(method, path) -> RouteMatch | None."""

    def __init__(self) -> None:
        # key: (method_upper, path), value: (handler, parsed_segments)
        # parsed_segments: list[tuple[str, bool]] — (segment_text, is_param)
        self._routes: dict[tuple[str, str], tuple[Callable[[Ctx], Response], list[tuple[str, bool]]]] = {}

    def add(self, method: str, path: str, handler: Callable[[Ctx], Response]) -> None:
        method_upper = method.upper()
        key = (method_upper, path)
        if key in self._routes:
            raise RouteConflictError(f"duplicate route {method_upper} {path}")
        segments = self._parse_route(path)
        self._routes[key] = (handler, segments)

    def match(self, method: str, path: str) -> RouteMatch | None:
        method_upper = method.upper()
        segments = self._split(path)

        # Собираем методы, для которых path совпал по структуре
        matching_methods: list[str] = []
        matched: RouteMatch | None = None

        for (reg_method, _), (handler, reg_segs) in self._routes.items():
            result = self._try_match(reg_segs, segments)
            if result is not None:
                matching_methods.append(reg_method)
                if reg_method == method_upper:
                    params = {name: unquote(value) for name, value in result.items()}
                    matched = RouteMatch(handler, params)
                    break

        if matched is not None:
            return matched

        if matching_methods:
            raise MethodNotAllowedError(matching_methods)

        return None

    @staticmethod
    def _split(path: str) -> list[str]:
        """Split path into segments; drop leading empty segment from leading '/'.

        Хвостовые пустые сегменты сохраняются — "/users/" и "/users" РАЗНЫЕ.
        """
        parts = path.split("/")
        if parts and parts[0] == "":
            parts = parts[1:]
        return parts

    @staticmethod
    def _parse_route(path: str) -> list[tuple[str, bool]]:
        """Разобрать path маршрута в список кортежей (segment_text, is_param).

        "/users/:id/posts" -> [("users", False), (":id", True), ("posts", False)]
        """
        raw = Router._split(path)
        result: list[tuple[str, bool]] = []
        for seg in raw:
            if seg.startswith(":"):
                result.append((seg[1:], True))
            else:
                result.append((seg, False))
        return result

    @staticmethod
    def _try_match(
        route_segs: list[tuple[str, bool]],
        path_segs: list[str],
    ) -> dict[str, str] | None:
        """Попробовать сматчить сегменты пути против маршрута.

        Returns dict of param_name->value on match, None otherwise.
        """
        if len(route_segs) != len(path_segs):
            return None

        params: dict[str, str] = {}
        for (name, is_param), seg in zip(route_segs, path_segs):
            if is_param:
                # :param НЕ матчит пустой сегмент
                if seg == "":
                    return None
                params[name] = seg
            else:
                # Литераль — регистрозависимое равенство
                if name != seg:
                    return None

        return params
