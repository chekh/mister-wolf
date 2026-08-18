"""Иерархия ошибок nanohttp и error handler.

Все HTTP-ошибки наследуют :class:`HttpError` (status/code/message).
Подклассы с фиксированными статусами определяются здесь;
``ValidationError`` определена в ``validation.py`` (перегруженный
конструктор, см. §5 спеки), а ``ResolutionError`` /
``CircularDependencyError`` — в ``di.py``.
"""

from .ctx import Response


class HttpError(Exception):
    """Базовая HTTP-ошибка.

    Attributes:
        status: HTTP-код статуса.
        code: машиночитаемый код ошибки.
        message: человекочитаемое сообщение.
    """

    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class NotFoundError(HttpError):
    """404 not_found — путь не совпал ни с одним маршрутом."""

    def __init__(self, message="not found"):
        super().__init__(404, "not_found", message)


class MethodNotAllowedError(HttpError):
    """405 method_not_allowed — path есть, метод другой.

    Attributes:
        allowed: отсортированный список методов этого path.
    """

    def __init__(self, allowed=None, message="method not allowed"):
        self.allowed = sorted(allowed) if allowed else []
        super().__init__(405, "method_not_allowed", message)


class RouteConflictError(HttpError):
    """409 route_conflict — дубликат method+path при регистрации."""

    def __init__(self, message="route conflict"):
        super().__init__(409, "route_conflict", message)


class ErrorHandler:
    """Диспетчер обработчиков исключений.

    Поиск: точный тип -> ближайший базовый по MRO. Если обработчика
    нет: HttpError -> Response с его статусом и uniform-телом
    ``{"error": code, "message": msg}`` (+ ``"details"`` у ошибок
    с атрибутом ``errors``, т.е. ValidationError); прочее исключение
    -> ``Response(500, {"error": "internal", ...})``.
    """

    def __init__(self):
        self._handlers = {}

    def on(self, exc_type, handler):
        """Зарегистрировать обработчик для типа исключения."""
        self._handlers[exc_type] = handler

    def handle(self, ctx, exc):
        """Преобразовать исключение в Response по зарегистрированным
        обработчикам; при отсутствии — fallback (см. класс docstring)."""
        for exc_type in type(exc).__mro__:
            if exc_type in self._handlers:
                return self._handlers[exc_type](ctx, exc)
        if isinstance(exc, HttpError):
            body = {"error": exc.code, "message": exc.message}
            details = getattr(exc, "errors", None)
            if details is not None:
                body["details"] = details
            return Response(exc.status, body)
        return Response(500, {"error": "internal", "message": str(exc)})
