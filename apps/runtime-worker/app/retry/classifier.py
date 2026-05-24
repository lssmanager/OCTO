from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel

from .policy import ErrorClass, RETRYABLE_CLASSES


class ErrorClassification(BaseModel):
    error_class: ErrorClass
    retryable: bool
    scope: Literal['provider', 'tool', 'runtime', 'reclaim'] | None
    error_code: str
    reason: str


class ErrorClassifier:
    def classify(self, exc: BaseException | dict[str, Any] | str, context: dict[str, Any] | None = None) -> ErrorClassification:
        context = context or {}
        payload: dict[str, Any] = exc if isinstance(exc, dict) else {}
        name = exc.__class__.__name__ if isinstance(exc, BaseException) else ''
        message = str(exc)
        status = payload.get('status') or payload.get('status_code') or context.get('status')
        code = str(payload.get('error_code') or context.get('error_code') or name or 'UNKNOWN')

        if payload.get('poison') or context.get('poison'):
            return self._mk(ErrorClass.POISON, None, 'poison marker', code)
        if status == 429:
            return self._mk(ErrorClass.PROVIDER_RATE_LIMIT, 'provider', 'provider rate limit', code)
        if isinstance(status, int) and 500 <= status <= 599 and context.get('scope') == 'tool' and context.get('retryable', True):
            return self._mk(ErrorClass.TOOL_TRANSIENT, 'tool', 'tool 5xx retryable', code)
        if isinstance(status, int) and 500 <= status <= 599:
            return self._mk(ErrorClass.PROVIDER_TRANSIENT, 'provider', 'provider 5xx', code)
        if 'timeout' in message.lower() and context.get('scope') == 'tool' and context.get('idempotent', False):
            return self._mk(ErrorClass.TOOL_TIMEOUT, 'tool', 'tool timeout idempotent', code)
        if 'timeout' in message.lower():
            return self._mk(ErrorClass.PROVIDER_TRANSIENT, 'provider', 'provider timeout', code)
        if any(s in message.lower() for s in ['deadlock', 'serialization', 'redis timeout', 'connection reset']):
            return self._mk(ErrorClass.RUNTIME_TRANSIENT, 'runtime', 'runtime transient', code)
        if any(s in name for s in ['InvalidTransitionError', 'CASConflictError', 'CheckpointLineageError']) or 'invariant' in message.lower():
            return self._mk(ErrorClass.INVARIANT_BREACH, None, 'invariant breach', code)
        if 'budget' in message.lower():
            return self._mk(ErrorClass.BUDGET_EXCEEDED, None, 'budget exceeded', code)
        if any(s in message.lower() for s in ['forbidden', 'auth', 'credential', 'unauthorized']):
            return self._mk(ErrorClass.TERMINAL, None, 'auth/terminal failure', code)
        return self._mk(ErrorClass.RUNTIME_TRANSIENT, 'runtime', 'default runtime transient', code)

    @staticmethod
    def _mk(error_class: ErrorClass, scope: Literal['provider', 'tool', 'runtime', 'reclaim'] | None, reason: str, code: str) -> ErrorClassification:
        return ErrorClassification(
            error_class=error_class,
            retryable=error_class in RETRYABLE_CLASSES,
            scope=scope,
            error_code=code,
            reason=reason,
        )
