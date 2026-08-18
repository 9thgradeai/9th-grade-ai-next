import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "9Th-Grade AI — Free AI-powered exam prep for Bangladesh";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
        <div style={{ fontSize: 72, fontWeight: 800, color: "#10B981" }}>
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
