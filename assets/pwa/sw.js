/**
 * Sprint 9 — hand-rolled service worker (no next-pwa: webpack-only, broke
 * Next 16 builds). Source lives here tracked in git; `npm run build` copies
 * it to public/sw.js (see package.json). Keep it dependency-free and small.
 *
 * Policy (mirrors the old runtimeCaching intent, minus its flaws):
 * - Only GET, same-origin requests are handled. Everything else passes through.
 * - /api/* is NEVER cached (per-user, cookie-authenticated payloads must not
 *   persist in CacheStorage across users/sessions).
 * - App static assets (/_next/static/*, /vendor/*, fonts, images): cache-first.
 * - Navigations: network-first, falling back to the cached shell ("/") when
 *   offline. Dashboard routes fall back too (better than a browser error page;
 *   the app's own auth gate handles signed-out state on rehydrate).
 */

const VERSION = "9g-v1";
const STATIC_CACHE = `9g-static-${VERSION}`;
const SHELL_CACHE = `9g-shell-${VERSION}`;
const SHELL_URL = "/";

const STATIC_PREFIXES = ["/_next/static/", "/vendor/", "/fonts/", "/icons/"];
const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".avif", ".ico", ".woff", ".woff2", ".ttf"];

function isStaticAsset(pathname) {
  if (STATIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return IMAGE_EXT.some((ext) => pathname.endsWith(ext));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        await cache.add(SHELL_URL);
      } catch {
        // First install while offline — shell caches on first successful visit.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("9g-") && k !== STATIC_CACHE && k !== SHELL_CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never touch API traffic (auth + per-user data).
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network-first, offline shell fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(SHELL_URL, res.clone()).catch(() => {});
          return res;
        } catch {
          const cached = await caches.match(SHELL_URL);
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  // Versioned static assets: cache-first (immutable, content-hashed).
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const res = await fetch(request);
          if (res.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, res.clone()).catch(() => {});
          }
          return res;
        } catch {
          return caches.match(request).then((hit) => hit || Response.error());
        }
      })(),
    );
  }
});
