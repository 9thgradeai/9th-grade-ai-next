import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono, Hind_Siliguri } from "next/font/google";
import { MotionConfig } from "framer-motion";
import { AuthProvider } from "@/lib/auth-ctx";
import { DashboardProvider } from "@/lib/store-ctx/dashboard";
import { ThemeProvider } from "@/lib/theme-ctx";
import { ToastProvider } from "@/lib/toast-ctx";
import { LanguageProvider, LANGUAGE_KEY } from "@/lib/lang-ctx";
import ScrollProgress from "@/components/ui/ScrollProgress";
import Toaster from "@/components/ui/Toaster";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// Bangla text is first-class across the product (KPIs, questions, AI tutor).
// Hind Siliguri ships the bengali subset so UI copy renders in a proper
// Bengali face instead of falling back to system fonts.
const hindSiliguri = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hind-siliguri",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://9thgrade.ai"),
  title: "9Th-Grade AI — AI-Powered Study Planner & Exam Prep",
  description: "Master competitive exams with AI-driven precision. Adaptive mock tests, automated flashcards, daily streak tracking, and AI doubt solving for BCS, Bank, and Teacher recruitment exams.",
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

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("9th-grade-ai-theme");if(t==="light"){document.documentElement.classList.add("light")}else{document.documentElement.classList.remove("light")}}catch(e){}})()`;

const LANG_INIT_SCRIPT = `(function(){try{var l=localStorage.getItem("${LANGUAGE_KEY}");document.documentElement.lang=(l==="en")?"en":"bn";}catch(e){}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="bn"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} ${hindSiliguri.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the persisted theme before first paint to avoid a dark flash
            for light-mode users. The class is re-synced after hydration by
            ThemeProvider. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Sync <html lang> with the persisted UI language before paint. */}
        <script dangerouslySetInnerHTML={{ __html: LANG_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans noise">
        <div className="cosmic-bg" aria-hidden="true" />
        <ScrollProgress />
        <MotionConfig reducedMotion="user">
          <ToastProvider>
            <LanguageProvider>
              <AuthProvider>
                <DashboardProvider>
                  <ThemeProvider>
                    {children}
                  </ThemeProvider>
                </DashboardProvider>
              </AuthProvider>
            </LanguageProvider>
            <Toaster />
          </ToastProvider>
        </MotionConfig>
      </body>
    </html>
  );
}
