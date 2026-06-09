from __future__ import annotations

import sys
from pathlib import Path

from opentelemetry.context import Context

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src import trace_context


def test_resume_trace_from_job_prefers_canonical_w3c_keys(monkeypatch) -> None:
    captured: dict[str, str] = {}

    def fake_extract(carrier: dict[str, str]) -> str:
        captured.update(carrier)
        return 'ctx'

    monkeypatch.setattr(trace_context.propagate, 'extract', fake_extract)

    ctx = trace_context.resume_trace_from_job(
        {
            'traceparent': 'canonical-parent',
            'tracestate': 'canonical-state',
            '_traceparent': 'legacy-parent',
            '_tracestate': 'legacy-state',
        }
    )

    assert ctx == 'ctx'
    assert captured == {
        'traceparent': 'canonical-parent',
        'tracestate': 'canonical-state',
    }


def test_resume_trace_from_job_falls_back_to_legacy_keys(monkeypatch) -> None:
    captured: dict[str, str] = {}

    def fake_extract(carrier: dict[str, str]) -> str:
        captured.update(carrier)
        return 'ctx'

    monkeypatch.setattr(trace_context.propagate, 'extract', fake_extract)

    ctx = trace_context.resume_trace_from_job(
        {
            '_traceparent': 'legacy-parent',
            '_tracestate': 'legacy-state',
        }
    )

    assert ctx == 'ctx'
    assert captured == {
        'traceparent': 'legacy-parent',
        'tracestate': 'legacy-state',
    }


def test_resume_trace_from_job_returns_empty_context_without_trace_fields() -> None:
    assert isinstance(trace_context.resume_trace_from_job({}), Context)
