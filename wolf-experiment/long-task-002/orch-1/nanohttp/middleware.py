"""middleware — цепочка middleware, луковичная модель (spec.md §3)."""

from __future__ import annotations

from typing import Any, Callable

from .ctx import Ctx, Response

Middleware = Callable[[Ctx, Callable[[], Response]], Response]


class MiddlewareChain:
    """Луковичная цепочка middleware."""

    def __init__(self) -> None:
        self._middlewares: list[Middleware] = []

    def use(self, mw: Middleware) -> None:
        """Добавить middleware в конец цепочки."""
        self._middlewares.append(mw)

    def execute(
        self,
        ctx: Ctx,
        endpoint: Callable[[Ctx], Response],
    ) -> Response:
        """Прогнать цепочку; на конце — endpoint."""
        if not self._middlewares:
            return endpoint(ctx)

        def build_chain(index: int) -> Callable[[], Response]:
            """Создать замыкание для middleware по индексу."""
            if index >= len(self._middlewares):
                return lambda: endpoint(ctx)
            mw = self._middlewares[index]
            nxt = build_chain(index + 1)
            return lambda: mw(ctx, nxt)

        return (build_chain(0))()
