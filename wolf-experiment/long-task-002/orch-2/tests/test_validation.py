"""Тесты валидации (спецификация §5)."""

import unittest

from nanohttp import Field, ValidationError, validate


class TestValidation(unittest.TestCase):
    def test_missing_required(self):
        schema = {"name": Field("str", required=True)}
        with self.assertRaises(ValidationError) as cm:
            validate({}, schema)
        self.assertEqual(cm.exception.errors[0]["field"], "name")
        self.assertEqual(cm.exception.errors[0]["message"], "missing field")

    def test_optional_default(self):
        schema = {"name": Field("str", required=False, default="anon")}
        result = validate({}, schema)
        self.assertEqual(result, {"name": "anon"})

    def test_str_min_len(self):
        schema = {"name": Field("str", min_len=3)}
        # too short
        with self.assertRaises(ValidationError):
            validate({"name": "ab"}, schema)
        # exactly min_len — passes
        result = validate({"name": "abc"}, schema)
        self.assertEqual(result["name"], "abc")

    def test_int_rejects_bool(self):
        schema = {"flag": Field("int")}
        with self.assertRaises(ValidationError):
            validate({"flag": True}, schema)

    def test_int_ge_le(self):
        schema = {"age": Field("int", ge=0, le=150)}
        # in range
        result = validate({"age": 0}, schema)
        self.assertEqual(result["age"], 0)
        result = validate({"age": 150}, schema)
        self.assertEqual(result["age"], 150)
        # below ge
        with self.assertRaises(ValidationError):
            validate({"age": -1}, schema)
        # above le
        with self.assertRaises(ValidationError):
            validate({"age": 151}, schema)

    def test_bool_kind(self):
        schema = {"ok": Field("bool")}
        result = validate({"ok": True}, schema)
        self.assertTrue(result["ok"])
        with self.assertRaises(ValidationError):
            validate({"ok": "yes"}, schema)

    def test_email_valid_invalid(self):
        schema = {"email": Field("email")}
        # valid
        result = validate({"email": "a@b.c"}, schema)
        self.assertEqual(result["email"], "a@b.c")
        # invalid cases
        for bad in ["a@b", "a@@b.c", "@b.c", "a@"]:
            with self.subTest(bad=bad), self.assertRaises(ValidationError):
                validate({"email": bad}, schema)

    def test_choices(self):
        schema = {"role": Field("str", choices=["admin", "user"])}
        result = validate({"role": "admin"}, schema)
        self.assertEqual(result["role"], "admin")
        with self.assertRaises(ValidationError):
            validate({"role": "guest"}, schema)

    def test_multiple_errors_collected(self):
        """Несколько битых полей → ОДИН ValidationError со всеми ошибками."""
        schema = {
            "name": Field("str", required=True),
            "age": Field("int", required=True),
        }
        with self.assertRaises(ValidationError) as cm:
            validate({}, schema)
        self.assertEqual(len(cm.exception.errors), 2)
        fields = {e["field"] for e in cm.exception.errors}
        self.assertEqual(fields, {"name", "age"})


if __name__ == "__main__":
    unittest.main()
