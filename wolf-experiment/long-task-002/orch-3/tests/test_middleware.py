"""Тесты MiddlewareChain (спека §3, приложение B)."""

import unittest
from nanohttp import MiddlewareChain, Ctx, Request, Response


class TestMiddleware(unittest.TestCase):
    """Тесты цепочки middleware."""

    def test_order_before(self):
        """Внешний middleware выполняется ПЕРЕД внутренним (до вызова next())."""
        order: list[str] = []

        def mw_outer(ctx, next):
            order.append("outer-before")
            result = next()
            order.append("outer-after")
            return result

        def mw_inner(ctx, next):
            order.append("inner-before")
            result = next()
            order.append("inner-after")
            return result

        def endpoint(ctx):
            order.append("endpoint")
            return Response(200)

        chain = MiddlewareChain()
        chain.use(mw_outer)
        chain.use(mw_inner)

        ctx = Ctx(Request("GET", "/"))
        chain.execute(ctx, endpoint)

        self.assertEqual(order, [
            "outer-before", "inner-before", "endpoint",
            "inner-after", "outer-after",
        ])

    def test_order_after(self):
        """Код ПОСЛЕ next() разворачивается в обратном порядке."""
        order: list[str] = []

        def mw_a(ctx, next):
            order.append("a-before")
            result = next()
            order.append("a-after")
            return result

        def mw_b(ctx, next):
            order.append("b-before")
            result = next()
            order.append("b-after")
            return result

        def endpoint(ctx):
            return Response(200)

        chain = MiddlewareChain()
        chain.use(mw_a)
        chain.use(mw_b)

        ctx = Ctx(Request("GET", "/"))
        chain.execute(ctx, endpoint)

        # Порядок: a-before, b-before, b-after, a-after (endpoint не добавляет)
        self.assertEqual(order[2], "b-after")
        self.assertEqual(order[3], "a-after")

    def test_short_circuit(self):
        """Middleware может не вызывать next() — short-circuit."""
        called: list[str] = []

        def mw_short(ctx, next):
            called.append("mw")
            return Response(403, "forbidden")

        def endpoint(ctx):
            called.append("endpoint")
            return Response(200)

        chain = MiddlewareChain()
        chain.use(mw_short)

        ctx = Ctx(Request("GET", "/"))
        resp = chain.execute(ctx, endpoint)

        self.assertEqual(called, ["mw"])
        self.assertEqual(resp.status, 403)

    def test_endpoint_called_when_empty_chain(self):
        """Пустая цепочка — execute сразу зовёт endpoint."""
        called = False

        def endpoint(ctx):
            nonlocal called
            called = True
            return Response(201)

        chain = MiddlewareChain()
        ctx = Ctx(Request("GET", "/"))
        resp = chain.execute(ctx, endpoint)

        self.assertTrue(called)
        self.assertEqual(resp.status, 201)

    def test_error_propagates_to_outer(self):
        """Исключение из внутреннего пробрасывается наружу (не ловится)."""
        def mw_outer(ctx, next):
            return next()  # не ловит

        def mw_inner(ctx, next):
            raise RuntimeError("boom")

        def endpoint(ctx):
            return Response(200)

        chain = MiddlewareChain()
        chain.use(mw_outer)
        chain.use(mw_inner)

        ctx = Ctx(Request("GET", "/"))
        with self.assertRaises(RuntimeError):
            chain.execute(ctx, endpoint)

    def test_outer_catches_inner_exception(self):
        """Исключение из внутреннего ловится try/except вокруг next() во внешнем."""
        caught: list[str] = []

        def mw_outer(ctx, next):
            try:
                return next()
            except ValueError as e:
                caught.append(str(e))
                return Response(500, f"caught: {e}")

        def mw_inner(ctx, next):
            raise ValueError("inner-error")

        def endpoint(ctx):
            return Response(200)

        chain = MiddlewareChain()
        chain.use(mw_outer)
        chain.use(mw_inner)

        ctx = Ctx(Request("GET", "/"))
        resp = chain.execute(ctx, endpoint)

        self.assertEqual(caught, ["inner-error"])
        self.assertEqual(resp.status, 500)

    def test_chain_returns_endpoint_response(self):
        """Цепочка возвращает Response от endpoint через все middleware."""
        def mw(ctx, next):
            return next()

        def endpoint(ctx):
            return Response(201, {"result": "created"})

        chain = MiddlewareChain()
        chain.use(mw)

        ctx = Ctx(Request("GET", "/"))
        resp = chain.execute(ctx, endpoint)

        self.assertEqual(resp.status, 201)
        self.assertEqual(resp.body, {"result": "created"})

    def test_next_returns_response(self):
        """next() возвращает Response от следующего слоя/endpoint."""
        next_response: Response | None = None

        def mw(ctx, next):
            nonlocal next_response
            next_response = next()
            return next_response

        def endpoint(ctx):
            return Response(200, "hello")

        chain = MiddlewareChain()
        chain.use(mw)

        ctx = Ctx(Request("GET", "/"))
        resp = chain.execute(ctx, endpoint)

        self.assertIsNotNone(next_response)
        self.assertEqual(next_response.status, 200)
        self.assertEqual(next_response.body, "hello")
        # chain.execute тоже возвращает тот же Response
        self.assertIs(resp, next_response)


if __name__ == "__main__":
    unittest.main()
