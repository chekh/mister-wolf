"""Тесты DI-контейнера (nanohttp/di.py, спека §4)."""

import unittest

from nanohttp import Container, ResolutionError, CircularDependencyError


class TestContainerResolveValue(unittest.TestCase):
    """test_resolve_value: зарегистрированное значение возвращается."""

    def test_resolve_value(self):
        c = Container()
        c.register_value("config", {"debug": True})
        self.assertEqual(c.resolve("config"), {"debug": True})


class TestFactoryNewEachResolve(unittest.TestCase):
    """test_factory_new_each_resolve: register — новый объект на каждый resolve."""

    def test_factory_new_each_resolve(self):
        c = Container()
        c.register("list_factory", list)
        a = c.resolve("list_factory")
        b = c.resolve("list_factory")
        self.assertIsInstance(a, list)
        self.assertIsInstance(b, list)
        self.assertIsNot(a, b)


class TestSingletonCached(unittest.TestCase):
    """test_singleton_cached: singleton — тот же объект (is)."""

    def test_singleton_cached(self):
        c = Container()
        c.singleton("my_list", list)
        a = c.resolve("my_list")
        b = c.resolve("my_list")
        self.assertIs(a, b)


class TestSingletonLazy(unittest.TestCase):
    """test_singleton_lazy: factory НЕ вызывается до первого resolve."""

    def test_singleton_lazy(self):
        call_count = 0

        def factory():
            nonlocal call_count
            call_count += 1
            return {"data": True}

        c = Container()
        c.singleton("lazy", factory)
        self.assertEqual(call_count, 0)
        _ = c.resolve("lazy")
        self.assertEqual(call_count, 1)
        _ = c.resolve("lazy")
        self.assertEqual(call_count, 1)


class TestUnknownRaisesResolution(unittest.TestCase):
    """test_unknown_raises_resolution: незарегистрированное имя → ResolutionError."""

    def test_unknown_raises_resolution(self):
        c = Container()
        with self.assertRaises(ResolutionError):
            c.resolve("nonexistent")


class TestCircularRaises(unittest.TestCase):
    """test_circular_raises: A(b)->B(a)->resolve("A") кидает CircularDependencyError."""

    def test_circular_raises(self):
        c = Container()

        def make_a(B):
            return {"a": B}

        def make_b(A):
            return {"b": A}

        c.register("A", make_a)
        c.register("B", make_b)

        with self.assertRaises(CircularDependencyError):
            c.resolve("A")


class TestKwargsInjectedBySignature(unittest.TestCase):
    """test_kwargs_injected_by_signature: параметры фабрики резолвятся по имени."""

    def test_kwargs_injected_by_signature(self):
        c = Container()
        c.register_value("prefix", "hello-")
        c.register_value("suffix", "-world")

        def build_greeting(prefix, suffix):
            return prefix + "X" + suffix

        c.register("greeting", build_greeting)
        result = c.resolve("greeting")
        self.assertEqual(result, "hello-X-world")

    def test_default_param_used_when_not_registered(self):
        c = Container()

        def build(name, mode="default"):
            return f"{name}:{mode}"

        c.register_value("name", "test")
        c.register("item", build)
        self.assertEqual(c.resolve("item"), "test:default")


class TestScopeSeesParent(unittest.TestCase):
    """test_scope_sees_parent: дочерний видит регистрации родителя."""

    def test_scope_sees_parent(self):
        parent = Container()
        parent.register_value("shared", 42)
        child = parent.scope()
        self.assertEqual(child.resolve("shared"), 42)


class TestScopeOverrideShadows(unittest.TestCase):
    """test_scope_override_shadows: собственная регистрация дочернего затеняет родительскую."""

    def test_scope_override_shadows(self):
        parent = Container()
        parent.register_value("val", "parent")
        child = parent.scope()
        child.register_value("val", "child")
        self.assertEqual(child.resolve("val"), "child")
        self.assertEqual(parent.resolve("val"), "parent")

    def test_scope_singleton_cache_separate(self):
        parent = Container()
        parent.singleton("svc", list)
        child = parent.scope()
        parent_instance = parent.resolve("svc")
        child_instance = child.resolve("svc")
        # child sees parent's singleton cache (delegates to parent)
        # but if child registers its own, it's separate
        self.assertIs(parent_instance, child_instance)
        # Now child overrides
        child.singleton("svc", list)
        child_own = child.resolve("svc")
        self.assertIsNot(child_own, parent_instance)


if __name__ == "__main__":
    unittest.main()
