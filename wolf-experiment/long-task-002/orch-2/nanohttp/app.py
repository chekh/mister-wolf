"""Приложение nanohttp — точка входа фреймворка (спецификация LONG-002, раздел 8).

NanoApp собирает роутер, цепочку middleware, обработчик ошибок и
DI-контейнер в единый lifecycle: request → router → middleware → handler → response.
"""

from __future__ import annotations

from typing import Any, Callable

from .ctx import Ctx, Request, Response
from .di import Container
from .errors import ErrorHandler
from .logger import default_logger, log_middleware
from .middleware import MiddlewareChain
from .router import NotFoundError, Router


class NanoApp:
    """Основной класс приложения nanohttp.

    Собирает роутер, цепочку middleware, обработчик ошибок и DI-контейнер.
    Логирование (log_middleware) всегда первое (внешнее) в цепочке middleware.

    Attributes:
        container: DI-контейнер для внедрения зависимостей в handler'ы.
        logger: Логгер (по умолчанию — глобальный ``default_logger``).
    """

    def __init__(self) -> None:
        self._router: Router = Router()
        self._chain: MiddlewareChain = MiddlewareChain()
        self._error_handler: ErrorHandler = ErrorHandler()
        self.container: Container = Container()
        self.logger = default_logger
        # Логирование всегда внешнее (первое в цепочке)
        self._chain.use(log_middleware(default_logger))

    def add(
        self,
        method: str,
        path: str,
        handler: Callable[[Ctx], Response],
    ) -> None:
        """Зарегистрировать маршрут.

        Args:
            method: HTTP-метод (приводится к верхнему регистру внутри Router).
            path: Паттерн пути (``/users/:id``).
            handler: Функция ``(Ctx) -> Response``.
        """
        self._router.add(method, path, handler)

    def get(
        self, path: str, handler: Callable[[Ctx], Response]
    ) -> None:
        """Шорткат: зарегистрировать GET-маршрут."""
        self.add("GET", path, handler)

    def post(
        self, path: str, handler: Callable[[Ctx], Response]
    ) -> None:
        """Шорткат: зарегистрировать POST-маршрут."""
        self.add("POST", path, handler)

    def patch(
        self, path: str, handler: Callable[[Ctx], Response]
    ) -> None:
        """Шорткат: зарегистрировать PATCH-маршрут."""
        self.add("PATCH", path, handler)

    def delete(
        self, path: str, handler: Callable[[Ctx], Response]
    ) -> None:
        """Шорткат: зарегистрировать DELETE-маршрут."""
        self.add("DELETE", path, handler)

    def use(self, mw: Callable[[Ctx, Callable[[], Response]], Response]) -> None:
        """Добавить middleware в цепочку (порядок: регистрация).

        Пользовательский middleware идёт ВНУТРИ log_middleware
        (последним зарегистрированным будет ближе к handler'у).

        Args:
            mw: Middleware-функция.
        """
        self._chain.use(mw)

    def on(
        self,
        exc_type: type[BaseException],
        handler: Callable[[Ctx, BaseException], Response],
    ) -> None:
        """Зарегистрировать обработчик исключения (делегирует ErrorHandler).

        Args:
            exc_type: Тип исключения.
            handler: Функция ``(ctx, exc) -> Response``.
        """
        self._error_handler.on(exc_type, handler)

    def handle(
        self,
        method: str,
        path: str,
        query: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        body: Any | None = None,
    ) -> Response:
        """Обработать один HTTP-запрос через полный lifecycle.

        1. Создать Ctx с Request.
        2. Сопоставить роутер; None → NotFoundError.
        3. Присвоить params в ctx.
        4. Прогнать middleware-цепочку с handler'ом.
        5. Исключения → error_handler.handle.

        Args:
            method: HTTP-метод.
            path: Путь запроса.
            query: Query-параметры.
            headers: Заголовки.
            body: Тело запроса.

        Returns:
            Response.
        """
        ctx: Ctx = Ctx(Request(method, path, query, headers, body))
        try:
            match = self._router.match(method, path)
            if match is None:
                raise NotFoundError()
            ctx.params = dict(match.params)  # копия, не мутируем оригинал
            return self._chain.execute(ctx, match.handler)
        except BaseException as exc:
            return self._error_handler.handle(ctx, exc)
