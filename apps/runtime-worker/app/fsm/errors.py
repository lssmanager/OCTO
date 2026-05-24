class ExecutionFSMError(Exception):
    """Base error for execution FSM operations."""


class InvalidTransitionError(ExecutionFSMError):
    """Raised when a requested transition violates FSM rules."""


class CASConflictError(ExecutionFSMError):
    """Raised when caller requests exception-based handling for CAS conflicts."""
