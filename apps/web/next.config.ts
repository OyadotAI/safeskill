import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@safeskill/shared', '@safeskill/scanner'],
  serverExternalPackages: ['ts-morph', 'globby'],
};

export default nextConfig;
