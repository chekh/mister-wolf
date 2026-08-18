"""Обработка ошибок nanohttp (спецификация LONG-002, раздел 6).

Базовая иерархия HttpError + ErrorHandler с поиском по MRO.
Ошибки роутера (NotFoundError, MethodNotAllowedError, RouteConflictError)
определены в router.py и реэкспортируются через PEP 562 __getattr__.
"""

from __future__ import annotations

from typing import Any, Callable

from .ctx import Ctx, Response


class HttpError(Exception):
    """Базовая ошибка HTTP с фиксированным статусом, кодом и сообщением.

    Attributes:
        status: HTTP-статус (например, 404).
        code: Строковый код ошибки (например, ``"not_found"``).
        message: Человекочитаемое сообщение.
    """

    def __init__(self, status: int, code: str, message: str) -> None:
        self.status: int = status
        self.code: str = code
        self.message: str = message
        super().__init__(message)


class ErrorHandler:
    """Реестр обработчиков исключений с поиском по MRO.

    Позволяет зарегистрировать обработчики для конкретных типов исключений.
    При вызове ``handle`` ищет обработчик по MRO типа исключения (от точного
    типа к базовым классам). Если обработчик не найден и исключение —
    ``HttpError``, формирует стандартное тело ошибки. Иначе — fallback 500.
    """

    def __init__(self) -> None:
        self._handlers: dict[type[BaseException], Callable[[Ctx, BaseException], Response]] = {}

    def on(
        self,
        exc_type: type[BaseException],
        handler: Callable[[Ctx, BaseException], Response],
    ) -> None:
        """Зарегистрировать обработчик для типа исключения.

        Args:
            exc_type: Тип исключения (включая подклассы через MRO).
            handler: Функция ``(ctx, exc) -> Response``.
        """
        self._handlers[exc_type] = handler

    def handle(self, ctx: Ctx, exc: BaseException) -> Response:
        """Обработать исключение: поиск обработчика по MRO или fallback.

        Логика (обязательна для интеграционных тестов):

        1. Ищем зарегистрированный обработчик: сначала точный тип ``exc``,
           затем по ``type(exc).__mro__`` по порядку.
        2. Не найден, но ``exc`` — ``HttpError`` (или подкласс): тело
           ``{"error": <code>, "message": <msg>}``; если у ``exc`` есть
           атрибут ``errors`` (список, как у ValidationError) → добавить
           ``"details"``.
        3. Не найден и не ``HttpError`` → fallback ``Response(500, ...)``.

        Args:
            ctx: Контекст текущего запроса.
            exc: Перехваченное исключение.

        Returns:
            Response с соответствующим статусом и телом.
        """
        # 1. Поиск обработчика по MRO
        for cls in type(exc).__mro__:
            if cls in self._handlers:
                return self._handlers[cls](ctx, exc)

        # 2. HttpError без кастомного обработчика → стандартное тело
        if isinstance(exc, HttpError):
            body: dict[str, Any] = {"error": exc.code, "message": exc.message}
            if hasattr(exc, "errors") and isinstance(getattr(exc, "errors"), list):
                body["details"] = getattr(exc, "errors")
            return Response(exc.status, body)

        # 3. Fallback для неизвестных исключений
        return Response(500, {"error": "internal", "message": str(exc)})


# ---------------------------------------------------------------------------
# Реэкспорт ошибок роутера (приложение A, п.29-30): errors.py публично
# предоставляет их через ленивый атрибут модуля (PEP 562), чтобы избежать
# циклического импорта router -> errors -> router.
# ---------------------------------------------------------------------------
_REEXPORTS: set[str] = {"RouteConflictError", "NotFoundError", "MethodNotAllowedError"}


def __getattr__(name: str) -> Any:  # noqa: ANN001
    """Ленивый реэкспорт классов из router.py (PEP 562)."""
    if name in _REEXPORTS:
        from . import router

        return getattr(router, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
