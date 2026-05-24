import pytest

from app.tools.egress_policy import EgressPolicyError, validate_endpoint_against_egress_policy


def test_allowlisted_host_passes() -> None:
    validate_endpoint_against_egress_policy("https://example.com/x", "egress_allowlist", ["example.com"])


@pytest.mark.parametrize("url", ["http://localhost/a", "http://127.0.0.1/a", "http://10.0.0.5/a", "http://172.16.0.2/a", "http://192.168.1.1/a", "http://169.254.169.254/latest"])
def test_private_or_local_hosts_denied(url: str) -> None:
    with pytest.raises(EgressPolicyError):
        validate_endpoint_against_egress_policy(url, "egress_allowlist", ["example.com"])
