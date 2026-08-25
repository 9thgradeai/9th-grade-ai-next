"use client";

import { useState } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { EASE_OUT_EXPO } from "@/lib/motion/variants";

/**
 * Interactive knowledge graph for the Intelligence section (desktop).
 * SVG supplies the connective tissue; real HTML buttons supply the nodes so
 * hover AND keyboard focus drive the same illumination state. The whole
 * canvas is decorative — the accessible narrative lives in the section's
 * semantic markup (vertical map on mobile, sr-only summary on desktop).
 */

const VIEW_W = 1000;
const VIEW_H = 460;

type NodeId = "subjects" | "topics" | "questions" | "performance" | "weaknesses" | "strengths";

const NODES: { id: NodeId; label: string; hint: string; x: number; y: number }[] = [
  { id: "subjects", label: "Subjects", hint: "the full map", x: 0.1, y: 0.55 },
  { id: "topics", label: "Topics", hint: "every unit", x: 0.28, y: 0.22 },
  { id: "questions", label: "Questions", hint: "each attempt", x: 0.46, y: 0.58 },
  { id: "performance", label: "Performance", hint: "score signal", x: 0.64, y: 0.25 },
  { id: "weaknesses", label: "Weaknesses", hint: "isolated fast", x: 0.8, y: 0.62 },
  { id: "strengths", label: "Strengths", hint: "reinforced", x: 0.9, y: 0.3 },
];

const EDGES: { from: NodeId; to: NodeId; dashed?: boolean; delay: number }[] = [
  { from: "subjects", to: "topics", delay: 0.15 },
  { from: "topics", to: "questions", delay: 0.45 },
  { from: "questions", to: "performance", delay: 0.75 },
  { from: "performance", to: "weaknesses", delay: 1.05 },
  { from: "performance", to: "strengths", delay: 1.2 },
  { from: "weaknesses", to: "strengths", dashed: true, delay: 1.5 },
];

function pos(nodeId: NodeId) {
  const node = NODES.find((n) => n.id === nodeId);
  if (!node) throw new Error(`Unknown node ${nodeId}`);
  return { x: node.x * VIEW_W, y: node.y * VIEW_H };
}

function edgePath(from: NodeId, to: NodeId) {
  const a = pos(from);
  const b = pos(to);
  const mx = (a.x + b.x) / 2;
  const drift = (b.y - a.y) * 0.35;
  return `M ${a.x} ${a.y} C ${mx} ${a.y + drift}, ${mx} ${b.y - drift}, ${b.x} ${b.y}`;
}

const nodeVariants: Variants = {
  hidden: { opacity: 0, scale: 0.82, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT_EXPO } },
};

export default function KnowledgeGraph() {
  const [active, setActive] = useState<NodeId | null>(null);
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="relative hidden aspect-[1000/460] w-full select-none lg:block" aria-hidden="true">
      {/* Edges */}
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="kg-edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        {EDGES.map((edge) => {
          const isActive =
            active !== null && (edge.from === active || edge.to === active);
          const isDimmed = active !== null && !isActive;
          return (
            <motion.path
              key={`${edge.from}-${edge.to}`}
              d={edgePath(edge.from, edge.to)}
              fill="none"
              stroke="url(#kg-edge)"
              strokeWidth={isActive ? 2 : 1.1}
              strokeLinecap="round"
              strokeDasharray={edge.dashed ? "3 8" : undefined}
              className="transition-[opacity,stroke-width] duration-300"
              style={{ opacity: isActive ? 0.95 : isDimmed ? 0.12 : 0.38 }}
              initial={shouldReduceMotion ? false : { pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true, margin: "-120px" }}
              transition={{ duration: 0.9, delay: edge.delay, ease: EASE_OUT_EXPO }}
            />
          );
        })}
      </svg>

      {/* Nodes */}
      {NODES.map((node, i) => (
        <motion.button
          key={node.id}
          type="button"
          variants={nodeVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-120px" }}
          transition={{ delay: i * 0.08 }}
          onMouseEnter={() => setActive(node.id)}
          onMouseLeave={() => setActive(null)}
          style={{ left: `${node.x * 100}%`, top: `${node.y * 100}%` }}
          className="group absolute -translate-x-1/2 -translate-y-1/2"
          tabIndex={-1}
        >
          <span
            className={`flex items-center gap-2 rounded-full border px-4 py-2 font-mono text-xs backdrop-blur-sm transition-all duration-300 ${
              active === node.id
                ? "border-emerald-400/60 bg-emerald-500/10 text-white shadow-glow-sm"
                : "border-white/12 bg-white/[0.04] text-zinc-300 hover:border-emerald-400/40"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
                active === node.id ? "bg-emerald-400 shadow-glow-sm" : "bg-emerald-400/60"
              }`}
            />
            {node.label}
          </span>
          <span
            className={`absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap font-mono text-[0.65rem] uppercase tracking-[0.14em] text-zinc-500 transition-opacity duration-300 ${
              active === node.id ? "opacity-100" : "opacity-0"
            }`}
          >
            {node.hint}
          </span>
        </motion.button>
      ))}
    </div>
  );
}
