"""Тесты модуля validation.py (spec.md §5)."""

import unittest

from nanohttp import Field, ValidationError, validate


class TestMissingRequired(unittest.TestCase):
    """test_missing_required"""

    def test_missing_required(self):
        schema = {"name": Field("str")}
        with self.assertRaises(ValidationError) as ctx:
            validate({}, schema)
        errs = ctx.exception.errors
        self.assertEqual(len(errs), 1)
        self.assertEqual(errs[0]["field"], "name")
        self.assertEqual(errs[0]["message"], "missing field")


class TestOptionalDefault(unittest.TestCase):
    """test_optional_default"""

    def test_optional_default(self):
        schema = {"nickname": Field("str", required=False, default="guest")}
        result = validate({}, schema)
        self.assertEqual(result, {"nickname": "guest"})

    def test_optional_default_none(self):
        schema = {"note": Field("str", required=False, default=None)}
        result = validate({}, schema)
        self.assertEqual(result, {"note": None})


class TestStrMinLen(unittest.TestCase):
    """test_str_min_len"""

    def test_str_min_len(self):
        schema = {"name": Field("str", min_len=2)}
        result = validate({"name": "ab"}, schema)
        self.assertEqual(result, {"name": "ab"})

        schema = {"name": Field("str", min_len=5)}
        with self.assertRaises(ValidationError) as ctx:
            validate({"name": "hi"}, schema)
        errs = ctx.exception.errors
        self.assertEqual(len(errs), 1)
        self.assertEqual(errs[0]["field"], "name")
        self.assertIn("too short", errs[0]["message"])


class TestIntRejectsBool(unittest.TestCase):
    """test_int_rejects_bool"""

    def test_int_rejects_bool(self):
        schema = {"flag": Field("int")}
        with self.assertRaises(ValidationError) as ctx:
            validate({"flag": True}, schema)
        errs = ctx.exception.errors
        self.assertEqual(len(errs), 1)
        self.assertEqual(errs[0]["field"], "flag")

    def test_int_ok(self):
        schema = {"count": Field("int")}
        result = validate({"count": 42}, schema)
        self.assertEqual(result, {"count": 42})


class TestIntGeLe(unittest.TestCase):
    """test_int_ge_le"""

    def test_int_ge_le(self):
        schema = {"age": Field("int", ge=0)}
        result = validate({"age": 5}, schema)
        self.assertEqual(result, {"age": 5})

        schema = {"age": Field("int", ge=18)}
        with self.assertRaises(ValidationError):
            validate({"age": 10}, schema)

        schema = {"age": Field("int", le=100)}
        result = validate({"age": 50}, schema)
        self.assertEqual(result, {"age": 50})

        schema = {"age": Field("int", le=10)}
        with self.assertRaises(ValidationError):
            validate({"age": 20}, schema)


class TestBoolKind(unittest.TestCase):
    """test_bool_kind"""

    def test_bool_kind(self):
        schema = {"active": Field("bool")}
        result = validate({"active": True}, schema)
        self.assertEqual(result, {"active": True})

        schema = {"active": Field("bool")}
        with self.assertRaises(ValidationError):
            validate({"active": "yes"}, schema)


class TestEmailValidInvalid(unittest.TestCase):
    """test_email_valid_invalid"""

    def test_email_valid_invalid(self):
        # valid
        schema = {"addr": Field("email")}
        result = validate({"addr": "user@example.com"}, schema)
        self.assertEqual(result, {"addr": "user@example.com"})

        # invalid: no @
        schema = {"addr": Field("email")}
        with self.assertRaises(ValidationError):
            validate({"addr": "userexample.com"}, schema)

        # invalid: empty local part
        schema = {"addr": Field("email")}
        with self.assertRaises(ValidationError):
            validate({"addr": "@example.com"}, schema)

        # invalid: no dot in domain
        schema = {"addr": Field("email")}
        with self.assertRaises(ValidationError):
            validate({"addr": "user@localhost"}, schema)

        # invalid: two @
        schema = {"addr": Field("email")}
        with self.assertRaises(ValidationError):
            validate({"addr": "user@@example.com"}, schema)


class TestChoices(unittest.TestCase):
    """test_choices"""

    def test_choices(self):
        schema = {"role": Field("str", choices=["admin", "user"])}
        result = validate({"role": "admin"}, schema)
        self.assertEqual(result, {"role": "admin"})

        schema = {"role": Field("str", choices=["admin", "user"])}
        with self.assertRaises(ValidationError) as ctx:
            validate({"role": "superadmin"}, schema)
        errs = ctx.exception.errors
        self.assertEqual(len(errs), 1)
        self.assertIn("choices", errs[0]["message"])


class TestMultipleErrorsCollected(unittest.TestCase):
    """test_multiple_errors_collected"""

    def test_multiple_errors_collected(self):
        schema = {
            "name": Field("str"),
            "age": Field("int", ge=0),
        }
        with self.assertRaises(ValidationError) as ctx:
            validate({"age": -5}, schema)  # name missing, age < ge
        errs = ctx.exception.errors
        self.assertEqual(len(errs), 2)
        field_names = {e["field"] for e in errs}
        self.assertEqual(field_names, {"name", "age"})


if __name__ == "__main__":
    unittest.main()
