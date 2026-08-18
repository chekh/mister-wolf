# -*- coding: utf-8 -*-
"""Тесты парсера конфигурационных файлов (cost/T3/flat-1).

Запуск: python3 cost/T3/flat-1/test_config_parser.py
Только stdlib: unittest, tempfile.
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


class TempFileMixin:
    """Хелпер: записать текст во временный файл и вернуть путь."""

    def write_cfg(self, text: str) -> str:
        tmp = tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".cfg",
            delete=False,
            encoding="utf-8",
        )
        with tmp:
            tmp.write(text)
        self.addCleanup(os.unlink, tmp.name)
        return tmp.name


class TestValidConfig(TempFileMixin, unittest.TestCase):
    """Валидный файл, наследование DEFAULT, комментарии/пустые строки."""

    def test_valid_file_all_sections_and_keys(self):
        path = self.write_cfg(
            "[DEFAULT]\n"
            "retries = 3\n"
            "\n"
            "[db]\n"
            "host = localhost\n"
            "port = 5432\n"
        )
        cfg = Config.load(path)
        self.assertEqual(cfg.get("db", "host"), "localhost")
        self.assertEqual(cfg.get("db", "port"), 5432)
        self.assertEqual(cfg.get("DEFAULT", "retries"), 3)

    def test_default_inherited_by_sections(self):
        path = self.write_cfg(
            "[DEFAULT]\n"
            "timeout = 30\n"
            "debug = false\n"
            "[api]\n"
            "timeout = 60\n"
            "[worker]\n"
            "name = w1\n"
        )
        cfg = Config.load(path)
        # собственное значение перекрывает DEFAULT
        self.assertEqual(cfg.get("api", "timeout"), 60)
        # worker наследует DEFAULT
        self.assertEqual(cfg.get("worker", "timeout"), 30)
        self.assertIs(cfg.get("worker", "debug"), False)
        # require тоже видит наследование
        self.assertEqual(cfg.require("worker", "timeout"), 30)

    def test_comments_and_blank_lines_ignored(self):
        path = self.write_cfg(
            "# верхний комментарий\n"
            "\n"
            "   \n"
            "[app]\n"
            "  # отступ-комментарий\n"
            "name = demo\n"
            "\n"
            "# ещё комментарий\n"
            "version = 1\n"
        )
        cfg = Config.load(path)
        self.assertEqual(cfg.get("app", "name"), "demo")
        self.assertEqual(cfg.get("app", "version"), 1)


class TestAutotype(TempFileMixin, unittest.TestCase):
    """Автотипизация значений."""

    def test_int_float_bool_str(self):
        path = self.write_cfg(
            "[types]\n"
            "count = 42\n"
            "ratio = 3.14\n"
            "flag_on = true\n"
            "flag_off = false\n"
            "label = hello\n"
        )
        cfg = Config.load(path)
        self.assertIsInstance(cfg.get("types", "count"), int)
        self.assertEqual(cfg.get("types", "count"), 42)
        self.assertIsInstance(cfg.get("types", "ratio"), float)
        self.assertAlmostEqual(cfg.get("types", "ratio"), 3.14)
        self.assertIs(cfg.get("types", "flag_on"), True)
        self.assertIs(cfg.get("types", "flag_off"), False)
        self.assertEqual(cfg.get("types", "label"), "hello")

    def test_negative_numbers_and_spaces(self):
        path = self.write_cfg(
            "[neg]\n"
            "delta = -15\n"
            "epsilon = -0.5\n"
            "padded =   7  \n"
        )
        cfg = Config.load(path)
        self.assertEqual(cfg.get("neg", "delta"), -15)
        self.assertIsInstance(cfg.get("neg", "epsilon"), float)
        self.assertEqual(cfg.get("neg", "epsilon"), -0.5)
        self.assertEqual(cfg.get("neg", "padded"), 7)

    def test_value_with_hash_and_empty_value(self):
        # '#' внутри значения — не комментарий; пустое значение — пустая строка
        path = self.write_cfg(
            "[misc]\n"
            "color = #ff0000\n"
            "empty =\n"
        )
        cfg = Config.load(path)
        self.assertEqual(cfg.get("misc", "color"), "#ff0000")
        self.assertEqual(cfg.get("misc", "empty"), "")

    def test_numeric_string_not_converted(self):
        path = self.write_cfg("[s]\nid = 00123\n")
        cfg = Config.load(path)
        # ведущие нули: int('00123') валиден, поэтому это int 123
        self.assertEqual(cfg.get("s", "id"), 123)


class TestErrors(TempFileMixin, unittest.TestCase):
    """Все три вида ошибок, номера строк, секции/ключи."""

    def test_syntax_error_key_outside_section(self):
        path = self.write_cfg("orphan = 1\n[app]\nx = 1\n")
        with self.assertRaises(ConfigSyntaxError) as ctx:
            Config.load(path)
        self.assertEqual(ctx.exception.line_no, 1)

    def test_syntax_error_missing_equals(self):
        path = self.write_cfg("[app]\nkey = 1\nbroken line\n")
        with self.assertRaises(ConfigSyntaxError) as ctx:
            Config.load(path)
        self.assertEqual(ctx.exception.line_no, 3)

    def test_syntax_error_bad_section_header(self):
        path = self.write_cfg("[unclosed\nkey = 1\n")
        with self.assertRaises(ConfigSyntaxError) as ctx:
            Config.load(path)
        self.assertEqual(ctx.exception.line_no, 1)

    def test_unknown_section(self):
        path = self.write_cfg("[app]\nkey = 1\n")
        cfg = Config.load(path)
        with self.assertRaises(ConfigUnknownSection) as ctx:
            cfg.require("ghost", "key")
        self.assertEqual(ctx.exception.section, "ghost")

    def test_missing_key_in_existing_section(self):
        path = self.write_cfg("[app]\nkey = 1\n")
        cfg = Config.load(path)
        with self.assertRaises(ConfigMissingKey) as ctx:
            cfg.require("app", "nope")
        self.assertEqual(ctx.exception.section, "app")
        self.assertEqual(ctx.exception.key, "nope")
        self.assertIn("nope", str(ctx.exception))

    def test_missing_key_not_rescued_by_default(self):
        # DEFAULT есть, но ключа в нём тоже нет -> ConfigMissingKey
        path = self.write_cfg("[DEFAULT]\na = 1\n[app]\nb = 2\n")
        cfg = Config.load(path)
        with self.assertRaises(ConfigMissingKey):
            cfg.require("app", "c")


class TestApi(TempFileMixin, unittest.TestCase):
    """get с default, require, поведение при отсутствующих сущностях."""

    def test_get_returns_default_for_missing_key_and_section(self):
        path = self.write_cfg("[app]\nkey = 1\n")
        cfg = Config.load(path)
        self.assertIsNone(cfg.get("app", "missing"))
        self.assertEqual(cfg.get("app", "missing", "fallback"), "fallback")
        self.assertEqual(cfg.get("ghost", "key", 99), 99)

    def test_require_returns_typed_value(self):
        path = self.write_cfg("[app]\nn = 5\n")
        cfg = Config.load(path)
        self.assertEqual(cfg.require("app", "n"), 5)

    def test_sections_are_independent(self):
        path = self.write_cfg(
            "[DEFAULT]\nshared = base\n"
            "[a]\nonly_a = 1\n"
            "[b]\nonly_b = 2\n"
        )
        cfg = Config.load(path)
        self.assertEqual(cfg.get("a", "only_a"), 1)
        self.assertIsNone(cfg.get("b", "only_a"))
        # обе наследуют shared
        self.assertEqual(cfg.get("a", "shared"), "base")
        self.assertEqual(cfg.get("b", "shared"), "base")

    def test_default_section_direct_access(self):
        path = self.write_cfg("[DEFAULT]\nx = 1\n[app]\ny = 2\n")
        cfg = Config.load(path)
        self.assertEqual(cfg.get("DEFAULT", "x"), 1)
        # ключ из обычной секции не виден в DEFAULT
        self.assertIsNone(cfg.get("DEFAULT", "y"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
