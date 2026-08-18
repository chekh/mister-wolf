"""Смоук-тесты приложения (фреймворк-агностичные)."""
from __future__ import annotations

import unittest

from app.factory import create_app


class TestHealth(unittest.TestCase):
    def test_health(self) -> None:
        res = create_app().handle("GET", "/health")
        self.assertEqual(res.status, 200)
        self.assertEqual(res.payload["status"], "ok")

    def test_unknown_route_404(self) -> None:
        res = create_app().handle("GET", "/nope")
        self.assertEqual(res.status, 404)


if __name__ == "__main__":
    unittest.main()
