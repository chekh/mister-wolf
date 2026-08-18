"""Тесты маршрутизации (спека §2, прил. B: test_router)."""
import unittest

from nanohttp import MethodNotAllowedError, Response, RouteConflictError, Router


def _ok(ctx):
    return Response(200, "ok")


class RouterTests(unittest.TestCase):
    def setUp(self):
        self.router = Router()

    def test_match_literal(self):
        self.router.add("GET", "/users/list", _ok)
        match = self.router.match("GET", "/users/list")
        self.assertIsNotNone(match)
        self.assertIs(match.handler, _ok)
        self.assertEqual(match.params, {})
        self.assertIsNone(self.router.match("GET", "/users/other"))

    def test_match_params_decoded(self):
        self.router.add("GET", "/files/:name", _ok)
        match = self.router.match("GET", "/files/a%20b%2Fc")
        self.assertEqual(match.params, {"name": "a b/c"})

    def test_no_match_returns_none(self):
        self.router.add("GET", "/a", _ok)
        self.assertIsNone(self.router.match("GET", "/b"))
        self.assertIsNone(self.router.match("GET", "/a/b"))

    def test_duplicate_route_conflict(self):
        self.router.add("GET", "/a", _ok)
        with self.assertRaises(RouteConflictError):
            self.router.add("GET", "/a", _ok)
        # тот же path другим методом — не конфликт
        self.router.add("POST", "/a", _ok)
        # регистронезависимый метод тоже конфликтует
        with self.assertRaises(RouteConflictError):
            self.router.add("get", "/a", _ok)

    def test_wrong_method_raises_405_with_sorted_allowed(self):
        self.router.add("POST", "/x", _ok)
        self.router.add("get", "/x", _ok)
        self.router.add("DELETE", "/x", _ok)
        with self.assertRaises(MethodNotAllowedError) as cm:
            self.router.match("PUT", "/x")
        self.assertEqual(cm.exception.allowed, ["DELETE", "GET", "POST"])
        self.assertEqual(cm.exception.status, 405)

    def test_case_insensitive_method(self):
        self.router.add("get", "/x", _ok)
        self.assertIsNotNone(self.router.match("GET", "/x"))
        self.router.add("POST", "/y", _ok)
        self.assertIsNotNone(self.router.match("post", "/y"))

    def test_case_sensitive_path(self):
        self.router.add("GET", "/Users", _ok)
        self.assertIsNone(self.router.match("GET", "/users"))

    def test_trailing_slash_distinct(self):
        self.router.add("GET", "/items", _ok)
        # трейлинг-слэш — отдельный path, не конфликт
        self.router.add("GET", "/items/", _ok)
        self.assertIsNotNone(self.router.match("GET", "/items"))
        self.assertIsNotNone(self.router.match("GET", "/items/"))

    def test_empty_segment_not_matched(self):
        self.router.add("GET", "/users/:id", _ok)
        self.assertIsNone(self.router.match("GET", "/users/"))

    def test_params_values(self):
        self.router.add("GET", "/users/:id/posts/:postId", _ok)
        match = self.router.match("GET", "/users/7/posts/abc")
        self.assertEqual(match.params, {"id": "7", "postId": "abc"})
        # число сегментов должно совпадать точно
        self.assertIsNone(self.router.match("GET", "/users/7/posts"))
        self.assertIsNone(self.router.match("GET", "/users/7/posts/abc/extra"))


if __name__ == "__main__":
    unittest.main()
