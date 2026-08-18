"""Маршрутизация nanohttp (спецификация LONG-002, раздел 2).

Простой маршрутизатор с паттернами ``:param``.
Определяет классы ошибок роутинга как подклассы ``HttpError`` из errors.py.
"""

from __future__ import annotations

import urllib.parse
from typing import Callable

from .ctx import Ctx, Response
from .errors import HttpError


# ---------------------------------------------------------------------------
# Ошибки роутинга (подклассы HttpError)
# ---------------------------------------------------------------------------


class RouteConflictError(HttpError):
    """Дубликат маршрута: метод + path уже зарегистрирован.

    Attributes:
        status: 409.
        code: ``"route_conflict"``.
    """

    def __init__(self, message: str = "Route conflict") -> None:
        super().__init__(409, "route_conflict", message)


class NotFoundError(HttpError):
    """Запрошенный path не найден (кидается на уровне app, не router).

    Attributes:
        status: 404.
        code: ``"not_found"``.
    """

    def __init__(self, message: str = "Not Found") -> None:
        super().__init__(404, "not_found", message)


class MethodNotAllowedError(HttpError):
    """Метод не поддерживается для данного path.

    Attributes:
        status: 405.
        code: ``"method_not_allowed"``.
        allowed: Отсортированный список допустимых методов.
    """

    def __init__(
        self,
        allowed: list[str] | None = None,
        message: str = "Method Not Allowed",
    ) -> None:
        super().__init__(405, "method_not_allowed", message)
        self.allowed: list[str] = sorted(allowed) if allowed is not None else []


# ---------------------------------------------------------------------------
# RouteMatch — результат совпадения
# ---------------------------------------------------------------------------


class RouteMatch:
    """Результат совпадения маршрута: обработчик + захваченные параметры.

    Attributes:
        handler: Функция ``(Ctx) -> Response`` для этого маршрута.
        params: Словарь захваченных параметров (имя → значение, decoded).
    """

    __slots__ = ("handler", "params")

    def __init__(self, handler: Callable[[Ctx], Response], params: dict[str, str]) -> None:
        self.handler: Callable[[Ctx], Response] = handler
        self.params: dict[str, str] = params


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------


class Router:
    """Простой маршрутизатор с паттернами ``:param``.

    - Паттерн: сегменты через ``/``, каждый — литерал или ``:param``.
    - Совпадение: точное по сегментам (то же число, литералы равны,
      ``:param`` захватывает любой непустой сегмент).
    - Значения параметров percent-decode (``urllib.parse.unquote``).
    - Метод — case-insensitive, path — case-sensitive.
    - Трейлинг-слэш — отдельный path.

    Raises:
        RouteConflictError: Дубликат method+path при ``add``.
        MethodNotAllowedError: Path совпал, method не совпал.
    """

    def __init__(self) -> None:
        self._routes: list[tuple[str, str, Callable[[Ctx], Response]]] = []

    def add(
        self,
        method: str,
        path: str,
        handler: Callable[[Ctx], Response],
    ) -> None:
        """Зарегистрировать маршрут.

        Args:
            method: HTTP-метод (case-insensitive).
            path: Паттерн пути (``/users/:id``, ``/static/file.txt``).
            handler: Функция ``(Ctx) -> Response``.

        Raises:
            RouteConflictError: Если метод+path уже зарегистрированы.
        """
        method_upper: str = method.upper()
        for existing_method, existing_path, _ in self._routes:
            if existing_method == method_upper and existing_path == path:
                raise RouteConflictError(
                    f"Route {method_upper} {path!r} already registered"
                )
        self._routes.append((method_upper, path, handler))

    def match(self, method: str, path: str) -> RouteMatch | None:
        """Найти обработчик для method+path.

        Поиск по маршрутам в порядке добавления, первый совпавший
        path-паттерн выигрывает.

        Args:
            method: HTTP-метод (case-insensitive).
            path: Фактический путь запроса.

        Returns:
            ``RouteMatch`` при совпадении, ``None`` если path не найден.

        Raises:
            MethodNotAllowedError: Path совпал с паттерном, но метод
                не совпал ни с одним зарегистрированным для этого паттерна.
        """
        method_upper: str = method.upper()
        path_segments: list[str] = path.split("/")

        for route_method, route_pattern, route_handler in self._routes:
            pattern_segments: list[str] = route_pattern.split("/")

            # Число сегментов должно совпадать точно
            if len(pattern_segments) != len(path_segments):
                continue

            # Попытка сопоставить сегменты
            params: dict[str, str] = {}
            segment_match: bool = True
            for p_seg, path_seg in zip(pattern_segments, path_segments):
                if p_seg.startswith(":"):
                    param_name: str = p_seg[1:]
                    if not path_seg:
                        # :param требует непустой сегмент
                        segment_match = False
                        break
                    params[param_name] = urllib.parse.unquote(path_seg)
                elif p_seg != path_seg:
                    segment_match = False
                    break

            if not segment_match:
                continue

            # Path-паттерн совпал
            if route_method == method_upper:
                return RouteMatch(route_handler, params)

            # Метод не совпал — собираем все методы для этого паттерна
            allowed: set[str] = set()
            for rm, rp, _ in self._routes:
                if rp == route_pattern:
                    allowed.add(rm)
            raise MethodNotAllowedError(allowed=sorted(allowed))

        return None
