"""app — приложение nanohttp: полный lifecycle (spec.md §8)."""

from typing import Any, Callable

from .ctx import Ctx, Request, Response
from .di import Container
from .errors import ErrorHandler
from .logger import default_logger, log_middleware
from .middleware import Middleware, MiddlewareChain
from .router import NotFoundError, RouteConflictError, Router


class NanoApp:
    """Минималистичный веб-фреймворк: маршрутизация, middleware, DI, ошибки."""

    def __init__(self) -> None:
        self._router = Router()
        self._chain = MiddlewareChain()
        self._error_handler = ErrorHandler()
        self.container = Container()
        self.logger = default_logger

        # Логирование ВСЕГДА внешнее (первый middleware)
        self._chain.use(log_middleware(default_logger))

    def add(
        self,
        method: str,
        path: str,
        handler: Callable[[Ctx], Response],
    ) -> None:
        """Зарегистрировать маршрут."""
        self._router.add(method, path, handler)

    def get(
        self,
        path: str,
        handler: Callable[[Ctx], Response],
    ) -> None:
        """Шорткат для GET."""
        self.add("GET", path, handler)

    def post(
        self,
        path: str,
        handler: Callable[[Ctx], Response],
    ) -> None:
        """Шорткат для POST."""
        self.add("POST", path, handler)

    def patch(
        self,
        path: str,
        handler: Callable[[Ctx], Response],
    ) -> None:
        """Шорткат для PATCH."""
        self.add("PATCH", path, handler)

    def delete(
        self,
        path: str,
        handler: Callable[[Ctx], Response],
    ) -> None:
        """Шорткат для DELETE."""
        self.add("DELETE", path, handler)

    def use(self, mw: Middleware) -> None:
        """Добавить middleware (после логирующего)."""
        self._chain.use(mw)

    def on(
        self,
        exc_type: type,
        handler: Callable[[Ctx, Any], Response],
    ) -> None:
        """Зарегистрировать обработчик исключения."""
        self._error_handler.on(exc_type, handler)

    def handle(
        self,
        method: str,
        path: str,
        query: dict | None = None,
        headers: dict | None = None,
        body: dict | None = None,
    ) -> Response:
        """Полный lifecycle обработки запроса."""
        ctx = Ctx(Request(method, path, query, headers, body))
        try:
            match = self._router.match(method, path)
            if match is None:
                raise NotFoundError("Not found")
            ctx.params = dict(match.params)
            return self._chain.execute(ctx, match.handler)
        except Exception as exc:
            return self._error_handler.handle(ctx, exc)
