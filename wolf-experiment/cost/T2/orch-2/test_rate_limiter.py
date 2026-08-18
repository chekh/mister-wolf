"""Тесты для модуля rate_limiter — скользящее окно с инжектируемым clock."""

import unittest
from typing import Callable

from rate_limiter import RateLimiter, RateLimitError


class FakeClock:
    """Поддельные часы: время управляется вручную через advance()."""

    def __init__(self, start: float = 0.0) -> None:
        self._now: float = start

    def __call__(self) -> float:
        """Возвращает текущее (поддельное) время."""
        return self._now

    def advance(self, seconds: float) -> None:
        """Сдвигает время вперёд на указанное количество секунд."""
        self._now += seconds


class TestRateLimiterBasic(unittest.TestCase):
    """Базовые сценарии: превышение лимита и восстановление."""

    def setUp(self) -> None:
        self.clock = FakeClock(start=0.0)
        self.limiter = RateLimiter(max_requests=3, window_seconds=10.0, clock=self.clock)

    def test_max_requests_pass_then_next_raises(self) -> None:
        """Ровно max_requests запросов проходят; лишний поднимает RateLimitError."""
        for _ in range(3):
            self.limiter.acquire("client-a")  # должен пройти молча
        with self.assertRaises(RateLimitError):
            self.limiter.acquire("client-a")  # 4-й — превышение

    def test_recovery_after_full_window(self) -> None:
        """После advance(window_seconds) запрос снова проходит."""
        for _ in range(3):
            self.limiter.acquire("client-a")
        with self.assertRaises(RateLimitError):
            self.limiter.acquire("client-a")

        # Сдвигаем время ровно на ширину окна — все старые записи выходят
        self.clock.advance(10.0)
        self.limiter.acquire("client-a")  # должен пройти

    def test_partial_window_does_not_recover(self) -> None:
        """Частичный сдвиг окна не восстанавливает лимит."""
        for _ in range(3):
            self.limiter.acquire("client-a")
        with self.assertRaises(RateLimitError):
            self.limiter.acquire("client-a")

        # Сдвиг меньше окна — старые записи ещё актуальны
        self.clock.advance(5.0)
        with self.assertRaises(RateLimitError):
            self.limiter.acquire("client-a")


class TestRateLimiterClientIndependence(unittest.TestCase):
    """Независимость лимитов по разным client_id."""

    def test_different_clients_have_separate_quotas(self) -> None:
        """Исчерпание лимита клиентом 'a' не мешает клиенту 'b'."""
        clock = FakeClock(start=0.0)
        limiter = RateLimiter(max_requests=2, window_seconds=10.0, clock=clock)

        # Клиент a исчерпывает свой лимит
        limiter.acquire("a")
        limiter.acquire("a")
        with self.assertRaises(RateLimitError):
            limiter.acquire("a")

        # Клиент b — отдельный лимит, проходит
        limiter.acquire("b")
        limiter.acquire("b")
        with self.assertRaises(RateLimitError):
            limiter.acquire("b")


class TestRateLimiterEdgeCases(unittest.TestCase):
    """Граничные и вырожденные сценарии."""

    def test_max_requests_one(self) -> None:
        """max_requests=1: первый проходит, второй — RateLimitError, после окна — проходит."""
        clock = FakeClock(start=0.0)
        limiter = RateLimiter(max_requests=1, window_seconds=5.0, clock=clock)

        limiter.acquire("c")  # первый — OK
        with self.assertRaises(RateLimitError):
            limiter.acquire("c")  # немедленный второй — ошибка

        clock.advance(5.0)
        limiter.acquire("c")  # после окна — снова OK

    def test_boundary_exact_vs_epsilon(self) -> None:
        """На границе окна: advance(window - eps) — всё ещё ошибка;
        advance до ровно window_seconds — проходит."""
        clock = FakeClock(start=0.0)
        limiter = RateLimiter(max_requests=1, window_seconds=10.0, clock=clock)

        limiter.acquire("d")
        with self.assertRaises(RateLimitError):
            limiter.acquire("d")

        # Чуть меньше окна — запись ещё активна
        clock.advance(10.0 - 1e-9)
        with self.assertRaises(RateLimitError):
            limiter.acquire("d")

        # Додвигаем до ровной границы
        clock.advance(1e-9)
        limiter.acquire("d")  # теперь OK

    def test_empty_client_id(self) -> None:
        """Пустая строка client_id работает как обычный клиент."""
        clock = FakeClock(start=0.0)
        limiter = RateLimiter(max_requests=2, window_seconds=10.0, clock=clock)

        limiter.acquire("")
        limiter.acquire("")
        with self.assertRaises(RateLimitError):
            limiter.acquire("")

    def test_independent_limiter_instances(self) -> None:
        """Разные экземпляры RateLimiter не делят состояние."""
        clock = FakeClock(start=0.0)
        limiter_a = RateLimiter(max_requests=1, window_seconds=10.0, clock=clock)
        limiter_b = RateLimiter(max_requests=1, window_seconds=10.0, clock=clock)

        limiter_a.acquire("x")
        with self.assertRaises(RateLimitError):
            limiter_a.acquire("x")

        # Другой экземпляр — свой лимит
        limiter_b.acquire("x")


class TestRateLimiterWindowSliding(unittest.TestCase):
    """Поведение скользящего окна: записи частично выходят по мере продвижения времени."""

    def test_partial_recovery_granular(self) -> None:
        """Часть старых записей выходит, часть остаётся — лимит частично восстанавливается."""
        clock = FakeClock(start=0.0)
        limiter = RateLimiter(max_requests=3, window_seconds=10.0, clock=clock)

        # 3 запроса в моменты 0, 2, 4
        limiter.acquire("e")
        clock.advance(2.0)
        limiter.acquire("e")
        clock.advance(2.0)
        limiter.acquire("e")

        # Лимит исчерпан
        with self.assertRaises(RateLimitError):
            limiter.acquire("e")

        # Сдвигаем до t=10: запрос с t=0 вышел (10-0=10 >= window), t=2 и t=4 — ещё в окне
        clock.advance(4.0)  # сейчас t=10
        with self.assertRaises(RateLimitError):
            limiter.acquire("e")  # 2 записи ещё заняли слоты (из 3 максимум)

        # Сдвигаем до t=12: записи t=0 и t=2 вышли, осталась только t=4
        clock.advance(2.0)  # сейчас t=12
        limiter.acquire("e")  # освободилось 2 слота — должно пройти
        limiter.acquire("e")  # второй зашедший — тоже


if __name__ == "__main__":
    unittest.main()
