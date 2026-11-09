"use client";

import Link from "next/link";
import { useRef } from "react";

const CARDS = [
  { label: "BCS PRELIMINARY", title: "200-mark MCQ drills", meta: "38 topics", tone: "a", glyph: "◎" },
  { label: "BCS WRITTEN", title: "Answer-writing practice", meta: "12 papers", tone: "b", glyph: "✎" },
  { label: "BANK OFFICER", title: "Math + reasoning sets", meta: "9 banks", tone: "c", glyph: "◈" },
  { label: "TEACHER RECRUITMENT", title: "NTRCA subject tests", meta: "24 subjects", tone: "d", glyph: "✧" },
  { label: "PRIMARY ASSISTANT", title: "Class 9–10 foundations", meta: "6 subjects", tone: "e", glyph: "◐" },
  { label: "COMBINED 9TH GRADE", title: "Full syllabus coverage", meta: "41 topics", tone: "f", glyph: "⬡" },
  { label: "CURRENT AFFAIRS", title: "Daily Bangladesh + world", meta: "Updated daily", tone: "g", glyph: "◉" },
  { label: "VIVA + WRITTEN", title: "Interview preparation", meta: "180 prompts", tone: "h", glyph: "☰" },
];

export default function OmGallery() {
  const track = useRef<HTMLDivElement | null>(null);

  const scroll = (dir: -1 | 1) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 720), behavior: "smooth" });
  };

  return (
    <section className="om-section om-gallery" aria-labelledby="om-gallery-title">
      <div className="om-shell">
        <div className="om-section-head om-section-head-row">
          <div>
            <p className="om-eyebrow">Made for the exams you sit</p>
            <h2 id="om-gallery-title" className="om-h2">
              Get to your next study session now.
            </h2>
          </div>
          <div className="om-gallery-controls">
            <button type="button" onClick={() => scroll(-1)} aria-label="Previous exams">
              ‹
            </button>
            <button type="button" onClick={() => scroll(1)} aria-label="Next exams">
              ›
            </button>
          </div>
        </div>
      </div>

      <div className="om-gallery-track" ref={track}>
        {CARDS.map((card) => (
          <article key={card.label} className={`om-gallery-card om-tone-${card.tone}`}>
            <div className="om-gallery-art" aria-hidden="true">
              <span className="om-gallery-glyph">{card.glyph}</span>
            </div>
            <div className="om-gallery-copy">
              <p className="om-gallery-label">{card.label}</p>
              <h3>{card.title}</h3>
              <p className="om-gallery-meta">{card.meta}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="om-shell">
        <Link href="/dashboard/question-bank" className="om-arrow-link">
          Explore the full question bank →
        </Link>
      </div>
    </section>
  );
}
