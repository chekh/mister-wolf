"""NanoApp — полный lifecycle (спека §8)."""

from __future__ import annotations

from typing import Callable

from .ctx import Ctx, Request, Response
from .di import Container
from .errors import ErrorHandler, NotFoundError
from .logger import Logger, default_logger, log_middleware
from .middleware import MiddlewareChain
from .router import Router


class NanoApp:
    """.add/.get/.post/.patch/.delete; .use; .on; .container; .logger;
    .handle(method, path, query=None, headers=None, body=None) -> Response.

    По умолчанию use(log_middleware(default_logger)) — логирование ВСЕГДА
    внешнее (первое).
    """

    def __init__(self) -> None:
        self.container = Container()
        self.logger = Logger()
        self.router = Router()
        self.chain = MiddlewareChain()
        self.error_handler = ErrorHandler()
        # Логирование всегда первое (внешнее)
        self.chain.use(log_middleware(default_logger))

    def add(self, method: str, path: str, handler: Callable[[Ctx], Response]) -> None:
        self.router.add(method, path, handler)

    def get(self, path: str, handler: Callable[[Ctx], Response]) -> None:
        self.router.add("GET", path, handler)

    def post(self, path: str, handler: Callable[[Ctx], Response]) -> None:
        self.router.add("POST", path, handler)

    def patch(self, path: str, handler: Callable[[Ctx], Response]) -> None:
        self.router.add("PATCH", path, handler)

    def delete(self, path: str, handler: Callable[[Ctx], Response]) -> None:
        self.router.add("DELETE", path, handler)

    def use(self, mw) -> None:
        self.chain.use(mw)

    def on(self, exc_type: type[BaseException], handler) -> None:
        self.error_handler.on(exc_type, handler)

    def handle(self, method: str, path: str, query: dict | None = None,
               headers: dict | None = None, body: dict | None = None) -> Response:
        # 1) Создаём контекст (всегда, чтобы error_handler имел ctx)
        ctx = Ctx(Request(method, path, query=query, headers=headers, body=body))
        try:
            # 2) Маршрутизация
            match = self.router.match(method, path)
            if match is None:
                raise NotFoundError()
            ctx.params = match.params
            handler = match.handler

            # 3) Прогоняем цепочку middleware + handler
            resp = self.chain.execute(ctx, handler)

            # 4) Возвращаем ответ
            return resp

        except BaseException as exc:
            # 5) ЛЮБОЕ исключение → error_handler
            return self.error_handler.handle(ctx, exc)
