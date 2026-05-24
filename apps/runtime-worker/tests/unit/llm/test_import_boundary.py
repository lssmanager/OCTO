from __future__ import annotations

from pathlib import Path


def test_openai_import_only_in_litellm_adapter() -> None:
    root = Path(__file__).resolve().parents[3]
    offenders: list[str] = []
    for path in root.rglob("*.py"):
        if "tests" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        if ("import openai" in text or "from openai" in text) and not str(path).endswith("app/adapters/llm/litellm_adapter.py"):
            offenders.append(str(path.relative_to(root)))
    assert offenders == []
