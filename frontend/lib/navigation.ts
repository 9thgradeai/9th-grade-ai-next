"use client";

import {
  BookOpen, LightningA, Target, TrendUp, Brain, Calendar, House,
  GraduationCap, FileText, ChartBar, Clock, Bookmark,
  Question, Info, Shield, FileText as FileCheck, Users, Books, Pen, Trophy, GridFour, Newspaper, Compass,
} from "@phosphor-icons/react";
import { createElement, type ComponentType } from "react";
import AiLogo from "@/components/ui/AiLogo";

export type NavIcon = ComponentType<{ className?: string }>;

// Bespoke 9Th-Grade AI emblem as a menu glyph — inherits the tile colour via
// currentColor so it renders like the other Phosphor nav icons.
const AiGlyph = ({ className }: { className?: string }) =>
  createElement(AiLogo, { solid: false, className });
export type NavItem = { label: string; labelBn?: string; href: string; icon?: NavIcon; desc?: string; descBn?: string; external?: boolean; auth?: "in" | "out" | "any" };
export type NavGroup = { label: string; labelBn?: string; items: NavItem[] };
export type MegaMenu = {
  id: string; label: string; labelBn?: string; groups: NavGroup[];
  highlight?: { title: string; titleBn?: string; desc: string; descBn?: string; href: string; cta: string; ctaBn?: string };
  show?: "always" | "auth" | "guest";
};

// VALIDATED against app/**/page.tsx and /dashboard?tab=* (TABS ids: home,study-planner,practice,flashcards,question-bank,progress,mistakes,settings)
export const NAVIGATION: MegaMenu[] = [
  {
    id: "learn", label: "Learn", labelBn: "শিখুন", show: "always",
    groups: [
      { label: "Library", labelBn: "লাইব্রেরি", items: [
        { label: "Question Bank", labelBn: "প্রশ্নব্যাংক", href: "/dashboard?tab=question-bank", icon: Books, desc: "10k+ syllabus-aligned questions", descBn: "১০ হাজার+ সিলেবাসভিত্তিক প্রশ্ন", auth: "any" },
        { label: "Flashcards", labelBn: "ফ্ল্যাশকার্ড", href: "/dashboard?tab=flashcards", icon: Brain, desc: "Spaced repetition", descBn: "বিরতিমূলক পুনরাবৃত্তি", auth: "any" },
        { label: "Subjects", labelBn: "বিষয়সমূহ", href: "/#syllabus", icon: GridFour, desc: "BCS syllabus map", descBn: "বিসিএস সিলেবাস ম্যাপ" },
        { label: "Archive", labelBn: "আর্কাইভ", href: "/archive", icon: FileText, desc: "Previous year papers (1982–2026)", descBn: "বিগত বছরের প্রশ্ন (১৯৮২–২০২৬)" },
      ]},
      { label: "Resources", labelBn: "রিসোর্স", items: [
        { label: "Current Affairs", labelBn: "সাম্প্রতিক", href: "/current-affairs", icon: Clock, desc: "Daily updates & quiz", descBn: "দৈনিক আপডেট ও কুইজ" },
        { label: "Vocabulary Builder", labelBn: "শব্দভাণ্ডার", href: "/vocab", icon: BookOpen, desc: "Word power drills", descBn: "শব্দ অনুশীলন" },
        { label: "Study Guides", labelBn: "গাইড", href: "/guides", icon: Pen, desc: "Expert-written guides", descBn: "বিশেষজ্ঞ গাইড" },
        { label: "Blog & Tips", labelBn: "ব্লগ ও টিপস", href: "/blog", icon: Newspaper, desc: "Strategy & motivation", descBn: "কৌশল ও অনুপ্রেরণা" },
      ]},
    ],
    highlight: { title: "Learn smarter", titleBn: "স্মার্টভাবে শিখুন", desc: "Syllabus-aligned for BCS, Bank & Teacher recruitment — Bangla + English.", descBn: "বিসিএস, ব্যাংক ও শিক্ষক নিয়োগের সিলেবাসভিত্তিক — বাংলা + ইংরেজি।", href: "/dashboard?tab=question-bank", cta: "Open Question Bank", ctaBn: "প্রশ্নব্যাংক খুলুন" },
  },
  {
    id: "practice", label: "Practice", labelBn: "প্র্যাকটিস", show: "always",
    groups: [
      { label: "Practice", labelBn: "অনুশীলন", items: [
        { label: "Quick Practice", labelBn: "দ্রুত অনুশীলন", href: "/dashboard?tab=practice&mode=quick", icon: LightningA, desc: "Start instantly", descBn: "এখনই শুরু করুন" },
        { label: "Question Drill", labelBn: "প্রশ্ন ড্রিল", href: "/dashboard?tab=question-bank&view=drill", icon: BookOpen, desc: "Topic-wise drill", descBn: "টপিকভিত্তিক ড্রিল" },
        { label: "Study Planner", labelBn: "স্টাডি প্ল্যানার", href: "/dashboard?tab=study-planner", icon: Calendar, desc: "Personalized schedule", descBn: "ব্যক্তিগত রুটিন" },
      ]},
      { label: "Review", labelBn: "রিভিউ", items: [
        { label: "Mistakes", labelBn: "ভুলসমূহ", href: "/dashboard?tab=mistakes", icon: Target, desc: "Wrong-answer notebook", descBn: "ভুলের নোটবুক" },
        { label: "Progress", labelBn: "অগ্রগতি", href: "/dashboard?tab=progress", icon: ChartBar, desc: "Accuracy & weak areas", descBn: "নির্ভুলতা ও দুর্বল টপিক" },
      ]},
    ],
    highlight: { title: "Adaptive practice", titleBn: "অভিযোজিত অনুশীলন", desc: "AI prioritizes your weak topics so every minute counts.", descBn: "এআই আপনার দুর্বল টপিককে অগ্রাধিকার দেয়।", href: "/dashboard?tab=practice", cta: "Start Practice", ctaBn: "অনুশীলন শুরু করুন" },
  },
  {
    id: "exams", label: "Exams", labelBn: "পরীক্ষা", show: "always",
    groups: [
      { label: "Exams", labelBn: "পরীক্ষা", items: [
        { label: "Mock Tests", labelBn: "মক টেস্ট", href: "/dashboard?tab=practice&mode=mock", icon: Trophy, desc: "Full-length timed exams", descBn: "পূর্ণাঙ্গ সময় পরীক্ষা" },
        { label: "Exam Tracks", labelBn: "পরীক্ষার ট্র্যাক", href: "/tracks", icon: GraduationCap, desc: "BCS / Bank / Teacher", descBn: "বিসিএস / ব্যাংক / শিক্ষক" },
        { label: "Archive Papers", labelBn: "আর্কাইভ প্রশ্ন", href: "/archive", icon: FileText, desc: "1982 – 2026 collection", descBn: "১৯৮২–২০২৬ সংগ্রহ" },
      ]},
      { label: "Results", labelBn: "ফলাফল", items: [
        { label: "Analytics", labelBn: "বিশ্লেষণ", href: "/dashboard?tab=progress", icon: TrendUp, desc: "Scores & analytics", descBn: "স্কোর ও বিশ্লেষণ" },
      ]},
    ],
    highlight: { title: "Exam command center", titleBn: "পরীক্ষা কমান্ড সেন্টার", desc: "Real pressure — timer, negative marking, instant review.", descBn: "আসল চাপ — টাইমার, নেগেটিভ মার্কিং, তাৎক্ষণিক রিভিউ।", href: "/tracks", cta: "Browse Tracks", ctaBn: "ট্র্যাক দেখুন" },
  },
  {
    id: "ai", label: "AI", labelBn: "এআই", show: "always",
    groups: [
      { label: "AI Tools", labelBn: "এআই টুলস", items: [
        { label: "AI Tutor", labelBn: "এআই টিউটর", href: "/dashboard?tab=practice&mode=tutor", icon: AiGlyph, desc: "Bilingual doubt solving", descBn: "দ্বিভাষিক সমস্যা সমাধান" },
        { label: "AI Solver", labelBn: "এআই সলভার", href: "/dashboard?tab=practice&mode=solver", icon: Pen, desc: "Explain any question", descBn: "যেকোনো প্রশ্নের ব্যাখ্যা" },
        { label: "Voice Tutor", labelBn: "ভয়েস টিউটর", href: "/dashboard?tab=practice&mode=voice", icon: Question, desc: "Speak & learn", descBn: "বলে শিখুন" },
      ]},
      { label: "Workspace", labelBn: "ওয়ার্কস্পেস", items: [
        { label: "Dashboard Home", labelBn: "ড্যাশবোর্ড", href: "/dashboard?tab=home", icon: House, desc: "AI coaching & insights", descBn: "এআই কোচিং ও ইনসাইট" },
        { label: "Planner", labelBn: "প্ল্যানার", href: "/dashboard?tab=study-planner", icon: Calendar, desc: "AI study plan", descBn: "এআই স্টাডি প্ল্যান" },
      ]},
    ],
    highlight: { title: "AI Learning Engine", titleBn: "এআই লার্নিং ইঞ্জিন", desc: "Explanations, solving, tutoring & personalized guidance — in Bangla + English.", descBn: "ব্যাখ্যা, সমাধান, টিউটরিং ও ব্যক্তিগত গাইডলাইন — বাংলা + ইংরেজিতে।", href: "/dashboard?tab=home", cta: "Open AI Coach", ctaBn: "এআই কোচ খুলুন" },
  },
  {
    id: "progress", label: "Progress", labelBn: "অগ্রগতি", show: "auth",
    groups: [
      { label: "Analytics", labelBn: "বিশ্লেষণ", items: [
        { label: "Overview", labelBn: "সারসংক্ষেপ", href: "/dashboard?tab=progress", icon: ChartBar, desc: "Performance overview", descBn: "পারফরম্যান্স সারসংক্ষেপ" },
        { label: "Planner", labelBn: "প্ল্যানার", href: "/dashboard?tab=study-planner", icon: Calendar, desc: "Streaks & schedule", descBn: "স্ট্রিক ও রুটিন" },
        { label: "Mistakes", labelBn: "ভুলসমূহ", href: "/dashboard?tab=mistakes", icon: TrendUp, desc: "Weak-area analysis", descBn: "দুর্বলতা বিশ্লেষণ" },
        { label: "Bookmarks", labelBn: "বুকমার্ক", href: "/dashboard?tab=question-bank&view=bookmarks", icon: Bookmark, desc: "Saved questions", descBn: "সংরক্ষিত প্রশ্ন" },
      ]},
    ],
    highlight: { title: "Know your edge", titleBn: "আপনার অবস্থান জানুন", desc: "Accuracy, subject mastery & weak topics — all in one view.", descBn: "নির্ভুলতা, বিষয় দক্ষতা ও দুর্বল টপিক — এক নজরে।", href: "/dashboard?tab=progress", cta: "View Progress", ctaBn: "অগ্রগতি দেখুন" },
  },
  {
    id: "more", label: "More", labelBn: "আরও", show: "always",
    groups: [
      { label: "Product", labelBn: "পণ্য", items: [
        { label: "How it works", labelBn: "যেভাবে কাজ করে", href: "/#features", icon: Compass, desc: "Features overview", descBn: "ফিচার পরিচিতি" },
        { label: "Syllabus", labelBn: "সিলেবাস", href: "/#syllabus", icon: Books, desc: "Coverage map", descBn: "সিলেবাস ম্যাপ" },
        { label: "Exam Engine", labelBn: "পরীক্ষা ইঞ্জিন", href: "/tracks", icon: Trophy, desc: "Tracks & archives", descBn: "ট্র্যাক ও আর্কাইভ" },
      ]},
      { label: "Company", labelBn: "কোম্পানি", items: [
        { label: "About", labelBn: "আমাদের সম্পর্কে", href: "/about", icon: Info, desc: "Our mission", descBn: "আমাদের লক্ষ্য" },
        { label: "Careers", labelBn: "ক্যারিয়ার", href: "/careers", icon: Users, desc: "Join us", descBn: "যোগ দিন" },
        { label: "Press", labelBn: "প্রেস", href: "/press", icon: FileCheck, desc: "Press kit", descBn: "প্রেস কিট" },
        { label: "Partners", labelBn: "পার্টনার", href: "/partners", icon: Users, desc: "Partnerships", descBn: "অংশীদারত্ব" },
      ]},
      { label: "Resources", labelBn: "রিসোর্স", items: [
        { label: "Docs / API", labelBn: "ডকস / এপিআই", href: "/docs", icon: FileText, desc: "Developer docs", descBn: "ডেভেলপার ডকস" },
        { label: "Onboarding", labelBn: "শুরু করুন", href: "/onboarding", icon: Question, desc: "Get started", descBn: "শুরু করা" },
      ]},
      { label: "Legal", labelBn: "আইনি", items: [
        { label: "Privacy", labelBn: "গোপনীয়তা", href: "/privacy", icon: Shield, desc: "Privacy policy", descBn: "গোপনীয়তা নীতি" },
        { label: "Terms", labelBn: "শর্তাবলী", href: "/terms", icon: FileCheck, desc: "Terms of service", descBn: "সেবার শর্ত" },
        { label: "GitHub", labelBn: "গিটহাব", href: "https://github.com/9thgradeai/9th-grade-ai-next", icon: FileText, desc: "Open source", descBn: "ওপেন সোর্স", external: true },
      ]},
    ],
    highlight: { title: "Explore 9Th-Grade AI", titleBn: "9Th-Grade AI ঘুরে দেখুন", desc: "Free & open-source exam prep for Bangladesh — built with aspirants.", descBn: "বাংলাদেশের জন্য ফ্রি ও ওপেন-সোর্স পরীক্ষা প্রস্তুতি।", href: "/about", cta: "About us", ctaBn: "আমাদের সম্পর্কে" },
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
