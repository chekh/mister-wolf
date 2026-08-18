"""Тесты для in-memory rate limiter (скользящее окно).

Тестируемый модуль: rate_limiter.py (в той же директории).
Фреймворк: unittest (stdlib). Время управляется FakeClock — никаких real sleep.
"""

import unittest

from rate_limiter import RateLimiter, RateLimitError


class FakeClock:
    """Имитация монотонных часов для детерминированного тестирования."""

    def __init__(self, start: float = 0.0) -> None:
        self._now: float = start

    def __call__(self) -> float:
        return self._now

    def advance(self, seconds: float) -> None:
        self._now += seconds


# === a) Превышение лимита → RateLimitError ===


class TestRateLimitExceeded(unittest.TestCase):
    """Превышение max_requests должно вызывать RateLimitError."""

    def test_exact_limit_passes_next_raises(self):
        """Ровно max_requests запросов проходят; (max_requests+1)-й — RateLimitError."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=3, window_seconds=10.0, clock=clock)
        for _ in range(3):
            limiter.acquire("c1")  # должны пройти
        with self.assertRaises(RateLimitError):
            limiter.acquire("c1")

    def test_limit_one(self):
        """При max_requests=1 второй запрос за тем же клиентом — ошибка."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=1, window_seconds=5.0, clock=clock)
        limiter.acquire("solo")
        with self.assertRaises(RateLimitError):
            limiter.acquire("solo")

    def test_limit_ten(self):
        """При max_requests=10 одиннадцатый запрос — ошибка."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=10, window_seconds=60.0, clock=clock)
        for _ in range(10):
            limiter.acquire("big")
        with self.assertRaises(RateLimitError):
            limiter.acquire("big")

    def test_repeated_attempts_still_blocked(self):
        """После превышения лимита повторные acquire (без сдвига времени) продолжают бросать."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=2, window_seconds=10.0, clock=clock)
        limiter.acquire("c1")
        limiter.acquire("c1")
        for _ in range(5):
            with self.assertRaises(RateLimitError):
                limiter.acquire("c1")


# === b) Восстановление после окна ===


class TestWindowRecovery(unittest.TestCase):
    """После сдвига времени за границу окна лимит сбрасывается."""

    def test_advance_past_window_allows_again(self):
        """Сдвиг времени > window_seconds: все старые метки неактивны, запрос проходит."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=2, window_seconds=10.0, clock=clock)
        limiter.acquire("c1")
        limiter.acquire("c1")
        clock.advance(10.0)
        # Теперь обе старые метки неактивны — можно снова 2 запроса
        limiter.acquire("c1")
        limiter.acquire("c1")

    def test_partial_advance_does_not_reset(self):
        """Частичный сдвиг (меньше окна): часть меток остаётся активной, лимит не полный."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=3, window_seconds=10.0, clock=clock)
        limiter.acquire("c1")  # t=0
        clock.advance(5.0)
        limiter.acquire("c1")  # t=5
        limiter.acquire("c1")  # t=5 (second at same time)
        # t=5: первая метка (t=0) активна (5-0=5 < 10), вторая и третья тоже — 3/3
        with self.assertRaises(RateLimitError):
            limiter.acquire("c1")

    def test_old_requests_expire_one_by_one(self):
        """Метка выпадает ровно через window_seconds — лимит «открывается» по одной."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=2, window_seconds=10.0, clock=clock)
        limiter.acquire("c1")  # t=0, метка A
        clock.advance(1.0)
        limiter.acquire("c1")  # t=1, метка B — лимит исчерпан
        clock.advance(9.0)    # t=10: метка A неактивна (10-0=10, не <10), B активна (10-1=9<10)
        limiter.acquire("c1")  # проходит: только B активна
        # теперь метки B и C (t=10), снова лимит
        with self.assertRaises(RateLimitError):
            limiter.acquire("c1")


# === c) Независимость клиентов ===


class TestClientIndependence(unittest.TestCase):
    """Разные client_id имеют раздельные счётчики."""

    def test_different_clients_separate_limits(self):
        """Два клиента не влияют друг на друга: каждый получает свой лимит."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=1, window_seconds=10.0, clock=clock)
        limiter.acquire("alice")
        limiter.acquire("bob")  # другой клиент — отдельный лимит
        with self.assertRaises(RateLimitError):
            limiter.acquire("alice")

    def test_client_not_affected_by_another_overflow(self):
        """Переполнение у одного клиента не блокирует другого."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=2, window_seconds=10.0, clock=clock)
        # Сначала исчерпываем лимит spammer двумя успешными запросами,
        # после чего все повторные acquire должны бросать RateLimitError.
        limiter.acquire("spammer")
        limiter.acquire("spammer")
        for _ in range(5):
            with self.assertRaises(RateLimitError):
                limiter.acquire("spammer")
        # bob не делал запросов — для него лимит свободен
        limiter.acquire("bob")
        limiter.acquire("bob")

    def test_many_clients_all_independent(self):
        """Много клиентов: каждый независимо исчерпывает свой лимит."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=1, window_seconds=5.0, clock=clock)
        clients = [f"client_{i}" for i in range(100)]
        for c in clients:
            limiter.acquire(c)  # первый запрос каждого — ок
        for c in clients:
            with self.assertRaises(RateLimitError):
                limiter.acquire(c)


# === d) Граничные кейсы ===


class TestBoundaryCases(unittest.TestCase):
    """Граничные условия: строгое неравенство < и крайние значения параметров."""

    def test_advance_exactly_window_expires_mark(self):
        """Граничный кейс 1: advance ровно на window_seconds.

        Метка t=0 при now=10 и window=10: now - t = 10, а активна только при < 10.
        Поэтому метка выпадает из окна. Парадокс «строго меньше»: возраст,
        равный ширине окна, уже означает неактивность.
        """
        clock = FakeClock()
        limiter = RateLimiter(max_requests=1, window_seconds=10.0, clock=clock)
        limiter.acquire("c1")  # t=0
        clock.advance(10.0)   # now=10: 10 - 0 = 10, не < 10 → метка неактивна
        limiter.acquire("c1")  # должен пройти без ошибки
        # Если бы метка осталась активной, здесь был бы RateLimitError

    def test_request_at_exact_limit_boundary(self):
        """Граничный кейс 2: последний допустимый запрос на границе лимита.

        При max_requests=N ровно N запросов проходят; N+1-й бросает RateLimitError.
        Проверяем, что при N=5 пятый запрос проходит, а шестой — нет.
        Обоснование: при >= max_requests бросаем, значит при == (max_requests-1)
        активных ещё можно добавить один.
        """
        clock = FakeClock()
        limiter = RateLimiter(max_requests=5, window_seconds=1.0, clock=clock)
        for i in range(4):
            limiter.acquire("c1")  # i=0..3: после каждого 1,2,3,4 активных
        # Перед пятым запросом активных = 4 < 5 → можно
        limiter.acquire("c1")     # пятый прошёл
        # Активных = 5 >= 5 → следующий ошибка
        with self.assertRaises(RateLimitError):
            limiter.acquire("c1")

    def test_sub_window_advance_keeps_mark_active(self):
        """Граничный кейс (доп.): advance на window - epsilon — метка ещё активна.

        now - t = (window - eps), что строго меньше window → метка активна.
        """
        clock = FakeClock()
        limiter = RateLimiter(max_requests=1, window_seconds=10.0, clock=clock)
        limiter.acquire("c1")
        clock.advance(9.999)  # now=9.999, age=9.999 < 10 → активна
        with self.assertRaises(RateLimitError):
            limiter.acquire("c1")

    def test_max_requests_one_and_window_one(self):
        """Граничный кейс (доп.): min параметры (max_requests=1, window=1).

        Проверяем работоспособность на минимальных валидных значениях.
        """
        clock = FakeClock()
        limiter = RateLimiter(max_requests=1, window_seconds=1.0, clock=clock)
        limiter.acquire("c1")
        clock.advance(0.999)
        with self.assertRaises(RateLimitError):  # ещё в окне
            limiter.acquire("c1")
        clock.advance(0.001)  # total 1.0 — ровно граница, метка выпадает
        limiter.acquire("c1")  # проходит


if __name__ == "__main__":
    unittest.main()
