"""tests/test_logger — тесты модуля logger (spec.md §7)."""

import unittest

from nanohttp import Ctx, Logger, Request, Response, log_middleware


class TestLogger(unittest.TestCase):
    def test_level_filtering(self) -> None:
        """Записи ниже порога не попадают в records."""
        log = Logger()
        log.configure("WARN")
        log.debug("skip")  # DEBUG < WARN
        log.info("skip")   # INFO < WARN
        log.warn("ok")     # WARN == WARN
        log.error("ok")    # ERROR > WARN
        records = log.records()
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]["msg"], "ok")
        self.assertEqual(records[1]["msg"], "ok")

    def test_records_copy(self) -> None:
        """records() возвращает копию; мутация не влияет на оригинал."""
        log = Logger()
        log.info("test")
        copy = log.records()
        copy.clear()
        self.assertEqual(len(log.records()), 1)

    def test_log_middleware_fields(self) -> None:
        """log_middleware логирует INFO с полями status и duration_ms."""
        log = Logger()
        log.configure("DEBUG")
        mw_fn = log_middleware(log)

        req = Request("GET", "/x")
        ctx = Ctx(req)

        def endpoint(c):
            return Response(201, body={"created": True})

        resp = mw_fn(ctx, lambda: endpoint(ctx))

        self.assertEqual(resp.status, 201)
        records = log.records()
        self.assertEqual(len(records), 1)
        r = records[0]
        self.assertEqual(r["level"], "INFO")
        self.assertEqual(r["msg"], "GET /x")
        self.assertEqual(r["status"], 201)
        self.assertIsInstance(r["duration_ms"], int)
        self.assertGreaterEqual(r["duration_ms"], 0)

    def test_default_logger(self) -> None:
        """Модульный default_logger — экземпляр Logger."""
        from nanohttp import default_logger
        self.assertIsInstance(default_logger, Logger)


if __name__ == "__main__":
    unittest.main()
