"""Интеграционные тесты домена billings (фреймворк-агностичные: только handle())."""
from __future__ import annotations

import unittest

from app.factory import create_app

APP = create_app()


def call(method: str, path: str, body: dict | None = None) -> tuple[int, object]:
    res = APP.handle(method, path, body or {})
    return res.status, res.payload


def valid_body(suffix: str = "x1") -> dict:
    return {
        "invoice": f"@billings-invoice-{suffix}",
        "customer": f"@billings-customer-{suffix}",
        "amount": 7,
        "method": f"@billings-method-{suffix}",
        "attempts": 7,
    }


class TestBillings(unittest.TestCase):
    def test_create_ok(self) -> None:
        status, payload = call("POST", "/billings", valid_body())
        self.assertEqual(status, 201)
        self.assertIn("id", payload)
        self.assertIn("created_at", payload)

    def test_create_missing_field_400(self) -> None:
        body = valid_body()
        body.pop("invoice")
        status, payload = call("POST", "/billings", body)
        self.assertEqual(status, 400)
        self.assertEqual(payload["error"], "validation")

    def test_create_wrong_type_400(self) -> None:
        body = valid_body()
        body["amount"] = "not-an-int"
        status, _ = call("POST", "/billings", body)
        self.assertEqual(status, 400)

    def test_create_conflict_409(self) -> None:
        call("POST", "/billings", valid_body("dup"))
        status, payload = call("POST", "/billings", valid_body("dup"))
        self.assertEqual(status, 409)
        self.assertEqual(payload["error"], "conflict")

    def test_get_ok(self) -> None:
        status, payload = call("GET", "/billings/1")
        self.assertEqual(status, 200)
        self.assertEqual(payload["id"], 1)

    def test_get_missing_404(self) -> None:
        status, payload = call("GET", "/billings/99999")
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"], "not_found")

    def test_patch_ok(self) -> None:
        status, payload = call("PATCH", "/billings/2", {"invoice": f"patched-1"})
        self.assertEqual(status, 200)
        self.assertIn("updated_at", payload)

    def test_patch_invalid_400(self) -> None:
        status, _ = call("PATCH", "/billings/2", {"amount": "not-an-int"})
        self.assertEqual(status, 400)

    def test_create_forbidden_403(self) -> None:
        body = {**valid_body("rbac"), "_actor_role": "viewer"}
        status, payload = call("POST", "/billings", body)
        self.assertEqual(status, 403)
        self.assertEqual(payload["error"], "forbidden")

    def test_patch_empty_body_ok(self) -> None:
        status, payload = call("PATCH", "/billings/1", {})
        self.assertEqual(status, 200)
        self.assertIn("revision", payload)

    def test_get_non_numeric_id_404(self) -> None:
        status, payload = call("GET", "/billings/not-a-number")
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"], "not_found")


if __name__ == "__main__":
    unittest.main()
