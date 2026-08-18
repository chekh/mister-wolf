"""Иерархия HTTP-ошибок и error handler (спека LONG-002, раздел 6).

Канонические определения HttpError и ErrorHandler живут здесь; ошибки
конкретных подсистем (router/di/validation) определены в своих модулях
как подклассы HttpError и реэкспортируются ниже — единая точка доступа.
"""

from typing import Any, Callable

from .ctx import Ctx, Response


class HttpError(Exception):
    """Базовая HTTP-ошибка: status, code, message; uniform JSON-подобное тело."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class ErrorHandler:
    """Диспетчер обработчиков исключений: точный тип -> MRO -> fallback."""

    def __init__(self) -> None:
        self._handlers: dict[type[BaseException], Callable[[Ctx, BaseException], Response]] = {}

    def on(self, exc_type: type[BaseException], handler: Callable[[Ctx, BaseException], Response]) -> None:
        """Зарегистрировать обработчик для типа исключения."""
        self._handlers[exc_type] = handler

    def handle(self, ctx: Ctx, exc: BaseException) -> Response:
        """Найти обработчик (точный тип, затем MRO) и выполнить.

        Нет обработчика и это HttpError — uniform-ответ по статусу/коду
        (у ValidationError добавляется details). Иначе — 500 internal.
        """
        for cls in type(exc).__mro__:
            if cls in self._handlers:
                return self._handlers[cls](ctx, exc)
        if isinstance(exc, HttpError):
            body: dict[str, Any] = {"error": exc.code, "message": exc.message}
            details = getattr(exc, "errors", None)
            if details is not None:
                body["details"] = details
            return Response(exc.status, body)
        return Response(500, {"error": "internal", "message": str(exc)})


# --- Реэкспорт ошибок подсистем (определения — в их канонических модулях) ---
from .router import MethodNotAllowedError, NotFoundError, RouteConflictError  # noqa: E402,F401
from .validation import ValidationError  # noqa: E402,F401
