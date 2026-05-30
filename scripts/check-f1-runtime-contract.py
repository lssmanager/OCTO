#!/usr/bin/env python3
"""Verify the executable F1 runtime PostgreSQL write contract.

This check intentionally combines documentation, migration, and code scanning so
runtime persistence cannot drift by changing only narrative documentation.
"""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "docs/f1/runtime-write-contract.json"
RUNTIME_SOURCE = ROOT / "apps/runtime-worker/src/f1_runtime.py"
RUNTIME_SCAN_ROOTS = [ROOT / "apps/runtime-worker/src", ROOT / "apps/runtime-worker/app"]

FORBIDDEN_NARRATIVE_RE = re.compile(
    r"NUNCA accede a DB|solo para health check|writes van por la API|"
    r"never writes to Postgres|NEVER writes to Postgres|no accede directo|"
    r"no accede directamente|no escribe en DB|no escribe.*PostgreSQL|reads DB only|"
    r"writes go through Control Plane events|writes go through the Control Plane|"
    r"writes go exclusively through the API",
    re.IGNORECASE,
)

SQL_WRITE_PATTERNS = [
    re.compile(r"\bINSERT\s+INTO\s+(?:ONLY\s+)?[\"`]?([A-Za-z_][A-Za-z0-9_]*)[\"`]?", re.IGNORECASE),
    re.compile(r"\bUPDATE\s+(?:ONLY\s+)?[\"`]?([A-Za-z_][A-Za-z0-9_]*)[\"`]?", re.IGNORECASE),
    re.compile(r"\bDELETE\s+FROM\s+(?:ONLY\s+)?[\"`]?([A-Za-z_][A-Za-z0-9_]*)[\"`]?", re.IGNORECASE),
]


def fail(message: str) -> None:
    print(f"f1-runtime-contract: {message}", file=sys.stderr)
    raise SystemExit(1)


def load_contract() -> dict[str, object]:
    if not CONTRACT_PATH.exists():
        fail(f"missing contract artifact: {CONTRACT_PATH.relative_to(ROOT)}")
    return json.loads(CONTRACT_PATH.read_text())


def sorted_strings(value: object, key: str) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        fail(f"contract field {key} must be a string array")
    return sorted(value)


def extract_runtime_constant() -> list[str]:
    tree = ast.parse(RUNTIME_SOURCE.read_text(), filename=str(RUNTIME_SOURCE))
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        if not any(isinstance(target, ast.Name) and target.id == "F1_RUNTIME_DB_WRITE_TABLES" for target in node.targets):
            continue
        call = node.value
        if not isinstance(call, ast.Call) or not isinstance(call.func, ast.Name) or call.func.id != "frozenset":
            fail("F1_RUNTIME_DB_WRITE_TABLES must be defined as frozenset({...})")
        if len(call.args) != 1 or not isinstance(call.args[0], (ast.Set, ast.List, ast.Tuple)):
            fail("F1_RUNTIME_DB_WRITE_TABLES must contain a literal set/list/tuple")
        tables: list[str] = []
        for element in call.args[0].elts:
            if not isinstance(element, ast.Constant) or not isinstance(element.value, str):
                fail("F1_RUNTIME_DB_WRITE_TABLES may contain only string literals")
            tables.append(element.value)
        return sorted(tables)
    fail("F1_RUNTIME_DB_WRITE_TABLES not found")


def iter_python_files() -> Iterable[Path]:
    for root in RUNTIME_SCAN_ROOTS:
        if not root.exists():
            continue
        for path in root.rglob("*.py"):
            if "__pycache__" in path.parts or "tests" in path.parts:
                continue
            yield path


def extract_static_strings(path: Path) -> Iterable[str]:
    tree = ast.parse(path.read_text(), filename=str(path))
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            yield node.value
        elif isinstance(node, ast.JoinedStr):
            static_parts = [part.value for part in node.values if isinstance(part, ast.Constant) and isinstance(part.value, str)]
            if static_parts:
                yield "".join(static_parts)


def scan_runtime_write_tables() -> tuple[list[str], list[str]]:
    tables: set[str] = set()
    evidence: list[str] = []
    for path in iter_python_files():
        rel = path.relative_to(ROOT)
        for text in extract_static_strings(path):
            normalized = " ".join(text.split())
            for pattern in SQL_WRITE_PATTERNS:
                for match in pattern.finditer(normalized):
                    table = match.group(1)
                    if table.lower() == "set":
                        # Ignore the SET token in PostgreSQL UPSERT clauses: ON CONFLICT DO UPDATE SET ...
                        continue
                    tables.add(table)
                    evidence.append(f"{rel}:{table}:{match.group(0)}")
    return sorted(tables), sorted(evidence)


def extract_marked_tables(doc_path: Path) -> list[str]:
    text = doc_path.read_text()
    marker = re.compile(r"<!-- runtime-write-contract:start -->(.*?)<!-- runtime-write-contract:end -->", re.DOTALL)
    match = marker.search(text)
    if not match:
        fail(f"{doc_path.relative_to(ROOT)} missing runtime-write-contract marker block")
    return sorted(set(re.findall(r"`([A-Za-z_][A-Za-z0-9_]*)`", match.group(1))))


def verify_docs(contract: dict[str, object], allowed_tables: list[str]) -> None:
    mandatory_docs = sorted_strings(contract.get("mandatoryDocs"), "mandatoryDocs")
    ownership_terms = [
        "Control Plane owns",
        "Runtime Worker owns",
        "direct PostgreSQL",
        "F2+",
    ]
    for doc in mandatory_docs:
        path = ROOT / doc
        if not path.exists():
            fail(f"mandatory document disappeared: {doc}")
        text = path.read_text()
        if FORBIDDEN_NARRATIVE_RE.search(text):
            fail(f"forbidden runtime boundary narrative found in {doc}")
        marked_tables = extract_marked_tables(path)
        if marked_tables != allowed_tables:
            fail(
                f"{doc} runtime-write-contract block diverges from JSON: "
                f"doc={marked_tables} json={allowed_tables}"
            )
        missing_terms = [term for term in ownership_terms if term not in text]
        if missing_terms:
            fail(f"{doc} missing ownership/boundary terms: {', '.join(missing_terms)}")


def verify_migration(contract: dict[str, object], allowed_tables: list[str]) -> None:
    role = contract.get("runtimeRole")
    migration_name = contract.get("mandatoryMigration")
    if not isinstance(role, str) or not isinstance(migration_name, str):
        fail("contract runtimeRole and mandatoryMigration must be strings")
    migration_path = ROOT / migration_name
    if not migration_path.exists():
        fail(f"missing runtime role migration: {migration_name}")
    sql = migration_path.read_text()
    upper = sql.upper()
    required_fragments = [
        f"CREATE ROLE {role}".upper(),
        f"ALTER ROLE {role}".upper(),
        "NOSUPERUSER",
        "NOBYPASSRLS",
        "NOCREATEDB",
        "NOCREATEROLE",
        "NOREPLICATION",
        "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA PUBLIC",
        "REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA PUBLIC",
        "REVOKE ALL PRIVILEGES ON SCHEMA PUBLIC",
        "GRANT SELECT, INSERT, UPDATE ON TABLE",
        "INFORMATION_SCHEMA.ROLE_TABLE_GRANTS",
        "HAS_SCHEMA_PRIVILEGE",
        "HAS_DATABASE_PRIVILEGE",
    ]
    for fragment in required_fragments:
        if fragment not in upper:
            fail(f"runtime role migration missing enforcement fragment: {fragment}")
    for table in allowed_tables:
        if not re.search(rf"\b{re.escape(table)}\b", sql):
            fail(f"runtime role migration missing allowed table: {table}")
    prohibited = sorted_strings(contract.get("runtimeProhibitedWrites"), "runtimeProhibitedWrites")
    for table in prohibited:
        if re.search(rf"GRANT\s+[^;]*\b{re.escape(table)}\b", sql, re.IGNORECASE | re.DOTALL):
            fail(f"runtime role migration grants prohibited table: {table}")


def main() -> None:
    contract = load_contract()
    allowed_tables = sorted_strings(contract.get("allowedWriteTables"), "allowedWriteTables")
    runtime_constant_tables = extract_runtime_constant()
    if runtime_constant_tables != allowed_tables:
        fail(f"F1_RUNTIME_DB_WRITE_TABLES diverges from JSON: code={runtime_constant_tables} json={allowed_tables}")

    effective_tables, evidence = scan_runtime_write_tables()
    if effective_tables != allowed_tables:
        unexpected = sorted(set(effective_tables) - set(allowed_tables))
        missing = sorted(set(allowed_tables) - set(effective_tables))
        fail(
            "runtime SQL writes diverge from F1 contract; "
            f"unexpected={unexpected} missing={missing} evidence={evidence}"
        )

    prohibited = sorted_strings(contract.get("runtimeProhibitedWrites"), "runtimeProhibitedWrites")
    prohibited_written = sorted(set(effective_tables) & set(prohibited))
    if prohibited_written:
        fail(f"runtime writes Control Plane/prohibited tables: {prohibited_written}")

    verify_docs(contract, allowed_tables)
    verify_migration(contract, allowed_tables)
    print("f1-runtime-contract:check passed")


if __name__ == "__main__":
    main()
