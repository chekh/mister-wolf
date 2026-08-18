import unittest

from nanohttp import (
    MethodNotAllowedError,
    RouteConflictError,
    Router,
)


def _handler(ctx):
    return None


class TestRouter(unittest.TestCase):
    def test_match_literal(self):
        router = Router()
        router.add("GET", "/users/list", _handler)
        match = router.match("GET", "/users/list")
        self.assertIsNotNone(match)
        self.assertIs(match.handler, _handler)
        self.assertEqual(match.params, {})

    def test_match_params_decoded(self):
        router = Router()
        router.add("GET", "/files/:name", _handler)
        match = router.match("GET", "/files/my%20file.txt")
        self.assertEqual(match.params, {"name": "my file.txt"})
        router.add("GET", "/esc/:raw", _handler)
        match = router.match("GET", "/esc/a%2Fb")
        self.assertEqual(match.params, {"raw": "a/b"})

    def test_no_match_returns_none(self):
        router = Router()
        router.add("GET", "/users", _handler)
        self.assertIsNone(router.match("GET", "/nope"))
        self.assertIsNone(router.match("GET", "/users/extra"))

    def test_duplicate_route_conflict(self):
        router = Router()
        router.add("GET", "/users", _handler)
        with self.assertRaises(RouteConflictError):
            router.add("GET", "/users", _handler)
        # регистронезависимость метода: get == GET — тоже конфликт
        with self.assertRaises(RouteConflictError):
            router.add("get", "/users", _handler)
        # другой метод — не конфликт
        router.add("POST", "/users", _handler)

    def test_wrong_method_raises_405_with_sorted_allowed(self):
        router = Router()
        router.add("GET", "/res", _handler)
        router.add("POST", "/res", _handler)
        router.add("DELETE", "/res", _handler)
        with self.assertRaises(MethodNotAllowedError) as cm:
            router.match("PUT", "/res")
        self.assertEqual(cm.exception.status, 405)
        self.assertEqual(cm.exception.allowed, ["DELETE", "GET", "POST"])

    def test_case_insensitive_method(self):
        router = Router()
        router.add("get", "/lower", _handler)
        self.assertIsNotNone(router.match("GET", "/lower"))
        router.add("POST", "/upper", _handler)
        self.assertIsNotNone(router.match("post", "/upper"))
        self.assertIsNotNone(router.match("PoSt", "/upper"))

    def test_case_sensitive_path(self):
        router = Router()
        router.add("GET", "/Users", _handler)
        self.assertIsNone(router.match("GET", "/users"))
        router.add("GET", "/users", _handler)
        self.assertIsNotNone(router.match("GET", "/users"))
        self.assertIsNotNone(router.match("GET", "/Users"))

    def test_trailing_slash_distinct(self):
        router = Router()
        router.add("GET", "/users", _handler)
        self.assertIsNone(router.match("GET", "/users/"))
        router.add("GET", "/users/", _handler)
        self.assertIsNotNone(router.match("GET", "/users/"))

    def test_empty_segment_not_matched(self):
        router = Router()
        router.add("GET", "/users/:id", _handler)
        self.assertIsNone(router.match("GET", "/users/"))
        router.add("GET", "/a/:x/b/:y", _handler)
        self.assertIsNone(router.match("GET", "/a//b/5"))

    def test_params_values(self):
        router = Router()
        router.add("GET", "/users/:id/posts/:postId", _handler)
        match = router.match("GET", "/users/7/posts/abc")
        self.assertEqual(match.params, {"id": "7", "postId": "abc"})
        # литеральные сегменты вокруг параметров должны совпасть точно
        self.assertIsNone(router.match("GET", "/users/7/comments/abc"))


if __name__ == "__main__":
    unittest.main()
