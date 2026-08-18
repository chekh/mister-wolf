"""Калькулятор арифметических выражений.

Лексер → рекурсивный спуск с вычислением на лету (без построения AST).
Грамматика:

    expr    := term (('+' | '-') term)*
    term    := factor (('*' | '/') factor)*
    factor  := '-' factor | primary
    primary := NUMBER | '(' expr ')'

Поддерживаются: +, -, *, /, скобки, унарный минус.
Результат всегда float, деление — true division.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, auto
from typing import Final


class _TokenType(Enum):
    NUMBER = auto()
    PLUS = auto()
    MINUS = auto()
    STAR = auto()
    SLASH = auto()
    LPAREN = auto()
    RPAREN = auto()
    EOF = auto()


@dataclass(frozen=True)
class _Token:
    type: _TokenType
    value: str


# Множество символов-разделителей (пробелы, табы)
_WHITESPACE: Final = frozenset(" \t")


def _tokenize(expression: str) -> list[_Token]:
    """Разбивает строку на список токенов.

    Args:
        expression: Исходная строка с арифметическим выражением.

    Returns:
        Список токенов, оканчивающийся токеном EOF.

    Raises:
        SyntaxError: При обнаружении неизвестного символа или невалидного числа.
    """
    tokens: list[_Token] = []
    i = 0
    n = len(expression)

    while i < n:
        ch = expression[i]

        if ch in _WHITESPACE:
            i += 1
            continue

        if ch == "+":
            tokens.append(_Token(_TokenType.PLUS, ch))
            i += 1
        elif ch == "-":
            tokens.append(_Token(_TokenType.MINUS, ch))
            i += 1
        elif ch == "*":
            tokens.append(_Token(_TokenType.STAR, ch))
            i += 1
        elif ch == "/":
            tokens.append(_Token(_TokenType.SLASH, ch))
            i += 1
        elif ch == "(":
            tokens.append(_Token(_TokenType.LPAREN, ch))
            i += 1
        elif ch == ")":
            tokens.append(_Token(_TokenType.RPAREN, ch))
            i += 1
        elif ch.isdigit() or ch == ".":
            # Число: \d+(\.\d*)? | \.\d+
            # Проверяем на несколько точек в одном числе
            start = i
            dot_count = 0
            while i < n and (expression[i].isdigit() or expression[i] == "."):
                if expression[i] == ".":
                    dot_count += 1
                    if dot_count > 1:
                        raise SyntaxError(
                            f"Invalid number with multiple dots at position {start}"
                        )
                i += 1

            number_str = expression[start:i]

            # Проверяем, что строка валидна: не одна точка, не пустая
            if number_str == ".":
                raise SyntaxError(
                    f"Invalid number '.' at position {start}"
                )

            tokens.append(_Token(_TokenType.NUMBER, number_str))
        else:
            raise SyntaxError(f"Unexpected character '{ch}' at position {i}")

    tokens.append(_Token(_TokenType.EOF, ""))
    return tokens


class _Parser:
    """Рекурсивный спуск-парсер с вычислением на лету."""

    def __init__(self, tokens: list[_Token]) -> None:
        self._tokens = tokens
        self._pos: int = 0

    def _current(self) -> _Token:
        return self._tokens[self._pos]

    def _advance(self) -> _Token:
        token = self._tokens[self._pos]
        self._pos += 1
        return token

    def _expect(self, token_type: _TokenType) -> _Token:
        token = self._current()
        if token.type is not token_type:
            raise SyntaxError(
                f"Expected {token_type.name}, got {token.type.name} ('{token.value}')"
            )
        return self._advance()

    def parse(self) -> float:
        """Запускает парсинг и возвращает результат.

        Raises:
            SyntaxError: Если после выражения остались непрочитанные токены.
        """
        result = self._expr()
        # Проверяем, что все токены исчерпаны (кроме EOF)
        if self._current().type is not _TokenType.EOF:
            raise SyntaxError(
                f"Unexpected token after expression: '{self._current().value}'"
            )
        return result

    def _expr(self) -> float:
        """expr := term (('+' | '-') term)*"""
        result = self._term()
        while self._current().type in (_TokenType.PLUS, _TokenType.MINUS):
            op = self._advance()
            right = self._term()
            if op.type is _TokenType.PLUS:
                result = result + right
            else:
                result = result - right
        return result

    def _term(self) -> float:
        """term := factor (('*' | '/') factor)*"""
        result = self._factor()
        while self._current().type in (_TokenType.STAR, _TokenType.SLASH):
            op = self._advance()
            right = self._factor()
            if op.type is _TokenType.STAR:
                result = result * right
            else:
                if right == 0.0:
                    raise ZeroDivisionError("division by zero")
                result = result / right
        return result

    def _factor(self) -> float:
        """factor := '-' factor | primary"""
        if self._current().type is _TokenType.MINUS:
            self._advance()
            return -self._factor()
        return self._primary()

    def _primary(self) -> float:
        """primary := NUMBER | '(' expr ')'"""
        token = self._current()

        if token.type is _TokenType.NUMBER:
            self._advance()
            return float(token.value)

        if token.type is _TokenType.LPAREN:
            self._advance()
            result = self._expr()
            self._expect(_TokenType.RPAREN)
            return result

        raise SyntaxError(
            f"Expected number or '(', got {token.type.name} ('{token.value}')"
        )


def evaluate(expression: str) -> float:
    """Вычисляет арифметическое выражение и возвращает результат.

    Поддерживаемые операции: сложение (+), вычитание (-), умножение (*),
    деление (/), скобки, унарный минус.

    Числа: целые (``3``), с дробной частью (``3.14``), с ведущей точкой
    (``.5``), с замыкающей точкой (``5.``).

    Args:
        expression: Строка с арифметическим выражением.

    Returns:
        Результат вычисления в виде ``float``.

    Raises:
        SyntaxError: При синтаксической ошибке в выражении (непарные скобки,
            неизвестные символы, пустой ввод, оператор без операнда и т.д.).
        ZeroDivisionError: При делении на ноль.
    """
    tokens = _tokenize(expression)
    parser = _Parser(tokens)
    return parser.parse()
