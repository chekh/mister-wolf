"""Тесты Router (спека §2, приложение B)."""

import unittest
from nanohttp import Router, RouteConflictError, MethodNotAllowedError
from nanohttp.ctx import Ctx, Response


class TestRouter(unittest.TestCase):
    """Тесты маршрутизатора."""

    def test_match_literal(self):
        """Литеральный маршрут совпадает точно."""
        r = Router()
        handler = lambda ctx: Response(200, "ok")
        r.add("GET", "/users", handler)
        m = r.match("GET", "/users")
        self.assertIsNotNone(m)
        self.assertIs(m.handler, handler)
        self.assertEqual(m.params, {})

    def test_match_params_decoded(self):
        """Percent-encoded значения параметров декодируются через unquote."""
        r = Router()
        handler = lambda ctx: Response(200)
        r.add("GET", "/users/:name", handler)
        m = r.match("GET", "/users/ann%20lee")
        self.assertIsNotNone(m)
        self.assertEqual(m.params, {"name": "ann lee"})

    def test_no_match_returns_none(self):
        """Несуществующий path возвращает None (не кидает NotFoundError)."""
        r = Router()
        r.add("GET", "/users", lambda ctx: Response())
        result = r.match("GET", "/posts")
        self.assertIsNone(result)

    def test_duplicate_route_conflict(self):
        """Дубликат method+path при add кидает RouteConflictError."""
        r = Router()
        r.add("GET", "/users", lambda ctx: Response())
        with self.assertRaises(RouteConflictError):
            r.add("GET", "/users", lambda ctx: Response())

    def test_wrong_method_raises_405_with_sorted_allowed(self):
        """Path совпал, метод нет → MethodNotAllowedError с .allowed (sorted)."""
        r = Router()
        r.add("GET", "/users", lambda ctx: Response())
        r.add("DELETE", "/users", lambda ctx: Response())
        r.add("POST", "/users", lambda ctx: Response())
        with self.assertRaises(MethodNotAllowedError) as ctx:
            r.match("PATCH", "/users")
        exc = ctx.exception
        self.assertEqual(exc.allowed, ["DELETE", "GET", "POST"])

    def test_case_insensitive_method(self):
        """Метод сравнивается регистронезависимо."""
        r = Router()
        handler = lambda ctx: Response()
        r.add("get", "/users", handler)
        m = r.match("GET", "/users")
        self.assertIsNotNone(m)
        self.assertIs(m.handler, handler)
        # И обратная сторона
        m2 = r.match("get", "/users")
        self.assertIsNotNone(m2)
        self.assertIs(m2.handler, handler)

    def test_case_sensitive_path(self):
        """Path регистрозависим — /Users и /users это разные пути."""
        r = Router()
        h1 = lambda ctx: Response(200, "upper")
        h2 = lambda ctx: Response(200, "lower")
        r.add("GET", "/Users", h1)
        r.add("GET", "/users", h2)
        m1 = r.match("GET", "/Users")
        self.assertIsNotNone(m1)
        self.assertIs(m1.handler, h1)
        m2 = r.match("GET", "/users")
        self.assertIsNotNone(m2)
        self.assertIs(m2.handler, h2)

    def test_trailing_slash_distinct(self):
        """Трейлинг-слэш создаёт отдельный path: /users и /users/ различаются."""
        r = Router()
        h_no_slash = lambda ctx: Response(200, "no-slash")
        h_slash = lambda ctx: Response(200, "slash")
        r.add("GET", "/users", h_no_slash)
        r.add("GET", "/users/", h_slash)
        m1 = r.match("GET", "/users")
        self.assertIsNotNone(m1)
        self.assertIs(m1.handler, h_no_slash)
        m2 = r.match("GET", "/users/")
        self.assertIsNotNone(m2)
        self.assertIs(m2.handler, h_slash)

    def test_empty_segment_not_matched(self):
        """:param НЕ матчит пустой сегмент."""
        r = Router()
        r.add("GET", "/x/:a", lambda ctx: Response())
        # Путь с пустым сегментом (двойной слэш)
        result = r.match("GET", "/x/")
        # "/x/" → split("/x/") → ["", "x", ""] → drop leading → ["x", ""]
        # Route "/x/:a" → ["x", (":a", param)]
        # Сегмент "" не матчит :param → None
        self.assertIsNone(result)

    def test_params_values(self):
        """Значения параметров корректно захватываются из нескольких сегментов."""
        r = Router()
        handler = lambda ctx: Response()
        r.add("GET", "/users/:id/posts/:postId", handler)
        m = r.match("GET", "/users/42/posts/99")
        self.assertIsNotNone(m)
        self.assertEqual(m.params, {"id": "42", "postId": "99"})


if __name__ == "__main__":
    unittest.main()
