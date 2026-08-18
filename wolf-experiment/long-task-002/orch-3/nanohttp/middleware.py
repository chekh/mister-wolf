"""Цепочка middleware, луковичная модель (спека §3)."""

from __future__ import annotations

from typing import Callable

from .ctx import Ctx, Response

Middleware = Callable[[Ctx, Callable[[], Response]], Response]


class MiddlewareChain:
    """.use(mw) — добавить в конец; .execute(ctx, endpoint) -> Response.

    Луковичная модель: первый зарегистрированный — внешний.
    Middleware вызывает next() для делегирования внутрь.
    Middleware может НЕ вызывать next() (short-circuit).
    Код после next() выполняется при разворачивании.
    Исключения из внутреннего ловятся try/except вокруг next() во внешнем.
    Пустая цепочка: execute сразу зовёт endpoint.
    """

    def __init__(self) -> None:
        self._middleware: list[Middleware] = []

    def use(self, mw: Middleware) -> None:
        """Добавить middleware в конец цепочки."""
        self._middleware.append(mw)

    def execute(self, ctx: Ctx, endpoint: Callable[[Ctx], Response]) -> Response:
        """Прогнать цепочку, на конце — endpoint."""
        if not self._middleware:
            return endpoint(ctx)

        # Строим луковичную цепочку:
        # Индекс 0 — самый внешний middleware.
        # Внутренним для middleware[i] является вызов middleware[i+1]...endpoint.
        n = len(self._middleware)

        def build_next(index: int) -> Callable[[], Response]:
            """Создать замыкание, вызывающее middleware[index] или endpoint."""
            if index == n:
                return lambda: endpoint(ctx)
            mw = self._middleware[index]
            return lambda: mw(ctx, build_next(index + 1))

        outer_call = build_next(0)
        return outer_call()
