"""Тесты маршрутизатора (спецификация §2)."""

import unittest
from urllib.parse import quote

from nanohttp import (
    MethodNotAllowedError,
    NotFoundError,
    Response,
    RouteConflictError,
    RouteMatch,
    Router,
)


def _ok(ctx):
    return Response(200, "ok")


class TestRouter(unittest.TestCase):
    def test_match_literal(self):
        r = Router()
        r.add("GET", "/hello", _ok)
        m = r.match("GET", "/hello")
        self.assertIsNotNone(m)
        self.assertIs(m.handler, _ok)
        self.assertEqual(m.params, {})

    def test_match_params_decoded(self):
        r = Router()
        r.add("GET", "/users/:id", _ok)
        m = r.match("GET", "/users/a%2Fb")
        self.assertIsNotNone(m)
        self.assertEqual(m.params["id"], "a/b")

    def test_no_match_returns_none(self):
        r = Router()
        r.add("GET", "/hello", _ok)
        self.assertIsNone(r.match("GET", "/bye"))

    def test_duplicate_route_conflict(self):
        r = Router()
        r.add("GET", "/x", _ok)
        with self.assertRaises(RouteConflictError):
            r.add("GET", "/x", _ok)

    def test_wrong_method_raises_405_with_sorted_allowed(self):
        r = Router()
        r.add("POST", "/items", _ok)
        r.add("DELETE", "/items", _ok)
        with self.assertRaises(MethodNotAllowedError) as cm:
            r.match("GET", "/items")
        self.assertEqual(cm.exception.allowed, sorted(["POST", "DELETE"]))

    def test_case_insensitive_method(self):
        r = Router()
        r.add("get", "/x", _ok)
        m = r.match("GET", "/x")
        self.assertIsNotNone(m)

    def test_case_sensitive_path(self):
        r = Router()
        r.add("GET", "/Users", _ok)
        self.assertIsNone(r.match("GET", "/users"))

    def test_trailing_slash_distinct(self):
        r = Router()
        r.add("GET", "/x", _ok)
        self.assertIsNone(r.match("GET", "/x/"))

    def test_empty_segment_not_matched(self):
        """Пустой сегмент не захватывается :param."""
        r = Router()
        r.add("GET", "/a/:b/c", _ok)
        # /a//c — второй сегмент пустой, :b не захватывается
        self.assertIsNone(r.match("GET", "/a//c"))

    def test_params_values(self):
        r = Router()
        r.add("GET", "/users/:id/posts/:postId", _ok)
        m = r.match("GET", "/users/42/posts/7")
        self.assertEqual(m.params["id"], "42")
        self.assertEqual(m.params["postId"], "7")


if __name__ == "__main__":
    unittest.main()
