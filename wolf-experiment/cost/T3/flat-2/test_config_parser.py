# -*- coding: utf-8 -*-
"""Тесты парсера конфигурационных файлов (только stdlib)."""

import os
import tempfile
import unittest

from config_parser import (
    Config,
    ConfigMissingKey,
    ConfigSyntaxError,
    ConfigUnknownSection,
)


class BaseConfigTest(unittest.TestCase):
    """Базовый класс: временный каталог и хелпер записи файла."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)

    def _write(self, content: str) -> str:
        path = os.path.join(self._tmp.name, "config.ini")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(content)
        return path


class TestValidConfig(BaseConfigTest):
    def test_valid_file_basic(self) -> None:
        cfg = Config.load(
            self._write("[app]\nname=demo\nport=8080\n[db]\nhost=localhost\n")
        )
        self.assertEqual(cfg.get("app", "name"), "demo")
        self.assertEqual(cfg.get("app", "port"), 8080)
        self.assertEqual(cfg.get("db", "host"), "localhost")

    def test_default_inheritance(self) -> None:
        cfg = Config.load(
            self._write("[DEFAULT]\ntimeout=30\nretries=3\n[api]\nretries=5\n")
        )
        self.assertEqual(cfg.get("api", "timeout"), 30)  # унаследован
        self.assertEqual(cfg.get("api", "retries"), 5)  # переопределён

    def test_default_section_direct_access(self) -> None:
        cfg = Config.load(self._write("[DEFAULT]\nmode=strict\n"))
        self.assertEqual(cfg.get("DEFAULT", "mode"), "strict")

    def test_comments_and_blank_lines_ignored(self) -> None:
        cfg = Config.load(
            self._write(
                "# верхний комментарий\n\n[sec]\n\n# ключ ниже\nkey=1\n"
                "#value=2 закомментировано\n\nother=abc\n"
            )
        )
        self.assertEqual(cfg.get("sec", "key"), 1)
        self.assertEqual(cfg.get("sec", "other"), "abc")
        self.assertIsNone(cfg.get("sec", "value"))

    def test_value_with_spaces_trimmed(self) -> None:
        cfg = Config.load(self._write("[s]\nname =  hello world  \nnum = 42 \n"))
        self.assertEqual(cfg.get("s", "name"), "hello world")
        self.assertEqual(cfg.get("s", "num"), 42)


class TestValueTypes(BaseConfigTest):
    def test_int(self) -> None:
        cfg = Config.load(self._write("[s]\na=0\nb=17\nc=-25\n"))
        self.assertEqual(cfg.get("s", "a"), 0)
        self.assertEqual(cfg.get("s", "b"), 17)
        self.assertEqual(cfg.get("s", "c"), -25)

    def test_float(self) -> None:
        cfg = Config.load(self._write("[s]\na=3.14\nb=-0.5\nc=2e3\nd=1.\n"))
        self.assertEqual(cfg.get("s", "a"), 3.14)
        self.assertEqual(cfg.get("s", "b"), -0.5)
        self.assertEqual(cfg.get("s", "c"), 2000.0)
        self.assertEqual(cfg.get("s", "d"), 1.0)

    def test_bool(self) -> None:
        cfg = Config.load(
            self._write("[s]\na=true\nb=false\nC=TRUE\nD=False\n")
        )
        self.assertIs(cfg.get("s", "a"), True)
        self.assertIs(cfg.get("s", "b"), False)
        self.assertIs(cfg.get("s", "C"), True)
        self.assertIs(cfg.get("s", "D"), False)

    def test_str_not_typed(self) -> None:
        cfg = Config.load(
            self._write("[s]\nname=hello world\nver=1.2.3\nflag=maybe\n")
        )
        self.assertEqual(cfg.get("s", "name"), "hello world")
        self.assertEqual(cfg.get("s", "ver"), "1.2.3")
        self.assertEqual(cfg.get("s", "flag"), "maybe")

    def test_negative_and_signed_numbers(self) -> None:
        cfg = Config.load(self._write("[s]\ni=-7\nf=-1.5\n"))
        self.assertEqual(cfg.get("s", "i"), -7)
        self.assertEqual(cfg.get("s", "f"), -1.5)


class TestErrors(BaseConfigTest):
    def test_syntax_error_no_equals(self) -> None:
        with self.assertRaises(ConfigSyntaxError) as ctx:
            Config.load(self._write("[sec]\nok=1\nпросто строка\n"))
        self.assertEqual(ctx.exception.line_no, 3)

    def test_syntax_error_outside_section(self) -> None:
        with self.assertRaises(ConfigSyntaxError) as ctx:
            Config.load(self._write("key=1\n"))
        self.assertEqual(ctx.exception.line_no, 1)

    def test_syntax_error_bad_section_header(self) -> None:
        with self.assertRaises(ConfigSyntaxError) as ctx:
            Config.load(self._write("[unclosed\nkey=1\n"))
        self.assertEqual(ctx.exception.line_no, 1)

    def test_syntax_error_counts_real_lines(self) -> None:
        # пустые строки и комментарии НЕ пропускаются при нумерации
        with self.assertRaises(ConfigSyntaxError) as ctx:
            Config.load(
                self._write("[sec]\n\n# comment\n\nbad line\n")
            )
        self.assertEqual(ctx.exception.line_no, 5)

    def test_unknown_section_on_require(self) -> None:
        cfg = Config.load(self._write("[sec]\nkey=1\n"))
        with self.assertRaises(ConfigUnknownSection) as ctx:
            cfg.require("nope", "key")
        self.assertEqual(ctx.exception.section, "nope")

    def test_missing_key_error_payload(self) -> None:
        cfg = Config.load(self._write("[sec]\nkey=1\n"))
        with self.assertRaises(ConfigMissingKey) as ctx:
            cfg.require("sec", "absent")
        exc = ctx.exception
        self.assertEqual(exc.section, "sec")
        self.assertEqual(exc.key, "absent")
        self.assertEqual(exc.line_no, 1)  # строка объявления секции
        msg = str(exc)
        self.assertIn("sec", msg)
        self.assertIn("absent", msg)
        self.assertIn("1", msg)


class TestGetRequireAPI(BaseConfigTest):
    def test_get_default_for_missing_key(self) -> None:
        cfg = Config.load(self._write("[sec]\nkey=1\n"))
        self.assertEqual(cfg.get("sec", "key", default=99), 1)
        self.assertEqual(cfg.get("sec", "no", default=99), 99)
        self.assertIsNone(cfg.get("sec", "no"))

    def test_get_default_for_unknown_section(self) -> None:
        cfg = Config.load(self._write("[sec]\nkey=1\n"))
        self.assertEqual(cfg.get("ghost", "key", default="fallback"), "fallback")

    def test_require_inherited_from_default(self) -> None:
        cfg = Config.load(self._write("[DEFAULT]\nhost=db.local\n[app]\nport=1\n"))
        self.assertEqual(cfg.require("app", "host"), "db.local")
        self.assertEqual(cfg.require("app", "port"), 1)

    def test_require_missing_not_rescued_by_default(self) -> None:
        cfg = Config.load(self._write("[DEFAULT]\na=1\n[app]\nb=2\n"))
        with self.assertRaises(ConfigMissingKey):
            cfg.require("app", "c")

    def test_equals_sign_in_value(self) -> None:
        cfg = Config.load(self._write("[s]\nexpr=a=b=c\n"))
        self.assertEqual(cfg.get("s", "expr"), "a=b=c")


if __name__ == "__main__":
    unittest.main(verbosity=2)
