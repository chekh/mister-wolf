"""Цепочка middleware (луковичная модель).

Middleware — callable ``(ctx, next) -> Response``, где ``next()``
запускает следующий слой (внутренние middleware и endpoint).
Первый зарегистрированный — внешний. Middleware может не звать
``next()`` (short-circuit).
"""

from typing import TYPE_CHECKING, Callable

if TYPE_CHECKING:  # pragma: no cover
    from .ctx import Ctx, Response

Middleware = Callable[..., object]


class MiddlewareChain:
    """Упорядоченный список middleware с исполнением «изнутри наружу»."""

    def __init__(self):
        self._middlewares = []

    def use(self, mw):
        """Добавить middleware в конец цепочки (станет внутренним)."""
        self._middlewares.append(mw)

    def execute(self, ctx, endpoint):
        """Прогнать цепочку; ``endpoint`` — самый внутренний слой.

        Пустая цепочка — сразу ``endpoint(ctx)``.
        """

        def run(index):
            if index >= len(self._middlewares):
                return endpoint(ctx)

            def next():
                return run(index + 1)

            return self._middlewares[index](ctx, next)

        return run(0)
