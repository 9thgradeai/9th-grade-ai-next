import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/auth-ctx";
import { DashboardProvider } from "@/lib/store-ctx/dashboard";
import { ThemeProvider } from "@/lib/theme-ctx";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "9Th-Grade AI — AI-Powered Study Planner & Exam Prep",
  description: "Master competitive exams with AI-driven precision. Adaptive mock tests, automated flashcards, daily streak tracking, and AI doubt solving for BCS, Bank, and Teacher recruitment exams.",
  keywords: ["BCS preparation", "exam prep", "AI study planner", "mock tests", "competitive exams Bangladesh"],
  authors: [{ name: "9Th-Grade AI Team" }],
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
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
    { media: "(prefers-color-scheme: light)", color: "#F0FDF4" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-terminal-text font-sans">
        <AuthProvider>
          <DashboardProvider>
            <ThemeProvider>
              {children}
            </ThemeProvider>
          </DashboardProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
