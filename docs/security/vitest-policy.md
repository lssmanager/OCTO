# Vitest security policy

OCTO does not expose Vitest UI, Vitest browser mode, or the Vitest API server in production, CI, or shared development environments. These features are intentionally outside the approved test surface because the Vitest UI/API server class of vulnerabilities can allow file disclosure or code execution when a developer or CI runner has a listening Vitest server.

## Minimum allowed versions

| Package family | Minimum OCTO version | Reason |
| --- | --- | --- |
| `vitest` | `4.1.8` | Remediates Dependabot alerts for “When Vitest UI server is listening, arbitrary file can be read and executed” / CVE-2026-47429 and keeps all workspaces on one supported Vitest line. |
| `@vitest/coverage-v8` | `4.1.8` | Must remain exactly aligned with the installed Vitest version to prevent peer drift and mixed Vitest internals. |
| `vite` | `6.4.2` | Minimum safe Vite 6 line for the dev-server WebSocket arbitrary file read advisory GHSA-p9ff-h696-f583 / CVE-2026-39363. |

Reference advisories:

- <https://github.com/advisories/GHSA-p9ff-h696-f583>
- <https://github.com/advisories?query=CVE-2026-47429>

## Disallowed test surface

Do not add any of the following unless a future security review explicitly approves it and restricts the listener to `127.0.0.1`:

- `@vitest/ui`
- `@vitest/browser`
- `@vitest/coverage-istanbul`
- direct `vite-node`
- `vitest --ui`, `vitest --api`, browser-mode config, or scripts binding Vitest/Vite to `0.0.0.0`

## Regression guard

Run this check before merging dependency changes:

```bash
pnpm security:vitest
```

The guard fails when a workspace reintroduces vulnerable Vitest versions, installs Vitest UI/browser packages, installs direct `vite-node`, or removes the centralized safe overrides from `pnpm-workspace.yaml`.

## Emergency release-age exception

The workspace keeps version-scoped `minimumReleaseAgeExclude` entries for `vitest@4.1.8` and `@vitest/*` so a critical Dependabot remediation can be installed immediately without disabling pnpm release-age protection globally. Remove or rotate the exception when the next safe Vitest line is adopted.
