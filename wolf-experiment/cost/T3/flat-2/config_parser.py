# -*- coding: utf-8 -*-
"""Парсер INI-подобных конфигурационных файлов.

Формат:
    - секции ``[section]``;
    - пары ``key=value`` внутри секций;
    - секция ``[DEFAULT]`` наследуется всеми секциями (своя секция
      переопределяет значения DEFAULT);
    - строки-комментарии начинаются с ``#``;
    - пустые строки игнорируются;
    - значения автотипизируются: bool (``true``/``false``), int, float,
      иначе str.

Ошибки:
    - :class:`ConfigSyntaxError` — синтаксическая ошибка (номер строки);
    - :class:`ConfigUnknownSection` — обращение к несуществующей секции;
    - :class:`ConfigMissingKey` — отсутствующий ключ (секция/ключ/строка).
"""

from __future__ import annotations

import re
from typing import Any, Dict, Optional, Tuple

__all__ = [
    "Config",
    "ConfigError",
    "ConfigSyntaxError",
    "ConfigUnknownSection",
    "ConfigMissingKey",
]

DEFAULT_SECTION = "DEFAULT"

_SECTION_RE = re.compile(r"^\[(.+)\]$")
_INT_RE = re.compile(r"^[+-]?\d+$")
_FLOAT_RE = re.compile(r"^[+-]?(?:\d+\.\d*|\.\d+|\d+(?=[eE]))(?:[eE][+-]?\d+)?$")


class ConfigError(Exception):
    """Базовый класс ошибок конфигурации."""


class ConfigSyntaxError(ConfigError):
    """Синтаксическая ошибка в конфигурационном файле."""

    def __init__(self, line_no: int, message: str) -> None:
        self.line_no = line_no
        super().__init__(f"строка {line_no}: {message}")


class ConfigUnknownSection(ConfigError):
    """Обращение к несуществующей секции."""

    def __init__(self, section: str) -> None:
        self.section = section
        super().__init__(f"неизвестная секция: {section!r}")


class ConfigMissingKey(ConfigError):
    """Отсутствующий ключ в секции."""

    def __init__(self, section: str, key: str, line_no: Optional[int] = None) -> None:
        self.section = section
        self.key = key
        self.line_no = line_no
        loc = f" (секция объявлена в строке {line_no})" if line_no is not None else ""
        super().__init__(f"отсутствует ключ {key!r} в секции {section!r}{loc}")


def _convert(raw: str) -> Any:
    """Автотипизация значения: bool -> int -> float -> str."""
    lowered = raw.lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    if _INT_RE.match(raw):
        return int(raw)
    if _FLOAT_RE.match(raw):
        return float(raw)
    return raw


class Config:
    """Загруженный конфигурационный файл.

    Атрибут ``sections`` отображает имя секции в словарь
    ``ключ -> (значение, номер_строки)`` (значения уже типизированы).
    """

    def __init__(self) -> None:
        self.sections: Dict[str, Dict[str, Tuple[Any, int]]] = {}
        self._section_lines: Dict[str, int] = {}

    # ------------------------------------------------------------------
    # Загрузка
    # ------------------------------------------------------------------

    @classmethod
    def load(cls, path: str) -> "Config":
        """Прочитать конфиг из файла ``path``."""
        cfg = cls()
        current: Optional[str] = None
        with open(path, "r", encoding="utf-8") as fh:
            for line_no, raw_line in enumerate(fh, start=1):
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                header = _SECTION_RE.match(line)
                if header is not None:
                    current = header.group(1).strip()
                    if not current:
                        raise ConfigSyntaxError(line_no, "пустое имя секции")
                    cfg.sections.setdefault(current, {})
                    cfg._section_lines.setdefault(current, line_no)
                    continue
                if current is None:
                    raise ConfigSyntaxError(
                        line_no, f"пару ключ=значение {line!r} вне секции"
                    )
                if "=" not in line:
                    raise ConfigSyntaxError(
                        line_no, f"ожидалось key=value, получено {line!r}"
                    )
                key, _, value = line.partition("=")
                key = key.strip()
                if not key:
                    raise ConfigSyntaxError(line_no, "пустой ключ")
                cfg.sections[current][key] = (_convert(value.strip()), line_no)
        return cfg

    # ------------------------------------------------------------------
    # Доступ к значениям
    # ------------------------------------------------------------------

    def _resolve(
        self, section: str, key: str
    ) -> Tuple[bool, Optional[Tuple[Any, int]]]:
        """Найти ``key``: сначала в секции, затем в DEFAULT.

        Возвращает ``(found, (value, line_no))``.
        """
        if section in self.sections:
            if key in self.sections[section]:
                return True, self.sections[section][key]
        if (
            section != DEFAULT_SECTION
            and DEFAULT_SECTION in self.sections
            and key in self.sections[DEFAULT_SECTION]
        ):
            return True, self.sections[DEFAULT_SECTION][key]
        return False, None

    def get(self, section: str, key: str, default: Any = None) -> Any:
        """Значение ``key`` в ``section`` (с наследованием DEFAULT).

        Для отсутствующего ключа или неизвестной секции возвращает
        ``default``.
        """
        found, entry = self._resolve(section, key)
        if not found:
            return default
        return entry[0]  # type: ignore[index]

    def require(self, section: str, key: str) -> Any:
        """Строгое получение значения: иначе ConfigUnknownSection/ConfigMissingKey."""
        if section not in self.sections:
            raise ConfigUnknownSection(section)
        found, entry = self._resolve(section, key)
        if not found:
            raise ConfigMissingKey(
                section, key, line_no=self._section_lines.get(section)
            )
        return entry[0]  # type: ignore[index]
