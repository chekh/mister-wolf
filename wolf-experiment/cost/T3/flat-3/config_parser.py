# -*- coding: utf-8 -*-
"""Парсер конфигурационных файлов формата INI-подобного вида.

Формат:
    - секции: ``[section]``;
    - пары ``key=value`` внутри секции;
    - секция ``[DEFAULT]`` наследуется всеми остальными секциями
      (собственный ключ секции имеет приоритет над DEFAULT);
    - строки-комментарии начинаются с ``#`` (inline-комментарии не
      поддерживаются: ``#`` внутри значения остаётся частью значения);
    - пустые строки игнорируются.

Автотипизация значений (после strip): int -> float -> bool ("true"/"false",
без учёта регистра) -> str. Пустое значение становится пустой строкой.

Ошибки:
    - :class:`ConfigSyntaxError` — некорректная строка (с номером строки);
    - :class:`ConfigUnknownSection` — обращение к несуществующей секции;
    - :class:`ConfigMissingKey` — :meth:`Config.require` к отсутствующему ключу
      (с указанием секции, ключа и строки определения секции).
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

__all__ = [
    "ConfigError",
    "ConfigSyntaxError",
    "ConfigUnknownSection",
    "ConfigMissingKey",
    "Config",
]

DEFAULT_SECTION = "DEFAULT"


class ConfigError(Exception):
    """Базовый класс ошибок конфигурации."""


class ConfigSyntaxError(ConfigError):
    """Синтаксическая ошибка в конфигурационном файле.

    Атрибуты:
        line: номер строки (1-based), в которой обнаружена ошибка.
    """

    def __init__(self, message: str, line: int) -> None:
        super().__init__(f"{message} (строка {line})")
        self.line = line


class ConfigUnknownSection(ConfigError):
    """Обращение к несуществующей секции.

    Атрибуты:
        section: имя отсутствующей секции.
    """

    def __init__(self, section: str) -> None:
        super().__init__(f"Неизвестная секция '[{section}]'")
        self.section = section


class ConfigMissingKey(ConfigError):
    """Отсутствующий ключ при строгом запросе :meth:`Config.require`.

    Атрибуты:
        section: имя секции, в которой искали ключ.
        key: имя отсутствующего ключа.
        line: номер строки, в котором секция определена (если известен).
    """

    def __init__(self, section: str, key: str, line: Optional[int] = None) -> None:
        where = f", секция определена в строке {line}" if line is not None else ""
        super().__init__(
            f"Ключ '{key}' отсутствует в секции '[{section}]'{where}"
        )
        self.section = section
        self.key = key
        self.line = line


def _parse_value(raw: str) -> Any:
    """Автотипизация значения: int -> float -> bool -> str."""
    text = raw.strip()
    if text == "":
        return ""
    try:
        return int(text)
    except ValueError:
        pass
    try:
        return float(text)
    except ValueError:
        pass
    lowered = text.lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    return text


class Config:
    """Загруженная конфигурация.

    Атрибуты:
        sections: отображение ``имя секции -> {ключ: значение}``
            (включая ``DEFAULT``, если он объявлен).
    """

    def __init__(
        self,
        sections: Dict[str, Dict[str, Any]],
        section_lines: Dict[str, int],
    ) -> None:
        self._sections = sections
        self._section_lines = section_lines

    @classmethod
    def load(cls, path: str) -> "Config":
        """Прочитать и разобрать конфигурационный файл ``path``.

        Raises:
            ConfigSyntaxError: при некорректной строке файла.
        """
        sections: Dict[str, Dict[str, Any]] = {}
        section_lines: Dict[str, int] = {}
        current: Optional[str] = None

        with open(path, "r", encoding="utf-8") as fh:
            for lineno, raw_line in enumerate(fh, start=1):
                line = raw_line.strip()
                if line == "" or line.startswith("#"):
                    continue

                if line.startswith("["):
                    if not line.endswith("]"):
                        raise ConfigSyntaxError(
                            "Незакрытая секция: ожидается '[имя]'", lineno
                        )
                    name = line[1:-1].strip()
                    if name == "":
                        raise ConfigSyntaxError(
                            "Пустое имя секции", lineno
                        )
                    current = name
                    sections.setdefault(name, {})
                    section_lines.setdefault(name, lineno)
                    continue

                if "=" not in line:
                    raise ConfigSyntaxError(
                        "Ожидалось 'key=value' или заголовок секции '[имя]'",
                        lineno,
                    )
                if current is None:
                    raise ConfigSyntaxError(
                        "Пара 'key=value' до объявления секции", lineno
                    )
                key_text, _, value_text = line.partition("=")
                key = key_text.strip()
                if key == "":
                    raise ConfigSyntaxError("Пустое имя ключа", lineno)
                sections[current][key] = _parse_value(value_text)

        return cls(sections, section_lines)

    def _resolve(self, section: str, key: str) -> Tuple[bool, Any]:
        """Поиск ключа в секции с наследованием DEFAULT.

        Returns:
            Кортеж ``(found, value)``.
        """
        if section in self._sections:
            if key in self._sections[section]:
                return True, self._sections[section][key]
            if (
                section != DEFAULT_SECTION
                and DEFAULT_SECTION in self._sections
                and key in self._sections[DEFAULT_SECTION]
            ):
                return True, self._sections[DEFAULT_SECTION][key]
            return False, None
        if (
            section != DEFAULT_SECTION
            and DEFAULT_SECTION in self._sections
            and key in self._sections[DEFAULT_SECTION]
        ):
            return True, self._sections[DEFAULT_SECTION][key]
        return False, None

    def get(self, section: str, key: str, default: Any = None) -> Any:
        """Значение ключа ``key`` секции ``section`` (с наследованием DEFAULT).

        Args:
            section: имя секции.
            key: имя ключа.
            default: значение по умолчанию, если ключ не найден.

        Returns:
            Типизированное значение либо ``default``.

        Raises:
            ConfigUnknownSection: если секция не объявлена в файле.
        """
        if section not in self._sections:
            raise ConfigUnknownSection(section)
        found, value = self._resolve(section, key)
        if not found:
            return default
        return value

    def require(self, section: str, key: str) -> Any:
        """Строго получить значение ключа (ключ обязан существовать).

        Raises:
            ConfigUnknownSection: если секция не объявлена в файле.
            ConfigMissingKey: если ключа нет ни в секции, ни в DEFAULT.
        """
        if section not in self._sections:
            raise ConfigUnknownSection(section)
        found, value = self._resolve(section, key)
        if not found:
            raise ConfigMissingKey(section, key, self._section_lines.get(section))
        return value
