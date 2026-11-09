import Link from "next/link";
import Reveal from "./Reveal";

const ITEMS = [
  {
    n: "01",
    title: "Free, and staying free",
    body: "Every question, mock and flashcard is free. No trial that expires, no locked chapter, no ads in the middle of a test.",
  },
  {
    n: "02",
    title: "Your progress is yours",
    body: "Attempts, notes and flashcard history belong to you. Export them whenever you want, in a format you can read.",
  },
  {
    n: "03",
    title: "Nothing gets lost",
    body: "Every answer, explanation and bookmark stays attached to the topic that produced it — even after you switch devices.",
  },
  {
    n: "04",
    title: "Bilingual by default",
    body: "Study in Bangla, English or both. Switch language without losing your place, your plan or your history.",
  },
  {
    n: "05",
    title: "Steer every step",
    body: "The plan, the question count and the difficulty are all visible and editable. Nothing is scheduled behind your back.",
  },
  {
    n: "06",
    title: "Leave any time",
    body: "No lock-in, no dark patterns. Delete your account and take your notes with you. We would rather earn the next session.",
  },
];

export default function OmNoLockIn() {
  return (
    <section className="om-section om-nolock" aria-labelledby="om-nolock-title">
      <div className="om-shell">
        <Reveal className="om-section-head">
          <p className="om-eyebrow">No lock-in</p>
          <h2 id="om-nolock-title" className="om-h2">
            Yours where it counts.
          </h2>
          <p className="om-section-lede">
            A study tool should make you more independent, not more dependent.
            Keep control of your notes, your history and the way you prepare.
          </p>
        </Reveal>

        <div className="om-nolock-grid">
          {ITEMS.map((item, i) => (
            <Reveal key={item.n} delay={i * 50} className="om-nolock-item">
              <span className="om-card-number">{item.n}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </Reveal>
          ))}
        </div>

        <Reveal delay={80}>
          <Link
            href="https://github.com/farhankabir/9th-grade-ai-next"
            className="om-outbound"
            target="_blank"
            rel="noopener noreferrer"
          >
            From the team behind 9Th-Grade AI, open source on GitHub ↗
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
