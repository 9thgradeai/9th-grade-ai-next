"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { GitBranch, Globe, Play, Mail, Monitor, Zap, BookOpen, Users } from "lucide-react";
import StatusPill from "./ui/StatusPill";

const footerLinks = {
  product: [
    { label: "Features", href: "/#features" },
    { label: "Syllabus", href: "/#syllabus" },
    { label: "Mock Tests", href: "/dashboard?tab=practice" },
    { label: "Question Bank", href: "/dashboard?tab=question-bank" },
    { label: "Progress Analytics", href: "/dashboard?tab=progress" },
  ],
  tracks: [
    { label: "BCS Preliminary", href: "/tracks#bcs-preliminary" },
    { label: "BCS Written", href: "/tracks#bcs-written" },
    { label: "Teacher Recruitment", href: "/tracks#teacher-recruitment" },
    { label: "Bank Jobs", href: "/tracks#bank-jobs" },
    { label: "PSC & Other Exams", href: "/tracks#psc-and-other" },
  ],
  resources: [
    { label: "Blog & Tips", href: "/blog" },
    { label: "Study Guides", href: "/guides" },
    { label: "Previous Year Papers", href: "/archive" },
    { label: "Current Affairs", href: "/current-affairs" },
    { label: "Vocabulary Builder", href: "/vocab" },
    { label: "API Documentation", href: "/docs" },
  ],
  company: [
    { label: "About Us", href: "/about" },
    { label: "Careers", href: "/careers" },
    { label: "Press Kit", href: "/press" },
    { label: "Partnerships", href: "/partners" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
  ],
};

const socialLinks = [
  { icon: Globe, href: "https://twitter.com/9thgradeai", label: "Twitter" },
  { icon: GitBranch, href: "https://github.com/9thgradeai/9th-grade-ai-next", label: "GitHub" },
  { icon: Play, href: "https://youtube.com/@9thgradeai", label: "YouTube" },
  { icon: Mail, href: "mailto:hello@9thgrade.ai", label: "Email" },
];

const statusItems = [
  { icon: Monitor, label: "System Status", value: "ALL SYSTEMS OPERATIONAL" },
  { icon: Zap, label: "API Latency", value: "42ms avg" },
  { icon: BookOpen, label: "Questions Served", value: "2.5M+ today" },
  { icon: Users, label: "Active Users", value: "12.3K online" },
];

export default function Footer() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <footer className="border-t border-white/10 bg-white/[0.015] relative" role="contentinfo">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12"
        >
          {/* Brand */}
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 font-display text-xl font-semibold text-white tracking-tight mb-6">
              <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 via-emerald-500 to-cyan-500 shadow-[0_0_20px_rgba(16,185,129,0.35)] flex items-center justify-center text-zinc-950 font-mono font-bold">
                {"⌁"}
              </span>
              <span>9th-grade-ai</span>
            </Link>
            <p className="text-sm text-zinc-500 max-w-xs mb-6 leading-relaxed">
              AI-powered study planner and exam prep platform for competitive exams in Bangladesh. Master BCS, Bank, and Teacher recruitment with precision.
            </p>
            <div className="flex gap-3">
              {socialLinks.map((social) => (
                <motion.a
                  key={social.label}
                  href={social.href}
                  whileHover={shouldReduceMotion ? undefined : { scale: 1.12, y: -2 }}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
                  className="w-10 h-10 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center text-zinc-400 hover:text-emerald-400 hover:border-emerald-400/40 hover:shadow-neon-glow transition-[border-color,color,box-shadow]"
                  aria-label={social.label}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <social.icon className="w-5 h-5" />
                </motion.a>
              ))}
            </div>
          </div>

          {/* Product */}
          <nav aria-label="Product links">
            <h4 className="font-display text-sm font-semibold text-white mb-4">Product</h4>
            <ul className="space-y-3" role="list">
              {footerLinks.product.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-500 hover:text-emerald-400 hover:translate-x-0.5 transition-[color,transform] inline-block"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Tracks */}
          <nav aria-label="Exam tracks">
            <h4 className="font-display text-sm font-semibold text-white mb-4">Exam Tracks</h4>
            <ul className="space-y-3" role="list">
              {footerLinks.tracks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-500 hover:text-emerald-400 hover:translate-x-0.5 transition-[color,transform] inline-block"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Resources */}
          <nav aria-label="Resources">
            <h4 className="font-display text-sm font-semibold text-white mb-4">Resources</h4>
            <ul className="space-y-3" role="list">
              {footerLinks.resources.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-500 hover:text-emerald-400 hover:translate-x-0.5 transition-[color,transform] inline-block"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Company */}
          <nav aria-label="Company">
            <h4 className="font-display text-sm font-semibold text-white mb-4">Company</h4>
            <ul className="space-y-3" role="list">
              {footerLinks.company.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-500 hover:text-emerald-400 hover:translate-x-0.5 transition-[color,transform] inline-block"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </motion.div>

        {/* System Status Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.5 }}
          className="glass-card rounded-2xl border border-white/10 p-4 md:p-6 mb-8"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
            {statusItems.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/15 to-cyan-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <item.icon className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{item.label}</p>
                  <p className="text-xs text-emerald-400 font-mono truncate">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-white/10 flex justify-end">
            <StatusPill label="HEALTH CHECK: PASSING" color="emerald" />
          </div>
        </motion.div>

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-6 border-t border-white/10">
          <p className="text-sm text-zinc-600 font-mono">
            v2.4.0-release • Next.js 16 · React 19 · Tailwind v4 · Framer Motion
          </p>
          <p className="text-sm text-zinc-500">
            © {new Date().getFullYear()} 9Th-Grade AI. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-zinc-500 font-mono">
            <span>uptime: 99.99%</span>
            <span className="text-emerald-400">●</span>
            <span>deployed on Vercel</span>
          </div>
        </div>
      </div>
    </footer>
  );
}