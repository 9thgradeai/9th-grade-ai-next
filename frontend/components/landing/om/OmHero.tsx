import Link from "next/link";
import Reveal from "./Reveal";

export default function OmHero({ questionCount }: { questionCount: number }) {
  const proof =
    questionCount > 0
      ? `${questionCount.toLocaleString("en-US")}+ questions in the bank`
      : "BCS, Bank & Teacher recruitment question bank";

  return (
    <section className="om-hero" aria-labelledby="om-hero-title">
      <div className="om-hero-ambient" aria-hidden="true">
        <span className="om-orb om-orb-a" />
        <span className="om-orb om-orb-b" />
        <span className="om-grain" />
      </div>

      <div className="om-shell om-hero-inner">
        <Reveal className="om-hero-copy">
          <Link href="/dashboard/question-bank" className="om-proof-chip">
            <span className="om-pulse" aria-hidden="true" />
            <strong>{proof}</strong>
            <span className="om-chip-sep" aria-hidden="true">
              ·
            </span>
            <span>See what&apos;s inside →</span>
          </Link>

          <h1 id="om-hero-title" className="om-display">
            Your syllabus. A whole study system to <em>master it.</em>
          </h1>

          <p className="om-lede">
            9Th-Grade AI is a free, bilingual study workspace for Bangladeshi
            government job aspirants. Map the syllabus, drill the question bank,
            sit full-length mocks, and let an AI tutor explain every mistake in
            English or বাংলা.
          </p>

          <div className="om-cta-row">
            <Link href="/register" className="om-btn">
              Start practising free
            </Link>
            <Link href="#how-it-works" className="om-btn om-btn-ghost">
              See how it works
            </Link>
          </div>

          <ul className="om-meta-chips" aria-label="Product facts">
            <li>BCS · Bank · Teacher recruitment</li>
            <li>Free forever</li>
            <li>English + বাংলা</li>
            <li>No ads, no watermarks</li>
          </ul>
        </Reveal>

        <Reveal delay={140} className="om-hero-demo">
          <div className="om-demo-card" aria-label="Example request in 9Th-Grade AI">
            <div className="om-demo-bar">
              <span className="om-dot" />
              <span className="om-dot" />
              <span className="om-dot" />
              <span className="om-demo-title">New study request</span>
            </div>
            <p className="om-demo-prompt">
              Build me a 30-day BCS preliminary plan around my weak topics. I
              have two hours a day.
            </p>
            <div className="om-demo-assets">
              <span>📎 syllabus.pdf</span>
              <span>📎 mock-04-results.csv</span>
            </div>
            <div className="om-demo-plan">
              <div className="om-demo-plan-head">
                <span>Your plan, before you study a page</span>
                <span className="om-badge">Draft</span>
              </div>
              <ul>
                <li>
                  <span>Week 1</span> Bangla + English foundations, 20 min drills
                </li>
                <li>
                  <span>Week 2</span> Math weak topics, daily 15-question sets
                </li>
                <li>
                  <span>Week 3</span> General knowledge + current affairs recap
                </li>
                <li>
                  <span>Week 4</span> Two full-length mocks, error review
                </li>
              </ul>
            </div>
            <p className="om-demo-caption">
              An example request typed into 9Th-Grade AI. You approve the plan
              before anything is scheduled.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
