"""Приложение nanohttp: сборка полного lifecycle.

request -> Router (params) -> MiddlewareChain -> handler -> Response;
любое исключение по пути уходит в ErrorHandler и превращается
в Response. Логирование — всегда самый внешний слой.
"""

from .ctx import Ctx, Request, Response  # noqa: F401
from .di import Container
from .errors import ErrorHandler, NotFoundError
from .logger import Logger, default_logger, log_middleware
from .middleware import MiddlewareChain
from .router import Router


class NanoApp:
    """Мини-приложение: маршруты, middleware, ошибки, DI, логгер."""

    def __init__(self):
        self.router = Router()
        self.chain = MiddlewareChain()
        self.error_handler = ErrorHandler()
        self.container = Container()
        self.logger = default_logger
        # Логирование ВСЕГДА первое (внешнее); пользовательские
        # middleware регистрируются внутри него.
        self.chain.use(log_middleware(self.logger))

    def add(self, method, path, handler):
        """Зарегистрировать маршрут (method любой регистр)."""
        self.router.add(method, path, handler)

    def get(self, path, handler):
        self.router.add("GET", path, handler)

    def post(self, path, handler):
        self.router.add("POST", path, handler)

    def patch(self, path, handler):
        self.router.add("PATCH", path, handler)

    def delete(self, path, handler):
        self.router.add("DELETE", path, handler)

    def use(self, mw):
        """Добавить middleware (порядок: регистрация)."""
        self.chain.use(mw)

    def on(self, exc_type, handler):
        """Зарегистрировать обработчик исключения (делегирует ErrorHandler)."""
        self.error_handler.on(exc_type, handler)

    def handle(self, method, path, query=None, headers=None, body=None):
        """Полный lifecycle одного запроса; всегда возвращает Response."""
        ctx = Ctx(
            Request(method, path, query=query, headers=headers, body=body)
        )
        try:
            match = self.router.match(method, path)
            if match is None:
                raise NotFoundError(f"no route for {method} {path}")
            ctx.params = match.params
            return self.chain.execute(ctx, match.handler)
        except Exception as exc:
            return self.error_handler.handle(ctx, exc)
