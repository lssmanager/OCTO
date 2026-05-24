from __future__ import annotations

from app.resilience.errors import AllProvidersUnavailableError
from app.resilience.models import ModelCandidate, ModelCapabilityRequirements


class FallbackChainResolver:
    def resolve(self, hierarchy_snapshot: dict, open_circuits: set[str], requirements: ModelCapabilityRequirements, global_default_model: str) -> list[ModelCandidate]:
        seq: list[tuple[str, str]] = []
        for lvl in ["subagent", "agent", "workspace", "department", "agency"]:
            mp = (hierarchy_snapshot.get(lvl) or {}).get("model_policy") or {}
            if mp.get("primary_model"):
                seq.append((lvl, mp["primary_model"]))
            for m in mp.get("fallback_models", []):
                seq.append((lvl, m))
        seq.append(("global", global_default_model))
        out: list[ModelCandidate] = []
        seen: set[str] = set()
        for i, (lvl, model) in enumerate(seq):
            if model in seen:
                continue
            seen.add(model)
            provider = model.split("/", 1)[0] if "/" in model else "unknown"
            if f"{provider}:{model}" in open_circuits:
                continue
            out.append(ModelCandidate(model=model, provider=provider, source_level=lvl if lvl in {"agent","workspace","department","agency","global"} else "agent", priority=i))
        if not out:
            raise AllProvidersUnavailableError("no candidates")
        return out
