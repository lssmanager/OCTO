#!/usr/bin/env python3
"""Guardrail for OCTO compose host-port exposure policy.

This intentionally uses a small line-oriented parser instead of Docker/PyYAML so
CI can run it before Docker is available and without adding parser dependencies.
It enforces the deployable compose files; explicit *.debug.yml overrides are the
only place where loopback host ports for internal services are expected.
"""
from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]

FORBIDDEN_SERVICE_PORTS = {
    ROOT / "docker-compose.yml": {
        "runtime-worker",
        "outbox-publisher-worker",
        "reclaimer-worker",
        "litellm",
    },
    ROOT / "infra/docker-compose.observability.yml": {
        "otel-collector",
        "prometheus",
        "grafana",
        "loki",
    },
}

DEBUG_FILES = [
    ROOT / "docker-compose.debug.yml",
    ROOT / "infra/docker-compose.observability.debug.yml",
]
TRIVIAL_GRAFANA_PASSWORDS = {"admin", "password", "changeme", "grafana", "octo"}


def service_port_blocks(path: Path) -> list[tuple[str, int]]:
    current_service: str | None = None
    current_indent = 0
    violations: list[tuple[str, int]] = []
    for lineno, line in enumerate(path.read_text().splitlines(), start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(line) - len(line.lstrip(" "))
        if indent == 2 and stripped.endswith(":") and not stripped.startswith("-"):
            current_service = stripped[:-1]
            current_indent = indent
            continue
        if current_service and indent <= current_indent and stripped.endswith(":"):
            current_service = None
        if current_service and indent == 4 and (stripped == "ports:" or stripped.startswith("ports: ")):
            violations.append((current_service, lineno))
    return violations


def assert_no_forbidden_ports() -> list[str]:
    errors: list[str] = []
    for path, forbidden_services in FORBIDDEN_SERVICE_PORTS.items():
        for service, lineno in service_port_blocks(path):
            if service in forbidden_services:
                errors.append(
                    f"{path.relative_to(ROOT)}:{lineno}: {service} must not publish host ports "
                    "in deployable compose; use the loopback-only debug override instead"
                )
    return errors


def assert_grafana_password_is_required() -> list[str]:
    path = ROOT / "infra/docker-compose.observability.yml"
    errors: list[str] = []
    for lineno, line in enumerate(path.read_text().splitlines(), start=1):
        if "GF_SECURITY_ADMIN_PASSWORD:" not in line:
            continue
        if ":?" not in line:
            errors.append(
                f"{path.relative_to(ROOT)}:{lineno}: GF_SECURITY_ADMIN_PASSWORD must require "
                "GRAFANA_PASSWORD instead of defaulting"
            )
        lowered = line.lower()
        for trivial in TRIVIAL_GRAFANA_PASSWORDS:
            if f":-{trivial}" in lowered or lowered.rstrip().endswith(f": {trivial}"):
                errors.append(
                    f"{path.relative_to(ROOT)}:{lineno}: Grafana password must not default to {trivial!r}"
                )
    return errors


def assert_debug_ports_are_loopback() -> list[str]:
    errors: list[str] = []
    for path in DEBUG_FILES:
        lines = path.read_text().splitlines()
        in_ports = False
        ports_indent = 0
        for lineno, line in enumerate(lines, start=1):
            stripped = line.strip()
            indent = len(line) - len(line.lstrip(" "))
            if stripped == "ports:" or stripped.startswith("ports: "):
                in_ports = True
                ports_indent = indent
                if stripped.startswith("ports: ") and "127.0.0.1:" not in stripped:
                    errors.append(
                        f"{path.relative_to(ROOT)}:{lineno}: debug host port bindings must be loopback-only"
                    )
                continue
            if in_ports and stripped and indent <= ports_indent:
                in_ports = False
            if in_ports and stripped.startswith("-") and "127.0.0.1:" not in stripped:
                errors.append(
                    f"{path.relative_to(ROOT)}:{lineno}: debug host port bindings must be loopback-only"
                )
    return errors


def main() -> int:
    errors = []
    errors.extend(assert_no_forbidden_ports())
    errors.extend(assert_grafana_password_is_required())
    errors.extend(assert_debug_ports_are_loopback())
    if errors:
        print("Compose network policy check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("Compose network policy check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
