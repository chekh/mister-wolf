"""Тесты DI-контейнера (спека, раздел 4)."""

import unittest

from nanohttp import CircularDependencyError, Container, ResolutionError


class TestContainer(unittest.TestCase):

    def setUp(self):
        self.container = Container()

    def test_resolve_value(self):
        config = {"debug": True}
        self.container.register_value("config", config)
        self.assertIs(self.container.resolve("config"), config)

    def test_factory_new_each_resolve(self):
        calls = []

        def make():
            calls.append(1)
            return {"fresh": True}

        self.container.register("service", make)
        first = self.container.resolve("service")
        second = self.container.resolve("service")
        self.assertIsNot(first, second)
        self.assertEqual(len(calls), 2)

    def test_singleton_cached(self):
        calls = []

        def make():
            calls.append(1)
            return {"shared": True}

        self.container.singleton("cache", make)
        first = self.container.resolve("cache")
        second = self.container.resolve("cache")
        self.assertIs(first, second)
        self.assertEqual(len(calls), 1)

    def test_singleton_lazy(self):
        calls = []

        def make():
            calls.append(1)
            return object()

        self.container.singleton("lazy", make)
        self.assertEqual(calls, [])  # factory не вызывался до первого resolve
        self.container.resolve("lazy")
        self.assertEqual(calls, [1])

    def test_unknown_raises_resolution(self):
        with self.assertRaises(ResolutionError):
            self.container.resolve("nope")

    def test_circular_raises(self):
        self.container.register("a", lambda b: ("a", b))
        self.container.register("b", lambda a: ("b", a))
        with self.assertRaises(CircularDependencyError):
            self.container.resolve("a")

    def test_kwargs_injected_by_signature(self):
        self.container.register_value("db", "DB-CONN")
        self.container.register_value("prefix", "app:")

        def service(db, prefix):
            return {"db": db, "prefix": prefix}

        self.container.register("service", service)
        result = self.container.resolve("service")
        self.assertEqual(result, {"db": "DB-CONN", "prefix": "app:"})

        # параметр с дефолтом без регистрации использует дефолт
        def tuned(db, retries=3):
            return (db, retries)

        self.container.register("tuned", tuned)
        self.assertEqual(self.container.resolve("tuned"), ("DB-CONN", 3))

        # параметр без дефолта и без регистрации — ResolutionError
        def broken(missing):
            return missing

        self.container.register("broken", broken)
        with self.assertRaises(ResolutionError):
            self.container.resolve("broken")

    def test_scope_sees_parent(self):
        self.container.register_value("x", 1)

        def make_repo():
            return {"repo": True}

        self.container.singleton("repo", make_repo)
        child = self.container.scope()
        self.assertEqual(child.resolve("x"), 1)
        self.assertIs(child.resolve("repo"), child.resolve("repo"))
        # вложенный scope видит всю цепочку
        grandchild = child.scope()
        self.assertEqual(grandchild.resolve("x"), 1)

    def test_scope_override_shadows(self):
        self.container.register_value("x", 1)
        self.container.singleton("svc", lambda: {"parent": True})
        child = self.container.scope()
        child.register_value("x", 2)
        self.assertEqual(child.resolve("x"), 2)
        self.assertEqual(self.container.resolve("x"), 1)

        # singleton-кэш дочернего отдельный от родительского:
        # затеняющая регистрация кэшируется в дочернем, не трогая родителя
        child.singleton("svc", lambda: ["child"])
        first = child.resolve("svc")
        self.assertIs(first, child.resolve("svc"))
        self.assertIsInstance(first, list)
        parent_value = self.container.resolve("svc")
        self.assertEqual(parent_value, {"parent": True})


if __name__ == "__main__":
    unittest.main()
