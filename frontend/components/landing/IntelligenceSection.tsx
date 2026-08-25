import Reveal from "@/components/ui/Reveal";
import SectionHeading from "@/components/ui/SectionHeading";
import KnowledgeGraph from "@/components/landing/KnowledgeGraph";

const flow = [
  {
    step: "01",
    title: "Subjects",
    body: "Every subject on the official preliminary syllabus enters the map the moment you enroll.",
  },
  {
    step: "02",
    title: "Topics",
    body: "Subjects decompose into hundreds of examinable units — each one tracked independently.",
  },
  {
    step: "03",
    title: "Questions",
    body: "Every question you attempt feeds evidence back into its topic and subject nodes.",
  },
  {
    step: "04",
    title: "Performance",
    body: "Accuracy, speed, and confidence are scored per node — not as one blurry average.",
  },
  {
    step: "05",
    title: "Weaknesses",
    body: "Failing patterns surface within days, not months, while there is still time to fix them.",
  },
  {
    step: "06",
    title: "Strengths",
    body: "Proven topics are reinforced on a spaced schedule so gains never quietly decay.",
  },
];

export default function IntelligenceSection() {
  return (
    <section id="intelligence" className="relative px-4 py-24 sm:px-6 md:py-32" aria-labelledby="intelligence-heading">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 52% 40% at 78% 42%, rgba(129,140,248,0.08), transparent 62%)",
        }}
      />
      <div className="relative mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="THE INTELLIGENCE LAYER"
          title="One living graph of"
          highlight="everything you know"
          description="Your preparation is modeled as a connected system — subjects, topics, questions, and outcomes linked in a single graph that updates with every answer."
        />

        <Reveal>
          <KnowledgeGraph />
        </Reveal>

        {/* Desktop screen readers get the same narrative without the canvas */}
        <p className="sr-only">
          The system maps subjects to topics to questions; your performance on each
          question isolates weaknesses quickly and reinforces strengths over time.
        </p>

        {/* Mobile: simplified vertical intelligence map */}
        <ol className="relative mx-auto mt-4 max-w-xl space-y-0 lg:hidden" aria-label="How the knowledge model works">
          <span
            aria-hidden="true"
            className="absolute bottom-6 left-[15px] top-6 w-px bg-gradient-to-b from-emerald-400/50 via-indigo-400/30 to-transparent"
          />
          {flow.map((item) => (
            <li key={item.step} className="relative flex gap-4 pb-8 last:pb-0">
              <span className="z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-[#071019] font-mono text-xs text-emerald-400">
                {item.step}
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-base font-semibold text-white">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* Desktop caption under the graph */}
        <Reveal delay={0.2}>
          <p className="mx-auto mt-10 hidden max-w-xl text-center text-sm text-zinc-500 lg:block">
            Hover any node to trace how a single answer travels through the system.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
