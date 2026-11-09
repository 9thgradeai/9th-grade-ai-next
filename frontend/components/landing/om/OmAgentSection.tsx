import Link from "next/link";
import Reveal from "./Reveal";

const CARDS = [
  {
    n: "01",
    title: "Study in the workspace",
    body: "Open the dashboard, pick a paper and start. Everything — attempts, notes, flashcards and mock results — stays together in one place.",
  },
  {
    n: "02",
    title: "Bring your own material",
    body: "Import a PDF, a question set or last year's paper. Your notes and files stay attached to the topic that asked for them.",
  },
  {
    n: "03",
    title: "Or ask the AI tutor",
    body: "Stuck on a line? Ask in English or Bangla. The tutor explains the concept, shows the working and gives you one similar question to try.",
  },
];

export default function OmAgentSection() {
  return (
    <section className="om-section om-agents" aria-labelledby="om-agents-title">
      <div className="om-shell">
        <Reveal className="om-section-head">
          <p className="om-eyebrow">Built around how you actually study</p>
          <h2 id="om-agents-title" className="om-h2">
            Your preparation. <em>Your choice of how to run it.</em>
          </h2>
          <p className="om-section-lede">
            Use the guided dashboard, bring your own material, or work through a
            topic in conversation. The same question bank and progress sit behind
            all three.
          </p>
        </Reveal>

        <div className="om-agent-grid">
          {CARDS.map((card, i) => (
            <Reveal key={card.n} delay={i * 70} className="om-agent-card">
              <span className="om-card-number">{card.n}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120} className="om-terminal">
          <div className="om-terminal-head">
            <span className="om-dot" />
            <span className="om-dot" />
            <span className="om-dot" />
            <span>AI tutor · English / বাংলা</span>
          </div>
          <pre>
            <code>
              <span className="om-code-dim">you ›</span> Explain time &amp; work with a
              shortcut I can use under exam pressure.{"\n"}
              <span className="om-code-accent">tutor ›</span> Use the unitary method:
              find one unit first, then scale. If 12 workers finish in 8 days, one
              worker needs 96 days…{"\n"}
              <span className="om-code-dim">you ›</span> এখন বাংলায় বলো।{"\n"}
              <span className="om-code-accent">tutor ›</span> ১২ জন শ্রমিক ৮ দিনে কাজ
              শেষ করে। ১ জনের লাগবে ৯৬ দিন…
            </code>
          </pre>
          <p className="om-terminal-foot">
            Same tutor, same context, whichever language you switch to.{" "}
            <Link href="/register">Try it free →</Link>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
