"""Цепочка middleware nanohttp — луковичная модель (спецификация, раздел 3)."""

from __future__ import annotations

from typing import Callable

from .ctx import Ctx, Response

Middleware = Callable[[Ctx, Callable[[], Response]], Response]


class MiddlewareChain:
    """Порядок: регистрация -> вызов; первый зарегистрированный — внешний.

    Middleware может не вызывать next() (short-circuit). Исключения из
    внутренних слоёв видны обычному try/except вокруг next() во внешних.
    """

    def __init__(self) -> None:
        self._middlewares: list[Middleware] = []

    def use(self, mw: Middleware) -> None:
        """Добавить middleware в конец цепочки."""
        self._middlewares.append(mw)

    def execute(self, ctx: Ctx, endpoint: Callable[[Ctx], Response]) -> Response:
        """Прогнать цепочку; на конце — endpoint. Пустая цепочка — сразу endpoint."""

        middlewares = list(self._middlewares)

        def run(index: int, current: Ctx) -> Response:
            if index == len(middlewares):
                return endpoint(current)

            def next() -> Response:
                return run(index + 1, current)

            return middlewares[index](current, next)

        return run(0, ctx)
