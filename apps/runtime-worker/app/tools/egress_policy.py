from __future__ import annotations

import ipaddress
from urllib.parse import urlparse


class EgressPolicyError(ValueError):
    pass


def validate_endpoint_against_egress_policy(url: str, network_policy: str, egress_allowlist: list[str]) -> None:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if not host:
        raise EgressPolicyError("invalid endpoint")
    if _is_blocked_host(host):
        raise EgressPolicyError("endpoint is blocked by egress policy")
    if network_policy == "none":
        raise EgressPolicyError("egress is disabled by policy")
    if network_policy == "egress_allowlist" and host not in {h.lower() for h in egress_allowlist}:
        raise EgressPolicyError("host is not allowlisted")


def _is_blocked_host(host: str) -> bool:
    if host in {"localhost"}:
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    blocked = [
        ipaddress.ip_network("127.0.0.0/8"),
        ipaddress.ip_network("10.0.0.0/8"),
        ipaddress.ip_network("172.16.0.0/12"),
        ipaddress.ip_network("192.168.0.0/16"),
        ipaddress.ip_network("169.254.169.254/32"),
        ipaddress.ip_network("::1/128"),
        ipaddress.ip_network("fc00::/7"),
        ipaddress.ip_network("fe80::/10"),
    ]
    return any(ip in net for net in blocked)
