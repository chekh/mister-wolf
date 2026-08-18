"""tests/test_middleware — тесты модуля middleware (spec.md §3)."""

import unittest

from nanohttp import Ctx, MiddlewareChain, Request, Response


class TestMiddleware(unittest.TestCase):
    def test_order_before(self) -> None:
        """Первый зарегистрированный — внешний, вызывается первым (до next)."""
        order: list[str] = []

        def outer(ctx, nxt):
            order.append("outer_before")
            nxt()
            order.append("outer_after")

        def inner(ctx, nxt):
            order.append("inner_before")
            nxt()
            order.append("inner_after")

        chain = MiddlewareChain()
        chain.use(outer)
        chain.use(inner)

        req = Request("GET", "/")
        ctx = Ctx(req)
        chain.execute(ctx, lambda c: order.append("endpoint"))

        # «before» порядок: outer_before, inner_before, endpoint
        self.assertEqual(order[0], "outer_before")
        self.assertEqual(order[1], "inner_before")
        self.assertEqual(order[2], "endpoint")

    def test_order_after(self) -> None:
        """«after» порядок: inner_after → outer_after (луковица)."""
        order: list[str] = []

        def outer(ctx, nxt):
            order.append("outer_before")
            nxt()
            order.append("outer_after")

        def inner(ctx, nxt):
            order.append("inner_before")
            nxt()
            order.append("inner_after")

        chain = MiddlewareChain()
        chain.use(outer)
        chain.use(inner)

        req = Request("GET", "/")
        ctx = Ctx(req)
        chain.execute(ctx, lambda c: order.append("endpoint"))

        # «after» порядок: inner_after, outer_after
        self.assertEqual(order[3], "inner_after")
        self.assertEqual(order[4], "outer_after")

    def test_short_circuit(self) -> None:
        """Middleware может не вызвать next() — short-circuit."""
        called: list[str] = []

        def mw(ctx, nxt):
            called.append("mw")
            return Response(403, body={"blocked": True})

        chain = MiddlewareChain()
        chain.use(mw)

        req = Request("GET", "/")
        ctx = Ctx(req)
        resp = chain.execute(ctx, lambda c: called.append("endpoint"))

        self.assertEqual(resp.status, 403)
        self.assertNotIn("endpoint", called)

    def test_endpoint_called_when_empty_chain(self) -> None:
        """Пустая цепочка → execute сразу зовёт endpoint."""
        called = False

        def endpoint(ctx):
            nonlocal called
            called = True
            return Response(200)

        chain = MiddlewareChain()
        req = Request("GET", "/")
        ctx = Ctx(req)
        resp = chain.execute(ctx, endpoint)

        self.assertTrue(called)
        self.assertEqual(resp.status, 200)

    def test_error_propagates_to_outer(self) -> None:
        """Исключение из endpoint/inner propagates к вызову execute."""
        def inner(ctx, nxt):
            raise RuntimeError("boom")

        chain = MiddlewareChain()
        chain.use(inner)

        req = Request("GET", "/")
        ctx = Ctx(req)
        with self.assertRaises(RuntimeError):
            chain.execute(ctx, lambda c: Response(200))

    def test_outer_catches_inner_exception(self) -> None:
        """Внешний middleware ловит исключение из inner через try/except."""
        caught = False

        def outer(ctx, nxt):
            nonlocal caught
            try:
                nxt()
            except RuntimeError:
                caught = True
                return Response(500, body={"error": "caught"})

        def inner(ctx, nxt):
            raise RuntimeError("boom")

        chain = MiddlewareChain()
        chain.use(outer)
        chain.use(inner)

        req = Request("GET", "/")
        ctx = Ctx(req)
        resp = chain.execute(ctx, lambda c: Response(200))

        self.assertTrue(caught)
        self.assertEqual(resp.status, 500)

    def test_chain_returns_endpoint_response(self) -> None:
        """Цепочка с pass-through middleware возвращает ответ endpoint."""
        def passthrough(ctx, nxt):
            return nxt()

        chain = MiddlewareChain()
        chain.use(passthrough)

        req = Request("GET", "/")
        ctx = Ctx(req)
        resp = chain.execute(ctx, lambda c: Response(201, body={"ok": True}))

        self.assertEqual(resp.status, 201)
        self.assertEqual(resp.body, {"ok": True})

    def test_next_returns_response(self) -> None:
        """next() возвращает Response от endpoint."""
        result = None

        def mw(ctx, nxt):
            nonlocal result
            result = nxt()
            return result

        chain = MiddlewareChain()
        chain.use(mw)

        req = Request("POST", "/data")
        ctx = Ctx(req)
        resp = chain.execute(ctx, lambda c: Response(201, body={"id": 42}))

        self.assertEqual(result.status, 201)
        self.assertEqual(result.body, {"id": 42})


if __name__ == "__main__":
    unittest.main()
