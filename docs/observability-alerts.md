# F1 observability alerts

## Main branch metric inventory

| Metric | Status | Owner component | Action |
|---|---|---|---|
| octo_execution_dlq_total | exists | runtime-worker dlq_router | alert wired |
| octo_rls_violation_total | missing | api/security/db | TODO instrumentation + alert codified |
| octo_auth_failure_total | missing | api auth/ownership checks | TODO instrumentation + alert codified |
| octo_execution_replay_total | missing | replay/checkpoint validator | TODO instrumentation + alert codified |
| octo_execution_active_gauge | missing | execution metrics exporter | TODO instrumentation + alert codified |
| octo_worker_heartbeat_age_seconds | missing (derived rule added) | worker heartbeat exporter | recording rule added; source metric required |
| octo_execution_reclaim_total | missing | scheduler reclaim | TODO instrumentation + alert codified |
| octo_execution_started_total | docs-only | scheduler/runtime | TODO instrumentation + alert codified |
| octo_litellm_request_total | exists | litellm adapter | alert wired |
| octo_queue_oldest_job_age_seconds | missing | queue exporter | TODO instrumentation + alert codified |
| octo_litellm_circuit_open_gauge | missing (derived rule added) | circuit breaker registry | recording alias added from state metric |
| octo_outbox_publish_failed_total | docs-only | outbox publisher | alert codified |
| octo_budget_exceeded_total | missing | budget evaluator | TODO instrumentation + alert codified |
| octo_litellm_tokens_output_total | docs-only | litellm adapter | alert codified |
| octo_persisted_step_tokens_output_total | missing (derived rule added) | token accounting exporter | recording alias added from step tokens metric |
| octo_execution_completed_total | docs-only | runtime transitions | alert codified |
| octo_tool_invocation_total | docs-only | tool executor | alert codified |
| octo_tool_approval_pending_gauge | missing | approval service exporter | alert codified |
| octo_queue_dlq_gauge | missing | queue exporter | alert codified |
| octo_contract_drift_check_failed_total | docs-only | contract drift check job | alert codified |

All alerts are defined in `infra/prometheus/rules/octo-f1.yml` and routed by Grafana provisioning files.
