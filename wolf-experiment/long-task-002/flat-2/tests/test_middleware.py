"""Тесты цепочки middleware (спека, раздел 3)."""

import unittest

from nanohttp import Ctx, MiddlewareChain, Request, Response


def _ctx():
    return Ctx(Request("GET", "/"))


def _endpoint(ctx):
    return Response(200, {"from": "endpoint"})


class TestMiddleware(unittest.TestCase):

    def setUp(self):
        self.chain = MiddlewareChain()

    def test_order_before(self):
        calls = []

        def mw1(ctx, next):
            calls.append("m1-before")
            return next()

        def mw2(ctx, next):
            calls.append("m2-before")
            return next()

        def endpoint(ctx):
            calls.append("endpoint")
            return Response(200, "ok")

        self.chain.use(mw1)
        self.chain.use(mw2)
        self.chain.execute(_ctx(), endpoint)
        self.assertEqual(calls[:3], ["m1-before", "m2-before", "endpoint"])

    def test_order_after(self):
        calls = []

        def mw1(ctx, next):
            calls.append("m1-before")
            response = next()
            calls.append("m1-after")
            return response

        def mw2(ctx, next):
            calls.append("m2-before")
            response = next()
            calls.append("m2-after")
            return response

        def endpoint(ctx):
            calls.append("endpoint")
            return Response(200, "ok")

        self.chain.use(mw1)
        self.chain.use(mw2)
        self.chain.execute(_ctx(), endpoint)
        self.assertEqual(
            calls,
            ["m1-before", "m2-before", "endpoint", "m2-after", "m1-after"],
        )

    def test_short_circuit(self):
        calls = []

        def guard(ctx, next):
            return Response(403, {"error": "forbidden"})

        def inner(ctx, next):
            calls.append("inner")
            return next()

        def endpoint(ctx):
            calls.append("endpoint")
            return Response(200, "ok")

        self.chain.use(guard)
        self.chain.use(inner)
        response = self.chain.execute(_ctx(), endpoint)
        self.assertEqual(response.status, 403)
        self.assertEqual(calls, [])  # ни внутренний mw, ни endpoint не звались

    def test_endpoint_called_when_empty_chain(self):
        seen = {}

        def endpoint(ctx):
            seen["ctx"] = ctx
            return Response(201, "created")

        response = self.chain.execute(_ctx(), endpoint)
        self.assertEqual(response.status, 201)
        self.assertEqual(response.body, "created")
        self.assertIn("ctx", seen)

    def test_error_propagates_to_outer(self):
        def mw(ctx, next):
            return next()  # без try — исключение летит дальше наружу

        def endpoint(ctx):
            raise RuntimeError("endpoint boom")

        self.chain.use(mw)
        with self.assertRaises(RuntimeError):
            self.chain.execute(_ctx(), endpoint)

    def test_outer_catches_inner_exception(self):
        def outer(ctx, next):
            try:
                return next()
            except ValueError:
                return Response(200, "caught")

        def inner(ctx, next):
            raise ValueError("inner boom")

        self.chain.use(outer)
        self.chain.use(inner)
        response = self.chain.execute(_ctx(), _endpoint)
        self.assertEqual(response.status, 200)
        self.assertEqual(response.body, "caught")

    def test_chain_returns_endpoint_response(self):
        endpoint_response = Response(203, "from endpoint")

        def mw(ctx, next):
            return next()

        self.chain.use(mw)
        result = self.chain.execute(_ctx(), lambda ctx: endpoint_response)
        self.assertIs(result, endpoint_response)

    def test_next_returns_response(self):
        seen = {}

        def mw(ctx, next):
            response = next()
            seen["response"] = response
            response.status = 299  # модификация ответа до возврата наружу
            return response

        self.chain.use(mw)
        result = self.chain.execute(_ctx(), _endpoint)
        self.assertIsInstance(seen["response"], Response)
        self.assertIs(seen["response"], result)
        self.assertEqual(result.status, 299)


if __name__ == "__main__":
    unittest.main()
