class LeaseError(Exception):
    """Base lease error."""


class LeaseRevokedError(LeaseError):
    """Raised when the worker no longer owns an active running lease."""


class LeaseRenewalError(LeaseError):
    """Raised when lease renewal fails due to transient database errors."""
