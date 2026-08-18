"""Приложение: полный lifecycle запроса (спека LONG-002, §8)."""
from __future__ import annotations

from typing import Callable

from .ctx import Ctx, Request, Response
from .di import Container
from .errors import ErrorHandler
from .logger import Logger, default_logger, log_middleware
from .middleware import Middleware, MiddlewareChain
from .router import NotFoundError, Router


class NanoApp:
    """Сборка lifecycle: ctx -> router -> middleware chain -> handler.

    В __init__ первым (внешним) middleware ставится log_middleware
    на default_logger — логирование всегда оборачивает пользовательские
    middleware и handler.
    """

    def __init__(self) -> None:
        self.container = Container()
        self.logger: Logger = default_logger
        self._router = Router()
        self._chain = MiddlewareChain()
        self._error_handler = ErrorHandler()
        self.use(log_middleware(self.logger))

    # -- маршруты -----------------------------------------------------------

    def add(self, method: str, path: str, handler: Callable[[Ctx], Response]) -> None:
        """Зарегистрировать маршрут (конфликт — RouteConflictError)."""
        self._router.add(method, path, handler)

    def get(self, path: str, handler: Callable[[Ctx], Response]) -> None:
        self.add("GET", path, handler)

    def post(self, path: str, handler: Callable[[Ctx], Response]) -> None:
        self.add("POST", path, handler)

    def patch(self, path: str, handler: Callable[[Ctx], Response]) -> None:
        self.add("PATCH", path, handler)

    def delete(self, path: str, handler: Callable[[Ctx], Response]) -> None:
        self.add("DELETE", path, handler)

    # -- расширения ---------------------------------------------------------

    def use(self, mw: Middleware) -> None:
        """Добавить middleware (внутри логирующего)."""
        self._chain.use(mw)

    def on(self, exc_type: type[BaseException], handler: Callable[[Ctx, BaseException], Response]) -> None:
        """Зарегистрировать обработчик исключения (делегирует ErrorHandler)."""
        self._error_handler.on(exc_type, handler)

    # -- lifecycle ----------------------------------------------------------

    def handle(
        self,
        method: str,
        path: str,
        query: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        body: dict | None = None,
    ) -> Response:
        """Полный цикл обработки запроса; любое исключение -> Response."""
        ctx = Ctx(Request(method, path, query=query, headers=headers, body=body))
        try:
            match = self._router.match(method, path)
            if match is None:
                raise NotFoundError(f"no route for path {path!r}")
            ctx.params.update(match.params)
            return self._chain.execute(ctx, match.handler)
        except Exception as exc:
            return self._error_handler.handle(ctx, exc)
