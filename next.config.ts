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
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.sentry.io https://api.groq.com https://api.anthropic.com https://api.resend.com https://api.sendgrid.com https://api.pwnedpasswords.com`,
  "media-src 'self' blob:",
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

// @ts-ignore - next-pwa types are incompatible with Next.js 15
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i, handler: "CacheFirst", options: { cacheName: "google-fonts", expiration: { maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 } } },
    { urlPattern: /^https:\/\/.*\.sentry\.io\/.*/i, handler: "NetworkFirst", options: { cacheName: "sentry", expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 }, networkTimeoutSeconds: 10 } },
    { urlPattern: /^https:\/\/api\.(groq|anthropic)\.com\/.*/i, handler: "NetworkOnly", options: { cacheName: "ai-api", networkTimeoutSeconds: 30 } },
    { urlPattern: /\/api\/questions/, handler: "StaleWhileRevalidate", options: { cacheName: "questions-api", expiration: { maxEntries: 64, maxAgeSeconds: 5 * 60 } } },
    { urlPattern: /\/api\/exam\/config/, handler: "StaleWhileRevalidate", options: { cacheName: "exam-config-api", expiration: { maxEntries: 16, maxAgeSeconds: 5 * 60 } } },
    { urlPattern: /\/api\/flash-news/, handler: "StaleWhileRevalidate", options: { cacheName: "flash-news-api", expiration: { maxEntries: 16, maxAgeSeconds: 10 * 60 } } },
    { urlPattern: /\/api\/dashboard-stats/, handler: "NetworkFirst", options: { cacheName: "dashboard-stats-api", expiration: { maxEntries: 32, maxAgeSeconds: 60 }, networkTimeoutSeconds: 5 } },
    { urlPattern: /\.(?:png|jpg|jpeg|svg|webp|avif|ico)$/, handler: "CacheFirst", options: { cacheName: "images", expiration: { maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 } } },
  ],
  navigateFallbackDenylist: [/\/api\/auth\/.*/, /\/api\/ai\/.*/, /\/api\/exam\/build/, /\/api\/exam\/submit/, /\/dashboard/],
  manifest: {
    name: "9Th-Grade AI", short_name: "9Th-Grade", description: "AI-Powered Study Planner & Exam Prep for Bangladeshi Government Jobs",
    start_url: "/", display: "standalone", background_color: "#05070c", theme_color: "#10b981", orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon-72x72.svg", sizes: "72x72", type: "image/svg+xml", purpose: "maskable any" },
      { src: "/icons/icon-96x96.svg", sizes: "96x96", type: "image/svg+xml", purpose: "maskable any" },
      { src: "/icons/icon-128x128.svg", sizes: "128x128", type: "image/svg+xml", purpose: "maskable any" },
      { src: "/icons/icon-144x144.svg", sizes: "144x144", type: "image/svg+xml", purpose: "maskable any" },
      { src: "/icons/icon-152x152.svg", sizes: "152x152", type: "image/svg+xml", purpose: "maskable any" },
      { src: "/icons/icon-192x192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "maskable any" },
      { src: "/icons/icon-384x384.svg", sizes: "384x384", type: "image/svg+xml", purpose: "maskable any" },
      { src: "/icons/icon-512x512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable any" },
    ],
  },
});

const baseConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,
  headers: async () => [{ source: "/(.*)", headers: securityHeaders }],
} satisfies NextConfig;

module.exports = withPWA(baseConfig);