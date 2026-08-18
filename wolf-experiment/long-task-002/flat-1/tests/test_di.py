import unittest

from nanohttp import CircularDependencyError, Container, ResolutionError


class TestContainer(unittest.TestCase):
    def test_resolve_value(self):
        c = Container()
        c.register_value("answer", 42)
        c.register_value("name", "nano")
        self.assertEqual(c.resolve("answer"), 42)
        self.assertEqual(c.resolve("name"), "nano")

    def test_factory_new_each_resolve(self):
        c = Container()
        calls = []

        def make():
            calls.append(1)
            return {"id": len(calls)}

        c.register("obj", make)
        a = c.resolve("obj")
        b = c.resolve("obj")
        self.assertIsNot(a, b)
        self.assertEqual(len(calls), 2)

    def test_singleton_cached(self):
        c = Container()
        calls = []

        def make():
            calls.append(1)
            return {"n": len(calls)}

        c.singleton("svc", make)
        a = c.resolve("svc")
        b = c.resolve("svc")
        self.assertIs(a, b)
        self.assertEqual(len(calls), 1)

    def test_singleton_lazy(self):
        c = Container()
        calls = []

        def make():
            calls.append(1)
            return object()

        c.singleton("lazy", make)
        self.assertEqual(len(calls), 0)  # factory не вызван при регистрации
        c.resolve("lazy")
        self.assertEqual(len(calls), 1)  # вызван при первом resolve

    def test_unknown_raises_resolution(self):
        c = Container()
        with self.assertRaises(ResolutionError):
            c.resolve("nope")
        # также для зависимостей фабрики
        c.register("broken", lambda missing: missing)
        with self.assertRaises(ResolutionError):
            c.resolve("broken")

    def test_circular_raises(self):
        c = Container()
        c.register("a", lambda b: ("a", b))
        c.register("b", lambda a: ("b", a))
        with self.assertRaises(CircularDependencyError):
            c.resolve("a")

    def test_kwargs_injected_by_signature(self):
        c = Container()
        c.register_value("x", 10)
        c.register_value("y", 5)

        def add(x, y):
            return x + y

        c.register("sum", add)
        self.assertEqual(c.resolve("sum"), 15)
        # factory без параметров тоже работает
        c.register("plain", lambda: "ok")
        self.assertEqual(c.resolve("plain"), "ok")
        # фабричная зависимость внедряется как значение
        c.register("scaled", lambda x, sum: x * sum)
        self.assertEqual(c.resolve("scaled"), 10 * 15)

    def test_scope_sees_parent(self):
        parent = Container()
        parent.register_value("greeting", "hello")
        child = parent.scope()
        self.assertEqual(child.resolve("greeting"), "hello")
        grandson = child.scope()
        self.assertEqual(grandson.resolve("greeting"), "hello")
        # регистрация в дочернем видна дальше вниз
        child.register_value("extra", 1)
        self.assertEqual(grandson.resolve("extra"), 1)

    def test_scope_override_shadows(self):
        parent = Container()
        parent.register_value("x", 1)
        child = parent.scope()
        child.register_value("x", 2)
        self.assertEqual(child.resolve("x"), 2)  # затеняет родителя
        self.assertEqual(parent.resolve("x"), 1)  # родитель не тронут
        # singleton-кэш дочернего отдельный от родительского
        parent.singleton("svc", lambda: object())
        p_obj = parent.resolve("svc")
        c_obj = child.resolve("svc")
        self.assertIsNot(c_obj, p_obj)
        self.assertIs(child.resolve("svc"), c_obj)
        self.assertIs(parent.resolve("svc"), p_obj)


if __name__ == "__main__":
    unittest.main()
