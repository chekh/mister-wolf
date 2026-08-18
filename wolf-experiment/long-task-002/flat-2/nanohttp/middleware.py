"""Цепочка middleware — луковичная модель (спека LONG-002, раздел 3)."""

from typing import Callable

from .ctx import Ctx, Response

Middleware = Callable[[Ctx, Callable[[], Response]], Response]


class MiddlewareChain:
    """Порядок: регистрация -> вызов; первый зарегистрированный — внешний.

    Middleware может не звать next() (short-circuit). Код после next()
    выполняется при разворачивании луковицы. Пустая цепочка — сразу endpoint.
    """

    def __init__(self) -> None:
        self._middlewares: list[Middleware] = []

    def use(self, mw: Middleware) -> None:
        """Добавить middleware в конец цепочки."""
        self._middlewares.append(mw)

    def execute(self, ctx: Ctx, endpoint: Callable[[Ctx], Response]) -> Response:
        """Прогнать цепочку, на конце — endpoint."""
        chain = self._middlewares

        def run(index: int) -> Response:
            if index >= len(chain):
                return endpoint(ctx)
            return chain[index](ctx, lambda: run(index + 1))

        return run(0)
