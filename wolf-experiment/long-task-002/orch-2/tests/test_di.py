"""Тесты DI-контейнера (спецификация §4)."""

import unittest

from nanohttp import CircularDependencyError, Container, ResolutionError


class TestDI(unittest.TestCase):
    def test_resolve_value(self):
        c = Container()
        c.register_value("db", 42)
        self.assertEqual(c.resolve("db"), 42)

    def test_factory_new_each_resolve(self):
        c = Container()

        def factory():
            return object()

        c.register("obj", factory)
        a = c.resolve("obj")
        b = c.resolve("obj")
        self.assertIsNot(a, b)

    def test_singleton_cached(self):
        c = Container()

        def factory():
            return object()

        c.singleton("obj", factory)
        a = c.resolve("obj")
        b = c.resolve("obj")
        self.assertIs(a, b)

    def test_singleton_lazy(self):
        """Factory синглтона не вызывается до первого resolve."""
        called = []

        def factory():
            called.append(True)
            return object()

        c = Container()
        c.singleton("obj", factory)
        self.assertEqual(called, [])
        c.resolve("obj")
        self.assertEqual(called, [True])

    def test_unknown_raises_resolution(self):
        c = Container()
        with self.assertRaises(ResolutionError):
            c.resolve("nonexistent")

    def test_circular_raises(self):
        c = Container()
        c.register("a", lambda b=None: f"A({b})")
        c.register("b", lambda a=None: f"B({a})")
        with self.assertRaises(CircularDependencyError):
            c.resolve("a")

    def test_kwargs_injected_by_signature(self):
        """Параметры фабрики резолвятся по имени."""
        c = Container()
        c.register_value("conn", "postgres://localhost")
        c.register("svc", lambda conn=None: f"svc({conn})")
        result = c.resolve("svc")
        self.assertEqual(result, "svc(postgres://localhost)")

    def test_scope_sees_parent(self):
        parent = Container()
        parent.register_value("x", 10)
        child = parent.scope()
        self.assertEqual(child.resolve("x"), 10)

    def test_scope_override_shadows(self):
        parent = Container()
        parent.register_value("x", 10)
        child = parent.scope()
        child.register_value("x", 20)
        self.assertEqual(child.resolve("x"), 20)
        self.assertEqual(parent.resolve("x"), 10)


if __name__ == "__main__":
    unittest.main()
