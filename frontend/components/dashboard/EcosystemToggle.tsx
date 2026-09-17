"use client";

import { useEcosystem } from "@/lib/ecosystem-ctx";
import { motion } from "framer-motion";

const ECOSYSTEMS = [
  { code: "BCS" as const, label: "BCS", bn: "বিসিএস" },
  { code: "BANGLADESH_BANK" as const, label: "ব্যাংক", bn: "Bangladesh Bank" },
];

export default function EcosystemToggle() {
  const { ecosystem, setEcosystem } = useEcosystem();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3"
    >
      <span className="text-xs font-mono uppercase tracking-wider" style={{ color: "var(--dashboard-text-muted)" }}>
        Exam:
      </span>
      <div className="flex gap-1 bg-[var(--surface-muted)] border border-[var(--border-subtle)] rounded-lg p-0.5">
        {ECOSYSTEMS.map((eco) => (
          <button
            key={eco.code}
            onClick={() => setEcosystem(eco.code)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              ecosystem === eco.code
                ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)] shadow-sm"
                : "text-[var(--dashboard-text-secondary)] hover:text-[var(--dashboard-text-primary)] hover:bg-[var(--surface-hover)]"
            }`}
          >
            {eco.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
