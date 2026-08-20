import type { Metadata } from "next";
import { Handshake, School, Globe, Mail, ArrowUpRight } from "lucide-react";
import PublicShell from "@/components/public/PublicShell";
import PageHero from "@/components/public/PageHero";
import SectionHeading from "@/components/ui/SectionHeading";

export const metadata: Metadata = {
  title: "Partnerships — 9Th-Grade AI",
  description:
    "Partner with 9Th-Grade AI — universities, coaching centers, publishers, and organizations serving government job aspirants in Bangladesh.",
};

const partners = [
  {
    icon: School,
    title: "Universities & Colleges",
    text: "Campus chapters, career centers, and student clubs can run free mock-test bootcamps and preparation drives on the platform.",
  },
  {
    icon: Globe,
    title: "Coaching & Content Creators",
    text: "Coaching centers and educators can host branded practice rooms and shared question sets for their students.",
  },
  {
    icon: Handshake,
    title: "Publishers & EdTech",
    text: "Content partners can contribute tagged question banks and study material, distributed to a nationwide audience.",
  },
];

const steps = [
  {
    number: "01",
    title: "Tell us about you",
    text: "Email hello@9thgrade.ai with your organization and how you serve aspirants.",
  },
  {
    number: "02",
    title: "We scope the fit",
    text: "We agree on goals, audience, and what each side contributes — from content to events.",
  },
  {
    number: "03",
    title: "Launch together",
    text: "We ship the integration, run the launch, and measure impact together.",
  },
];

export default function PartnersPage() {
  return (
    <PublicShell>
      <PageHero
        eyebrow="PARTNERSHIPS"
        title="Partner With a Platform"
        highlight="That Reaches 50K+ Aspirants"
        description="Whether you run a coaching center, a university chapter, or a publishing house — we'd love to build the future of exam prep together."
        actions={[{ href: "mailto:hello@9thgrade.ai?subject=Partnership", label: "Start a Conversation" }]}
      />

      <section className="py-16 md:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <SectionHeading eyebrow="WHO WE PARTNER WITH" title="Three Ways to" highlight="Collaborate" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {partners.map((partner) => {
              const Icon = partner.icon;
              return (
                <div
                  key={partner.title}
                  className="glass-card rounded-2xl border border-white/10 p-6 transition-[border-color,box-shadow] duration-300 hover:border-emerald-400/40 hover:shadow-card-hover"
                >
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/25 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-emerald-400" aria-hidden="true" />
                  </div>
                  <h3 className="font-display text-base font-semibold text-white mb-2">{partner.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{partner.text}</p>
                </div>
              );
            })}
          </div>

          <SectionHeading eyebrow="HOW IT WORKS" title="From Hello to" highlight="Launch in Three Steps" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {steps.map((step) => (
              <div key={step.number} className="relative glass-card rounded-2xl border border-white/10 p-6">
                <span className="font-mono text-4xl font-bold text-emerald-400/20">{step.number}</span>
                <h4 className="font-display text-base font-semibold text-white mt-2 mb-1.5">{step.title}</h4>
                <p className="text-sm text-zinc-400 leading-relaxed">{step.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-14 text-center">
            <a
              href="mailto:hello@9thgrade.ai?subject=Partnership"
              className="glow-border inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-emerald-500 text-zinc-950 font-mono font-semibold text-sm tracking-wide hover:bg-emerald-400 transition-colors"
            >
              <Mail className="w-4 h-4" aria-hidden="true" />
              hello@9thgrade.ai
              <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}