import type { NextConfig } from "next";

/**
 * Production security headers (blueprint §17.3).
 *
 * The CSP is deliberately pragmatic rather than maximal: the Next.js App
 * Router bootstraps hydration with inline scripts, so `script-src` allows
 * 'unsafe-inline' (a nonce-based CSP needs request middleware — tracked as a
 * future hardening step). Everything else is locked to same-origin; the app
 * loads no third-party scripts, styles, fonts, or frames.
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Produce a minimal server bundle for the Docker production image.
  output: "standalone",
  // pino uses worker threads and dynamic requires; keep it (and its dev
  // transport) out of the Next.js bundler.
  serverExternalPackages: ["pino", "pino-pretty"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
