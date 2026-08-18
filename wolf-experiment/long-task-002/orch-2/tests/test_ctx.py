"""Тесты контекста запроса/ответа (спецификация §1)."""

import unittest

from nanohttp import Ctx, Request, Response


class TestCtx(unittest.TestCase):
    def test_ctx_creates_default_response(self):
        req = Request("GET", "/")
        ctx = Ctx(req)
        self.assertIsInstance(ctx.response, Response)
        self.assertEqual(ctx.response.status, 200)
        self.assertIsNone(ctx.response.body)
        self.assertEqual(ctx.response.headers, {})

    def test_state_and_params_independent(self):
        req = Request("GET", "/")
        ctx = Ctx(req)
        ctx.state["a"] = 1
        ctx.params["b"] = 2
        self.assertNotIn("a", ctx.params)
        self.assertNotIn("b", ctx.state)

    def test_request_defaults_empty_dicts(self):
        req = Request("GET", "/")
        self.assertEqual(req.query, {})
        self.assertEqual(req.headers, {})
        self.assertEqual(req.body, {})

    def test_response_defaults(self):
        r = Response()
        self.assertEqual(r.status, 200)
        self.assertIsNone(r.body)
        self.assertEqual(r.headers, {})


if __name__ == "__main__":
    unittest.main()
