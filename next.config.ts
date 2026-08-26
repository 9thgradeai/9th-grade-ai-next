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
  "connect-src 'self'",
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
  // microphone=(self): the dashboard's Voice AI Tutor uses SpeechRecognition
  // and needs top-level document mic access; camera/geolocation stay denied.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,
  headers: async () => [
    {
      source: "/(.*)",
      headers: securityHeaders,
    },
  ],
} satisfies NextConfig;

export default nextConfig;