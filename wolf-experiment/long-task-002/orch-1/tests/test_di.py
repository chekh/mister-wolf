"""Тесты модуля di.py (spec.md §4)."""

import unittest

from nanohttp import Container, CircularDependencyError, ResolutionError


class TestResolveValue(unittest.TestCase):
    """test_resolve_value"""

    def test_resolve_value(self):
        c = Container()
        c.register_value("name", "Alice")
        self.assertEqual(c.resolve("name"), "Alice")


class TestFactoryNewEachResolve(unittest.TestCase):
    """test_factory_new_each_resolve"""

    def test_factory_new_each_resolve(self):
        c = Container()
        counter = {"n": 0}

        def make():
            counter["n"] += 1
            return {"id": counter["n"]}

        c.register("obj", make)
        a = c.resolve("obj")
        b = c.resolve("obj")
        self.assertNotEqual(id(a), id(b))
        self.assertEqual(a["id"], 1)
        self.assertEqual(b["id"], 2)


class TestSingletonCached(unittest.TestCase):
    """test_singleton_cached"""

    def test_singleton_cached(self):
        c = Container()
        counter = {"n": 0}

        def make():
            counter["n"] += 1
            return {"id": counter["n"]}

        c.singleton("obj", make)
        a = c.resolve("obj")
        b = c.resolve("obj")
        self.assertIs(a, b)


class TestSingletonLazy(unittest.TestCase):
    """test_singleton_lazy"""

    def test_singleton_lazy(self):
        c = Container()
        counter = {"n": 0}

        def make():
            counter["n"] += 1
            return {"id": counter["n"]}

        c.singleton("obj", make)
        # Фабрика ещё не вызвана
        self.assertEqual(counter["n"], 0)
        # Первый resolve вызывает фабрику
        c.resolve("obj")
        self.assertEqual(counter["n"], 1)


class TestUnknownRaisesResolution(unittest.TestCase):
    """test_unknown_raises_resolution"""

    def test_unknown_raises_resolution(self):
        c = Container()
        with self.assertRaises(ResolutionError):
            c.resolve("nonexistent")


class TestCircularRaises(unittest.TestCase):
    """test_circular_raises"""

    def test_circular_raises(self):
        c = Container()
        # A зависит от B, B зависит от A
        c.register("A", lambda B: f"A({B})")
        c.register("B", lambda A: f"B({A})")
        with self.assertRaises(CircularDependencyError):
            c.resolve("A")


class TestKwargsInjectedBySignature(unittest.TestCase):
    """test_kwargs_injected_by_signature"""

    def test_kwargs_injected_by_signature(self):
        c = Container()
        c.register_value("conn", "C")

        c.register("svc", lambda conn: conn)
        self.assertEqual(c.resolve("svc"), "C")

        # Именованный параметр через def
        def svc(conn):
            return conn

        c.register("svc2", svc)
        self.assertEqual(c.resolve("svc2"), "C")


class TestScopeSeesParent(unittest.TestCase):
    """test_scope_sees_parent"""

    def test_scope_sees_parent(self):
        parent = Container()
        parent.register_value("x", 42)
        child = parent.scope()
        self.assertEqual(child.resolve("x"), 42)


class TestScopeOverrideShadows(unittest.TestCase):
    """test_scope_override_shadows"""

    def test_scope_override_shadows(self):
        parent = Container()
        parent.register_value("x", 42)
        child = parent.scope()
        child.register_value("x", 100)
        self.assertEqual(child.resolve("x"), 100)
        # Родитель остаётся без изменений
        self.assertEqual(parent.resolve("x"), 42)


if __name__ == "__main__":
    unittest.main()
