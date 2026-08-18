"""tests/test_ctx — тесты модуля ctx (spec.md §1)."""

import unittest

from nanohttp import Ctx, Request, Response


class TestCtx(unittest.TestCase):
    def test_ctx_creates_default_response(self) -> None:
        """Ctx автоматически создаёт Response() с дефолтами."""
        req = Request("GET", "/")
        ctx = Ctx(req)
        self.assertIsInstance(ctx.response, Response)
        self.assertEqual(ctx.response.status, 200)
        self.assertIsNone(ctx.response.body)

    def test_state_and_params_independent(self) -> None:
        """state и params — разные словари."""
        req = Request("GET", "/")
        ctx = Ctx(req)
        ctx.params["a"] = "1"
        ctx.state["b"] = "2"
        self.assertNotIn("a", ctx.state)
        self.assertNotIn("b", ctx.params)

    def test_request_defaults_empty_dicts(self) -> None:
        """Request с None-параметрами даёт пустые словари."""
        req = Request("POST", "/api")
        self.assertEqual(req.query, {})
        self.assertEqual(req.headers, {})
        self.assertEqual(req.body, {})

    def test_response_defaults(self) -> None:
        """Response с дефолтами: status=200, body=None, headers={}."""
        r = Response()
        self.assertEqual(r.status, 200)
        self.assertIsNone(r.body)
        self.assertEqual(r.headers, {})


if __name__ == "__main__":
    unittest.main()
