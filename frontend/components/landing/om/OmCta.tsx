import Link from "next/link";
import Reveal from "./Reveal";

export default function OmCta() {
  return (
    <section className="om-section om-cta" aria-labelledby="om-cta-title">
      <div className="om-shell">
        <Reveal className="om-cta-card">
          <p className="om-eyebrow">Be on the crew</p>
          <h2 id="om-cta-title" className="om-h2">
            Start with one question. <em>Stay for the whole plan.</em>
          </h2>
          <p className="om-section-lede">
            Create a free account, take the 25-question diagnostic and get a plan
            built around your exam date. No card, no trial, no catch.
          </p>
          <div className="om-cta-row om-cta-row-center">
            <Link href="/register" className="om-btn">
              Create your free account
            </Link>
            <Link href="/dashboard/question-bank" className="om-btn om-btn-ghost">
              Browse the question bank
            </Link>
          </div>
          <p className="om-cta-note">
            Already have an account? <Link href="/login">Log in →</Link>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
