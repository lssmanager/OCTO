## Main branch metric inventory

| Metric | Status | Owner component | Action |
|---|---|---|---|
| octo_execution_dlq_total | exists | runtime-worker DLQ router | add alert |
| octo_litellm_request_total | exists | runtime-worker litellm adapter | add alert |
| octo_rls_violation_total | missing | api/security/db | add metric TODO + alert codified |
| octo_auth_failure_total | missing | api auth guards | add metric TODO + alert codified |
| octo_execution_replay_total | missing | replay/checkpoint service | add metric TODO + alert codified |
| octo_execution_active_gauge | missing | execution exporter | add metric TODO + alert codified |
| octo_execution_reclaim_total | missing | reclaim service | add metric TODO + alert codified |
| octo_execution_started_total | missing | scheduler/runtime | add metric TODO + alert codified |
| octo_queue_oldest_job_age_seconds | missing | queue exporter | add metric TODO + alert codified |
| octo_litellm_circuit_open_gauge | missing | circuit breaker registry | add recording rule alias |
| octo_outbox_publish_failed_total | missing | outbox publisher | add metric TODO + alert codified |
| octo_budget_exceeded_total | missing | budget evaluator | add metric TODO + alert codified |
| octo_litellm_tokens_output_total | documented only | llm accounting | add metric TODO + alert codified |
| octo_persisted_step_tokens_output_total | missing | token accounting exporter | add recording rule alias + TODO |
| octo_execution_completed_total | documented only | runtime transition | add metric TODO + alert codified |
| octo_tool_invocation_total | documented only | tool executor | add metric TODO + alert codified |
| octo_tool_approval_pending_gauge | missing | approval service | add metric TODO + alert codified |
| octo_queue_dlq_gauge | missing | queue exporter | add metric TODO + alert codified |
| octo_contract_drift_check_failed_total | documented only | contract CI/exporter | add metric TODO + alert codified |

Silencing policy:
- `OctoWorkerHeartbeatStale` and `OctoQueueOldestJobAge` may be muted during planned maintenance only.
- Every silence requires `reason/comment` and `end_time`; open-ended silences are prohibited.
