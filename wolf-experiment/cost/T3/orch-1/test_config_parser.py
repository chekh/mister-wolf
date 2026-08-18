"""Юнит-тесты для config_parser.py (контрактное тестирование).

Тестируемый модуль: config_parser.py (импорт: Config, ConfigSyntaxError,
ConfigUnknownSection, ConfigMissingKey).

Тесты написаны по спецификации парсера и НЕ зависят от наличия реализации —
запускать только после готовности config_parser.py.
"""

import os
import tempfile
import unittest
from typing import Any

from config_parser import Config, ConfigMissingKey, ConfigSyntaxError, ConfigUnknownSection


def _write_config(dir_: str, content: str, filename: str = "test.cfg") -> str:
    """Записать строку content в файл внутри временного каталога, вернуть путь."""
    path = os.path.join(dir_, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return path


class TestConfigParserValid(unittest.TestCase):
    """Тесты валидного парсинга и чтения значений."""

    def tearDown(self) -> None:
        pass  # Очистка через TemporaryDirectory в setUp/контекст-менеджере

    def test_valid_file_multiple_sections(self) -> None:
        """Валидный файл с несколькими секциями: значения читаются корректно."""
        content = (
            "# строка 1: комментарий\n"  # строка 1
            "[section1]\n"               # строка 2
            "name=alpha\n"              # строка 3
            "count=10\n"                # строка 4
            "\n"                        # строка 5: пустая
            "[section2]\n"              # строка 6
            "name=beta\n"               # строка 7
            "rate=3.14\n"              # строка 8
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            self.assertEqual(cfg.get("section1", "name"), "alpha")
            self.assertEqual(cfg.get("section1", "count"), 10)
            self.assertEqual(cfg.get("section2", "name"), "beta")
            self.assertEqual(cfg.get("section2", "rate"), 3.14)

    def test_valid_file_single_section(self) -> None:
        """Валидный файл с одной секцией."""
        content = (
            "[only]\n"       # строка 1
            "key=val\n"      # строка 2
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            self.assertEqual(cfg.get("only", "key"), "val")


class TestDefaultInheritance(unittest.TestCase):
    """Тесты наследования от секции [DEFAULT]."""

    def test_default_inheritance_visible(self) -> None:
        """Ключ из DEFAULT виден в другой секции через get."""
        content = (
            "[DEFAULT]\n"       # строка 1
            "timeout=30\n"      # строка 2
            "verbose=true\n"   # строка 3
            "\n"                # строка 4: пустая
            "[server]\n"        # строка 5
            "host=localhost\n"  # строка 6
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            # timeout из DEFAULT должен быть виден в [server]
            self.assertEqual(cfg.get("server", "timeout"), 30)
            self.assertEqual(cfg.get("server", "verbose"), True)
            self.assertEqual(cfg.get("server", "host"), "localhost")

    def test_default_inheritance_override(self) -> None:
        """Переопределение в секции побеждает над DEFAULT."""
        content = (
            "[DEFAULT]\n"       # строка 1
            "timeout=30\n"      # строка 2
            "\n"                # строка 3
            "[server]\n"        # строка 4
            "timeout=60\n"      # строка 5
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            # В [server] timeout = 60, не 30 из DEFAULT
            self.assertEqual(cfg.get("server", "timeout"), 60)
            # В DEFAULT по-прежнему 30
            self.assertEqual(cfg.get("DEFAULT", "timeout"), 30)

    def test_direct_access_default_section(self) -> None:
        """Прямой доступ к секции DEFAULT через get."""
        content = (
            "[DEFAULT]\n"       # строка 1
            "mode=auto\n"       # строка 2
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            self.assertEqual(cfg.get("DEFAULT", "mode"), "auto")


class TestCommentsAndBlankLines(unittest.TestCase):
    """Комментарии и пустые строки игнорируются."""

    def test_comments_ignored(self) -> None:
        """Строки-комментарии (начинаются с #) не влияют на парсинг."""
        content = (
            "# строка 1: это комментарий\n"  # строка 1
            "[db]\n"                         # строка 2
            "# строка 3: ещё комментарий\n" # строка 3
            "host=127.0.0.1\n"               # строка 4
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            self.assertEqual(cfg.get("db", "host"), "127.0.0.1")

    def test_blank_lines_ignored(self) -> None:
        """Пустые строки (и строки из пробелов) не влияют на парсинг."""
        content = (
            "\n"            # строка 1: пустая
            "   \n"         # строка 2: пробелы (после strip — пустая)
            "[sec]\n"       # строка 3
            "\n"            # строка 4: пустая
            "x=1\n"         # строка 5
            "\n"            # строка 6: пустая
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            self.assertEqual(cfg.get("sec", "x"), 1)

    def test_inline_comments_not_supported(self) -> None:
        """Инлайн-комментарии НЕ поддерживаются: всё после первого = — значение."""
        content = (
            "[sec]\n"                  # строка 1
            "value=hello # world\n"   # строка 2: значение = "hello # world"
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            self.assertEqual(cfg.get("sec", "value"), "hello # world")


class TestAutoTyping(unittest.TestCase):
    """Автотипизация значений: bool, int, float, str."""

    def test_type_bool_true(self) -> None:
        """true/True/TRUE → True (без учёта регистра)."""
        for val, expected in [("true", True), ("True", True), ("TRUE", True),
                               ("tRuE", True)]:
            content = f"[s]\nk={val}\n"
            with tempfile.TemporaryDirectory() as td:
                path = _write_config(td, content, "test.cfg")
                cfg = Config.load(path)
                self.assertIs(cfg.get("s", "k"), expected,
                              f"Неожиданное значение для '{val}'")

    def test_type_bool_false(self) -> None:
        """false/False → False."""
        for val, expected in [("false", False), ("False", False), ("FALSE", False)]:
            content = f"[s]\nk={val}\n"
            with tempfile.TemporaryDirectory() as td:
                path = _write_config(td, content, "test.cfg")
                cfg = Config.load(path)
                self.assertIs(cfg.get("s", "k"), expected,
                              f"Неожиданное значение для '{val}'")

    def test_type_int(self) -> None:
        """Целые числа: положительные и отрицательные."""
        cases: list[tuple[str, int]] = [
            ("42", 42),
            ("0", 0),
            ("-5", -5),
            ("1000", 1000),
        ]
        for val, expected in cases:
            content = f"[s]\nk={val}\n"
            with tempfile.TemporaryDirectory() as td:
                path = _write_config(td, content, "test.cfg")
                cfg = Config.load(path)
                self.assertEqual(cfg.get("s", "k"), expected,
                                 f"Неожиданное int для '{val}'")

    def test_type_float(self) -> None:
        """Числа с точкой: положительные и отрицательные."""
        cases: list[tuple[str, float]] = [
            ("3.14", 3.14),
            ("-2.5", -2.5),
            ("0.0", 0.0),
            ("-0.1", -0.1),
        ]
        for val, expected in cases:
            content = f"[s]\nk={val}\n"
            with tempfile.TemporaryDirectory() as td:
                path = _write_config(td, content, "test.cfg")
                cfg = Config.load(path)
                self.assertEqual(cfg.get("s", "k"), expected,
                                 f"Неожиданное float для '{val}'")

    def test_type_str(self) -> None:
        """Строки и пустые значения."""
        content = (
            "[s]\n"       # строка 1
            "name=hello\n"  # строка 2
            "empty=\n"      # строка 3: пустое значение → ""
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            self.assertEqual(cfg.get("s", "name"), "hello")
            self.assertEqual(cfg.get("s", "empty"), "")


class TestSyntaxErrors(unittest.TestCase):
    """Синтаксические ошибки → ConfigSyntaxError с корректным номером строки."""

    def test_key_value_before_section(self) -> None:
        """key=value до первой секции → ConfigSyntaxError, line = номер строки."""
        content = (
            "key=value\n"  # строка 1: ошибка — до секции
            "[sec]\n"      # строка 2
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            with self.assertRaises(ConfigSyntaxError) as ctx:
                Config.load(path)
            exc = ctx.exception
            self.assertEqual(exc.line, 1, f"Ожидался line=1, получен {exc.line}")

    def test_garbage_line(self) -> None:
        """Мусорная строка (не секция, не key=value, не комментарий, не пустая)
        → ConfigSyntaxError с корректным номером строки."""
        content = (
            "[sec]\n"            # строка 1
            "просто текст\n"     # строка 2: мусор
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            with self.assertRaises(ConfigSyntaxError) as ctx:
                Config.load(path)
            exc = ctx.exception
            self.assertEqual(exc.line, 2, f"Ожидался line=2, получен {exc.line}")

    def test_empty_key(self) -> None:
        """Пустой ключ (=value) → ConfigSyntaxError."""
        content = (
            "[sec]\n"    # строка 1
            "=value\n"   # строка 2: пустой ключ
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            with self.assertRaises(ConfigSyntaxError) as ctx:
                Config.load(path)
            exc = ctx.exception
            self.assertEqual(exc.line, 2, f"Ожидался line=2, получен {exc.line}")

    def test_syntax_error_is_value_error(self) -> None:
        """ConfigSyntaxError наследует ValueError."""
        content = (
            "bad line\n"  # строка 1
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            with self.assertRaises(ValueError):
                Config.load(path)


class TestUnknownSection(unittest.TestCase):
    """ConfigUnknownSection через require."""

    def test_require_unknown_section(self) -> None:
        """require с неизвестной секцией → ConfigUnknownSection, .section заполнен."""
        content = (
            "[known]\n"     # строка 1
            "x=1\n"        # строка 2
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            with self.assertRaises(ConfigUnknownSection) as ctx:
                cfg.require("missing", "x")
            self.assertEqual(ctx.exception.section, "missing")


class TestMissingKey(unittest.TestCase):
    """ConfigMissingKey через require."""

    def test_require_missing_key(self) -> None:
        """require: ключа нет ни в секции, ни в DEFAULT → ConfigMissingKey
        с .section, .key, .line (номер строки объявления секции)."""
        content = (
            "\n"            # строка 1: пустая
            "[sec]\n"       # строка 2
            "a=1\n"        # строка 3
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            with self.assertRaises(ConfigMissingKey) as ctx:
                cfg.require("sec", "nonexistent")
            exc = ctx.exception
            self.assertEqual(exc.section, "sec")
            self.assertEqual(exc.key, "nonexistent")
            # Секция [sec] объявлена на строке 2
            self.assertEqual(exc.line, 2, f"Ожидался line=2, получен {exc.line}")

    def test_require_missing_key_with_default(self) -> None:
        """require: ключа нет в секции и нет в DEFAULT → ConfigMissingKey."""
        content = (
            "[DEFAULT]\n"   # строка 1
            "base=1\n"      # строка 2
            "\n"            # строка 3
            "[sec]\n"       # строка 4
            "own=2\n"       # строка 5
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            # Ключ 'missing' нет ни в sec, ни в DEFAULT
            with self.assertRaises(ConfigMissingKey) as ctx:
                cfg.require("sec", "missing")
            self.assertEqual(ctx.exception.section, "sec")
            self.assertEqual(ctx.exception.key, "missing")
            self.assertEqual(ctx.exception.line, 4)


class TestGetWithDefault(unittest.TestCase):
    """get() с default-аргументом."""

    def test_get_unknown_section_returns_default(self) -> None:
        """get с неизвестной секцией → возвращает default."""
        content = (
            "[sec]\n"   # строка 1
            "x=1\n"     # строка 2
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            self.assertIsNone(cfg.get("no_such_section", "key"))
            self.assertEqual(cfg.get("no_such_section", "key", 42), 42)

    def test_get_missing_key_returns_default(self) -> None:
        """get: ключа нет в секции и в DEFAULT → возвращает default."""
        content = (
            "[sec]\n"   # строка 1
            "x=1\n"     # строка 2
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            self.assertIsNone(cfg.get("sec", "missing"))
            self.assertEqual(cfg.get("sec", "missing", "fallback"), "fallback")

    def test_get_key_from_default_not_default_arg(self) -> None:
        """get: ключ из DEFAULT виден, возвращает его, а не default-аргумент."""
        content = (
            "[DEFAULT]\n"    # строка 1
            "shared=yes\n"  # строка 2
            "\n"             # строка 3
            "[sec]\n"        # строка 4
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            self.assertEqual(cfg.get("sec", "shared", "nope"), "yes")


class TestRequireReturnValue(unittest.TestCase):
    """require на существующий ключ возвращает значение."""

    def test_require_existing_key_returns_value(self) -> None:
        """require возвращает значение существующего ключа."""
        content = (
            "[sec]\n"       # строка 1
            "port=8080\n"   # строка 2
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            self.assertEqual(cfg.require("sec", "port"), 8080)

    def test_require_key_from_default(self) -> None:
        """require: ключ из DEFAULT наследуется, возвращает значение."""
        content = (
            "[DEFAULT]\n"    # строка 1
            "mode=auto\n"  # строка 2
            "\n"             # строка 3
            "[sec]\n"        # строка 4
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            self.assertEqual(cfg.require("sec", "mode"), "auto")


class TestEdgeCases(unittest.TestCase):
    """Дополнительные граничные сценарии."""

    def test_value_with_equals_sign(self) -> None:
        """Значение содержит '=': первый = разделяет, остальные — часть значения."""
        content = (
            "[s]\n"                        # строка 1
            "equation=a=b+c\n"            # строка 2: key='equation', value='a=b+c'
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            self.assertEqual(cfg.get("s", "equation"), "a=b+c")

    def test_value_with_leading_trailing_spaces(self) -> None:
        """Пробелы вокруг = и значения strip-ятся."""
        content = (
            "[s]\n"                    # строка 1
            "key  =   trimmed  \n"    # строка 2: key='key', value='trimmed'
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            self.assertEqual(cfg.get("s", "key"), "trimmed")

    def test_multiple_sections_with_same_key(self) -> None:
        """Разные секции могут иметь одинаковый ключ с разными значениями."""
        content = (
            "[a]\n"     # строка 1
            "x=10\n"    # строка 2
            "[b]\n"     # строка 3
            "x=20\n"    # строка 4
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            self.assertEqual(cfg.get("a", "x"), 10)
            self.assertEqual(cfg.get("b", "x"), 20)

    def test_missing_key_exception_is_value_error(self) -> None:
        """ConfigMissingKey наследует ValueError."""
        content = (
            "[s]\n"   # строка 1
        )
        with tempfile.TemporaryDirectory() as td:
            path = _write_config(td, content)
            cfg = Config.load(path)
            with self.assertRaises(ValueError):
                cfg.require("s", "missing")


if __name__ == "__main__":
    unittest.main()
