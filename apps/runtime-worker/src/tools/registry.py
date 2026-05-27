from __future__ import annotations
from .definitions import ToolDefinition
from .builtin import echo_tool, math_add_tool

class ToolRegistry:
    def __init__(self) -> None:
        self._defs = {
            'builtin.echo': ToolDefinition('builtin.echo','builtin_sync','Echo text',{'type':'object','required':['text'],'properties':{'text':{'type':'string'}}},{'type':'object','required':['text'],'properties':{'text':{'type':'string'}}}),
            'builtin.math_add': ToolDefinition('builtin.math_add','builtin_sync','Add numbers',{'type':'object','required':['a','b'],'properties':{'a':{'type':'number'},'b':{'type':'number'}}},{'type':'object','required':['result'],'properties':{'result':{'type':'number'}}}),
        }
        self._fns = {'builtin.echo': echo_tool, 'builtin.math_add': math_add_tool}

    def resolve(self, name: str):
        return self._defs.get(name), self._fns.get(name)
