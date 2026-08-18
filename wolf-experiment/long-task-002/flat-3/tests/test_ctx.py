"""Тесты контекста (спека §1, прил. B: test_ctx)."""
import unittest

from nanohttp import Ctx, Request, Response


class CtxTests(unittest.TestCase):
    def test_ctx_creates_default_response(self):
        ctx = Ctx(Request("GET", "/"))
        self.assertIsInstance(ctx.response, Response)
        self.assertEqual(ctx.response.status, 200)
        self.assertIsNone(ctx.response.body)
        self.assertEqual(ctx.response.headers, {})

    def test_state_and_params_independent(self):
        ctx = Ctx(Request("GET", "/"))
        self.assertEqual(ctx.state, {})
        self.assertEqual(ctx.params, {})
        ctx.state["a"] = 1
        ctx.params["b"] = 2
        # независимые словари: ключи не пересекаются
        self.assertNotIn("b", ctx.state)
        self.assertNotIn("a", ctx.params)
        self.assertIsNot(ctx.state, ctx.params)

    def test_request_defaults_empty_dicts(self):
        req = Request("POST", "/x")
        self.assertEqual(req.query, {})
        self.assertEqual(req.headers, {})
        self.assertEqual(req.body, {})
        # дефолтные словари — свежие на каждый экземпляр
        req2 = Request("POST", "/x")
        self.assertIsNot(req.query, req2.query)
        self.assertIsNot(req.headers, req2.headers)
        self.assertIsNot(req.body, req2.body)

    def test_response_defaults(self):
        resp = Response()
        self.assertEqual(resp.status, 200)
        self.assertIsNone(resp.body)
        self.assertEqual(resp.headers, {})


if __name__ == "__main__":
    unittest.main()
