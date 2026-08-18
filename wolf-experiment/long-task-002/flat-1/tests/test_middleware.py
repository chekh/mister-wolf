import unittest

from nanohttp import Ctx, MiddlewareChain, Request, Response


class TestMiddleware(unittest.TestCase):
    def _ctx(self):
        return Ctx(Request("GET", "/"))

    def test_order_before(self):
        chain = MiddlewareChain()
        order = []
        chain.use(lambda ctx, next: order.append("mw1") or next())
        chain.use(lambda ctx, next: order.append("mw2") or next())
        chain.execute(self._ctx(), lambda ctx: order.append("endpoint") or Response())
        self.assertEqual(order, ["mw1", "mw2", "endpoint"])

    def test_order_after(self):
        chain = MiddlewareChain()
        order = []
        chain.use(
            lambda ctx, next: (order.append("mw1-before"), next(), order.append("mw1-after"))[2]
        )
        chain.use(
            lambda ctx, next: (order.append("mw2-before"), next(), order.append("mw2-after"))[2]
        )
        chain.execute(self._ctx(), lambda ctx: order.append("endpoint") or Response())
        # разворачивание: код после next() у внешнего — ПОСЛЕ внутреннего
        self.assertEqual(
            order,
            ["mw1-before", "mw2-before", "endpoint", "mw2-after", "mw1-after"],
        )

    def test_short_circuit(self):
        chain = MiddlewareChain()
        called = {"inner": False, "endpoint": False}
        short = Response(201, "short")

        def outer(ctx, next):
            return short

        def inner(ctx, next):
            called["inner"] = True
            return next()

        def endpoint(ctx):
            called["endpoint"] = True
            return Response()

        chain.use(outer)
        chain.use(inner)
        result = chain.execute(self._ctx(), endpoint)
        self.assertIs(result, short)
        self.assertFalse(called["inner"])
        self.assertFalse(called["endpoint"])

    def test_endpoint_called_when_empty_chain(self):
        chain = MiddlewareChain()
        endpoint_response = Response(200, "ok")
        result = chain.execute(self._ctx(), lambda ctx: endpoint_response)
        self.assertIs(result, endpoint_response)

    def test_error_propagates_to_outer(self):
        chain = MiddlewareChain()
        boom = RuntimeError("boom")

        def outer(ctx, next):  # без try/except — исключение должно вылететь
            return next()

        def inner(ctx, next):
            raise boom

        chain.use(outer)
        chain.use(inner)
        with self.assertRaises(RuntimeError) as cm:
            chain.execute(self._ctx(), lambda ctx: Response())
        self.assertIs(cm.exception, boom)

    def test_outer_catches_inner_exception(self):
        chain = MiddlewareChain()
        caught = {}

        def outer(ctx, next):
            try:
                return next()
            except ValueError as exc:
                caught["exc"] = exc
                return Response(200, "caught")

        def inner(ctx, next):
            raise ValueError("inner boom")

        chain.use(outer)
        chain.use(inner)
        result = chain.execute(self._ctx(), lambda ctx: Response())
        self.assertEqual(result.status, 200)
        self.assertEqual(result.body, "caught")
        self.assertEqual(caught["exc"].args[0], "inner boom")

    def test_chain_returns_endpoint_response(self):
        chain = MiddlewareChain()
        chain.use(lambda ctx, next: next())
        chain.use(lambda ctx, next: next())
        endpoint_response = Response(201, "created")
        result = chain.execute(self._ctx(), lambda ctx: endpoint_response)
        self.assertIs(result, endpoint_response)

    def test_next_returns_response(self):
        chain = MiddlewareChain()
        endpoint_response = Response(200, "from-endpoint")
        seen = {}

        def mw(ctx, next):
            seen["resp"] = next()
            return seen["resp"]

        chain.use(mw)
        result = chain.execute(self._ctx(), lambda ctx: endpoint_response)
        self.assertIs(seen["resp"], endpoint_response)
        self.assertIs(result, endpoint_response)


if __name__ == "__main__":
    unittest.main()
