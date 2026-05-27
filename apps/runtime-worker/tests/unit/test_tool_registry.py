from src.tools.registry import ToolRegistry


def test_registry_resolves_builtin_tools():
    r = ToolRegistry()
    d, fn = r.resolve('builtin.echo')
    assert d is not None
    assert callable(fn)


def test_registry_unknown_tool():
    r = ToolRegistry()
    d, fn = r.resolve('nope')
    assert d is None and fn is None
