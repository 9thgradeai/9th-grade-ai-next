import { Landmark } from "lucide-react";

const tracks = [
  "BCS Preliminary",
  "BCS Written",
  "Bank Jobs",
  "NTRCA",
  "Teacher Recruitment",
  "PSC & Govt. Jobs",
  "Admission Tests",
  "9th-Grade Pay Scale",
];

/**
 * Supported exam ecosystems — a single CSS-driven marquee (GPU transform
 * only, pauses on hover, frozen to a wrapped row under reduced motion).
 * Server-rendered; no client JS ships for this section.
 */
export default function TrustStripSection() {
  return (
    <section
      className="relative border-y border-white/5 bg-white/[0.015] px-4 py-12 sm:px-6"
      aria-label="Supported exam tracks"
    >
      <div className="mx-auto max-w-7xl">
        <p className="section-eyebrow justify-center mb-7">
          <span aria-hidden="true">{"//"}</span>
          ONE PLATFORM · EVERY COMPETITIVE EXAM
        </p>

        <div className="marquee-paused overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
          <div className="marquee-track gap-3 sm:gap-4">
            {tracks.map((label) => (
              <TrackChip key={label} label={label} />
            ))}
            {/* Duplicated set drives the seamless loop — hidden from AT */}
            <div aria-hidden="true" className="marquee-dup contents">
              {tracks.map((label) => (
                <TrackChip key={`${label}-dup`} label={label} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrackChip({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 font-mono text-sm text-zinc-300">
      <Landmark className="h-4 w-4 text-emerald-400" aria-hidden="true" />
      {label}
    </div>
  );
}
