"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { GitBranch, Globe, Play, Mail, Monitor, Zap, BookOpen, Users } from "lucide-react";

const footerLinks = {
  product: [
    { label: "Features", href: "#features" },
    { label: "Syllabus", href: "#syllabus" },
    { label: "Mock Tests", href: "/dashboard?tab=practice" },
    { label: "Question Bank", href: "/dashboard?tab=question-bank" },
    { label: "Progress Analytics", href: "/dashboard?tab=progress" },
  ],
  tracks: [
    { label: "BCS Preliminary", href: "#tracks" },
    { label: "BCS Written", href: "#tracks" },
    { label: "Teacher Recruitment", href: "#tracks" },
    { label: "Bank Jobs", href: "#tracks" },
    { label: "PSC & Other Exams", href: "#tracks" },
  ],
  resources: [
    { label: "Blog & Tips", href: "https://blog.9thgrade.ai" },
    { label: "Study Guides", href: "https://blog.9thgrade.ai/guides" },
    { label: "Previous Year Papers", href: "/dashboard?tab=archive" },
    { label: "Current Affairs", href: "https://blog.9thgrade.ai/current-affairs" },
    { label: "Vocabulary Builder", href: "https://blog.9thgrade.ai/vocab" },
    { label: "API Documentation", href: "https://docs.9thgrade.ai" },
  ],
  company: [
    { label: "About Us", href: "https://9thgrade.ai/about" },
    { label: "Careers", href: "https://careers.9thgrade.ai" },
    { label: "Press Kit", href: "https://9thgrade.ai/press" },
    { label: "Partnerships", href: "https://partners.9thgrade.ai" },
    { label: "Privacy Policy", href: "https://9thgrade.ai/privacy" },
    { label: "Terms of Service", href: "https://9thgrade.ai/terms" },
  ],
};

const socialLinks = [
  { icon: Globe, href: "https://twitter.com/9thgradeai", label: "Twitter" },
  { icon: GitBranch, href: "https://github.com/9thgradeai", label: "GitHub" },
  { icon: Play, href: "https://youtube.com/@9thgradeai", label: "YouTube" },
  { icon: Mail, href: "mailto:hello@9thgrade.ai", label: "Email" },
];

export default function Footer() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <footer className="bg-zinc-900/40 border-t border-emerald-500/10 relative" role="contentinfo">
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
            <Link href="/" className="flex items-center gap-2 text-xl font-bold text-white tracking-tight font-mono mb-6">
              <span className="text-gradient">{'>'}</span>
              <span>9th-grade-ai</span>
            </Link>
            <p className="text-zinc-400 text-sm max-w-xs mb-6 leading-relaxed">
              AI-powered study planner and exam prep platform for competitive exams in Bangladesh. Master BCS, Bank, and Teacher recruitment with precision.
            </p>
            <div className="flex gap-4">
              {socialLinks.map((social) => (
                <motion.a
                  key={social.label}
                  href={social.href}
                  whileHover={shouldReduceMotion ? undefined : { scale: 1.12, y: -2 }}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
                  className="w-10 h-10 rounded-full bg-zinc-800 border border-emerald-500/20 flex items-center justify-center text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/40 hover:shadow-neon-glow transition-[border-color,color,box-shadow]"
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
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4 font-mono">Product</h4>
            <ul className="space-y-3" role="list">
              {footerLinks.product.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-400 hover:text-emerald-400 hover:translate-x-0.5 transition-[color,transform] font-mono inline-block"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Tracks */}
          <nav aria-label="Exam tracks">
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4 font-mono">Exam Tracks</h4>
            <ul className="space-y-3" role="list">
              {footerLinks.tracks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-400 hover:text-emerald-400 hover:translate-x-0.5 transition-[color,transform] font-mono inline-block"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Resources */}
          <nav aria-label="Resources">
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4 font-mono">Resources</h4>
            <ul className="space-y-3" role="list">
              {footerLinks.resources.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-400 hover:text-emerald-400 hover:translate-x-0.5 transition-[color,transform] font-mono inline-block"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Company */}
          <nav aria-label="Company">
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4 font-mono">Company</h4>
            <ul className="space-y-3" role="list">
              {footerLinks.company.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-400 hover:text-emerald-400 hover:translate-x-0.5 transition-[color,transform] font-mono inline-block"
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
          className="glass-card rounded-terminal-rounded border border-terminal-border p-4 md:p-6 mb-8"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Monitor className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">System Status</p>
                <p className="text-xs text-emerald-400 font-mono">ALL SYSTEMS OPERATIONAL</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">API Latency</p>
                <p className="text-xs text-emerald-400 font-mono">42ms avg</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Questions Served</p>
                <p className="text-xs text-emerald-400 font-mono">2.5M+ today</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Active Users</p>
                <p className="text-xs text-emerald-400 font-mono">12.3K online</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-6 border-t border-emerald-500/10">
          <p className="text-sm text-zinc-500 font-mono">
            v2.4.0-release • Built with Next.js 16, React 19, Tailwind CSS v4, Framer Motion
          </p>
          <p className="text-sm text-zinc-500">
            © {new Date().getFullYear()} 9Th-Grade AI. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-zinc-500 font-mono">
            <span>uptime: 99.99%</span>
            <span className="text-emerald-500">●</span>
            <span>deployed on Vercel</span>
          </div>
        </div>
      </div>
    </footer>
  );
}