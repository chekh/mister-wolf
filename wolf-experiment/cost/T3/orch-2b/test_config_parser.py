"""Тесты модуля config_parser.py — МИНИМУМ 12 тестов."""

import os
import tempfile
import unittest
from config_parser import (
    Config,
    ConfigError,
    ConfigMissingKey,
    ConfigSyntaxError,
    ConfigUnknownSection,
)


class TestConfigParser(unittest.TestCase):
    """Тесты парсера конфигурационных файлов."""

    def setUp(self) -> None:
        """Создаём временный файл для каждого теста."""
        self.tmpdir = tempfile.mkdtemp()
        self.tmpfile = os.path.join(self.tmpdir, "test.cfg")

    def tearDown(self) -> None:
        """Удаляем временные файлы."""
        if os.path.exists(self.tmpfile):
            os.unlink(self.tmpfile)
        if os.path.isdir(self.tmpdir):
            os.rmdir(self.tmpdir)

    def _write(self, content: str) -> str:
        """Пишет содержимое во временный файл, возвращает путь."""
        with open(self.tmpfile, "w", encoding="utf-8") as f:
            f.write(content)
        return self.tmpfile

    # --- 1. Валидный файл ---
    def test_valid_file_reads_all_values(self) -> None:
        """Валидный файл — все значения читаются корректно."""
        self._write(
            "[DEFAULT]\n"
            "timeout=30\n"
            "verbose=true\n\n"
            "[server]\n"
            "host=localhost\n"
            "port=8080\n"
        )
        cfg = Config.load(self.tmpfile)
        self.assertEqual(cfg.get("server", "host"), "localhost")
        self.assertEqual(cfg.get("server", "port"), 8080)
        self.assertEqual(cfg.get("DEFAULT", "timeout"), 30)
        self.assertEqual(cfg.get("DEFAULT", "verbose"), True)

    # --- 2. Наследование DEFAULT ---
    def test_default_inheritance_key_visible_in_section(self) -> None:
        """Ключ из DEFAULT виден в секции."""
        self._write(
            "[DEFAULT]\n"
            "timeout=30\n\n"
            "[server]\n"
            "host=localhost\n"
        )
        cfg = Config.load(self.tmpfile)
        # timeout из DEFAULT виден в server
        self.assertEqual(cfg.get("server", "timeout"), 30)

    def test_default_override_section_wins(self) -> None:
        """Переопределение в секции побеждает DEFAULT."""
        self._write(
            "[DEFAULT]\n"
            "timeout=30\n\n"
            "[server]\n"
            "timeout=60\n"
            "host=localhost\n"
        )
        cfg = Config.load(self.tmpfile)
        # server.timeout = 60, не 30
        self.assertEqual(cfg.get("server", "timeout"), 60)
        # DEFAULT.timeout всё ещё 30
        self.assertEqual(cfg.get("DEFAULT", "timeout"), 30)

    # --- 3. Комментарии и пустые строки ---
    def test_comments_and_empty_lines_ignored(self) -> None:
        """Комментарии и пустые строки игнорируются."""
        self._write(
            "# Это комментарий\n"
            "\n"
            "[section]\n"
            "  # Вложенный комментарий\n"
            "\n"
            "key=value\n"
            "\n"
            "# Финальный комментарий\n"
        )
        cfg = Config.load(self.tmpfile)
        self.assertEqual(cfg.get("section", "key"), "value")

    # --- 4. Типы значений ---
    def test_type_int(self) -> None:
        """Целочисленные значения типизируются как int."""
        self._write("[s]\nval=42\n")
        cfg = Config.load(self.tmpfile)
        self.assertIsInstance(cfg.get("s", "val"), int)
        self.assertEqual(cfg.get("s", "val"), 42)

    def test_type_float(self) -> None:
        """Вещественные значения типизируются как float."""
        self._write("[s]\nval=3.14\n")
        cfg = Config.load(self.tmpfile)
        self.assertIsInstance(cfg.get("s", "val"), float)
        self.assertEqual(cfg.get("s", "val"), 3.14)

    def test_type_bool_true(self) -> None:
        """Bool true — регистронезависимо."""
        self._write("[s]\na=true\nb=TrUe\n")
        cfg = Config.load(self.tmpfile)
        self.assertIsInstance(cfg.get("s", "a"), bool)
        self.assertTrue(cfg.get("s", "a"))
        self.assertTrue(cfg.get("s", "b"))

    def test_type_bool_false(self) -> None:
        """Bool false — регистронезависимо."""
        self._write("[s]\na=false\nb=FalSe\n")
        cfg = Config.load(self.tmpfile)
        self.assertIsInstance(cfg.get("s", "a"), bool)
        self.assertFalse(cfg.get("s", "a"))
        self.assertFalse(cfg.get("s", "b"))

    def test_type_str(self) -> None:
        """Строковые значения остаются str."""
        self._write("[s]\nname=hello world\n")
        cfg = Config.load(self.tmpfile)
        self.assertIsInstance(cfg.get("s", "name"), str)
        self.assertEqual(cfg.get("s", "name"), "hello world")

    def test_type_negative_int(self) -> None:
        """Отрицательное целое число."""
        self._write("[s]\nval=-5\n")
        cfg = Config.load(self.tmpfile)
        self.assertIsInstance(cfg.get("s", "val"), int)
        self.assertEqual(cfg.get("s", "val"), -5)

    def test_type_negative_float(self) -> None:
        """Отрицательное вещественное число."""
        self._write("[s]\nval=-2.5\n")
        cfg = Config.load(self.tmpfile)
        self.assertIsInstance(cfg.get("s", "val"), float)
        self.assertEqual(cfg.get("s", "val"), -2.5)

    # --- 5. ConfigSyntaxError ---
    def test_syntax_error_unclosed_bracket(self) -> None:
        """Секция без закрывающей скобки — ConfigSyntaxError."""
        self._write("[section\nkey=val\n")
        with self.assertRaises(ConfigSyntaxError) as ctx:
            Config.load(self.tmpfile)
        exc = ctx.exception
        self.assertEqual(exc.line, 1)
        self.assertIn("line 1", str(exc))

    def test_syntax_error_empty_key(self) -> None:
        """key=value с пустым ключом — ConfigSyntaxError."""
        self._write("[s]\n=val\n")
        with self.assertRaises(ConfigSyntaxError) as ctx:
            Config.load(self.tmpfile)
        exc = ctx.exception
        self.assertEqual(exc.line, 2)
        self.assertIn("line 2", str(exc))

    def test_syntax_error_unexpected_content(self) -> None:
        """Строка, не являющаяся ни секцией, ни парой, ни комментарием."""
        self._write("[s]\njust_garbage\n")
        with self.assertRaises(ConfigSyntaxError) as ctx:
            Config.load(self.tmpfile)
        exc = ctx.exception
        self.assertEqual(exc.line, 2)
        self.assertIn("line 2", str(exc))

    def test_syntax_error_kv_outside_section(self) -> None:
        """Пара key=value до любой секции — ConfigSyntaxError."""
        self._write("key=val\n[s]\n")
        with self.assertRaises(ConfigSyntaxError) as ctx:
            Config.load(self.tmpfile)
        self.assertEqual(ctx.exception.line, 1)

    # --- 6. ConfigUnknownSection ---
    def test_require_unknown_section(self) -> None:
        """require на несуществующую секцию — ConfigUnknownSection."""
        self._write("[s]\nkey=val\n")
        cfg = Config.load(self.tmpfile)
        with self.assertRaises(ConfigUnknownSection) as ctx:
            cfg.require("nonexistent", "key")
        exc = ctx.exception
        self.assertEqual(exc.section, "nonexistent")
        self.assertEqual(exc.key, "key")

    # --- 7. ConfigMissingKey ---
    def test_require_missing_key(self) -> None:
        """require отсутствующего ключа — ConfigMissingKey."""
        self._write("[s]\nkey=val\n")
        cfg = Config.load(self.tmpfile)
        with self.assertRaises(ConfigMissingKey) as ctx:
            cfg.require("s", "other")
        exc = ctx.exception
        self.assertEqual(exc.section, "s")
        self.assertEqual(exc.key, "other")

    def test_require_missing_key_not_in_default(self) -> None:
        """require ключа, которого нет ни в секции, ни в DEFAULT."""
        self._write("[DEFAULT]\ntimeout=30\n[s]\nhost=localhost\n")
        cfg = Config.load(self.tmpfile)
        with self.assertRaises(ConfigMissingKey) as ctx:
            cfg.require("s", "port")
        exc = ctx.exception
        self.assertEqual(exc.section, "s")
        self.assertEqual(exc.key, "port")

    # --- 8. get с default ---
    def test_get_default_missing_key(self) -> None:
        """get возвращает default при отсутствии ключа."""
        self._write("[s]\nkey=val\n")
        cfg = Config.load(self.tmpfile)
        self.assertIsNone(cfg.get("s", "other"))
        self.assertEqual(cfg.get("s", "other", "fallback"), "fallback")

    def test_get_default_missing_section(self) -> None:
        """get возвращает default при отсутствии секции."""
        self._write("[s]\nkey=val\n")
        cfg = Config.load(self.tmpfile)
        self.assertIsNone(cfg.get("nonexistent", "key"))
        self.assertEqual(cfg.get("nonexistent", "key", 42), 42)

    # --- 9. Исключения наследуются от ConfigError ---
    def test_exceptions_inherit_from_config_error(self) -> None:
        """Все кастомные исключения наследуются от ConfigError."""
        self.assertTrue(issubclass(ConfigSyntaxError, ConfigError))
        self.assertTrue(issubclass(ConfigUnknownSection, ConfigError))
        self.assertTrue(issubclass(ConfigMissingKey, ConfigError))


if __name__ == "__main__":
    unittest.main()
