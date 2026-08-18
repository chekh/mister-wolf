"""tests/test_router — тесты модуля router (spec.md §2)."""

import unittest

from nanohttp import (
    MethodNotAllowedError,
    Request,
    Response,
    RouteConflictError,
    RouteMatch,
    Router,
)


class TestRouter(unittest.TestCase):
    def test_match_literal(self) -> None:
        """Литеральный путь совпадает."""
        router = Router()
        handler = lambda ctx: Response(200)
        router.add("GET", "/users", handler)
        match = router.match("GET", "/users")
        self.assertIsNotNone(match)
        assert match is not None
        self.assertIs(match.handler, handler)

    def test_match_params_decoded(self) -> None:
        """Параметры percent-decode."""
        router = Router()
        handler = lambda ctx: Response(200)
        router.add("GET", "/items/:x", handler)
        match = router.match("GET", "/items/a%20b")
        self.assertIsNotNone(match)
        assert match is not None
        self.assertEqual(match.params["x"], "a b")

    def test_no_match_returns_none(self) -> None:
        """Нет совпадения path → None."""
        router = Router()
        router.add("GET", "/users", lambda ctx: Response(200))
        result = router.match("GET", "/posts")
        self.assertIsNone(result)

    def test_duplicate_route_conflict(self) -> None:
        """Дубликат (method, path) → RouteConflictError."""
        router = Router()
        router.add("GET", "/users", lambda ctx: Response(200))
        with self.assertRaises(RouteConflictError):
            router.add("GET", "/users", lambda ctx: Response(201))

    def test_wrong_method_raises_405_with_sorted_allowed(self) -> None:
        """Path совпал, method нет → MethodNotAllowedError с sorted allowed."""
        router = Router()
        router.add("GET", "/items", lambda ctx: Response(200))
        router.add("POST", "/items", lambda ctx: Response(201))
        router.add("DELETE", "/items", lambda ctx: Response(204))
        with self.assertRaises(MethodNotAllowedError) as cm:
            router.match("PUT", "/items")
        self.assertEqual(cm.exception.allowed, ["DELETE", "GET", "POST"])

    def test_case_insensitive_method(self) -> None:
        """Регистр method нечувствителен."""
        router = Router()
        router.add("get", "/x", lambda ctx: Response(200))
        match = router.match("GET", "/x")
        self.assertIsNotNone(match)

    def test_case_sensitive_path(self) -> None:
        """Регистр path чувствителен."""
        router = Router()
        router.add("GET", "/Users", lambda ctx: Response(200))
        match = router.match("GET", "/users")
        self.assertIsNone(match)

    def test_trailing_slash_distinct(self) -> None:
        """Трейлинг-слэш — отдельный path."""
        router = Router()
        router.add("GET", "/users", lambda ctx: Response(200))
        match = router.match("GET", "/users/")
        self.assertIsNone(match)

    def test_empty_segment_not_matched(self) -> None:
        """Пустой сегмент не захватывается параметром."""
        router = Router()
        router.add("GET", "/a/:x/b", lambda ctx: Response(200))
        # /a//b → средний сегмент пустой
        match = router.match("GET", "/a//b")
        self.assertIsNone(match)

    def test_params_values(self) -> None:
        """Значения параметров корректно извлекаются."""
        router = Router()
        handler = lambda ctx: Response(200)
        router.add("GET", "/users/:id/posts/:postId", handler)
        match = router.match("GET", "/users/42/posts/99")
        self.assertIsNotNone(match)
        assert match is not None
        self.assertEqual(match.params["id"], "42")
        self.assertEqual(match.params["postId"], "99")


if __name__ == "__main__":
    unittest.main()
