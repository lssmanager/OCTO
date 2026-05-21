// apps/api/src/migrate.ts
// Thin shim — delegates entirely to @octo/database/migrate.
//
// The actual runner lives in packages/database/src/migrate.ts so that
// drizzle-orm and postgres are resolved from packages/database/node_modules
// at runtime (where pnpm installs them), avoiding MODULE_NOT_FOUND errors
// when Node resolves from /app/node_modules.
//
// The Docker CMD runs packages/database/dist/migrate.js directly;
// this file is kept only so `nest build` does not error on missing entrypoint
// references. It is NOT executed at runtime.
//
// ADR F0-014 (Dockerfile strategy)

export {};
