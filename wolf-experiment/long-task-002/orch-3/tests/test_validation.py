"""Тесты валидации (nanohttp/validation.py, спека §5)."""

import unittest

from nanohttp import Field, validate, ValidationError


class TestMissingRequired(unittest.TestCase):
    """test_missing_required: required=True, ключа нет → ValidationError."""

    def test_missing_required(self):
        schema = {"name": Field("str")}
        with self.assertRaises(ValidationError) as ctx:
            validate({}, schema)
        self.assertEqual(len(ctx.exception.errors), 1)
        self.assertEqual(ctx.exception.errors[0]["field"], "name")
        self.assertEqual(ctx.exception.errors[0]["message"], "missing field")


class TestOptionalDefault(unittest.TestCase):
    """test_optional_default: required=False, ключа нет → default в результате."""

    def test_optional_default(self):
        schema = {"role": Field("str", required=False, default="guest")}
        result = validate({}, schema)
        self.assertEqual(result, {"role": "guest"})

    def test_optional_default_none(self):
        schema = {"role": Field("str", required=False)}
        result = validate({}, schema)
        self.assertEqual(result, {"role": None})


class TestStrMinLen(unittest.TestCase):
    """test_str_min_len: str с min_len."""

    def test_str_min_len(self):
        schema = {"name": Field("str", min_len=3)}
        with self.assertRaises(ValidationError) as ctx:
            validate({"name": "ab"}, schema)
        self.assertEqual(ctx.exception.errors[0]["message"], "min_len violation")

    def test_str_min_len_ok(self):
        schema = {"name": Field("str", min_len=3)}
        result = validate({"name": "abc"}, schema)
        self.assertEqual(result, {"name": "abc"})


class TestIntRejectsBool(unittest.TestCase):
    """test_int_rejects_bool: bool не проходит как int."""

    def test_int_rejects_bool(self):
        schema = {"flag": Field("int")}
        with self.assertRaises(ValidationError) as ctx:
            validate({"flag": True}, schema)
        self.assertEqual(ctx.exception.errors[0]["message"], "expected int")

    def test_int_ok(self):
        schema = {"count": Field("int")}
        result = validate({"count": 5}, schema)
        self.assertEqual(result, {"count": 5})


class TestIntGeLe(unittest.TestCase):
    """test_int_ge_le: int с ge/le."""

    def test_int_ge(self):
        schema = {"age": Field("int", ge=0)}
        with self.assertRaises(ValidationError) as ctx:
            validate({"age": -1}, schema)
        self.assertEqual(ctx.exception.errors[0]["message"], "ge violation")

    def test_int_le(self):
        schema = {"age": Field("int", le=150)}
        with self.assertRaises(ValidationError) as ctx:
            validate({"age": 200}, schema)
        self.assertEqual(ctx.exception.errors[0]["message"], "le violation")

    def test_int_ge_le(self):
        schema = {"age": Field("int", ge=0, le=150)}
        result = validate({"age": 33}, schema)
        self.assertEqual(result, {"age": 33})
        with self.assertRaises(ValidationError) as ctx:
            validate({"age": 200}, schema)
        self.assertEqual(ctx.exception.errors[0]["message"], "le violation")
        with self.assertRaises(ValidationError):
            validate({"age": -1}, schema)


class TestBoolKind(unittest.TestCase):
    """test_bool_kind: bool."""

    def test_bool_kind(self):
        schema = {"active": Field("bool")}
        result = validate({"active": True}, schema)
        self.assertEqual(result, {"active": True})

    def test_bool_rejects_str(self):
        schema = {"active": Field("bool")}
        with self.assertRaises(ValidationError):
            validate({"active": "true"}, schema)


class TestEmailValidInvalid(unittest.TestCase):
    """test_email_valid_invalid: email валидные и невалидные."""

    def test_email_valid_invalid(self):
        schema = {"addr": Field("email")}
        result = validate({"addr": "user@example.com"}, schema)
        self.assertEqual(result, {"addr": "user@example.com"})
        with self.assertRaises(ValidationError):
            validate({"addr": "userexample.com"}, schema)

    def test_email_invalid_no_at(self):
        schema = {"addr": Field("email")}
        with self.assertRaises(ValidationError) as ctx:
            validate({"addr": "userexample.com"}, schema)
        self.assertEqual(ctx.exception.errors[0]["message"], "invalid email")

    def test_email_invalid_empty_left(self):
        schema = {"addr": Field("email")}
        with self.assertRaises(ValidationError):
            validate({"addr": "@example.com"}, schema)

    def test_email_invalid_no_dot_in_domain(self):
        schema = {"addr": Field("email")}
        with self.assertRaises(ValidationError):
            validate({"addr": "user@domain"}, schema)

    def test_email_rejects_non_str(self):
        schema = {"addr": Field("email")}
        with self.assertRaises(ValidationError):
            validate({"addr": 42}, schema)


class TestChoices(unittest.TestCase):
    """test_choices: значение должно быть в choices."""

    def test_choices(self):
        schema = {"role": Field("str", choices=["admin", "user"])}
        result = validate({"role": "admin"}, schema)
        self.assertEqual(result, {"role": "admin"})

    def test_choices_fail(self):
        schema = {"role": Field("str", choices=["admin", "user"])}
        with self.assertRaises(ValidationError) as ctx:
            validate({"role": "guest"}, schema)
        self.assertEqual(ctx.exception.errors[0]["message"], "invalid choice")


class TestMultipleErrorsCollected(unittest.TestCase):
    """test_multiple_errors_collected: все ошибки собираются в один ValidationError."""

    def test_multiple_errors_collected(self):
        schema = {
            "name": Field("str", required=True),
            "age": Field("int", required=True),
        }
        with self.assertRaises(ValidationError) as ctx:
            validate({"name": 123, "age": "bad"}, schema)
        errors = ctx.exception.errors
        self.assertEqual(len(errors), 2)
        fields = {e["field"] for e in errors}
        self.assertEqual(fields, {"name", "age"})


if __name__ == "__main__":
    unittest.main()
