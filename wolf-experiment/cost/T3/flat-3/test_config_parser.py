# -*- coding: utf-8 -*-
"""Юнит-тесты парсера конфигураций (stdlib unittest, фикстуры через tempfile).

Запуск: python3 cost/T3/flat-3/test_config_parser.py
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest

sys.path.insert(
    0, os.path.dirname(os.path.abspath(__file__))
)

from config_parser import (  # noqa: E402
    Config,
    ConfigMissingKey,
    ConfigSyntaxError,
    ConfigUnknownSection,
)


def write_config(text: str) -> str:
    """Записать текст конфига во временный файл и вернуть путь."""
    tmpdir = tempfile.mkdtemp(prefix="cfg_test_")
    path = os.path.join(tmpdir, "test.ini")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    return path


VALID_CONFIG = """\
# Главный комментарий
[DEFAULT]
retries = 3
timeout = 2.5
debug = false

[server]
# адрес сервера
host = localhost
port = 8080

[client]
timeout = 1.5
name = test client
"""


class TestValidParsing(unittest.TestCase):
    def setUp(self) -> None:
        self.cfg = Config.load(write_config(VALID_CONFIG))

    def test_valid_file_sections_and_keys(self):
        """Валидный файл: секции и ключи читаются корректно."""
        self.assertEqual(self.cfg.require("server", "host"), "localhost")
        self.assertEqual(self.cfg.require("server", "port"), 8080)
        self.assertEqual(self.cfg.require("client", "name"), "test client")

    def test_comments_and_blank_lines_ignored(self):
        """Комментарии и пустые строки не ломают разбор."""
        self.assertEqual(self.cfg.require("server", "port"), 8080)
        # между парами в [DEFAULT] была пустая строка и комментарий
        self.assertEqual(self.cfg.require("DEFAULT", "retries"), 3)

    def test_default_inheritance(self):
        """Секции наследуют ключи из [DEFAULT]."""
        # retries объявлен только в DEFAULT
        self.assertEqual(self.cfg.require("server", "retries"), 3)
        self.assertEqual(self.cfg.get("client", "retries"), 3)

    def test_section_overrides_default(self):
        """Собственный ключ секции сильнее DEFAULT."""
        self.assertEqual(self.cfg.require("DEFAULT", "timeout"), 2.5)
        self.assertEqual(self.cfg.require("client", "timeout"), 1.5)


class TestValueTypes(unittest.TestCase):
    def setUp(self) -> None:
        self.cfg = Config.load(write_config("""\
[types]
pos_int = 42
neg_int = -17
pos_float = 3.14
neg_float = -0.5
exp_float = 1e3
yes_bool = true
no_bool = FALSE
text = hello world
empty =
hash_inside = a#b
"""))

    def test_int_type(self):
        self.assertEqual(self.cfg.require("types", "pos_int"), 42)
        self.assertIsInstance(self.cfg.require("types", "pos_int"), int)

    def test_negative_int_type(self):
        self.assertEqual(self.cfg.require("types", "neg_int"), -17)
        self.assertIsInstance(self.cfg.require("types", "neg_int"), int)

    def test_float_type(self):
        self.assertEqual(self.cfg.require("types", "pos_float"), 3.14)
        self.assertIsInstance(self.cfg.require("types", "pos_float"), float)
        self.assertEqual(self.cfg.require("types", "neg_float"), -0.5)
        self.assertEqual(self.cfg.require("types", "exp_float"), 1000.0)

    def test_bool_type(self):
        self.assertIs(self.cfg.require("types", "yes_bool"), True)
        self.assertIs(self.cfg.require("types", "no_bool"), False)

    def test_str_type_and_empty(self):
        self.assertEqual(self.cfg.require("types", "text"), "hello world")
        self.assertIsInstance(self.cfg.require("types", "text"), str)
        self.assertEqual(self.cfg.require("types", "empty"), "")
        # '#' внутри значения — не комментарий
        self.assertEqual(self.cfg.require("types", "hash_inside"), "a#b")


class TestErrors(unittest.TestCase):
    def test_syntax_error_no_section_header(self):
        """Ключ до объявления секции — ошибка с номером строки."""
        path = write_config("key = value\n[sect]\nother = 1\n")
        with self.assertRaises(ConfigSyntaxError) as ctx:
            Config.load(path)
        self.assertEqual(ctx.exception.line, 1)

    def test_syntax_error_no_equals(self):
        """Строка без '=' внутри секции — ошибка с номером строки."""
        path = write_config("[sect]\nbroken line\n")
        with self.assertRaises(ConfigSyntaxError) as ctx:
            Config.load(path)
        self.assertEqual(ctx.exception.line, 2)

    def test_syntax_error_unclosed_section(self):
        """Незакрытая секция — ошибка с номером строки."""
        path = write_config("[ok]\na = 1\n[broken\nb = 2\n")
        with self.assertRaises(ConfigSyntaxError) as ctx:
            Config.load(path)
        self.assertEqual(ctx.exception.line, 3)

    def test_syntax_error_line_numbers_with_comments(self):
        """Номера строк считаются по файлу, а не по значимым строкам."""
        text = "# комментарий\n\n[sect]\n\n# ещё\nbad line\n"
        path = write_config(text)
        with self.assertRaises(ConfigSyntaxError) as ctx:
            Config.load(path)
        self.assertEqual(ctx.exception.line, 6)

    def test_unknown_section_on_get(self):
        cfg = Config.load(write_config("[sect]\na = 1\n"))
        with self.assertRaises(ConfigUnknownSection) as ctx:
            cfg.get("nope", "a")
        self.assertEqual(ctx.exception.section, "nope")

    def test_unknown_section_on_require(self):
        cfg = Config.load(write_config("[sect]\na = 1\n"))
        with self.assertRaises(ConfigUnknownSection):
            cfg.require("ghost", "a")

    def test_missing_key_on_require(self):
        """require на отсутствующий ключ — ConfigMissingKey с деталями."""
        cfg = Config.load(write_config("[sect]\na = 1\n"))
        with self.assertRaises(ConfigMissingKey) as ctx:
            cfg.require("sect", "missing")
        exc = ctx.exception
        self.assertEqual(exc.section, "sect")
        self.assertEqual(exc.key, "missing")
        self.assertEqual(exc.line, 1)  # секция объявлена в строке 1

    def test_missing_key_not_shadowed_by_default(self):
        """Ключ из DEFAULT не делает его 'своим' для require другой секции —
        наследование работает, поэтому ключ доступен; а вот отсутствие
        и в секции, и в DEFAULT — ошибка."""
        cfg = Config.load(write_config("[DEFAULT]\nx = 1\n[sect]\na = 2\n"))
        self.assertEqual(cfg.require("sect", "x"), 1)  # наследуется
        with self.assertRaises(ConfigMissingKey):
            cfg.require("sect", "no_such_key")


class TestApiSemantics(unittest.TestCase):
    def setUp(self) -> None:
        self.cfg = Config.load(write_config(VALID_CONFIG))

    def test_get_returns_default_for_missing_key(self):
        self.assertIsNone(self.cfg.get("server", "absent"))
        self.assertEqual(self.cfg.get("server", "absent", 99), 99)
        self.assertEqual(self.cfg.get("server", "absent", "fallback"), "fallback")

    def test_get_distinguishes_false_from_missing(self):
        """Явный false не путается с отсутствием ключа."""
        cfg = Config.load(write_config("[s]\nflag = false\n"))
        self.assertIs(cfg.get("s", "flag", True), False)

    def test_require_returns_typed_value(self):
        value = self.cfg.require("server", "port")
        self.assertEqual(value, 8080)
        self.assertIsInstance(value, int)

    def test_default_section_direct_access(self):
        self.assertEqual(self.cfg.get("DEFAULT", "retries"), 3)
        self.assertEqual(self.cfg.require("DEFAULT", "debug"), False)

    def test_no_default_section_still_works(self):
        """Файл без [DEFAULT] разбирается без наследования."""
        cfg = Config.load(write_config("[a]\nx = 1\n"))
        self.assertEqual(cfg.require("a", "x"), 1)
        self.assertEqual(cfg.get("a", "y", "dflt"), "dflt")


if __name__ == "__main__":
    unittest.main(verbosity=2)
