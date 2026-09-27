// next.config.ts
// Main Next.js config with PWA support via next-pwa

import type { NextConfig } from "next";

// Content-Security-Policy. 'unsafe-inline' on script-src is required by
// Next.js hydration (inline bootstrap/flight data) without nonce plumbing via
// proxy; it still blocks ALL external script sources, plugins, framing and
// form/action exfiltration. Tighten to nonces when moving headers to proxy.
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.mux.com https://*.fastly.mux.com https://image.mux.com",
  "font-src 'self' data: https://frontend-cdn.perplexity.ai https://fonts.gstatic.com",
  `connect-src 'self' blob: data: https://*.sentry.io https://api.groq.com https://api.anthropic.com https://api.resend.com https://api.sendgrid.com https://api.pwnedpasswords.com https://*.mux.com https://*.fastly.mux.com https://*.litix.io https://*.fastly.net https://stream.mux.com`,
  "media-src 'self' blob: data: https://*.mux.com https://*.fastly.mux.com https://*.fastly.net https://stream.mux.com https://d8j0ntlcm91z4.cloudfront.net",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: cspDirectives },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i, handler: "CacheFirst", options: { cacheName: "google-fonts", expiration: { maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 } } },
    { urlPattern: /^https:\/\/.*\.sentry\.io\/.*/i, handler: "NetworkFirst", options: { cacheName: "sentry", expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 }, networkTimeoutSeconds: 10 } },
    { urlPattern: /^https:\/\/api\.(groq|anthropic)\.com\/.*/i, handler: "NetworkOnly", options: { cacheName: "ai-api" } },
    // Cookie-authenticated, per-user payloads MUST be NetworkOnly. Caching
    // them in SW CacheStorage persists User A's study-plan/badges on shared
    // devices and can serve them to User B after logout (no reliable
    // cross-user purge exists). The in-memory gateway cache in
    // frontend/lib/services/api.ts already covers offline/blip resilience
    // per-tab without persisting across sessions — so nothing is lost.
    { urlPattern: /\/api\/questions/, handler: "NetworkOnly", options: { cacheName: "questions-api" } },
    { urlPattern: /\/api\/flashcards/, handler: "NetworkOnly", options: { cacheName: "flashcards-api" } },
    { urlPattern: /\/api\/exam\/config/, handler: "NetworkOnly", options: { cacheName: "exam-config-api" } },
    { urlPattern: /\/api\/flash-news/, handler: "NetworkOnly", options: { cacheName: "flash-news-api" } },
    { urlPattern: /\/api\/dashboard-stats/, handler: "NetworkOnly", options: { cacheName: "dashboard-stats-api" } },
    { urlPattern: /\/api\/study-plan/, handler: "NetworkOnly", options: { cacheName: "study-plan-api" } },
    { urlPattern: /\/api\/mistakes/, handler: "NetworkOnly", options: { cacheName: "mistakes-api" } },
    { urlPattern: /\/api\/bookmarks/, handler: "NetworkOnly", options: { cacheName: "bookmarks-api" } },
    { urlPattern: /\/api\/notifications/, handler: "NetworkOnly", options: { cacheName: "notifications-api" } },
    { urlPattern: /\/api\/vocab\//, handler: "NetworkOnly", options: { cacheName: "vocab-api" } },
    { urlPattern: /\/api\/exam-history/, handler: "NetworkOnly", options: { cacheName: "exam-history-api" } },
    { urlPattern: /\.(?:png|jpg|jpeg|svg|webp|avif|ico)$/, handler: "CacheFirst", options: { cacheName: "images", expiration: { maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 } } },
    { urlPattern: /^https:\/\/.*\.(woff2?|ttf|otf)$/, handler: "CacheFirst", options: { cacheName: "fonts", expiration: { maxEntries: 16, maxAgeSeconds: 365 * 24 * 60 * 60 } } },
  ],
  navigateFallback: "/",
  navigateFallbackDenylist: [/\/api\/auth\/.*/, /\/api\/ai\/.*/, /\/api\/exam\/build/, /\/api\/exam\/submit/, /\/dashboard/],
});

const baseConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,
  // Barrel imports (`@phosphor-icons/react` in ~90 files, `framer-motion`
  // in ~20) resolve to per-module imports at build time, so tab code-splitting
  // isn't defeated by a single giant icon/motion chunk.
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react", "framer-motion"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.mux.com" },
      { protocol: "https", hostname: "*.fastly.mux.com" },
      { protocol: "https", hostname: "image.mux.com" },
    ],
  },
  headers: async () => [{ source: "/(.*)", headers: securityHeaders }],
  // pdfkit is a CJS package that depends on Node.js built-ins (fs, stream,
  // zlib). Webpack must NOT bundle it — it runs natively in the Node.js
  // runtime. Without this, the production build silently corrupts the module,
  // causing runtime 500s on the PDF export route.
  serverExternalPackages: ["pdfkit"],
  // Ensure the Bengali font files are included in the serverless function
  // bundle for the PDF export route on Vercel.
  //
  // pdfkit's own files MUST also be traced wholesale: since v0.20 pdfkit loads
  // its standard-14 font metrics lazily via Node's package "imports" map
  // (require("#standard-fonts/Helvetica") → ./js/standard-fonts/Helvetica.cjs
  // → ./js/chunks/*.cjs). Next's file tracer does NOT follow package-internal
  // imports-map entries, so the default trace ships only js/pdfkit.js — the
  // constructor's eager initFonts('Helvetica') then throws
  // "Cannot find module .../standard-fonts/Helvetica.cjs" inside the lambda,
  // surfacing as a generic 500 "PDF rendering failed" (reproduced by running
  // the route's .nft.json trace standalone). Tracing the whole package fixes
  // it (~3.5MB incl. .afm data) without affecting any other route.
  outputFileTracingIncludes: {
    "/api/real-exam/export": ["./fonts/**/*", "./node_modules/pdfkit/**/*"],
  },
} satisfies NextConfig;

// Bundle analysis is opt-in via `ANALYZE=true npm run build` (the existing
// `npm run analyze` script). Wrapping the withPWA output keeps the PWA and
// analyzer orthogonal: normal builds are byte-identical, analysis builds emit
// .next/analyze/*.html treemaps for chunk-profile work (see
// docs/PERFORMANCE-OPTIMIZATION.md §3 Phase 0).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

module.exports = withBundleAnalyzer(withPWA(baseConfig));