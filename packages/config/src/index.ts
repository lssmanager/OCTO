// @octo/config — Zod-validated environment schemas
//
// Each service imports its own schema and calls loadXxxConfig() at startup.
// If any required variable is missing or invalid, the process exits immediately
// with a human-readable list of all problems (fail-fast pattern).
//
// Pattern source: F0-016-env-config-strategy.md, F0-013-code-standards.md

export { apiConfigSchema, loadApiConfig, type ApiConfig } from './schema/api';
export { runtimeConfigSchema, type RuntimeConfig } from './schema/runtime';
