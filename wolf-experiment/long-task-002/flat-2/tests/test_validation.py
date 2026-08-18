"""Тесты валидации (спека, раздел 5)."""

import unittest

from nanohttp import Field, ValidationError, validate


class TestValidation(unittest.TestCase):

    def test_missing_required(self):
        with self.assertRaises(ValidationError) as ctx:
            validate({"age": 1}, {"name": Field("str")})
        errors = ctx.exception.errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["field"], "name")
        self.assertIn("missing", errors[0]["message"])

    def test_optional_default(self):
        schema = {
            "name": Field("str", required=False, default="anon"),
            "note": Field("str", required=False, default=None),
        }
        result = validate({}, schema)
        self.assertEqual(result, {"name": "anon", "note": None})

    def test_str_min_len(self):
        schema = {"name": Field("str", min_len=3)}
        self.assertEqual(validate({"name": "abc"}, schema), {"name": "abc"})
        self.assertEqual(validate({"name": "abcd"}, schema), {"name": "abcd"})
        with self.assertRaises(ValidationError) as ctx:
            validate({"name": "ab"}, schema)
        self.assertEqual(ctx.exception.errors[0]["field"], "name")
        # не строка — тоже ошибка
        with self.assertRaises(ValidationError):
            validate({"name": 123}, schema)

    def test_int_rejects_bool(self):
        schema = {"age": Field("int")}
        self.assertEqual(validate({"age": 5}, schema), {"age": 5})
        with self.assertRaises(ValidationError):
            validate({"age": True}, schema)
        with self.assertRaises(ValidationError):
            validate({"age": False}, schema)

    def test_int_ge_le(self):
        schema = {"age": Field("int", ge=2, le=10)}
        self.assertEqual(validate({"age": 2}, schema), {"age": 2})
        self.assertEqual(validate({"age": 10}, schema), {"age": 10})
        with self.assertRaises(ValidationError):
            validate({"age": 1}, schema)  # < ge
        with self.assertRaises(ValidationError):
            validate({"age": 11}, schema)  # > le
        # ge/le проверяются после типа: строка падает на типе, не на сравнении
        with self.assertRaises(ValidationError) as ctx:
            validate({"age": "5"}, schema)
        self.assertEqual(ctx.exception.errors[0]["field"], "age")

    def test_bool_kind(self):
        schema = {"active": Field("bool")}
        self.assertEqual(validate({"active": True}, schema), {"active": True})
        self.assertEqual(validate({"active": False}, schema), {"active": False})
        for bad in (1, 0, "yes", None):
            with self.assertRaises(ValidationError):
                validate({"active": bad}, schema)

    def test_email_valid_invalid(self):
        schema = {"email": Field("email")}
        for good in ("user@example.com", "a@b.c", "ann.lee@mail.example.org"):
            self.assertEqual(validate({"email": good}, schema), {"email": good})
        for bad in (
            "userexample.com",  # нет @
            "user@@example.com",  # две @
            "@example.com",  # пустая левая часть
            "user@",  # пустая правая часть
            "user@examplecom",  # правая без точки
            42,  # не строка
        ):
            with self.assertRaises(ValidationError):
                validate({"email": bad}, schema)

    def test_choices(self):
        schema = {"color": Field("str", choices=["red", "green"])}
        self.assertEqual(validate({"color": "red"}, schema), {"color": "red"})
        with self.assertRaises(ValidationError):
            validate({"color": "blue"}, schema)
        # kind проверяется до choices
        int_schema = {"n": Field("int", choices=[1, 2, 3])}
        self.assertEqual(validate({"n": 2}, int_schema), {"n": 2})
        with self.assertRaises(ValidationError):
            validate({"n": "2"}, int_schema)
        self.assertEqual(validate({"n": 3}, int_schema), {"n": 3})

    def test_multiple_errors_collected(self):
        schema = {
            "name": Field("str", min_len=2),
            "age": Field("int", ge=0),
            "email": Field("email"),
        }
        with self.assertRaises(ValidationError) as ctx:
            validate({"name": "a", "age": "x", "email": "nope"}, schema)
        errors = ctx.exception.errors
        self.assertEqual(len(errors), 3)
        self.assertEqual({e["field"] for e in errors}, {"name", "age", "email"})
        # неизвестные ключи data игнорируются (не попадают ни в результат, ни в ошибки)
        result = validate({"name": "ann", "age": 30, "email": "a@b.c", "extra": 1}, schema)
        self.assertEqual(result, {"name": "ann", "age": 30, "email": "a@b.c"})


if __name__ == "__main__":
    unittest.main()
