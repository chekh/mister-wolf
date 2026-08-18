import unittest

from nanohttp import Field, ValidationError, validate


class TestValidation(unittest.TestCase):
    def test_missing_required(self):
        with self.assertRaises(ValidationError) as cm:
            validate({}, {"name": Field("str")})
        errors = cm.exception.errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["field"], "name")
        self.assertIn("missing", errors[0]["message"])

    def test_optional_default(self):
        schema = {
            "name": Field("str", required=False, default="anon"),
            "age": Field("int", required=False),
        }
        result = validate({}, schema)
        self.assertEqual(result, {"name": "anon", "age": None})
        # default подставляется только при отсутствии ключа
        result = validate({"age": 5}, schema)
        self.assertEqual(result, {"name": "anon", "age": 5})

    def test_str_min_len(self):
        schema = {"name": Field("str", min_len=3)}
        self.assertEqual(validate({"name": "abc"}, schema), {"name": "abc"})
        self.assertEqual(validate({"name": "abcd"}, schema), {"name": "abcd"})
        with self.assertRaises(ValidationError):
            validate({"name": "ab"}, schema)
        with self.assertRaises(ValidationError):  # не строка
            validate({"name": 42}, schema)

    def test_int_rejects_bool(self):
        schema = {"age": Field("int")}
        self.assertEqual(validate({"age": 33}, schema), {"age": 33})
        with self.assertRaises(ValidationError):
            validate({"age": True}, schema)
        with self.assertRaises(ValidationError):
            validate({"age": False}, schema)

    def test_int_ge_le(self):
        schema = {"age": Field("int", ge=0, le=150)}
        self.assertEqual(validate({"age": 0}, schema), {"age": 0})
        self.assertEqual(validate({"age": 150}, schema), {"age": 150})
        with self.assertRaises(ValidationError):
            validate({"age": -1}, schema)
        with self.assertRaises(ValidationError):
            validate({"age": 151}, schema)
        # границы проверяются после типа: не-int всё равно ошибка типа
        with self.assertRaises(ValidationError):
            validate({"age": "33"}, schema)

    def test_bool_kind(self):
        schema = {"active": Field("bool")}
        self.assertEqual(validate({"active": True}, schema), {"active": True})
        self.assertEqual(validate({"active": False}, schema), {"active": False})
        for bad in ("yes", 1, 0, None):
            with self.assertRaises(ValidationError):
                validate({"active": bad}, schema)

    def test_email_valid_invalid(self):
        schema = {"email": Field("email")}
        for good in ("a@b.com", "user.name@example.org", "x@y.z"):
            self.assertEqual(validate({"email": good}, schema), {"email": good})
        for bad in (
            "a@b",  # нет точки справа
            "a@",  # пустая правая часть
            "@b.com",  # пустая левая часть
            "a@b@c",  # два @
            "plain",  # нет @
            42,  # не строка
            "",  # пусто
        ):
            with self.assertRaises(ValidationError):
                validate({"email": bad}, schema)

    def test_choices(self):
        schema = {"color": Field("str", choices=["red", "green"])}
        self.assertEqual(validate({"color": "red"}, schema), {"color": "red"})
        with self.assertRaises(ValidationError):
            validate({"color": "blue"}, schema)
        # choices на не-str: сначала kind, потом membership
        with self.assertRaises(ValidationError):
            validate({"color": 7}, schema)

    def test_multiple_errors_collected(self):
        schema = {
            "name": Field("str", min_len=2),
            "age": Field("int", ge=0),
            "email": Field("email"),
        }
        with self.assertRaises(ValidationError) as cm:
            validate({"name": "a", "age": -1, "email": "nope"}, schema)
        fields = [e["field"] for e in cm.exception.errors]
        self.assertEqual(fields, ["name", "age", "email"])
        # все элементы — {"field": str, "message": str}
        for e in cm.exception.errors:
            self.assertEqual(set(e), {"field", "message"})


if __name__ == "__main__":
    unittest.main()
