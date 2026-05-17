import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@octo/contracts'],
  // output: 'standalone' es requerido por apps/web/Dockerfile.
  // Genera .next/standalone/ con solo los archivos necesarios para produccion:
  // el server.js de Next.js + node_modules mínimos (no el node_modules completo).
  // Sin esto, la imagen Docker de web seria ~400MB en vez de ~120MB.
  // Ver: https://nextjs.org/docs/app/api-reference/config/next-config-js/output
  output: 'standalone',
};

export default nextConfig;
