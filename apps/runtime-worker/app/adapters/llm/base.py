from __future__ import annotations


class LLMCanonicalError(RuntimeError):
    def __init__(
        self,
        canonical_code: str,
        message: str,
        retryable: bool,
        provider: str | None = None,
        model: str | None = None,
        status_code: int | None = None,
        raw_error_type: str | None = None,
    ) -> None:
        super().__init__(message)
        self.canonical_code = canonical_code
        self.retryable = retryable
        self.provider = provider
        self.model = model
        self.status_code = status_code
        self.raw_error_type = raw_error_type
