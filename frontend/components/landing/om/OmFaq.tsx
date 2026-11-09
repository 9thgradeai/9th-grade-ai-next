import Reveal from "./Reveal";

const FAQS = [
  {
    q: "What does it cost?",
    a: "Nothing. The question bank, mock tests, flashcards, planner and AI tutor are free. There is no paid tier, no trial countdown and no ads inside a test.",
  },
  {
    q: "Which exams does it cover?",
    a: "BCS preliminary and written, bank officer recruitment, NTRCA teacher recruitment, primary assistant teacher and combined 9th-grade pay-scale posts. Current affairs are updated daily for all of them.",
  },
  {
    q: "Do I need a powerful device?",
    a: "No. It runs in the browser on a normal phone or laptop. Mock tests are light enough for a mid-range Android phone on a 3G connection.",
  },
  {
    q: "Can I study in Bangla?",
    a: "Yes. The interface, explanations and AI tutor all work in Bangla and English. You can switch language at any point without losing your place.",
  },
  {
    q: "What happens to my data?",
    a: "Your attempts, notes and flashcard history stay attached to your account and are used only to personalise your preparation. You can export or delete them at any time.",
  },
  {
    q: "Do I need my own AI account?",
    a: "No. The tutor is included. If you prefer, you can bring your own notes and material — the tutor will work from those too.",
  },
];

export default function OmFaq() {
  return (
    <section className="om-section om-faq" aria-labelledby="om-faq-title">
      <div className="om-shell om-faq-shell">
        <Reveal className="om-faq-head">
          <p className="om-eyebrow">Questions</p>
          <h2 id="om-faq-title" className="om-h2">
            Before you start.
          </h2>
        </Reveal>

        <div className="om-faq-list">
          {FAQS.map((item, i) => (
            <Reveal key={item.q} delay={i * 40}>
              <details className="om-faq-item">
                <summary>
                  <span>{item.q}</span>
                  <span className="om-faq-icon" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p>{item.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
