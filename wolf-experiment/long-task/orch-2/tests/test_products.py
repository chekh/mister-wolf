"""Интеграционные тесты домена products (фреймворк-агностичные: только handle())."""
from __future__ import annotations

import unittest

from app.factory import create_app

APP = create_app()


def call(method: str, path: str, body: dict | None = None) -> tuple[int, object]:
    res = APP.handle(method, path, body or {})
    return res.status, res.payload


def valid_body(suffix: str = "x1") -> dict:
    return {
        "sku": f"@products-sku-{suffix}",
        "title": f"@products-title-{suffix}",
        "price": 7,
        "currency": f"@products-currency-{suffix}",
        "stock": 7,
    }


class TestProducts(unittest.TestCase):
    def test_create_ok(self) -> None:
        status, payload = call("POST", "/products", valid_body())
        self.assertEqual(status, 201)
        self.assertIn("id", payload)
        self.assertIn("created_at", payload)

    def test_create_missing_field_400(self) -> None:
        body = valid_body()
        body.pop("sku")
        status, payload = call("POST", "/products", body)
        self.assertEqual(status, 400)
        self.assertEqual(payload["error"], "validation")

    def test_create_wrong_type_400(self) -> None:
        body = valid_body()
        body["price"] = "not-an-int"
        status, _ = call("POST", "/products", body)
        self.assertEqual(status, 400)

    def test_create_conflict_409(self) -> None:
        call("POST", "/products", valid_body("dup"))
        status, payload = call("POST", "/products", valid_body("dup"))
        self.assertEqual(status, 409)
        self.assertEqual(payload["error"], "conflict")

    def test_get_ok(self) -> None:
        status, payload = call("GET", "/products/1")
        self.assertEqual(status, 200)
        self.assertEqual(payload["id"], 1)

    def test_get_missing_404(self) -> None:
        status, payload = call("GET", "/products/99999")
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"], "not_found")

    def test_patch_ok(self) -> None:
        status, payload = call("PATCH", "/products/2", {"sku": f"patched-1"})
        self.assertEqual(status, 200)
        self.assertIn("updated_at", payload)

    def test_patch_invalid_400(self) -> None:
        status, _ = call("PATCH", "/products/2", {"price": "not-an-int"})
        self.assertEqual(status, 400)

    def test_create_forbidden_403(self) -> None:
        body = {**valid_body("rbac"), "_actor_role": "viewer"}
        status, payload = call("POST", "/products", body)
        self.assertEqual(status, 403)
        self.assertEqual(payload["error"], "forbidden")

    def test_patch_empty_body_ok(self) -> None:
        status, payload = call("PATCH", "/products/1", {})
        self.assertEqual(status, 200)
        self.assertIn("revision", payload)

    def test_get_non_numeric_id_404(self) -> None:
        status, payload = call("GET", "/products/not-a-number")
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"], "not_found")


if __name__ == "__main__":
    unittest.main()
