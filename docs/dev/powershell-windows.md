# Developing on Windows (PowerShell)

OCTO's dev tooling uses bash-style environment variable syntax in some scripts.
PowerShell uses a different syntax. Use these equivalents:

## Common Commands

| bash (Linux/macOS/WSL) | PowerShell (Windows) |
|---|---|
| `HUSKY=0 pnpm install` | `$env:HUSKY=0; pnpm install` |
| `NODE_ENV=production node dist/main` | `$env:NODE_ENV='production'; node dist/main` |
| `export DATABASE_URL=...` | `$env:DATABASE_URL='...'` |
| `DATABASE_URL=... pnpm dev` | `$env:DATABASE_URL='...'; pnpm dev` |

## Recommended Setup (avoid all of this)

The cleanest experience on Windows is **WSL 2** (Windows Subsystem for Linux):

```powershell
# Install WSL2 (run as Administrator, then restart)
wsl --install

# After restart, open Ubuntu terminal and clone the repo there:
git clone https://github.com/lssmanager/OCTO ~/projects/OCTO
cd ~/projects/OCTO

# Now all bash commands work natively:
HUSKY=0 pnpm install
pnpm typecheck
pnpm dev
```

VS Code detects WSL automatically and opens the remote session.
Extension: **Remote - WSL** (ms-vscode-remote.remote-wsl)

## Using .env for local secrets

```powershell
# Copy example
copy .env.example .env
# Edit .env with real values (never commit .env)
notepad .env
```

ADR-0016 mandates that secrets are NEVER in Dockerfiles or build args.
For local dev, `.env` is loaded automatically by NestJS ConfigModule.

## pnpm scripts cross-platform

All `package.json` scripts should use `cross-env` for env vars:

```json
"dev": "cross-env NODE_ENV=development nest start --watch"
```

`cross-env` is already in devDependencies at the root.
