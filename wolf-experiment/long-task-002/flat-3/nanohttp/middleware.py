"""Цепочка middleware, луковичная модель (спека LONG-002, §3)."""
from __future__ import annotations

from typing import Callable

from .ctx import Ctx, Response

Middleware = Callable[[Ctx, Callable[[], Response]], Response]


class MiddlewareChain:
    """Хранит middleware в порядке регистрации и прогоняет запрос через них.

    Первый зарегистрированный — внешний. Middleware может не вызвать
    next() (short-circuit); исключения изнутри распространяются наружу
    как обычные Python-исключения.
    """

    def __init__(self) -> None:
        self._middlewares: list[Middleware] = []

    def use(self, mw: Middleware) -> None:
        """Добавить middleware в конец цепочки."""
        self._middlewares.append(mw)

    def execute(self, ctx: Ctx, endpoint: Callable[[Ctx], Response]) -> Response:
        """Прогнать ctx через цепочку, на конце — endpoint."""
        middlewares = self._middlewares

        def run(index: int) -> Response:
            if index == len(middlewares):
                return endpoint(ctx)
            next_call: Callable[[], Response] = lambda: run(index + 1)
            return middlewares[index](ctx, next_call)

        return run(0)
