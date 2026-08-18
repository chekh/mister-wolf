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


class TestLogger(unittest.TestCase):
    def test_level_filtering(self):
        log = Logger()
        log.configure("INFO")
        log.debug("dbg")
        log.info("inf")
        log.warn("wrn")
        log.error("err")
        msgs = [r["msg"] for r in log.records()]
        self.assertNotIn("dbg", msgs)  # ниже порога
        self.assertIn("inf", msgs)
        self.assertIn("wrn", msgs)
        self.assertIn("err", msgs)
        # смена порога
        log.configure("WARN")
        log.info("inf2")
        self.assertNotIn("inf2", [r["msg"] for r in log.records()])
        log.warn("wrn2")
        self.assertIn("wrn2", [r["msg"] for r in log.records()])
        # вызов метода ниже порога не падает
        log.debug("silent")

    def test_records_copy(self):
        log = Logger()
        log.info("one", k="v")
        snapshot = log.records()
        snapshot.append({"level": "INFO", "msg": "fake"})
        snapshot[0]["msg"] = "mutated"
        fresh = log.records()
        self.assertEqual(len(fresh), 1)
        self.assertEqual(fresh[0]["msg"], "one")
        self.assertEqual(fresh[0]["k"], "v")

    def test_log_middleware_fields(self):
        log = Logger()
        chain = MiddlewareChain()
        chain.use(log_middleware(log))

        def endpoint(ctx):
            return Response(201, "created")

        ctx = Ctx(Request("POST", "/items"))
        resp = chain.execute(ctx, endpoint)
        self.assertEqual(resp.status, 201)
        records = log.records()
        self.assertEqual(len(records), 1)
        rec = records[0]
        self.assertEqual(rec["level"], "INFO")
        self.assertEqual(rec["msg"], "POST /items")
        self.assertEqual(rec["status"], 201)
        self.assertIsInstance(rec["duration_ms"], int)
        self.assertGreaterEqual(rec["duration_ms"], 0)

    def test_default_logger(self):
        self.assertIsInstance(default_logger, Logger)
        # дефолтный порог INFO: debug-записи не попадают в records
        default_logger.debug("should-not-appear")
        self.assertNotIn(
            "should-not-appear", [r["msg"] for r in default_logger.records()]
        )


if __name__ == "__main__":
    unittest.main()
