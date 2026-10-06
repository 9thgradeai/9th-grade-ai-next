"use client";

// World-map backdrop rendered INSIDE the AI workspace modal, so the AI
// Assistant always shows the same ambient map as the user dashboard — on
// every viewport, regardless of what sits underneath the modal overlay.
// Decorative only: pointer-transparent, hidden in forced-colors mode,
// motion-guarded by the shared world-map keyframes. Asset: world-map.ts.

import { WORLD_MAP_PATH, WORLD_MAP_VIEWBOX, DHAKA_SPOT } from "@/lib/data/world-map";

export default function AIMapBackdrop() {
  return (
    <div aria-hidden="true" className="ai-map pointer-events-none absolute inset-0 overflow-hidden">
      <div className="world-map-glow" />
      <div className="world-map-grid" />
      <div className="world-map-drift absolute">
        <svg viewBox={WORLD_MAP_VIEWBOX} className="world-map-svg" focusable="false">
          <path d={WORLD_MAP_PATH} className="world-map-land" />
        </svg>
        <span
          className="world-map-spot"
          style={{
            left: `${(DHAKA_SPOT.x / 1000) * 100}%`,
            top: `${(DHAKA_SPOT.y / 500) * 100}%`,
          }}
        >
          <span className="world-map-spot-ring" />
          <span className="world-map-spot-dot" />
          <span className="world-map-spot-label">Bangladesh</span>
        </span>
      </div>
    </div>
  );
}
