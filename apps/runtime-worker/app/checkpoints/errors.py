class CheckpointError(Exception):
    """Base error for checkpoint operations."""


class CheckpointLineageError(CheckpointError):
    """Raised when parent lineage is missing or invalid."""


class CheckpointNotFoundError(CheckpointError):
    """Raised when no checkpoint exists for requested resource."""


class CheckpointPersistenceError(CheckpointError):
    """Raised when checkpoint persistence fails."""


class CheckpointValidationError(CheckpointError):
    """Raised when checkpoint payload validation fails."""
