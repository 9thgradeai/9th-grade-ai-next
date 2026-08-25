import { ImageResponse } from "next/og";

export const alt = "9Th-Grade AI — Free AI-powered exam prep for Bangladesh";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The official brand mark (knowledge constellation) rebuilt with satori-safe
// primitives — satori does not support raw <svg>, so the geometry from
// /assets/favicon.svg is approximated with positioned divs.
function BrandMark({ size: px }: { size: number }) {
  const c = px / 2;
  const sat = px * 0.075;
  const satPos: [number, number][] = [
    [c, px * 0.156], // top
    [px * 0.41, px * 0.406], // upper-left
    [px * 0.59, px * 0.406], // upper-right
    [c, px * 0.844], // bottom
  ];
  const lines: { len: number; angle: number }[] = [
    { len: c - satPos[0][1] - sat / 2, angle: -90 },
    { len: 45.7 * (px / 140), angle: -163.3 },
    { len: 45.7 * (px / 140), angle: -16.7 },
    { len: c - satPos[3][1] - sat / 2, angle: 90 },
  ];

  return (
    <div
      style={{
        width: px,
        height: px,
        position: "relative",
        background: "#05060a",
        borderRadius: px * 0.22,
        display: "flex",
      }}
    >
      {/* Orbit ring */}
      <div
        style={{
          position: "absolute",
          inset: px * 0.14,
          borderRadius: "50%",
          border: `${Math.max(2, px * 0.03)}px solid rgba(34,211,238,0.55)`,
          display: "flex",
        }}
      />
      {/* Connectors */}
      {lines.map((l, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: c,
            top: c,
            width: l.len,
            height: Math.max(1.5, px * 0.019),
            background: "#9aa3b8",
            opacity: 0.7,
            transformOrigin: "left center",
            transform: `rotate(${l.angle}deg)`,
            display: "flex",
          }}
        />
      ))}
      {/* Core */}
      <div
        style={{
          position: "absolute",
          left: c - px * 0.095,
          top: c - px * 0.095,
          width: px * 0.19,
          height: px * 0.19,
          borderRadius: "50%",
          background: "#22d3ee",
          display: "flex",
        }}
      />
      {/* Satellites */}
      {satPos.map(([x, y], i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: x - sat / 2,
            top: y - sat / 2,
            width: sat,
            height: sat,
            borderRadius: "50%",
            background: ["#22d3ee", "#4f7cff", "#8b5cf6", "#22d3ee"][i],
            display: "flex",
          }}
        />
      ))}
    </div>
  );
}

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          color: "#e2e8f0",
          fontFamily: "monospace",
        }}
      >
        <BrandMark size={168} />
        <div style={{ fontSize: 72, fontWeight: 800, color: "#10B981", marginTop: 28 }}>
          9Th-Grade AI
        </div>
        <div style={{ fontSize: 32, marginTop: 20 }}>
          Free AI-powered exam prep for Bangladesh
        </div>
        <div style={{ fontSize: 24, marginTop: 12, color: "#94a3b8" }}>
          BCS · Bangladesh Bank · Assistant Director
        </div>
      </div>
    ),
    size,
  );
}
