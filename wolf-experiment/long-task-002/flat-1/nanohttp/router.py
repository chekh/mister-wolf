"""Маршрутизация nanohttp.

Паттерны: сегменты через ``/``; сегмент — литерал или ``:param``
(захватывает любой непустой сегмент). Значения параметров
percent-decode'ятся. Метод регистронезависим, путь — регистрозависим,
трейлинг-слэш — отдельный путь.
"""

from urllib.parse import unquote

from .errors import (  # noqa: F401  (реэкспорт ошибок роутера)
    HttpError,
    MethodNotAllowedError,
    NotFoundError,
    RouteConflictError,
)


class RouteMatch:
    """Результат совпадения маршрута.

    Attributes:
        handler: обработчик ``(Ctx) -> Response``.
        params: percent-decoded параметры пути ``dict[str, str]``.
    """

    def __init__(self, handler, params):
        self.handler = handler
        self.params = params


class Router:
    """Таблица маршрутов: регистрация и сопоставление."""

    def __init__(self):
        self._routes = {}  # (METHOD, pattern) -> handler

    def add(self, method, path, handler):
        """Зарегистрировать обработчик; дубликат — RouteConflictError."""
        key = (method.upper(), path)
        if key in self._routes:
            raise RouteConflictError(
                f"route already registered: {key[0]} {key[1]}"
            )
        self._routes[key] = handler

    def match(self, method, path):
        """Найти маршрут.

        Returns:
            RouteMatch с handler и percent-decoded params, либо None,
            если path не совпадает ни с одним маршрутом.

        Raises:
            MethodNotAllowedError: path совпал, но метод другой
                (``.allowed`` — отсортированные методы этого path).
        """
        wanted = method.upper()
        matched = []
        for (route_method, pattern), handler in self._routes.items():
            params = self._match_pattern(pattern, path)
            if params is not None:
                matched.append((route_method, handler, params))
        if not matched:
            return None
        for route_method, handler, params in matched:
            if route_method == wanted:
                return RouteMatch(handler, params)
        raise MethodNotAllowedError(allowed=[m for m, _, _ in matched])

    @staticmethod
    def _match_pattern(pattern, path):
        """Сегментное сравнение; None — нет совпадения.

        ``:param`` захватывает любой непустой сегмент path;
        захваченные значения percent-decode'ятся (``unquote``).
        """
        pattern_segments = pattern.split("/")
        path_segments = path.split("/")
        if len(pattern_segments) != len(path_segments):
            return None
        params = {}
        for pat, seg in zip(pattern_segments, path_segments):
            if len(pat) > 1 and pat.startswith(":"):
                if seg == "":
                    return None
                params[pat[1:]] = unquote(seg)
            elif pat != seg:
                return None
        return params
