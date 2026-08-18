/* src/components/AIRecommendationsWidget.tsx */
"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight } from "lucide-react";
import { RECOMMENDATIONS } from "@/lib/data/ai";
import { api } from "@/lib/services/api";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";

/* --------------------------------------------------------------
   AI Study Recommendations Widget
   Renders a compact card inside the Home Dashboard showing
   the user's weakest topics and a one‑click CTA to start
   targeted revision via the Practice Hub.
   -------------------------------------------------------------- */
export default function AIRecommendationsWidget() {
  const { setActiveTab } = useDashboardStore();
  const [recs, setRecs] = useState(RECOMMENDATIONS);

  // Load recommendations from the database (fallback to static data).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.recommendations();
        if (!cancelled && list.length) {
          setRecs(
            list.map((r) => ({
              id: String(r.id),
              subject: { bn: r.subjectBn, en: r.subjectEn },
              metric: r.metric,
              accuracy: r.accuracy,
              title: { bn: r.titleBn, en: r.titleEn },
              description: { bn: r.descriptionBn, en: r.descriptionEn },
              cta: { bn: r.ctaBn, en: r.ctaEn },
            })),
          );
        }
      } catch {
        /* keep static fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // For demo: pick the first recommendation (highest priority)
  const rec = recs[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-terminal-rounded"
    >
      <Sparkles className="w-5 h-5 text-emerald-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-300">
          <span className="text-emerald-400 font-mono">চর্চা AI:</span> Your weakest area is{" "}
          <span className="text-white font-mono">{rec.subject.bn}</span> —
          accuracy <span className="text-emerald-400 font-mono">{rec.accuracy}%</span>.
        </p>
        <p className="text-xs text-zinc-400 mt-0.5">{rec.description.bn}</p>
      </div>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setActiveTab("practice")}
        className="flex-shrink-0 px-3 py-1.5 bg-emerald-500 text-zinc-950 font-mono text-sm rounded hover:bg-emerald-400 transition-colors flex items-center gap-1 shadow-neon-glow"
      >
        {rec.cta.bn}
        <ArrowRight className="w-3 h-3" aria-hidden="true" />
      </motion.button>
    </motion.div>
  );
}