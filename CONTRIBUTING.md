# Contributing to OCTO

## Development Workflow

1. **Branch from `main`** — use convention `feat/F0-xxx-description`, `fix/issue-description`
2. **Follow ADRs** — all architectural decisions must align with `docs/adr/`
3. **Run quality checks before PR**:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm build
   pnpm test
   ```
4. **Fill out PR template** — including ADR/phase reference
5. **No CI failures** — PRs with failing CI will not be reviewed

## Architectural Rules (Non-Negotiable)

- **Never** put runtime AI execution in `apps/api` (Control Plane)
- **Never** put orchestration logic in `apps/runtime-worker`
- **Never** import vendor SDKs outside `packages/sdk-abstractions`
- **Never** put business logic in `apps/web`
- **Always** include `trace_id` on executions
- **Always** emit events for state transitions

## Adding a New Package

1. Create `packages/your-package/`
2. Add `package.json` with `@octo/your-package` name
3. Add `tsconfig.json` extending `@octo/config`
4. Add `src/index.ts` stub
5. Add to `pnpm-workspace.yaml` (already covered by `packages/*`)
6. Run `pnpm install`

## ADR Process

1. Create `docs/adr/FXXX-title.md`
2. Follow the ADR format in `docs/adr/README.md`
3. Update `docs/adr/README.md` index
4. Reference in PR

## Commit Convention

```
feat(scope): description
fix(scope): description
refactor(scope): description
docs(scope): description
test(scope): description
infra(scope): description
```

Examples:
```
feat(api): add ExecutionModule with run lifecycle
fix(runtime-worker): handle LLM timeout gracefully
docs(adr): add F1-001 Platform Kernel ADR
```
