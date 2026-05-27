from __future__ import annotations
from typing import Any

def validate_checkpoint_lineage(rows: list[dict[str, Any]]) -> bool:
    if not rows:
        return False
    by_id = {str(r['id']): r for r in rows}
    seen: set[str] = set()
    cur = max(rows, key=lambda r: int(r['step_index']))
    hops = 0
    while cur is not None:
        cid = str(cur['id'])
        if cid in seen:
            return False
        seen.add(cid)
        hops += 1
        if hops > len(rows) + 1:
            return False
        parent = cur.get('parent_checkpoint_id')
        if parent is None:
            return int(cur['step_index']) == 0
        cur = by_id.get(str(parent))
        if cur is None:
            return False
    return False
