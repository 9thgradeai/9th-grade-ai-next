import Reveal from "./Reveal";

const FEATURES = [
  {
    title: "A dashboard you steer",
    body: "Each topic is a card. Open one and tell the tutor what to change, or jump straight into the questions.",
  },
  {
    title: "The plan, laid out",
    body: "Your full schedule, topic weights and daily question count — visible before you start, editable any time.",
  },
  {
    title: "Explanations you can direct",
    body: "Read the reasoning as text, select one line and ask for a simpler or deeper explanation of just that part.",
  },
  {
    title: "Every format you need",
    body: "MCQ drills, written outlines, flashcards and full mocks — English or Bangla, on phone or laptop.",
  },
];

export default function OmStudioSection() {
  return (
    <section className="om-section om-studio" aria-labelledby="om-studio-title">
      <div className="om-shell">
        <Reveal className="om-section-head">
          <p className="om-eyebrow">The workspace</p>
          <h2 id="om-studio-title" className="om-h2">
            One dashboard for the whole preparation.
          </h2>
          <p className="om-section-lede">
            Research, practice, review and mock exams in one place. Ask for a
            complete study plan or one focused drill — then keep directing the
            work in the same conversation.
          </p>
        </Reveal>

        <Reveal delay={100} className="om-studio-frame">
          <div className="om-window">
            <div className="om-window-bar">
              <span className="om-dot" />
              <span className="om-dot" />
              <span className="om-dot" />
              <span className="om-window-title">9thgrade.ai / dashboard</span>
            </div>
            <div className="om-window-body">
              <aside className="om-window-side">
                <span className="om-side-active">Today</span>
                <span>Question bank</span>
                <span>Mock tests</span>
                <span>Flashcards</span>
                <span>Study plan</span>
                <span>Current affairs</span>
              </aside>
              <div className="om-window-main">
                <div className="om-window-kpis">
                  <div>
                    <span>Questions solved</span>
                    <strong>1,248</strong>
                  </div>
                  <div>
                    <span>Accuracy</span>
                    <strong>78%</strong>
                  </div>
                  <div>
                    <span>Streak</span>
                    <strong>14 days</strong>
                  </div>
                </div>
                <div className="om-window-panel">
                  <div className="om-panel-head">
                    <span>Weak topics this week</span>
                    <span className="om-badge">Live</span>
                  </div>
                  <ul className="om-bars">
                    <li>
                      <span>Time &amp; work</span>
                      <i style={{ width: "42%" }} />
                      <em>42%</em>
                    </li>
                    <li>
                      <span>Prepositions</span>
                      <i style={{ width: "56%" }} />
                      <em>56%</em>
                    </li>
                    <li>
                      <span>Sandhi</span>
                      <i style={{ width: "63%" }} />
                      <em>63%</em>
                    </li>
                    <li>
                      <span>Current affairs</span>
                      <i style={{ width: "81%" }} />
                      <em>81%</em>
                    </li>
                  </ul>
                </div>
              </div>
              <aside className="om-window-chat">
                <p className="om-chat-title">AI tutor</p>
                <p className="om-chat-bubble">
                  Your math accuracy dropped 6% on time &amp; work. Want a
                  15-question drill tonight?
                </p>
                <p className="om-chat-bubble om-chat-user">Yes, keep it short.</p>
              </aside>
            </div>
          </div>
          <p className="om-frame-caption">
            Illustration of the 9Th-Grade AI workspace. Your real dashboard fills
            with your own attempts and notes.
          </p>
        </Reveal>

        <div className="om-feature-grid">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 60} className="om-feature">
              <span className="om-feature-dot" aria-hidden="true" />
              <div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
