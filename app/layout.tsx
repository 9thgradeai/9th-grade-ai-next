import type { Metadata, Viewport } from "next";
import { Geist, Space_Grotesk, Hind_Siliguri, Bricolage_Grotesque } from "next/font/google";
import { AuthProvider } from "@/lib/auth-ctx";
import { ToastProvider } from "@/lib/toast-ctx";
import { LanguageProvider } from "@/lib/lang-ctx";
import { LANGUAGE_KEY } from "@/lib/lang-key";
import ScrollProgress from "@/components/ui/ScrollProgress";
import Toaster from "@/components/ui/ToasterLazy";
import CommandPalette from "@/components/navigation/CommandPalette";
import { SentryClientProvider } from "@/lib/sentry";
import "./globals.css";

// Geist replaces Inter as the primary sans — Inter is an AI-default font
// banned by taste-skill, gpt-taste, high-end-visual-design, minimalist-ui,
// and stitch-design-taste. Space Grotesk stays as the display face.
// Bangla text is first-class across the product. Fonts use `swap` so the
// real web face shows on first paint. LCP is no longer tied to font loading
// because the hero text paints at FCP — the late swap re-paint cannot overtake LCP.
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
  preload: true,
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
  preload: false,
});

// Hind Siliguri ships the bengali subset so UI copy renders in a proper
// Bengali face. Latin is intentionally omitted (Geist covers Latin). We keep
// only the two weights used for hierarchy (400 + 700; 600 is synthesized) and
// disable font preloading so the render-blocking CSS — not the font files —
// wins the throttled connection first. Total font payload is ~150KB.
const hindSiliguri = Hind_Siliguri({
  subsets: ["bengali"],
  weight: ["400", "700"],
  variable: "--font-hind-siliguri",
  display: "swap",
  preload: false,
});

// Bricolage Grotesque — the hero/display voice: expressive, idiosyncratic,
// unmistakably non-AI-default. Latin-only (Bengali headlines fall back to
// Hind Siliguri via the stack). Swap + no preload so it never blocks LCP.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://9thgrade.ai"),
  title: "9Th-Grade AI — AI-Powered Study Planner & Exam Prep",
  description: "Master competitive exams with AI-driven precision. Full-length mock tests, automated flashcards, daily streak tracking, and AI doubt solving for BCS, Bank, and Teacher recruitment exams.",
  keywords: ["BCS preparation", "exam prep", "AI study planner", "mock tests", "competitive exams Bangladesh"],
  authors: [{ name: "9Th-Grade AI Team" }],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "9Th-Grade AI — Next-Gen Exam Intelligence",
    description: "Master competitive exams with AI-driven precision.",
    type: "website",
    locale: "en_US",
    siteName: "9Th-Grade AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "9Th-Grade AI",
    description: "AI-powered study planner for competitive exams",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#05070c" },
    { media: "(prefers-color-scheme: light)", color: "#f5f9f7" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Sprint 5 theme unification: ONE theme system. Public pages (landing,
// marketing, auth) ship a single unified dark design — light/dark switching
// lives only in the dashboard (`DashboardThemeProvider` +
// `.dashboard-theme-scope[data-dashboard-theme]`). There is no React theme
// provider here by design: the pre-paint script below is the entire public
// enforcement (strips any legacy `light` class, migrates the legacy storage
// key). The old no-op `ThemeProvider` (`frontend/lib/theme-ctx`) is deleted.
const THEME_INIT_SCRIPT = `(function(){try{document.documentElement.classList.remove("light");localStorage.removeItem("9th-grade-ai-theme");}catch(e){}})()`;

const LANG_INIT_SCRIPT = `(function(){try{var l=localStorage.getItem("${LANGUAGE_KEY}");document.documentElement.lang=(l==="bn")?"bn":"en";}catch(e){}})()`;

// Failsafe: landing sections are server-rendered with `opacity:0` and only
// revealed by framer-motion JS animations. If hydration stalls (e.g. a chunk
// fails to load) those initial states stay frozen and the page appears blank.
// This plain inline script runs independently of the React/Next chunks, so it
// reveals any still-hidden content shortly after load as a last resort.
const ANIMATION_FAILSAFE_SCRIPT = `(function(){try{function r(){document.querySelectorAll('[style*="opacity: 0"],[style*="opacity:0"]').forEach(function(el){if(el.hasAttribute("hidden"))return;el.style.opacity="1";el.style.transform="none";el.style.height="";});}var t1=setTimeout(r,1500),t2=setTimeout(r,3000);if(document.readyState==="complete"){setTimeout(r,800);}else{window.addEventListener("load",function(){setTimeout(r,800);});}window.addEventListener("load",function(){clearTimeout(t1);});}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${spaceGrotesk.variable} ${hindSiliguri.variable} ${bricolage.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Public dark enforcement (see THEME_INIT_SCRIPT above). The theme
            class is owned by the dashboard provider after hydration. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Sync <html lang> with the persisted UI language before paint. */}
        <script dangerouslySetInnerHTML={{ __html: LANG_INIT_SCRIPT }} />
        {/* Last-resort reveal of content if JS animations fail to run. */}
        <script dangerouslySetInnerHTML={{ __html: ANIMATION_FAILSAFE_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans noise">
        <div className="cosmic-bg" aria-hidden="true" />
        <ScrollProgress />
        <ToastProvider>
          <LanguageProvider>
            <AuthProvider>
              <SentryClientProvider>{children}</SentryClientProvider>
              <CommandPalette />
            </AuthProvider>
          </LanguageProvider>
          <Toaster />
        </ToastProvider>
      </body>
    </html>
  );
}
