import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (infra/).
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: ['@pats/shared'],
  serverExternalPackages: ['pg', 'nodemailer', 'playwright-core'],
  // playwright-core reads browsers.json at runtime, which static tracing can't see.
  outputFileTracingIncludes: { '/**': ['../../node_modules/playwright-core/browsers.json'] },
  experimental: {
    // Event flyers (up to 5 MB) are uploaded through a server action.
    serverActions: { bodySizeLimit: '6mb' },
  },
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
