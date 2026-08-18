"""INI-подобный парсер конфигурационных файлов.

Поддерживает секции, DEFAULT-наследование, автотипизацию значений.
Только stdlib.
"""

from __future__ import annotations

import re
from pathlib import Path


# ---------------------------------------------------------------------------
# Исключения
# ---------------------------------------------------------------------------


class ConfigError(Exception):
    """Базовое исключение парсера конфигурации."""


class ConfigSyntaxError(ConfigError):
    """Синтаксическая ошибка при парсинге.

    Attributes:
        line: 1-based номер строки файла.
    """

    def __init__(self, message: str, line: int) -> None:
        self.line = line
        super().__init__(message)


class ConfigUnknownSection(ConfigError):
    """Обращение к несуществующей секции через require.

    Attributes:
        section: Имя запрошенной секции.
        key: Запрошенный ключ.
        line: Всегда None — несуществующей секции нет в файле.
    """

    def __init__(self, section: str, key: str, line: int | None) -> None:
        self.section = section
        self.key = key
        self.line = line
        super().__init__(
            f"Секция '{section}' не найдена (запрошен ключ '{key}')"
        )


class ConfigMissingKey(ConfigError):
    """Ключ не найден ни в секции, ни в DEFAULT.

    Attributes:
        section: Имя секции.
        key: Запрошенный ключ.
        line: 1-based номер строки объявления секции в файле.
    """

    def __init__(self, section: str, key: str, line: int) -> None:
        self.section = section
        self.key = key
        self.line = line
        super().__init__(
            f"Ключ '{key}' не найден в секции '{section}' (строка {line})"
        )


# ---------------------------------------------------------------------------
# Автотипизация
# ---------------------------------------------------------------------------

_BOOL_RE = re.compile(r"^(true|false)$", re.IGNORECASE)
_INT_RE = re.compile(r"^-?\d+$")
_FLOAT_RE = re.compile(
    r"^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$"
)


def _auto_type(value: str) -> object:
    """Автоматически определяет тип значения.

    Порядок: bool → int → float → str.
    Пустое значение → "".

    Args:
        value: Строковое значение.

    Returns:
        Приведённое значение (bool, int, float или str).
    """
    if value == "":
        return ""
    if _BOOL_RE.match(value):
        return value.lower() == "true"
    if _INT_RE.match(value):
        return int(value)
    if _FLOAT_RE.match(value):
        return float(value)
    return value


# ---------------------------------------------------------------------------
# Парсер
# ---------------------------------------------------------------------------

_SECTION_RE = re.compile(r"^\[(.+)\]\s*$")


class Config:
    """INI-подобная конфигурация с наследованием DEFAULT.

    Attributes:
        _sections: Словарь секций: имя → {ключ: значение}.
        _section_lines: Словарь: имя секции → номер строки первого объявления.
        _default: Словарь ключей секции [DEFAULT].
        _default_line: Номер строки объявления [DEFAULT] или None.
    """

    def __init__(self) -> None:
        self._sections: dict[str, dict[str, object]] = {}
        self._section_lines: dict[str, int] = {}
        self._default: dict[str, object] = {}
        self._default_line: int | None = None

    # ------------------------------------------------------------------
    # Публичный API
    # ------------------------------------------------------------------

    @classmethod
    def load(cls, path: str | Path) -> Config:
        """Загружает конфигурацию из файла.

        Args:
            path: Путь к конфигурационному файлу.

        Returns:
            Экземпляр Config.

        Raises:
            ConfigSyntaxError: При синтаксических ошибках в файле.
        """
        cfg = cls()
        cfg._parse_file(Path(path))
        return cfg

    def get(
        self,
        section: str,
        key: str,
        default: object = None,
    ) -> object:
        """Возвращает значение с fallback: секция → DEFAULT → default.

        Не вызывает исключений. Если секция неизвестна или ключ нигде
        не найден — возвращает ``default``.

        Args:
            section: Имя секции.
            key: Имя ключа.
            default: Значение по умолчанию.

        Returns:
            Найденное значение или default.
        """
        sec_data = self._sections.get(section)
        if sec_data is not None and key in sec_data:
            return sec_data[key]
        if key in self._default:
            return self._default[key]
        return default

    def require(self, section: str, key: str) -> object:
        """Возвращает значение, вызывая исключение при отсутствии.

        Args:
            section: Имя секции.
            key: Имя ключа.

        Returns:
            Найденное значение.

        Raises:
            ConfigUnknownSection: Если секция не существует.
            ConfigMissingKey: Если ключ не найден (ни в секции, ни в DEFAULT).
        """
        sec_data = self._sections.get(section)
        if sec_data is None:
            raise ConfigUnknownSection(section, key, line=None)
        if key in sec_data:
            return sec_data[key]
        if key in self._default:
            return self._default[key]
        raise ConfigMissingKey(
            section, key, line=self._section_lines[section]
        )

    # ------------------------------------------------------------------
    # Introspection (для тестов)
    # ------------------------------------------------------------------

    def sections(self) -> list[str]:
        """Возвращает имена всех секций (кроме DEFAULT) в порядке появления."""
        return list(self._section_lines.keys())

    # ------------------------------------------------------------------
    # Внутренний парсер
    # ------------------------------------------------------------------

    def _parse_file(self, path: Path) -> None:
        """Парсит файл построчно."""
        text = path.read_text(encoding="utf-8")
        lines = text.splitlines()
        current_section: str | None = None

        for idx, raw_line in enumerate(lines, start=1):
            line = raw_line.strip()

            # Пустая строка или комментарий — пропускаем
            if line == "" or line.startswith("#"):
                continue

            # Секция
            m = _SECTION_RE.match(line)
            if m:
                section_name = m.group(1)
                if section_name == "":
                    raise ConfigSyntaxError(
                        "Пустое имя секции", line=idx
                    )
                if section_name == "DEFAULT":
                    if self._default_line is None:
                        self._default_line = idx
                else:
                    if section_name not in self._section_lines:
                        self._section_lines[section_name] = idx
                    self._sections.setdefault(section_name, {})
                current_section = section_name
                continue

            # Незакрытая скобка секции
            if line.startswith("["):
                raise ConfigSyntaxError(
                    "Незакрытая скобка секции", line=idx
                )

            # Пара key=value
            if "=" in line:
                key_part, _, value_part = line.partition("=")
                key_stripped = key_part.strip()
                value_stripped = value_part.strip()
                if key_stripped == "":
                    raise ConfigSyntaxError(
                        "Пустой ключ", line=idx
                    )
                typed_value = _auto_type(value_stripped)

                if current_section == "DEFAULT":
                    self._default[key_stripped] = typed_value
                elif current_section is not None:
                    self._sections[current_section][
                        key_stripped
                    ] = typed_value
                else:
                    raise ConfigSyntaxError(
                        "Пара key=value вне секции", line=idx
                    )
                continue

            # Строка без '=' внутри секции — синтаксическая ошибка
            raise ConfigSyntaxError(
                "Неизвестная синтаксическая конструкция", line=idx
            )
