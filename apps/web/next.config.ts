import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (infra/).
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: ['@pats/shared'],
  serverExternalPackages: ['pg', 'nodemailer'],
  poweredByHeader: false,
  // Keep `next dev` from writing extra files into the repo.
  agentRules: false,
  devIndicators: false,
  turbopack: {
    root: path.join(__dirname, '../..'),
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
