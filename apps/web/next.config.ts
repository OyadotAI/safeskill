import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  transpilePackages: ['@safeskill/shared'],
  images: { unoptimized: true },
};

export default nextConfig;
