"""Тесты маршрутизации (спека, раздел 2)."""

import unittest

from nanohttp import (
    MethodNotAllowedError,
    Response,
    RouteConflictError,
    Router,
)


def _handler(ctx):
    return Response(200, {"ok": True})


class TestRouter(unittest.TestCase):

    def setUp(self):
        self.router = Router()

    def test_match_literal(self):
        self.router.add("GET", "/users", _handler)
        match = self.router.match("GET", "/users")
        self.assertIsNotNone(match)
        self.assertIs(match.handler, _handler)
        self.assertEqual(match.params, {})

    def test_match_params_decoded(self):
        self.router.add("GET", "/files/:name", _handler)
        match = self.router.match("GET", "/files/john%20doe%20100%25")
        self.assertIsNotNone(match)
        self.assertEqual(match.params["name"], "john doe 100%")

    def test_no_match_returns_none(self):
        self.router.add("GET", "/users/:id", _handler)
        self.assertIsNone(self.router.match("GET", "/nope"))
        # другое число сегментов
        self.assertIsNone(self.router.match("GET", "/users/1/posts"))
        self.assertIsNone(self.router.match("GET", "/users"))

    def test_duplicate_route_conflict(self):
        self.router.add("GET", "/a", _handler)
        with self.assertRaises(RouteConflictError):
            self.router.add("GET", "/a", _handler)
        # тот же path другим методом — не конфликт
        self.router.add("POST", "/a", _handler)
        # тот же метод другим регистром — конфликт (нормализация метода)
        with self.assertRaises(RouteConflictError):
            self.router.add("get", "/a", _handler)

    def test_wrong_method_raises_405_with_sorted_allowed(self):
        # порядок регистрации намеренно «не сортированный»
        self.router.add("post", "/r", _handler)
        self.router.add("DELETE", "/r", _handler)
        self.router.add("get", "/r", _handler)
        with self.assertRaises(MethodNotAllowedError) as ctx:
            self.router.match("PUT", "/r")
        exc = ctx.exception
        self.assertEqual(exc.status, 405)
        self.assertEqual(exc.code, "method_not_allowed")
        self.assertEqual(exc.allowed, ["DELETE", "GET", "POST"])

    def test_case_insensitive_method(self):
        self.router.add("get", "/low", _handler)
        self.assertIsNotNone(self.router.match("GET", "/low"))
        self.router.add("POST", "/up", _handler)
        self.assertIsNotNone(self.router.match("post", "/up"))

    def test_case_sensitive_path(self):
        self.router.add("GET", "/Users", _handler)
        self.assertIsNotNone(self.router.match("GET", "/Users"))
        # другой регистр path — вообще не тот path (не 405, а None)
        self.assertIsNone(self.router.match("GET", "/users"))

    def test_trailing_slash_distinct(self):
        self.router.add("GET", "/x", _handler)
        self.assertIsNone(self.router.match("GET", "/x/"))
        self.router.add("GET", "/x/", _handler)  # отдельный path, не конфликт
        match = self.router.match("GET", "/x/")
        self.assertIsNotNone(match)

    def test_empty_segment_not_matched(self):
        self.router.add("GET", "/users/:id", _handler)
        self.assertIsNone(self.router.match("GET", "/users/"))
        self.assertIsNone(self.router.match("GET", "/users//7"))

    def test_params_values(self):
        self.router.add("GET", "/users/:uid/posts/:postId", _handler)
        match = self.router.match("GET", "/users/7/posts/42")
        self.assertIsNotNone(match)
        self.assertEqual(match.params, {"uid": "7", "postId": "42"})
        # литеральные сегменты должны совпасть точно
        self.assertIsNone(self.router.match("GET", "/users/7/comments/42"))


if __name__ == "__main__":
    unittest.main()
