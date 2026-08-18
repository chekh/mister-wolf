"""Тесты middleware-цепочки (спека §3, прил. B: test_middleware)."""
import unittest

from nanohttp import Ctx, MiddlewareChain, Request, Response


def _ctx():
    return Ctx(Request("GET", "/"))


class MiddlewareChainTests(unittest.TestCase):
    def test_order_before(self):
        order = []

        def mw_a(ctx, next):
            order.append("a-before")
            return next()

        def mw_b(ctx, next):
            order.append("b-before")
            return next()

        def endpoint(ctx):
            order.append("endpoint")
            return Response(200, "ok")

        chain = MiddlewareChain()
        chain.use(mw_a)
        chain.use(mw_b)
        chain.execute(_ctx(), endpoint)
        # первый зарегистрированный — внешний: a входит первым
        self.assertEqual(order, ["a-before", "b-before", "endpoint"])

    def test_order_after(self):
        order = []

        def mw_a(ctx, next):
            response = next()
            order.append("a-after")
            return response

        def mw_b(ctx, next):
            response = next()
            order.append("b-after")
            return response

        def endpoint(ctx):
            return Response(200, "ok")

        chain = MiddlewareChain()
        chain.use(mw_a)
        chain.use(mw_b)
        chain.execute(_ctx(), endpoint)
        # при разворачивании — изнутри наружу
        self.assertEqual(order, ["b-after", "a-after"])

    def test_short_circuit(self):
        called = {"inner": False, "endpoint": False}

        def outer(ctx, next):
            return Response(403, "denied")  # next() не вызывается

        def inner(ctx, next):
            called["inner"] = True
            return next()

        def endpoint(ctx):
            called["endpoint"] = True
            return Response(200, "ok")

        chain = MiddlewareChain()
        chain.use(outer)
        chain.use(inner)
        resp = chain.execute(_ctx(), endpoint)
        self.assertEqual(resp.status, 403)
        self.assertEqual(resp.body, "denied")
        self.assertFalse(called["inner"])
        self.assertFalse(called["endpoint"])

    def test_endpoint_called_when_empty_chain(self):
        def endpoint(ctx):
            return Response(201, "created")

        chain = MiddlewareChain()
        resp = chain.execute(_ctx(), endpoint)
        self.assertEqual(resp.status, 201)
        self.assertEqual(resp.body, "created")

    def test_error_propagates_to_outer(self):
        def endpoint(ctx):
            raise RuntimeError("boom")

        chain = MiddlewareChain()
        with self.assertRaises(RuntimeError):
            chain.execute(_ctx(), endpoint)

    def test_outer_catches_inner_exception(self):
        def outer(ctx, next):
            try:
                return next()
            except ValueError:
                return Response(400, "caught")

        def inner(ctx, next):
            return next()

        def endpoint(ctx):
            raise ValueError("bad")

        chain = MiddlewareChain()
        chain.use(outer)
        chain.use(inner)
        resp = chain.execute(_ctx(), endpoint)
        self.assertEqual(resp.status, 400)
        self.assertEqual(resp.body, "caught")

    def test_chain_returns_endpoint_response(self):
        expected = Response(200, {"hello": "world"})

        def endpoint(ctx):
            return expected

        chain = MiddlewareChain()
        chain.use(lambda ctx, next: next())
        resp = chain.execute(_ctx(), endpoint)
        self.assertIs(resp, expected)

    def test_next_returns_response(self):
        seen = {}

        def outer(ctx, next):
            seen["resp"] = next()
            return seen["resp"]

        def endpoint(ctx):
            return Response(202, "accepted")

        chain = MiddlewareChain()
        chain.use(outer)
        resp = chain.execute(_ctx(), endpoint)
        self.assertIsInstance(seen["resp"], Response)
        self.assertEqual(seen["resp"].status, 202)
        self.assertIs(resp, seen["resp"])


if __name__ == "__main__":
    unittest.main()
