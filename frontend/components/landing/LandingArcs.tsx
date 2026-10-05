"use client";

/**
 * Phase 4 — Landing narrative arcs. 11 scattered sections collapse into 5
 * story beats (Problem → Intelligence → Tutor → Proof → CTA). All original
 * components are preserved inside the arcs — nothing deleted, just grouped
 * so each lazy chunk is one narrative unit instead of one widget.
 */

import ProblemSection from "@/components/landing/ProblemSection";
import TrustStripSection from "@/components/landing/TrustStripSection";
import IntelligenceSection from "@/components/landing/IntelligenceSection";
import SignalSection from "@/components/landing/SignalSection";
import TutorSection from "@/components/landing/TutorSection";
import AdaptivePracticeSection from "@/components/landing/AdaptivePracticeSection";
import ExamEngineSection from "@/components/landing/ExamEngineSection";
import AnalyticsSection from "@/components/landing/AnalyticsSection";
import SubjectUniverseSection from "@/components/landing/SubjectUniverseSection";
import PlannerSection from "@/components/landing/PlannerSection";
import PhilosophySection from "@/components/landing/PhilosophySection";
import FinalCtaSection from "@/components/landing/FinalCtaSection";

export default function ArcProblem() {
  return (
    <section aria-label="The problem" id="arc-problem">
      <ProblemSection />
      <TrustStripSection />
    </section>
  );
}

export function ArcIntelligence() {
  return (
    <section aria-label="Intelligence" id="arc-intelligence">
      <IntelligenceSection />
      <SignalSection />
    </section>
  );
}

export function ArcTutor() {
  return (
    <section aria-label="AI tutor" id="arc-tutor">
      <TutorSection />
      <AdaptivePracticeSection />
    </section>
  );
}

export function ArcProof() {
  return (
    <section aria-label="Proof" id="arc-proof">
      <ExamEngineSection />
      <AnalyticsSection />
      <SubjectUniverseSection />
    </section>
  );
}

export function ArcCta() {
  return (
    <section aria-label="Get started" id="arc-cta">
      <PlannerSection />
      <PhilosophySection />
      <FinalCtaSection />
    </section>
  );
}
