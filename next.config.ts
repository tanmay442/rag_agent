import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev",
              "style-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev",
              "img-src 'self' https://img.clerk.com https://*.clerk.accounts.dev data: blob:",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.clerk.accounts.dev https://clerk.clerk.accounts.dev https://api.clerk.com https://api.openai.com https://generativelanguage.googleapis.com",
              "frame-src 'self' https://*.clerk.accounts.dev https://accounts.google.com https://www.google.com",
              "form-action 'self' https://*.clerk.accounts.dev",
              "worker-src 'self' blob:",
              "child-src 'self' https://*.clerk.accounts.dev https://accounts.google.com",
              "object-src 'none'",
              "base-uri 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
  // pdf-parse is now pinned to 1.1.1 (pure Node, no native
  // canvas / DOMMatrix dependency). Nothing to externalise.
  serverExternalPackages: [],
};

export default nextConfig;
