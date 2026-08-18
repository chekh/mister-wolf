"""Тесты логгера (спецификация §7)."""

import unittest

from nanohttp import Logger, default_logger, log_middleware
from nanohttp.ctx import Ctx, Request, Response


class TestLogger(unittest.TestCase):
    def setUp(self):
        self.logger = Logger()

    def test_level_filtering(self):
        self.logger.configure("ERROR")
        self.logger.info("test")
        self.logger.debug("test")
        self.assertEqual(self.logger.records(), [])
        self.logger.error("boom")
        recs = self.logger.records()
        self.assertEqual(len(recs), 1)
        self.assertEqual(recs[0]["level"], "ERROR")

    def test_records_copy(self):
        self.logger.info("first")
        snap = self.logger.records()
        snap.clear()
        # Оригинальные записи не затронуты
        self.assertEqual(len(self.logger.records()), 1)
        self.assertEqual(self.logger.records()[0]["msg"], "first")

    def test_log_middleware_fields(self):
        self.logger.configure("INFO")

        def endpoint(ctx):
            return Response(201, "created")

        mw = log_middleware(self.logger)
        ctx = Ctx(Request("GET", "/x"))
        resp = mw(ctx, lambda: endpoint(ctx))
        self.assertEqual(resp.status, 201)
        recs = self.logger.records()
        self.assertEqual(len(recs), 1)
        rec = recs[0]
        self.assertEqual(rec["level"], "INFO")
        self.assertEqual(rec["msg"], "GET /x")
        self.assertEqual(rec["status"], 201)
        self.assertIsInstance(rec["duration_ms"], int)
        self.assertGreaterEqual(rec["duration_ms"], 0)

    def test_default_logger(self):
        """Глобальный default_logger существует и является Logger."""
        self.assertIsInstance(default_logger, Logger)


if __name__ == "__main__":
    unittest.main()
