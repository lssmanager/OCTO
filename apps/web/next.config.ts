import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@octo/contracts'],
};

export default nextConfig;
