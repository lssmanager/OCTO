from __future__ import annotations


class LLMCanonicalError(RuntimeError):
    def __init__(
        self,
        code: str,
        message: str,
        retryable: bool,
        provider: str | None = None,
        model: str | None = None,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.provider = provider
        self.model = model
        self.status_code = status_code
