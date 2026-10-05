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

// PWA NOTE (2026-10): next-pwa@5 is webpack-only and crashes Next 16 builds
// (`next build --webpack` dies with an uncaught TypeError inside its compiler
// hook), which was silently failing Vercel production deploys and freezing the
// live site on stale code. The build now uses the default Turbopack pipeline
// and ships without a service worker until the offline strategy is migrated
// (see docs/DECISIONS.md). The web-manifest route is unaffected.

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
    "/api/real-exam/export": [
      "./fonts/**/*",
      "./node_modules/pdfkit/**/*",
      // katex.min.css and its woff2 fonts are read from disk at
      // render time (backend/services/pdf/mathHtml.ts) and inlined
      // as base64 into the print HTML. Not tracing them surfaces as
      // ENOENT .../node_modules/katex/dist/katex.min.css → generic
      // 500 "PDF rendering failed" inside the Vercel lambda.
      "./node_modules/katex/dist/**/*",
    ],
  },
} satisfies NextConfig;

// Bundle analysis is opt-in via `ANALYZE=true npm run build` (the existing
// `npm run analyze` script). Wrapping the base config keeps normal builds
// byte-identical; analysis builds emit .next/analyze/*.html treemaps for
// chunk-profile work (see docs/PERFORMANCE-OPTIMIZATION.md §3 Phase 0).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

module.exports = withBundleAnalyzer(baseConfig);