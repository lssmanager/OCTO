from __future__ import annotations

from app.resilience.models import ModelCandidate, ModelCapabilityRequirements


class ModelCapabilityMatcher:
    def is_compatible(self, candidate: ModelCandidate, requirements: ModelCapabilityRequirements) -> tuple[bool, str | None]:
        if requirements.requires_tools and not candidate.supports_tools:
            return False, "missing_tool_support"
        if requirements.requires_reasoning and not candidate.supports_reasoning:
            return False, "missing_reasoning_support"
        if requirements.requires_native_json_schema and not candidate.supports_native_json_schema:
            return False, "missing_structured_output_support"
        return True, None
