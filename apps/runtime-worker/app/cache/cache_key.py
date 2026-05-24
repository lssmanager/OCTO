from __future__ import annotations

import hashlib


def hash_cache_key(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
