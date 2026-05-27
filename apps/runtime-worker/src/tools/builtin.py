from __future__ import annotations

def echo_tool(args: dict) -> dict:
    return {'text': str(args['text'])}

def math_add_tool(args: dict) -> dict:
    return {'result': float(args['a']) + float(args['b'])}
