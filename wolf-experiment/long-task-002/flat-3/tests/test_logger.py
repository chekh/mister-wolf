"""Тесты логгера (спека §7, прил. B: test_logger)."""
import unittest

from nanohttp import Ctx, Logger, Request, Response, default_logger, log_middleware


class LoggerTests(unittest.TestCase):
    def test_level_filtering(self):
        logger = Logger()
        logger.configure("WARN")
        # ниже порога — не падают и не попадают в records
        logger.debug("d")
        logger.info("i")
        self.assertEqual(logger.records(), [])
        logger.warn("w", code=1)
        logger.error("e", code=2)
        records = logger.records()
        self.assertEqual([r["msg"] for r in records], ["w", "e"])
        self.assertEqual([r["level"] for r in records], ["WARN", "ERROR"])

    def test_records_copy(self):
        logger = Logger()
        logger.info("hello", a=1)
        snapshot = logger.records()
        snapshot.append({"fake": True})
        snapshot[0]["msg"] = "hacked"
        fresh = logger.records()
        # мутация снимка не влияет на внутреннее состояние
        self.assertEqual(len(fresh), 1)
        self.assertEqual(fresh[0]["msg"], "hello")

    def test_log_middleware_fields(self):
        logger = Logger()
        middleware = log_middleware(logger)
        ctx = Ctx(Request("GET", "/things"))
        resp = middleware(ctx, lambda: Response(201, "created"))
        self.assertEqual(resp.status, 201)
        records = logger.records()
        self.assertEqual(len(records), 1)
        record = records[0]
        self.assertEqual(record["level"], "INFO")
        self.assertEqual(record["msg"], "GET /things")
        self.assertEqual(record["status"], 201)
        self.assertIsInstance(record["duration_ms"], int)
        self.assertGreaterEqual(record["duration_ms"], 0)

    def test_default_logger(self):
        self.assertIsInstance(default_logger, Logger)
        before = len(default_logger.records())
        default_logger.info("default check")
        records = default_logger.records()
        self.assertEqual(len(records), before + 1)
        self.assertEqual(records[-1]["msg"], "default check")


if __name__ == "__main__":
    unittest.main()
