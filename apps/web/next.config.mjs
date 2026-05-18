// next.config.mjs
// Next.js 14.2.x requires .js or .mjs — .ts is only supported from Next 15+.

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Server-side env vars used in lib/health.ts
  // These are NOT exposed to the browser (no NEXT_PUBLIC_ prefix)
  // → enforces the architecture rule: no direct browser calls to runtime-worker
  env: {
    API_URL: process.env['API_URL'] ?? 'http://localhost:3001',
    RUNTIME_WORKER_URL:
      process.env['RUNTIME_WORKER_URL'] ?? 'http://localhost:8000',
    GIT_COMMIT: process.env['GIT_COMMIT'] ?? 'local',
    BUILD_TIME: process.env['BUILD_TIME'] ?? new Date().toISOString(),
  },
  // Disable x-powered-by header
  poweredByHeader: false,
  // React strict mode
  reactStrictMode: true,
  // Compress responses
  compress: true,
  // Allow images from internal services only
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
