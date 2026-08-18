"""Приложение: сборка полного lifecycle (спека LONG-002, раздел 8)."""

from typing import Any, Callable, Optional

from .ctx import Ctx, Request, Response
from .di import Container
from .errors import ErrorHandler
from .logger import Logger, default_logger, log_middleware
from .middleware import Middleware, MiddlewareChain
from .router import NotFoundError, Router


class NanoApp:
    """request -> router (params) -> middleware -> handler -> response;
    любое исключение уходит в ErrorHandler; логирование — всегда внешнее."""

    def __init__(self) -> None:
        self.container = Container()
        self.logger: Logger = default_logger
        self._router = Router()
        self._chain = MiddlewareChain()
        self._error_handler = ErrorHandler()
        # Логирование ВСЕГДА первое (внешнее); пользовательские — внутри.
        self.use(log_middleware(self.logger))

    def add(self, method: str, path: str, handler: Callable[[Ctx], Response]) -> None:
        """Зарегистрировать маршрут (method регистронезависим)."""
        self._router.add(method, path, handler)

    def get(self, path: str, handler: Callable[[Ctx], Response]) -> None:
        self._router.add("GET", path, handler)

    def post(self, path: str, handler: Callable[[Ctx], Response]) -> None:
        self._router.add("POST", path, handler)

    def patch(self, path: str, handler: Callable[[Ctx], Response]) -> None:
        self._router.add("PATCH", path, handler)

    def delete(self, path: str, handler: Callable[[Ctx], Response]) -> None:
        self._router.add("DELETE", path, handler)

    def use(self, mw: Middleware) -> None:
        """Добавить middleware (порядок: регистрация)."""
        self._chain.use(mw)

    def on(self, exc_type: type[BaseException], handler: Callable[[Ctx, BaseException], Response]) -> None:
        """Зарегистрировать обработчик исключения (делегирует ErrorHandler)."""
        self._error_handler.on(exc_type, handler)

    def handle(
        self,
        method: str,
        path: str,
        query: Optional[dict[str, str]] = None,
        headers: Optional[dict[str, str]] = None,
        body: Optional[dict] = None,
    ) -> Response:
        """Полный lifecycle одного запроса; исключения -> error-ответ."""
        ctx = Ctx(Request(method, path, query=query, headers=headers, body=body))
        try:
            match = self._router.match(method, path)
            if match is None:
                raise NotFoundError(f"no route for {method.upper()} {path}")
            ctx.params = match.params
            return self._chain.execute(ctx, match.handler)
        except Exception as exc:  # noqa: BLE001 — единая точка обработки
            return self._error_handler.handle(ctx, exc)
