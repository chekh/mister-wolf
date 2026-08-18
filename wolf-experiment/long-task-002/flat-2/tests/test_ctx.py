"""Тесты контекста (спека, раздел 1)."""

import unittest

from nanohttp import Ctx, Request, Response


class TestCtx(unittest.TestCase):

    def test_ctx_creates_default_response(self):
        ctx = Ctx(Request("GET", "/"))
        self.assertIsInstance(ctx.response, Response)
        self.assertEqual(ctx.response.status, 200)
        self.assertIsNone(ctx.response.body)
        self.assertEqual(ctx.response.headers, {})
        self.assertIs(ctx.request, ctx.request)

    def test_state_and_params_independent(self):
        ctx = Ctx(Request("GET", "/"))
        self.assertIsInstance(ctx.params, dict)
        self.assertIsInstance(ctx.state, dict)
        self.assertIsNot(ctx.params, ctx.state)
        ctx.params["id"] = "7"
        ctx.state["user"] = "ann"
        self.assertEqual(ctx.params, {"id": "7"})
        self.assertEqual(ctx.state, {"user": "ann"})
        self.assertNotIn("user", ctx.params)
        self.assertNotIn("id", ctx.state)

    def test_request_defaults_empty_dicts(self):
        request = Request("GET", "/items")
        self.assertEqual(request.method, "GET")
        self.assertEqual(request.path, "/items")
        self.assertEqual(request.query, {})
        self.assertEqual(request.headers, {})
        self.assertEqual(request.body, {})
        # дефолты не шарятся между инстансами
        request.query["a"] = "1"
        other = Request("POST", "/items")
        self.assertEqual(other.query, {})

    def test_response_defaults(self):
        response = Response()
        self.assertEqual(response.status, 200)
        self.assertIsNone(response.body)
        self.assertEqual(response.headers, {})


if __name__ == "__main__":
    unittest.main()
