import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const appDirectory = path.dirname(fileURLToPath(import.meta.url));

const securityHeaders = [
  // The site is HTTPS-only in every deployed environment; plain-HTTP development
  // ignores this header, so it can ship unconditionally.
  { key: 'strict-transport-security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'x-content-type-options', value: 'nosniff' },
  { key: 'referrer-policy', value: 'strict-origin-when-cross-origin' },
  // SAMEORIGIN keeps the in-app same-origin preview frames working while
  // blocking third-party framing of Admin/Dealer/My surfaces.
  { key: 'x-frame-options', value: 'SAMEORIGIN' },
  { key: 'permissions-policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  output: 'standalone',
  outputFileTracingRoot: path.join(appDirectory, '../..'),
  agentRules: false,
  transpilePackages: ['@alsvid/ui'],
  serverExternalPackages: ['geoip-country'],
  outputFileTracingIncludes: {
    '/*': ['../../node_modules/.pnpm/geoip-country@*/node_modules/geoip-country/data/**/*'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // Retired workbench must never render from a stale bookmark or deep link.
  async redirects() {
    return [
      { source: '/admin-legacy', destination: '/admin', permanent: true },
      { source: '/admin-preview', destination: '/admin', permanent: true },
      { source: '/admin/workbench-v2', destination: '/admin', permanent: true },
      { source: '/admin/workbench-v3', destination: '/admin', permanent: true },
    ];
  },
};

export default nextConfig;
