from app.retry.classifier import ErrorClassifier
from app.retry.policy import ErrorClass


def test_provider_429() -> None:
    c = ErrorClassifier().classify({'status': 429})
    assert c.error_class == ErrorClass.PROVIDER_RATE_LIMIT


def test_provider_5xx() -> None:
    c = ErrorClassifier().classify({'status': 503})
    assert c.error_class == ErrorClass.PROVIDER_TRANSIENT


def test_tool_5xx_retryable() -> None:
    c = ErrorClassifier().classify({'status': 500}, {'scope': 'tool', 'retryable': True})
    assert c.error_class == ErrorClass.TOOL_TRANSIENT


def test_tool_timeout_idempotent() -> None:
    c = ErrorClassifier().classify('timeout', {'scope': 'tool', 'idempotent': True})
    assert c.error_class == ErrorClass.TOOL_TIMEOUT


def test_runtime_deadlock() -> None:
    c = ErrorClassifier().classify('deadlock detected')
    assert c.error_class == ErrorClass.RUNTIME_TRANSIENT


def test_invariant_breach() -> None:
    c = ErrorClassifier().classify('invariant violation')
    assert c.error_class == ErrorClass.INVARIANT_BREACH


def test_budget_exceeded() -> None:
    c = ErrorClassifier().classify('budget exceeded')
    assert c.error_class == ErrorClass.BUDGET_EXCEEDED


def test_auth_terminal() -> None:
    c = ErrorClassifier().classify('forbidden')
    assert c.error_class == ErrorClass.TERMINAL


def test_poison_marker() -> None:
    c = ErrorClassifier().classify({'poison': True})
    assert c.error_class == ErrorClass.POISON
