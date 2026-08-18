"""Тесты валидации (спека §5, прил. B: test_validation)."""
import unittest

from nanohttp import Field, ValidationError, validate


class ValidationTests(unittest.TestCase):
    def test_missing_required(self):
        with self.assertRaises(ValidationError) as cm:
            validate({}, {"name": Field("str")})
        self.assertEqual(
            cm.exception.errors, [{"field": "name", "message": "missing field"}]
        )
        self.assertEqual(cm.exception.status, 400)

    def test_optional_default(self):
        schema = {"name": Field("str", required=False, default="anon")}
        self.assertEqual(validate({}, schema), {"name": "anon"})
        self.assertEqual(validate({"name": "Ann"}, schema), {"name": "Ann"})
        # default=None тоже попадает в результат
        schema2 = {"age": Field("int", required=False, default=None)}
        self.assertEqual(validate({}, schema2), {"age": None})

    def test_str_min_len(self):
        schema = {"name": Field("str", min_len=2)}
        self.assertEqual(validate({"name": "ok"}, schema), {"name": "ok"})
        with self.assertRaises(ValidationError) as cm:
            validate({"name": "o"}, schema)
        self.assertEqual(cm.exception.errors[0]["field"], "name")
        # не строка
        with self.assertRaises(ValidationError):
            validate({"name": 5}, schema)

    def test_int_rejects_bool(self):
        schema = {"age": Field("int")}
        self.assertEqual(validate({"age": 33}, schema), {"age": 33})
        with self.assertRaises(ValidationError):
            validate({"age": True}, schema)

    def test_int_ge_le(self):
        schema = {"age": Field("int", ge=0, le=150)}
        self.assertEqual(validate({"age": 0}, schema), {"age": 0})
        self.assertEqual(validate({"age": 150}, schema), {"age": 150})
        with self.assertRaises(ValidationError):
            validate({"age": -1}, schema)
        with self.assertRaises(ValidationError):
            validate({"age": 151}, schema)

    def test_bool_kind(self):
        schema = {"active": Field("bool")}
        self.assertEqual(validate({"active": True}, schema), {"active": True})
        self.assertEqual(validate({"active": False}, schema), {"active": False})
        with self.assertRaises(ValidationError):
            validate({"active": "yes"}, schema)
        # int не проходит как bool
        with self.assertRaises(ValidationError):
            validate({"active": 1}, schema)

    def test_email_valid_invalid(self):
        schema = {"email": Field("email")}
        for good in ["a@b.c", "user.name@example.com"]:
            self.assertEqual(validate({"email": good}, schema), {"email": good})
        for bad in ["no-at", "a@b", "@b.c", "a@", "a@b@c.d", 123]:
            with self.assertRaises(ValidationError, msg=bad):
                validate({"email": bad}, schema)

    def test_choices(self):
        schema = {"color": Field("str", choices=["red", "green"])}
        self.assertEqual(validate({"color": "red"}, schema), {"color": "red"})
        with self.assertRaises(ValidationError):
            validate({"color": "blue"}, schema)
        # choices после проверки kind: не-int отбрасывается ещё на типе
        schema2 = {"n": Field("int", choices=[1, 2, 3])}
        self.assertEqual(validate({"n": 2}, schema2), {"n": 2})
        with self.assertRaises(ValidationError):
            validate({"n": 5}, schema2)

    def test_multiple_errors_collected(self):
        schema = {
            "name": Field("str", min_len=2),
            "age": Field("int", ge=0),
            "email": Field("email"),
        }
        with self.assertRaises(ValidationError) as cm:
            validate({"name": "x", "age": -5, "email": "bad", "unknown": 1}, schema)
        # все ошибки полей в ОДНОМ исключении; неизвестный ключ игнорирован
        fields = [error["field"] for error in cm.exception.errors]
        self.assertEqual(fields, ["name", "age", "email"])


if __name__ == "__main__":
    unittest.main()
