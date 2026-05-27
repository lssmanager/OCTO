import asyncio
from src.tools.builtin import echo_tool, math_add_tool


def test_echo_success():
    assert echo_tool({'text':'hi'}) == {'text':'hi'}


def test_math_add_success():
    assert math_add_tool({'a':2,'b':3}) == {'result':5.0}
