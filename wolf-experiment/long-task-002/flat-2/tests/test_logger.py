"""Тесты логгера и log-middleware (спека, раздел 7)."""

import unittest

from nanohttp import (
    Ctx,
    Logger,
    MiddlewareChain,
    Request,
    Response,
    default_logger,
    log_middleware,
)


def _ctx(method="GET", path="/hello"):
    return Ctx(Request(method, path))


class TestLogger(unittest.TestCase):

    def test_level_filtering(self):
        logger = Logger()
        logger.configure("WARN")
        # записи ниже порога не падают, но и не попадают в records
        logger.debug("dbg")
        logger.info("inf")
        logger.warn("warn", key=1)
        logger.error("err")
        records = logger.records()
        self.assertEqual([r["level"] for r in records], ["WARN", "ERROR"])
        self.assertEqual(records[0]["msg"], "warn")
        self.assertEqual(records[0]["key"], 1)

    def test_records_copy(self):
        logger = Logger()
        logger.info("first", a=1)
        snapshot = logger.records()
        snapshot.append({"level": "INFO", "msg": "fake"})
        snapshot[0]["a"] = 999
        fresh = logger.records()
        self.assertEqual(len(fresh), 1)
        self.assertEqual(fresh[0]["a"], 1)

    def test_log_middleware_fields(self):
        logger = Logger()
        chain = MiddlewareChain()
        chain.use(log_middleware(logger))
        response = chain.execute(_ctx(), lambda ctx: Response(201, "created"))
        self.assertEqual(response.status, 201)
        records = logger.records()
        self.assertEqual(len(records), 1)
        record = records[0]
        self.assertEqual(record["level"], "INFO")
        self.assertEqual(record["msg"], "GET /hello")
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
        # дефолтный порог INFO: debug не попадает
        default_logger.debug("hidden")
        self.assertEqual(len(default_logger.records()), before + 1)


if __name__ == "__main__":
    unittest.main()
