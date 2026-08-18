"""Тесты цепочки middleware (спецификация §3)."""

import unittest

from nanohttp import Ctx, MiddlewareChain, Request, Response


class TestMiddleware(unittest.TestCase):
    def test_order_before(self):
        """Первый зарегистрированный выполняется первым ДО next()."""
        order = []

        def mw1(ctx, nxt):
            order.append("mw1-before")
            return nxt()

        def mw2(ctx, nxt):
            order.append("mw2-before")
            return nxt()

        def endpoint(ctx):
            order.append("ep")
            return Response(200)

        chain = MiddlewareChain()
        chain.use(mw1)
        chain.use(mw2)

        ctx = Ctx(Request("GET", "/"))
        chain.execute(ctx, endpoint)
        self.assertEqual(order, ["mw1-before", "mw2-before", "ep"])

    def test_order_after(self):
        """Разворачивание: внешний выполняется ПОСЛЕ внутреннего."""
        order = []

        def mw1(ctx, nxt):
            order.append("mw1-before")
            resp = nxt()
            order.append("mw1-after")
            return resp

        def mw2(ctx, nxt):
            order.append("mw2-before")
            resp = nxt()
            order.append("mw2-after")
            return resp

        def endpoint(ctx):
            order.append("ep")
            return Response(200)

        chain = MiddlewareChain()
        chain.use(mw1)
        chain.use(mw2)

        ctx = Ctx(Request("GET", "/"))
        chain.execute(ctx, endpoint)
        self.assertEqual(order, ["mw1-before", "mw2-before", "ep", "mw2-after", "mw1-after"])

    def test_short_circuit(self):
        """Middleware без next() — внутренние и endpoint не выполняются."""
        reached = []

        def mw1(ctx, nxt):
            reached.append("mw1")
            return Response(403, "blocked")

        def mw2(ctx, nxt):
            reached.append("mw2")
            return nxt()

        def endpoint(ctx):
            reached.append("ep")
            return Response(200)

        chain = MiddlewareChain()
        chain.use(mw1)
        chain.use(mw2)

        ctx = Ctx(Request("GET", "/"))
        resp = chain.execute(ctx, endpoint)
        self.assertEqual(reached, ["mw1"])
        self.assertEqual(resp.status, 403)

    def test_endpoint_called_when_empty_chain(self):
        called = []

        def endpoint(ctx):
            called.append(True)
            return Response(200)

        chain = MiddlewareChain()
        ctx = Ctx(Request("GET", "/"))
        chain.execute(ctx, endpoint)
        self.assertTrue(called)

    def test_error_propagates_to_outer(self):
        """Исключение из endpoint долетает наружу."""

        def endpoint(ctx):
            raise RuntimeError("boom")

        chain = MiddlewareChain()
        ctx = Ctx(Request("GET", "/"))
        with self.assertRaises(RuntimeError):
            chain.execute(ctx, endpoint)

    def test_outer_catches_inner_exception(self):
        """Внешний middleware ловит исключение через try/except вокруг next()."""
        caught = []

        def outer(ctx, nxt):
            try:
                return nxt()
            except RuntimeError as e:
                caught.append(str(e))
                return Response(500, "caught")

        def inner(ctx, nxt):
            return nxt()

        def endpoint(ctx):
            raise RuntimeError("boom")

        chain = MiddlewareChain()
        chain.use(outer)
        chain.use(inner)

        ctx = Ctx(Request("GET", "/"))
        resp = chain.execute(ctx, endpoint)
        self.assertEqual(caught, ["boom"])
        self.assertEqual(resp.status, 500)

    def test_chain_returns_endpoint_response(self):
        """Цепочка возвращает именно Response endpoint'а."""

        def mw(ctx, nxt):
            return nxt()

        def endpoint(ctx):
            return Response(201, {"id": 42})

        chain = MiddlewareChain()
        chain.use(mw)

        ctx = Ctx(Request("GET", "/"))
        resp = chain.execute(ctx, endpoint)
        self.assertEqual(resp.status, 201)
        self.assertEqual(resp.body, {"id": 42})

    def test_next_returns_response(self):
        """next() возвращает Response."""
        result = None

        def mw(ctx, nxt):
            nonlocal result
            result = nxt()
            return result

        def endpoint(ctx):
            return Response(200, "hello")

        chain = MiddlewareChain()
        chain.use(mw)

        ctx = Ctx(Request("GET", "/"))
        resp = chain.execute(ctx, endpoint)
        self.assertIs(result, resp)
        self.assertIsInstance(result, Response)
        self.assertEqual(result.status, 200)
        self.assertEqual(result.body, "hello")


if __name__ == "__main__":
    unittest.main()
