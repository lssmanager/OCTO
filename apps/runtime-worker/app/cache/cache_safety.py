from __future__ import annotations

import re

PATTERNS = [r"sk-[A-Za-z0-9]", r"ghp_[A-Za-z0-9]", r"BEGIN PRIVATE KEY", r"password", r"Bearer "]


def is_safe_for_cache(text: str) -> tuple[bool, str | None]:
    for p in PATTERNS:
        if re.search(p, text, re.IGNORECASE):
            return False, "sensitive_content"
    return True, None
