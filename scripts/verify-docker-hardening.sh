#!/usr/bin/env bash
set -euo pipefail

REPORT_PATH="${F1_HARDENING_REPORT_PATH:-artifacts/f1-hardening-report.md}"

python3 - "$REPORT_PATH" <<'PY'
from __future__ import annotations

import datetime as dt
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import yaml

report_path = Path(sys.argv[1])
root = Path.cwd()
floating_tags = {"latest", "main-latest", "nightly", "edge", "canary", "dev", "main"}
# Tags like 16-alpine or 22-alpine are mutable minor aliases. sha-* local build tags are accepted.
mutable_alias_re = re.compile(r"^(?:\d+|\d+\.\d+)-(?:alpine|slim|bookworm|bullseye|trixie)$")

results: list[tuple[str, str, str]] = []
images: list[dict[str, str]] = []
dockerfile_rows: list[dict[str, str]] = []
f1_syntax_required = {
    'docker/api.Dockerfile',
    'docker/runtime-worker.Dockerfile',
    'docker/scheduler-worker.Dockerfile',
    'docker/reclaimer-worker.Dockerfile',
    'docker/migrate.Dockerfile',
}
compose_rows: list[dict[str, str]] = []

def add(level: str, check: str, detail: str) -> None:
    results.append((level, check, detail))
    print(f"{level}: {check} - {detail}")

def run(cmd: list[str]) -> tuple[int, str]:
    try:
        cp = subprocess.run(cmd, cwd=root, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=60)
        return cp.returncode, cp.stdout.strip()
    except Exception as exc:  # noqa: BLE001 - report environmental limitations clearly
        return 127, str(exc)

def image_tag(ref: str) -> str | None:
    if "@sha256:" in ref:
        return None
    last = ref.rsplit("/", 1)[-1]
    if ":" not in last:
        return "latest"
    return last.rsplit(":", 1)[-1]

def check_image_ref(ref: str, source: str) -> None:
    tag = image_tag(ref)
    digest = ref.split("@sha256:", 1)[1] if "@sha256:" in ref else ""
    images.append({"source": source, "image": ref, "tag": tag or "digest-pinned", "digest": ("sha256:" + digest) if digest else ""})
    if tag in floating_tags or (tag and mutable_alias_re.match(tag)):
        add("FAIL", "floating Docker image", f"{source}: {ref}")

def dockerfiles() -> list[Path]:
    return sorted([p for p in root.rglob("*Dockerfile*") if "node_modules" not in p.parts and ".git" not in p.parts and p.is_file()])

# Compose checks
compose_paths = sorted({
    p for pattern in ("docker-compose*.yml", "docker-compose*.yaml", "compose*.yml", "compose*.yaml")
    for p in root.rglob(pattern)
    if "node_modules" not in p.parts and ".git" not in p.parts and p.is_file()
})
for path in compose_paths:
    compose_name = str(path.relative_to(root))
    try:
        data = yaml.safe_load(path.read_text()) or {}
    except Exception as exc:  # noqa: BLE001
        add("FAIL", "compose parse", f"{compose_name}: {exc}")
        continue
    services = data.get("services") or {}
    if not services:
        add("WARN", "compose services", f"{compose_name}: no services found")
        continue
    is_debug_override = compose_name.endswith(".debug.yml") or compose_name.endswith(".debug.yaml")
    for service, cfg in services.items():
        source = f"{compose_name}:{service}"
        if isinstance(cfg, dict) and cfg.get("image"):
            check_image_ref(str(cfg["image"]), source)
        if is_debug_override:
            add("PASS", "debug compose override", f"{source}: debug-only host bindings are checked by compose:network-policy")
            if cfg.get("ports"):
                compose_rows.append({"compose": compose_name, "service": service, "ports": json.dumps(cfg.get("ports")), "healthcheck": "debug override", "restart": "debug override"})
            continue
        restart = str(cfg.get("restart", "")) if isinstance(cfg, dict) else ""
        if restart != "unless-stopped":
            if service == "migrate" and restart in {"no", "'no'", '"no"'}:
                add("PASS", "restart policy exception", f"{source}: one-shot migration job uses restart: {restart}")
            else:
                add("FAIL", "restart policy missing", f"{source}: expected restart: unless-stopped")
        else:
            add("PASS", "restart policy", f"{source}: unless-stopped")
        if isinstance(cfg, dict) and cfg.get("healthcheck"):
            add("PASS", "healthcheck", f"{source}: healthcheck configured")
        else:
            if service == "migrate":
                add("PASS", "healthcheck exception", f"{source}: one-shot job gated by service_completed_successfully")
            else:
                add("FAIL", "healthcheck missing", f"{source}: compatible long-running service has no healthcheck")
        if service not in {"postgres", "redis", "migrate"}:
            missing = []
            if cfg.get("read_only") is not True:
                missing.append("read_only: true")
            if "no-new-privileges:true" not in [str(x) for x in cfg.get("security_opt", [])]:
                missing.append("security_opt: no-new-privileges:true")
            if "ALL" not in [str(x) for x in cfg.get("cap_drop", [])]:
                missing.append("cap_drop: ALL")
            if missing:
                add("WARN", "compose hardening", f"{source}: missing {', '.join(missing)}")
            else:
                add("PASS", "compose hardening", f"{source}: read-only, no-new-privileges and cap_drop ALL")
        if cfg.get("ports"):
            compose_rows.append({"compose": compose_name, "service": service, "ports": json.dumps(cfg.get("ports")), "healthcheck": "yes" if cfg.get("healthcheck") else "no", "restart": restart or "missing"})

# Dockerfile static checks
for path in dockerfiles():
    rel = str(path.relative_to(root))
    text = path.read_text()
    first_line = text.splitlines()[0] if text.splitlines() else ''
    syntax_effective = first_line.startswith('# syntax=docker/dockerfile:')
    if rel in f1_syntax_required:
        if syntax_effective:
            add('PASS', 'Dockerfile syntax directive', f'{rel}: effective on line 1 ({first_line})')
        else:
            add('FAIL', 'Dockerfile syntax directive', f'{rel}: missing or ineffective; # syntax= must be the first line for BuildKit')
    elif '# syntax=' in text and not syntax_effective:
        add('WARN', 'Dockerfile syntax directive', f'{rel}: # syntax= is present but not effective because it is not line 1')
    from_lines = re.findall(r"^FROM\s+([^\s]+)(?:\s+AS\s+([^\s]+))?", text, flags=re.MULTILINE | re.IGNORECASE)
    froms = [ref for ref, _alias in from_lines]
    stage_aliases = {alias for _ref, alias in from_lines if alias}
    for ref in froms:
        if ref in stage_aliases:
            continue
        check_image_ref(ref, f"{rel}:FROM")
    if len(froms) < 2:
        add("WARN", "Dockerfile multi-stage", f"{rel}: single-stage build")
    else:
        add("PASS", "Dockerfile multi-stage", f"{rel}: {len(froms)} stages")
    users = re.findall(r"^USER\s+(.+)$", text, flags=re.MULTILINE)
    final_user = users[-1].strip() if users else ""
    if not final_user or final_user in {"root", "0", "0:0"}:
        add("FAIL", "Dockerfile runtime user", f"{rel}: final USER is {final_user or 'missing'}")
    else:
        add("PASS", "Dockerfile runtime user", f"{rel}: {final_user}")
    if "org.opencontainers.image.title" not in text or "org.opencontainers.image.version" not in text or "org.opencontainers.image.source" not in text:
        add("WARN", "OCI labels", f"{rel}: missing title/version/source label set")
    else:
        add("PASS", "OCI labels", f"{rel}: required label set present")
    if re.search(r"corepack prepare pnpm@latest\b", text):
        add("FAIL", "floating package manager", f"{rel}: pnpm@latest")
    non_comment_text = "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("#"))
    if re.search(r"^(?:ENV|ARG)\s+[^\n]*(_KEY|_SECRET|PASSWORD|TOKEN)=", non_comment_text, flags=re.MULTILINE):
        add("FAIL", "Dockerfile secret material", f"{rel}: possible secret ENV/ARG assignment")
    dockerfile_rows.append({"path": rel, "syntax": "line 1" if syntax_effective else "missing/ineffective", "stages": str(len(froms)), "final_user": final_user or "missing", "oci_labels": "yes" if "org.opencontainers.image.title" in text else "no"})

# Optional built-image checks for canonical F1 local images. Static checks above are authoritative for close gate.
for image in ["octo/api:sha-local", "octo/runtime-worker:sha-local", "octo/scheduler-worker:sha-local", "octo/migrate:sha-local", "octo/outbox-publisher-worker:sha-local", "octo/reclaimer-worker:sha-local"]:
    code, out = run(["docker", "image", "inspect", image])
    if code != 0:
        add("WARN", "built image inspect", f"{image}: not present locally; static Dockerfile checks used")
        continue
    meta = json.loads(out)[0]
    user = meta.get("Config", {}).get("User", "")
    if not user or user in {"root", "0", "0:0"}:
        add("FAIL", "built image runtime user", f"{image}: {user or 'missing'}")
    else:
        add("PASS", "built image runtime user", f"{image}: {user}")
    labels = meta.get("Config", {}).get("Labels") or {}
    if not labels.get("org.opencontainers.image.title"):
        add("FAIL", "built image OCI labels", f"{image}: title label missing")
    else:
        add("PASS", "built image OCI labels", f"{image}: {labels.get('org.opencontainers.image.title')}")
    envs = meta.get("Config", {}).get("Env") or []
    leaked = [e for e in envs if re.search(r"(_KEY|_SECRET|PASSWORD|TOKEN)=", e)]
    if leaked:
        add("FAIL", "built image secret env", f"{image}: {', '.join(x.split('=',1)[0] for x in leaked)}")

fail_count = sum(1 for level, _, _ in results if level == "FAIL")
warn_count = sum(1 for level, _, _ in results if level == "WARN")
pass_count = sum(1 for level, _, _ in results if level == "PASS")
commit = run(["git", "rev-parse", "HEAD"])[1] or "unknown"
branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"])[1] or "unknown"
report_path.parent.mkdir(parents=True, exist_ok=True)
with report_path.open("w") as f:
    f.write("# F1 Docker Reproducibility & Hardening Report\n\n")
    f.write(f"- Date (UTC): {dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}\n")
    f.write(f"- Commit: {commit}\n")
    f.write(f"- Branch: {branch}\n")
    f.write(f"- Result: {'FAIL' if fail_count else 'PASS'}\n")
    f.write(f"- Summary: PASS={pass_count}, WARN={warn_count}, FAIL={fail_count}\n\n")
    f.write("## Images\n\n| Source | Image | Version/tag | Digest |\n|---|---|---|---|\n")
    for row in images:
        f.write(f"| {row['source']} | `{row['image']}` | `{row['tag']}` | `{row['digest'] or 'n/a'}` |\n")
    f.write("\n## Exposed ports, health checks and restart policies\n\n| Compose | Service | Ports | Healthcheck | Restart |\n|---|---|---|---|---|\n")
    for row in compose_rows:
        f.write(f"| {row['compose']} | {row['service']} | `{row['ports']}` | {row['healthcheck']} | `{row['restart']}` |\n")
    f.write("\n## Dockerfiles\n\n| Path | Syntax directive | Stages | Final USER | OCI labels |\n|---|---|---:|---|---|\n")
    for row in dockerfile_rows:
        f.write(f"| `{row['path']}` | {row['syntax']} | {row['stages']} | `{row['final_user']}` | {row['oci_labels']} |\n")
    f.write("\n## Check log\n\n| Level | Check | Detail |\n|---|---|---|\n")
    for level, check, detail in results:
        f.write(f"| {level} | {check} | {detail.replace('|','\\|')} |\n")

print(f"SUMMARY: PASS={pass_count} WARN={warn_count} FAIL={fail_count}")
print(f"REPORT: {report_path}")
if fail_count:
    sys.exit(1)
PY
