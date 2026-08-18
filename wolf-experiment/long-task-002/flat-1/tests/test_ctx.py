import unittest

from nanohttp import Ctx, Request, Response


class TestCtx(unittest.TestCase):
    def test_ctx_creates_default_response(self):
        ctx = Ctx(Request("GET", "/"))
        self.assertIsInstance(ctx.response, Response)
        self.assertEqual(ctx.response.status, 200)
        self.assertIsNone(ctx.response.body)
        self.assertEqual(ctx.response.headers, {})
        self.assertIs(ctx.request.method, "GET")

    def test_state_and_params_independent(self):
        ctx = Ctx(Request("GET", "/"))
        self.assertEqual(ctx.state, {})
        self.assertEqual(ctx.params, {})
        self.assertIsNot(ctx.state, ctx.params)
        ctx.state["k"] = "v"
        self.assertNotIn("k", ctx.params)
        ctx.params["id"] = "7"
        self.assertNotIn("id", ctx.state)
        other = Ctx(Request("GET", "/"))
        self.assertEqual(other.state, {})
        self.assertEqual(other.params, {})

    def test_request_defaults_empty_dicts(self):
        req = Request("GET", "/x")
        self.assertEqual(req.query, {})
        self.assertEqual(req.headers, {})
        self.assertEqual(req.body, {})
        self.assertIsNot(req.query, req.headers)
        req2 = Request("POST", "/y")
        self.assertIsNot(req.query, req2.query)
        req3 = Request("GET", "/z", query={"a": "1"}, headers={"h": "v"}, body={"b": 2})
        self.assertEqual(req3.query, {"a": "1"})
        self.assertEqual(req3.headers, {"h": "v"})
        self.assertEqual(req3.body, {"b": 2})

    def test_response_defaults(self):
        resp = Response()
        self.assertEqual(resp.status, 200)
        self.assertIsNone(resp.body)
        self.assertEqual(resp.headers, {})
        resp2 = Response(404, "nope", {"X-Tag": "t"})
        self.assertEqual(resp2.status, 404)
        self.assertEqual(resp2.body, "nope")
        self.assertEqual(resp2.headers, {"X-Tag": "t"})


if __name__ == "__main__":
    unittest.main()
