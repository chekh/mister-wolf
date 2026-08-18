"""Тесты модуля logger.py (спека §7, приложение B)."""

import unittest

from nanohttp import Ctx, Logger, Request, Response, default_logger, log_middleware


class TestLevelFiltering(unittest.TestCase):
    """test_level_filtering: сообщения ниже порога не попадают в records."""

    def test_level_filtering(self):
        logger = Logger()
        logger.configure("WARN")  # порог = WARN (2)
        logger.debug("d")          # 0 < 2 — нет записи
        logger.info("i")           # 1 < 2 — нет записи
        logger.warn("w")           # 2 >= 2 — есть
        logger.error("e")          # 3 >= 2 — есть
        recs = logger.records()
        self.assertEqual(len(recs), 2)
        self.assertEqual(recs[0]["level"], "WARN")
        self.assertEqual(recs[1]["level"], "ERROR")


class TestRecordsCopy(unittest.TestCase):
    """test_records_copy: records() возвращает копию."""

    def test_records_copy(self):
        logger = Logger()
        logger.info("hello")
        recs1 = logger.records()
        recs1.append({"fake": True})
        recs2 = logger.records()
        self.assertEqual(len(recs2), 1)
        self.assertNotIn("fake", recs2[0])


class TestLogMiddlewareFields(unittest.TestCase):
    """test_log_middleware_fields: свой Logger, middleware, проверка полей."""

    def test_log_middleware_fields(self):
        logger = Logger()
        logger.configure("DEBUG")

        mw = log_middleware(logger)

        def endpoint(ctx: Ctx) -> Response:
            return Response(201, {"ok": True})

        ctx = Ctx(Request("POST", "/items"))
        resp = mw(ctx, lambda: endpoint(ctx))

        self.assertEqual(resp.status, 201)

        recs = logger.records()
        self.assertEqual(len(recs), 1)
        rec = recs[0]
        self.assertEqual(rec["level"], "INFO")
        self.assertEqual(rec["msg"], "POST /items")
        self.assertEqual(rec["status"], 201)
        self.assertIsInstance(rec["duration_ms"], int)
        self.assertGreaterEqual(rec["duration_ms"], 0)


class TestDefaultLogger(unittest.TestCase):
    """test_default_logger: существует, тип Logger, уровень INFO."""

    def test_default_logger(self):
        self.assertIsInstance(default_logger, Logger)
        # Проверяем, что новый Logger() не мутирует default_logger
        fresh = Logger()
        self.assertIsNot(fresh, default_logger)


if __name__ == "__main__":
    unittest.main()
