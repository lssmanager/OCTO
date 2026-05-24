class PoisonDetector:
    def build_key(self, tenant_id, execution_id, step_index, error_code):
        return f"octo:{tenant_id}:poison:{execution_id}:{step_index}:{error_code}"
