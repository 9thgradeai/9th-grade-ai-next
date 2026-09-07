"use client";
import {
  BookOpen, Zap, Target, TrendingUp, Brain, Calendar, Home,
  GraduationCap, FileText, Sparkles, BarChart3, Clock, Bookmark,
  HelpCircle, Info, Shield, FileCheck, Users, Library, PenTool, Trophy, Layers,
} from "lucide-react";
import type { ComponentType } from "react";

export type NavIcon = ComponentType<{ className?: string }>;
export type NavItem = { label: string; href: string; icon?: NavIcon; desc?: string; external?: boolean; auth?: "in" | "out" | "any" };
export type NavGroup = { label: string; items: NavItem[] };
export type MegaMenu = {
  id: string; label: string; labelBn?: string; groups: NavGroup[];
  highlight?: { title: string; desc: string; href: string; cta: string };
  show?: "always" | "auth" | "guest";
};

// VALIDATED against app/**/page.tsx and /dashboard?tab=* (TABS ids: home,study-planner,practice,flashcards,question-bank,progress,mistakes,settings)
export const NAVIGATION: MegaMenu[] = [
  {
    id: "learn", label: "Learn", labelBn: "শিখুন", show: "always",
    groups: [
      { label: "Library", items: [
        { label: "Question Bank", href: "/dashboard?tab=question-bank", icon: Library, desc: "10k+ syllabus-aligned questions", auth: "any" },
        { label: "Flashcards", href: "/dashboard?tab=flashcards", icon: Brain, desc: "Spaced repetition", auth: "any" },
        { label: "Subjects", href: "/#syllabus", icon: Layers, desc: "BCS syllabus map" },
        { label: "Archive", href: "/archive", icon: FileText, desc: "Previous year papers (1982–2026)" },
      ]},
      { label: "Resources", items: [
        { label: "Current Affairs", href: "/current-affairs", icon: Clock, desc: "Daily updates & quiz" },
        { label: "Vocabulary Builder", href: "/vocab", icon: BookOpen, desc: "Word power drills" },
        { label: "Study Guides", href: "/guides", icon: PenTool, desc: "Expert-written guides" },
        { label: "Blog & Tips", href: "/blog", icon: Sparkles, desc: "Strategy & motivation" },
      ]},
    ],
    highlight: { title: "Learn smarter", desc: "Syllabus-aligned for BCS, Bank & Teacher recruitment — Bangla + English.", href: "/dashboard?tab=question-bank", cta: "Open Question Bank" },
  },
  {
    id: "practice", label: "Practice", labelBn: "প্র্যাকটিস", show: "always",
    groups: [
      { label: "Practice", items: [
        { label: "Quick Practice", href: "/dashboard?tab=practice", icon: Zap, desc: "Start instantly" },
        { label: "Question Drill", href: "/dashboard?tab=question-bank", icon: BookOpen, desc: "Topic-wise drill" },
        { label: "Study Planner", href: "/dashboard?tab=study-planner", icon: Calendar, desc: "Personalized schedule" },
      ]},
      { label: "Review", items: [
        { label: "Mistakes", href: "/dashboard?tab=mistakes", icon: Target, desc: "Wrong-answer notebook" },
        { label: "Progress", href: "/dashboard?tab=progress", icon: BarChart3, desc: "Accuracy & weak areas" },
      ]},
    ],
    highlight: { title: "Adaptive practice", desc: "AI prioritizes your weak topics so every minute counts.", href: "/dashboard?tab=practice", cta: "Start Practice" },
  },
  {
    id: "exams", label: "Exams", labelBn: "পরীক্ষা", show: "always",
    groups: [
      { label: "Exams", items: [
        { label: "Mock Tests", href: "/dashboard?tab=practice", icon: Trophy, desc: "Full-length timed exams" },
        { label: "Exam Tracks", href: "/tracks", icon: GraduationCap, desc: "BCS / Bank / Teacher" },
        { label: "Archive Papers", href: "/archive", icon: FileText, desc: "1982 – 2026 collection" },
      ]},
      { label: "Results", items: [
        { label: "Analytics", href: "/dashboard?tab=progress", icon: TrendingUp, desc: "Scores & analytics" },
      ]},
    ],
    highlight: { title: "Exam command center", desc: "Real pressure — timer, negative marking, instant review.", href: "/tracks", cta: "Browse Tracks" },
  },
  {
    id: "ai", label: "AI", labelBn: "এআই", show: "always",
    groups: [
      { label: "AI Tools", items: [
        { label: "AI Tutor", href: "/dashboard?tab=practice", icon: Sparkles, desc: "Bilingual doubt solving" },
        { label: "AI Solver", href: "/dashboard?tab=practice", icon: PenTool, desc: "Explain any question" },
        { label: "Voice Tutor", href: "/dashboard?tab=practice", icon: HelpCircle, desc: "Speak & learn" },
      ]},
      { label: "Workspace", items: [
        { label: "Dashboard Home", href: "/dashboard?tab=home", icon: Home, desc: "AI coaching & insights" },
        { label: "Planner", href: "/dashboard?tab=study-planner", icon: Calendar, desc: "AI study plan" },
      ]},
    ],
    highlight: { title: "AI Learning Engine", desc: "Explanations, solving, tutoring & personalized guidance — in Bangla + English.", href: "/dashboard?tab=home", cta: "Open AI Coach" },
  },
  {
    id: "progress", label: "Progress", labelBn: "অগ্রগতি", show: "auth",
    groups: [
      { label: "Analytics", items: [
        { label: "Overview", href: "/dashboard?tab=progress", icon: BarChart3, desc: "Performance overview" },
        { label: "Planner", href: "/dashboard?tab=study-planner", icon: Calendar, desc: "Streaks & schedule" },
        { label: "Mistakes", href: "/dashboard?tab=mistakes", icon: TrendingUp, desc: "Weak-area analysis" },
        { label: "Bookmarks", href: "/dashboard?tab=question-bank", icon: Bookmark, desc: "Saved questions" },
      ]},
    ],
    highlight: { title: "Know your edge", desc: "Accuracy, subject mastery & weak topics — all in one view.", href: "/dashboard?tab=progress", cta: "View Progress" },
  },
  {
    id: "more", label: "More", show: "always",
    groups: [
      { label: "Product", items: [
        { label: "How it works", href: "/#features", icon: Sparkles, desc: "Features overview" },
        { label: "Syllabus", href: "/#syllabus", icon: Library, desc: "Coverage map" },
        { label: "Exam Engine", href: "/tracks", icon: Trophy, desc: "Tracks & archives" },
      ]},
      { label: "Company", items: [
        { label: "About", href: "/about", icon: Info, desc: "Our mission" },
        { label: "Careers", href: "/careers", icon: Users, desc: "Join us" },
        { label: "Press", href: "/press", icon: FileCheck, desc: "Press kit" },
        { label: "Partners", href: "/partners", icon: Users, desc: "Partnerships" },
      ]},
      { label: "Resources", items: [
        { label: "Docs / API", href: "/docs", icon: FileText, desc: "Developer docs" },
        { label: "Onboarding", href: "/onboarding", icon: HelpCircle, desc: "Get started" },
      ]},
      { label: "Legal", items: [
        { label: "Privacy", href: "/privacy", icon: Shield, desc: "Privacy policy" },
        { label: "Terms", href: "/terms", icon: FileCheck, desc: "Terms of service" },
        { label: "GitHub", href: "https://github.com/9thgradeai/9th-grade-ai-next", icon: FileText, desc: "Open source", external: true },
      ]},
    ],
    highlight: { title: "Explore 9Th-Grade AI", desc: "Free & open-source exam prep for Bangladesh — built with aspirants.", href: "/about", cta: "About us" },
  },
];

export type Command = { label: string; href: string; keywords: string; group: string; external?: boolean };
export function getCommands(): Command[] {
  const cmds: Command[] = [];
  for (const m of NAVIGATION) {
    for (const g of m.groups) for (const it of g.items) cmds.push({ label: it.label, href: it.href, keywords: `${m.label} ${g.label} ${it.label} ${it.desc ?? ""}`.toLowerCase(), group: m.label, external: it.external });
  }
  cmds.push(
    { label: "Dashboard", href: "/dashboard", keywords: "dashboard home", group: "Go" },
    { label: "Dashboard — Home", href: "/dashboard?tab=home", keywords: "home dashboard", group: "Go" },
    { label: "Login", href: "/login", keywords: "login sign in", group: "Go" },
    { label: "Get Started", href: "/login?register=true", keywords: "register signup", group: "Go" },
    { label: "Settings", href: "/dashboard?tab=settings", keywords: "settings preferences", group: "Go" },
  );
  const seen = new Set<string>();
  return cmds.filter(c => { const k = c.label + c.href; if (seen.has(k)) return false; seen.add(k); return true; });
}

export function visibleMenus(isAuthed: boolean): typeof NAVIGATION {
  return NAVIGATION.filter(m => m.show === "always" || (m.show === "auth" && isAuthed) || (m.show === "guest" && !isAuthed));
}
