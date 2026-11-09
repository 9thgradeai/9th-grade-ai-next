import Reveal from "./Reveal";

const STEPS = [
  {
    n: "01",
    stage: "Brief",
    status: "Done",
    lead: "Tell it the exam, the date, the hours.",
    body: (
      <>
        <p>
          <strong>Exam</strong>: BCS preliminary · <strong>Date</strong>: 14 March ·{" "}
          <strong>Time</strong>: 2 hours a day
        </p>
        <p className="om-step-note">
          Pick a target, a deadline and the time you can actually give. The plan
          is built around that, not the other way round.
        </p>
      </>
    ),
  },
  {
    n: "02",
    stage: "Syllabus map",
    status: "Done",
    lead: "The whole syllabus, mapped.",
    body: (
      <ul className="om-step-list">
        <li>38 topics across Bangla, English, Math, GK and science</li>
        <li>Weightage from previous BCS papers, side by side</li>
        <li>What you already know vs what needs work</li>
        <li>Every topic links to the exact questions that test it</li>
      </ul>
    ),
  },
  {
    n: "03",
    stage: "Diagnostic",
    status: "Done",
    lead: "It finds the gaps first.",
    body: (
      <>
        <p>
          A 25-question diagnostic across the paper, scored in under 12 minutes.
          No account history needed.
        </p>
        <p className="om-step-note">
          Weak topics: Math (time &amp; work), English (prepositions), Bangla
          (sandhi). Strong: GK, science.
        </p>
      </>
    ),
  },
  {
    n: "04",
    stage: "Plan",
    status: "Mixed",
    lead: "A schedule you can keep.",
    body: (
      <>
        <p>Days 1–7 foundations · Days 8–21 targeted drills · Days 22–30 mocks.</p>
        <p className="om-step-note">
          Short sessions on workdays, longer blocks on Fridays. Miss a day and
          the plan rebalances instead of piling up.
        </p>
      </>
    ),
  },
  {
    n: "05",
    stage: "Your approval",
    status: "Waiting",
    lead: "Nothing is scheduled until you say so.",
    body: (
      <>
        <p>Review the full plan before a single reminder is set.</p>
        <ul className="om-step-list">
          <li>142 practice questions · chosen from the bank</li>
          <li>6 full-length mocks · timed, with negative marking</li>
          <li>30 flashcards · spaced repetition, bilingual</li>
          <li>4 current-affairs digests · weekly</li>
        </ul>
      </>
    ),
  },
  {
    n: "06",
    stage: "Daily practice",
    status: "Ready",
    lead: "Questions that adapt to you.",
    body: (
      <>
        <p>
          Every answer updates your weak-topic map. Easy questions retire,
          harder ones arrive — no infinite feed, just the next right question.
        </p>
        <p className="om-step-note">Bangla-first explanations, English on tap.</p>
      </>
    ),
  },
  {
    n: "07",
    stage: "Review",
    status: "Ready",
    lead: "Mistakes become lessons.",
    body: (
      <>
        <p>
          Every wrong answer gets a one-line reason, the concept behind it and a
          similar question to retry in three days.
        </p>
        <ul className="om-step-list">
          <li>Mistake notebook, auto-built</li>
          <li>Spaced-repetition flashcards from your errors</li>
          <li>Ask the AI tutor to explain just one line</li>
        </ul>
      </>
    ),
  },
  {
    n: "08",
    stage: "Mock exam",
    status: "Ready",
    lead: "Sit the real thing, before the real thing.",
    body: (
      <>
        <p>
          Full-length, timed, negative marking, OMR-style. Pause is disabled so
          the pressure feels familiar.
        </p>
        <p className="om-step-note">
          Rank, percentile, time-per-question and a topic breakdown after every
          mock.
        </p>
      </>
    ),
  },
  {
    n: "09",
    stage: "Exam day",
    status: "Ready",
    lead: "Walk in with a record of the work.",
    body: (
      <>
        <p>
          Your streak, accuracy trend, weak-topic fixes and last-minute revision
          sheet — all in one place, exportable, yours to keep.
        </p>
        <p className="om-step-note">
          No lock-in: export your notes, attempts and flashcards at any time.
        </p>
      </>
    ),
  },
];

export default function OmHowItWorks() {
  return (
    <section id="how-it-works" className="om-section om-how" aria-labelledby="om-how-title">
      <div className="om-shell">
        <Reveal className="om-section-head">
          <p className="om-eyebrow">How it works</p>
          <h2 id="om-how-title" className="om-h2">
            Start with an exam, or a date you already have. Build a plan. Practise.
            Review. <em>One workspace. Every step yours to direct.</em>
          </h2>
        </Reveal>

        <ol className="om-steps">
          {STEPS.map((step, index) => (
            <li key={step.n} className="om-step">
              <Reveal delay={Math.min(index * 40, 160)} className="om-step-inner">
                <div className="om-step-rail" aria-hidden="true">
                  <span className="om-step-number">{step.n}</span>
                </div>
                <div className="om-step-content">
                  <div className="om-step-top">
                    <span className="om-step-stage">
                      Step {step.n} · {step.stage}
                    </span>
                    <span className={`om-status om-status-${step.status.toLowerCase()}`}>
                      {step.status}
                    </span>
                  </div>
                  <h3 className="om-step-title">{step.lead}</h3>
                  <div className="om-step-body">{step.body}</div>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
