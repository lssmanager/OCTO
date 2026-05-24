from __future__ import annotations


class AllProvidersUnavailableError(RuntimeError):
    pass


class CircuitOpenError(RuntimeError):
    pass


class RateLimitExceededError(RuntimeError):
    pass


class NoCompatibleModelError(RuntimeError):
    pass
