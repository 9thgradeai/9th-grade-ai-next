"use client";

// DEPRECATED — public pages are dark-only. Dashboard theme switching lives in
// `frontend/lib/dashboard-theme-ctx` (ThemeToggle). This stub renders nothing
// so no dead/broken control stays in the a11y tree. Kept as a module for
// backwards-compatible imports (see tests/NewFeatures.test.tsx).
export default function ThemeToggle() {
  return null;
}
