"""Тесты для config_parser — INI-подобный парсер конфигурационных файлов.

Все фикстуры создаются через tempfile; тесты запускаются напрямую.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from config_parser import (
    Config,
    ConfigMissingKey,
    ConfigSyntaxError,
    ConfigUnknownSection,
)

# Номера строк в тестовом конфиге (1-based)
# Используется единая нумерация для удобства расчёта ожидаемых line.


class _TempConfigMixin:
    """Хелпер: создаёт временный конфиг-файл и возвращает путь."""

    def _write_config(
        self, content: str
    ) -> Path:
        """Создаёт временный файл с заданным содержимым.

        Args:
            content: Текст конфигурации.

        Returns:
            Path к созданному файлу.
        """
        self._tmpdir = tempfile.TemporaryDirectory()
        path = Path(self._tmpdir.name) / "test.cfg"
        path.write_text(content, encoding="utf-8")
        return path


class TestValidConfig(unittest.TestCase, _TempConfigMixin):
    """Базовый тест: валидный файл с несколькими секциями."""

    def test_valid_file_sections_and_keys(self) -> None:
        """Проверяет загрузку и чтение значений из нескольких секций."""
        content = (
            "[server]\n"
            "host=localhost\n"
            "port=8080\n"
            "\n"
            "[database]\n"
            "name=mydb\n"
        )
        path = self._write_config(content)
        cfg = Config.load(path)

        self.assertEqual(cfg.get("server", "host"), "localhost")
        self.assertEqual(cfg.get("server", "port"), 8080)
        self.assertEqual(cfg.get("database", "name"), "mydb")

    def tearDown(self) -> None:
        if hasattr(self, "_tmpdir"):
            self._tmpdir.cleanup()


class TestDefaultInheritance(unittest.TestCase, _TempConfigMixin):
    """Наследование DEFAULT: ключи видны в секциях, перекрытие работает."""

    def test_default_key_visible_in_section(self) -> None:
        """Ключ из DEFAULT виден в произвольной секции."""
        content = (
            "[DEFAULT]\n"
            "timeout=30\n"
            "\n"
            "[server]\n"
            "host=localhost\n"
        )
        path = self._write_config(content)
        cfg = Config.load(path)
        self.assertEqual(cfg.get("server", "timeout"), 30)

    def test_explicit_key_overrides_default(self) -> None:
        """Явный ключ секции перекрывает значение из DEFAULT."""
        content = (
            "[DEFAULT]\n"
            "timeout=30\n"
            "\n"
            "[server]\n"
            "timeout=60\n"
            "host=localhost\n"
        )
        path = self._write_config(content)
        cfg = Config.load(path)
        self.assertEqual(cfg.get("server", "timeout"), 60)

    def tearDown(self) -> None:
        if hasattr(self, "_tmpdir"):
            self._tmpdir.cleanup()


class TestCommentsAndEmptyLines(unittest.TestCase, _TempConfigMixin):
    """Комментарии и пустые строки игнорируются."""

    def test_comments_and_empty_lines_ignored(self) -> None:
        """Строки с # и пустые строки не влияют на парсинг."""
        content = (
            "# Это комментарий\n"
            "\n"
            "[server]\n"
            "  # ещё комментарий\n"
            "\n"
            "host=localhost\n"
            "# хвост\n"
        )
        path = self._write_config(content)
        cfg = Config.load(path)
        self.assertEqual(cfg.get("server", "host"), "localhost")

    def tearDown(self) -> None:
        if hasattr(self, "_tmpdir"):
            self._tmpdir.cleanup()


class TestAutoTyping(unittest.TestCase, _TempConfigMixin):
    """Автотипизация значений: bool, int, float, str, пустое значение."""

    def test_types_int_negative_int(self) -> None:
        """int и отрицательный int распознаются корректно."""
        content = (
            "[types]\n"
            "pos_int=42\n"
            "neg_int=-7\n"
        )
        path = self._write_config(content)
        cfg = Config.load(path)
        self.assertEqual(cfg.get("types", "pos_int"), 42)
        self.assertEqual(cfg.get("types", "neg_int"), -7)
        self.assertIsInstance(cfg.get("types", "pos_int"), int)
        self.assertIsInstance(cfg.get("types", "neg_int"), int)

    def test_types_float_negative_float(self) -> None:
        """float и отрицательный float распознаются корректно."""
        content = (
            "[types]\n"
            "pos_float=3.14\n"
            "neg_float=-2.5\n"
            "sci_float=1e3\n"
        )
        path = self._write_config(content)
        cfg = Config.load(path)
        self.assertEqual(cfg.get("types", "pos_float"), 3.14)
        self.assertEqual(cfg.get("types", "neg_float"), -2.5)
        self.assertEqual(cfg.get("types", "sci_float"), 1000.0)
        self.assertIsInstance(cfg.get("types", "pos_float"), float)
        self.assertIsInstance(cfg.get("types", "neg_float"), float)

    def test_types_bool(self) -> None:
        """true/false (без учёта регистра) → bool."""
        content = (
            "[types]\n"
            "flag_true=true\n"
            "flag_false=False\n"
            "flag_upper=TRUE\n"
        )
        path = self._write_config(content)
        cfg = Config.load(path)
        self.assertIs(cfg.get("types", "flag_true"), True)
        self.assertIs(cfg.get("types", "flag_false"), False)
        self.assertIs(cfg.get("types", "flag_upper"), True)

    def test_types_str(self) -> None:
        """Строковые значения остаются str."""
        content = (
            "[types]\n"
            "name=hello world\n"
            "path=/usr/local/bin\n"
        )
        path = self._write_config(content)
        cfg = Config.load(path)
        self.assertEqual(cfg.get("types", "name"), "hello world")
        self.assertEqual(cfg.get("types", "path"), "/usr/local/bin")
        self.assertIsInstance(cfg.get("types", "name"), str)

    def test_empty_value_is_empty_string(self) -> None:
        """key= → пустая строка."""
        content = (
            "[vals]\n"
            "empty=\n"
        )
        path = self._write_config(content)
        cfg = Config.load(path)
        self.assertEqual(cfg.get("vals", "empty"), "")

    def tearDown(self) -> None:
        if hasattr(self, "_tmpdir"):
            self._tmpdir.cleanup()


class TestSyntaxErrors(unittest.TestCase, _TempConfigMixin):
    """ConfigSyntaxError с проверкой номеров строк."""

    def test_default_section_is_valid(self) -> None:
        """Секция [DEFAULT] допустима и загружается без ошибок."""
        content = (
            "[DEFAULT]\n"
            "timeout=30\n"
        )
        path = self._write_config(content)
        cfg = Config.load(path)

    def test_keyvalue_outside_section(self) -> None:
        """Пара key=value до любой секции → SyntaxError, line=1."""
        content = "key=value\n"
        path = self._write_config(content)
        with self.assertRaises(ConfigSyntaxError) as ctx:
            Config.load(path)
        self.assertEqual(ctx.exception.line, 1)

    def test_line_without_equals_in_section(self) -> None:
        """Строка без '=' внутри секции → SyntaxError."""
        content = (
            "[server]\n"
            "host=localhost\n"
            "just_a_word\n"
        )
        path = self._write_config(content)
        with self.assertRaises(ConfigSyntaxError) as ctx:
            Config.load(path)
        self.assertEqual(ctx.exception.line, 3)

    def test_unclosed_bracket(self) -> None:
        """Незакрытая скобка секции [name → SyntaxError."""
        content = "[server\n"
        path = self._write_config(content)
        with self.assertRaises(ConfigSyntaxError) as ctx:
            Config.load(path)
        self.assertEqual(ctx.exception.line, 1)

    def test_empty_section_name(self) -> None:
        """Пустое имя секции [] → SyntaxError."""
        content = "[]\n"
        path = self._write_config(content)
        with self.assertRaises(ConfigSyntaxError) as ctx:
            Config.load(path)
        self.assertEqual(ctx.exception.line, 1)

    def test_empty_key(self) -> None:
        """Пустой ключ =value → SyntaxError."""
        content = (
            "[server]\n"
            "=oops\n"
        )
        path = self._write_config(content)
        with self.assertRaises(ConfigSyntaxError) as ctx:
            Config.load(path)
        self.assertEqual(ctx.exception.line, 2)

    def tearDown(self) -> None:
        if hasattr(self, "_tmpdir"):
            self._tmpdir.cleanup()


class TestGetWithDefault(unittest.TestCase, _TempConfigMixin):
    """get() возвращает default при неизвестной секции/ключе."""

    def test_get_unknown_section_returns_default(self) -> None:
        """Неизвестная секция → default."""
        content = "[server]\nhost=localhost\n"
        path = self._write_config(content)
        cfg = Config.load(path)
        self.assertIsNone(cfg.get("missing", "key"))
        self.assertEqual(cfg.get("missing", "key", 42), 42)

    def test_get_unknown_key_returns_default(self) -> None:
        """Неизвестный ключ в существующей секции → default."""
        content = "[server]\nhost=localhost\n"
        path = self._write_config(content)
        cfg = Config.load(path)
        self.assertEqual(cfg.get("server", "port", 8080), 8080)

    def test_get_falls_back_to_default_section(self) -> None:
        """Ключ, отсутствующий в секции, берётся из DEFAULT."""
        content = (
            "[DEFAULT]\n"
            "timeout=30\n"
            "\n"
            "[server]\n"
            "host=localhost\n"
        )
        path = self._write_config(content)
        cfg = Config.load(path)
        self.assertEqual(cfg.get("server", "timeout"), 30)

    def tearDown(self) -> None:
        if hasattr(self, "_tmpdir"):
            self._tmpdir.cleanup()


class TestRequireErrors(unittest.TestCase, _TempConfigMixin):
    """require() бросает исключения при отсутствии ключа/секции."""

    def test_require_missing_key_raises_missing_key(self) -> None:
        """require по отсутствующему ключу → ConfigMissingKey."""
        content = (
            "[DEFAULT]\n"
            "timeout=30\n"
            "\n"
            "[server]\n"
            "host=localhost\n"
        )
        path = self._write_config(content)
        cfg = Config.load(path)
        with self.assertRaises(ConfigMissingKey) as ctx:
            cfg.require("server", "port")
        self.assertEqual(ctx.exception.section, "server")
        self.assertEqual(ctx.exception.key, "port")
        # [server] на строке 4
        self.assertEqual(ctx.exception.line, 4)

    def test_require_unknown_section_raises_unknown_section(
        self,
    ) -> None:
        """require по неизвестной секции → ConfigUnknownSection."""
        content = "[server]\nhost=localhost\n"
        path = self._write_config(content)
        cfg = Config.load(path)
        with self.assertRaises(ConfigUnknownSection) as ctx:
            cfg.require("missing", "key")
        self.assertEqual(ctx.exception.section, "missing")
        self.assertEqual(ctx.exception.key, "key")
        self.assertIsNone(ctx.exception.line)

    def tearDown(self) -> None:
        if hasattr(self, "_tmpdir"):
            self._tmpdir.cleanup()


class TestDuplicateSections(unittest.TestCase, _TempConfigMixin):
    """Повторная секция объединяется; повторный ключ — последнее значение."""

    def test_duplicate_section_merges(self) -> None:
        """Повторное объявление секции — ключи объединяются."""
        content = (
            "[server]\n"
            "host=localhost\n"
            "\n"
            "[server]\n"
            "port=8080\n"
        )
        path = self._write_config(content)
        cfg = Config.load(path)
        self.assertEqual(cfg.get("server", "host"), "localhost")
        self.assertEqual(cfg.get("server", "port"), 8080)

    def test_duplicate_key_last_wins(self) -> None:
        """Повторный ключ в секции — последнее значение побеждает."""
        content = (
            "[server]\n"
            "host=first\n"
            "host=second\n"
        )
        path = self._write_config(content)
        cfg = Config.load(path)
        self.assertEqual(cfg.get("server", "host"), "second")

    def tearDown(self) -> None:
        if hasattr(self, "_tmpdir"):
            self._tmpdir.cleanup()


if __name__ == "__main__":
    unittest.main()
