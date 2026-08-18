"""Тесты DI-контейнера (спека §4, прил. B: test_di)."""
import unittest

from nanohttp import CircularDependencyError, Container, ResolutionError


class ContainerTests(unittest.TestCase):
    def test_resolve_value(self):
        container = Container()
        container.register_value("answer", 42)
        self.assertEqual(container.resolve("answer"), 42)
        # значение внедряется в фабрику по имени параметра
        container.register("scaled", lambda answer: answer * 2)
        self.assertEqual(container.resolve("scaled"), 84)

    def test_factory_new_each_resolve(self):
        container = Container()
        container.register("obj", lambda: object())
        first = container.resolve("obj")
        second = container.resolve("obj")
        self.assertIsNot(first, second)

    def test_singleton_cached(self):
        container = Container()
        container.singleton("obj", lambda: object())
        self.assertIs(container.resolve("obj"), container.resolve("obj"))

    def test_singleton_lazy(self):
        calls = []

        def make_svc():
            calls.append(1)
            return object()

        container = Container()
        container.singleton("svc", make_svc)
        # фабрика не вызывается при регистрации
        self.assertEqual(calls, [])
        container.resolve("svc")
        self.assertEqual(len(calls), 1)
        container.resolve("svc")
        self.assertEqual(len(calls), 1)  # кэш, без повторного вызова

    def test_unknown_raises_resolution(self):
        container = Container()
        with self.assertRaises(ResolutionError):
            container.resolve("nope")
        # через параметр фабрики — тоже ResolutionError
        container.register("broken", lambda missing: missing)
        with self.assertRaises(ResolutionError):
            container.resolve("broken")

    def test_circular_raises(self):
        container = Container()

        def make_a(b):
            return {"b": b}

        def make_b(a):
            return {"a": a}

        container.register("a", make_a)
        container.register("b", make_b)
        with self.assertRaises(CircularDependencyError):
            container.resolve("a")

    def test_kwargs_injected_by_signature(self):
        container = Container()
        container.register_value("x", 3)
        container.register_value("y", 4)

        def make_sum(x, y):
            return x + y

        container.register("sum", make_sum)
        self.assertEqual(container.resolve("sum"), 7)

    def test_scope_sees_parent(self):
        parent = Container()
        parent.register_value("greeting", "hi")
        child = parent.scope()
        self.assertEqual(child.resolve("greeting"), "hi")
        # singleton родителя резолвится лениво и тем же объектом
        parent.singleton("svc", lambda: object())
        self.assertIs(child.resolve("svc"), parent.resolve("svc"))

    def test_scope_override_shadows(self):
        parent = Container()
        parent.register_value("who", "parent")
        child = parent.scope()
        child.register_value("who", "child")
        self.assertEqual(child.resolve("who"), "child")
        self.assertEqual(parent.resolve("who"), "parent")
        # singleton-кэш дочернего отдельный от родительского
        parent.singleton("svc", lambda: object())
        child2 = parent.scope()
        child2.singleton("svc", lambda: object())
        self.assertIsNot(child2.resolve("svc"), parent.resolve("svc"))


if __name__ == "__main__":
    unittest.main()
