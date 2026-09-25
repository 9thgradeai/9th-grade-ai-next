/**
 * scripts/build-world-map.ts
 * ----------------------------------------------------------------------------
 * Builds the ambient dashboard world-map asset from Natural Earth 110m land
 * (public domain) TopoJSON: decodes arcs, drops Antarctica, simplifies
 * coastlines (Douglas–Peucker), projects to a 1000×500 viewBox, and emits a
 * single compact SVG path plus the Dhaka hotspot coordinate.
 *
 * Output: frontend/lib/data/world-map.ts  ("generated — do not edit").
 * Budget gate: fails if the emitted file exceeds 25KB.
 *
 * Run: `npx tsx scripts/build-world-map.ts --input /tmp/land-110m.json`
 * ----------------------------------------------------------------------------
 */
import { readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";

const OUT_FILE = join(process.cwd(), "frontend", "lib", "data", "world-map.ts");
const BUDGET_BYTES = 25 * 1024;
const VIEW_W = 1000;
const VIEW_H = 500;
// Perceptual tolerance in viewBox units — coastlines stay recognizable at
// 65vw while point count collapses.
const SIMPLIFY_TOL = 1.6;

type Topology = {
  transform: { scale: [number, number]; translate: [number, number] };
  arcs: number[][][];
  objects: { land: { geometries: { type: string; arcs: unknown }[] } };
};

function decodeArcs(topo: Topology): number[][][] {
  const { scale, translate } = topo.transform;
  return topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
}

function stitchRing(arcs: number[][][], indexes: number[]): number[][] {
  const pts: number[][] = [];
  for (const idx of indexes) {
    const arc = idx >= 0 ? arcs[idx] : [...arcs[~idx]].reverse();
    // Skip the duplicated joint point between consecutive arcs.
    for (let i = pts.length === 0 ? 0 : 1; i < arc.length; i++) pts.push(arc[i]);
  }
  return pts;
}

function collectRings(topo: Topology, decoded: number[][][]): number[][][] {
  const rings: number[][][] = [];
  for (const geom of topo.objects.land.geometries) {
    if (geom.type === "Polygon") {
      for (const ring of geom.arcs as number[][][]) rings.push(stitchRing(decoded, ring.flat()));
    } else if (geom.type === "MultiPolygon") {
      for (const poly of geom.arcs as number[][][][]) {
        for (const ring of poly) rings.push(stitchRing(decoded, ring.flat()));
      }
    }
  }
  return rings;
}

const project = ([lon, lat]: number[]): [number, number] => [
  ((lon + 180) / 360) * VIEW_W,
  ((90 - lat) / 180) * VIEW_H,
];

function unproject([x, y]: [number, number]): [number, number] {
  return [(x / VIEW_W) * 360 - 180, 90 - (y / VIEW_H) * 180];
}

function perpDist(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function douglasPeucker(pts: number[][], tol: number): number[][] {
  if (pts.length <= 2) return pts;
  let maxD = 0;
  let maxI = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) {
      maxD = d;
      maxI = i;
    }
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  return [...douglasPeucker(pts.slice(0, maxI + 1), tol), ...douglasPeucker(pts.slice(maxI), tol).slice(1)];
}

const fmt = (n: number): string => {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

function main() {
  const flag = process.argv.find((a) => a.startsWith("--input="));
  const input = flag ? flag.split("=").slice(1).join("=") : process.argv[2];
  if (!input) throw new Error("Usage: npx tsx scripts/build-world-map.ts --input <land-110m.json>");
  const topo = JSON.parse(readFileSync(input, "utf8")) as Topology;
  const decoded = decodeArcs(topo);
  const rings = collectRings(topo, decoded);

  // Drop Antarctica (avg latitude below −60°) — a bottom strip that eats
  // vertical budget without adding recognition value. Decoded arcs are in
  // lon/lat space, so latitude is checked directly.
  const geoRings: number[][][] = [];
  for (const ring of rings) {
    const avgLat = ring.reduce((a, p) => a + p[1], 0) / ring.length;
    if (avgLat < -60) continue;
    geoRings.push(ring.map(project));
  }

  const path = geoRings
    .map((ring) => {
      const simp = douglasPeucker(ring, SIMPLIFY_TOL);
      // Close rings explicitly for clean fills/strokes.
      const closed = [...simp, simp[0]];
      // Split subpaths at antimeridian jumps (|dx| > half the map) so
      // Russia/Fiji-type polygons never draw streaks across the map.
      let d = "";
      let pen = false;
      let prevX = 0;
      for (const p of closed) {
        if (!pen || Math.abs(p[0] - prevX) > VIEW_W / 2) {
          d += `M${fmt(p[0])} ${fmt(p[1])}`;
          pen = true;
        } else {
          d += `L${fmt(p[0])} ${fmt(p[1])}`;
        }
        prevX = p[0];
      }
      return `${d}Z`;
    })
    .join("");

  // Dhaka, Bangladesh — default hotspot (lon 90.41, lat 23.81).
  const [dx, dy] = project([90.4125, 23.8103]);

  const totalPts = geoRings.reduce((a, r) => a + r.length, 0);
  const content =
    `// GENERATED by scripts/build-world-map.ts — do not edit by hand.\n` +
    `// Natural Earth 110m land (public domain), Antarctica dropped, simplified.\n` +
    `export const WORLD_MAP_VIEWBOX = "0 0 ${VIEW_W} ${VIEW_H}";\n` +
    `export const WORLD_MAP_PATH = "${path}";\n` +
    `export const DHAKA_SPOT = { x: ${fmt(dx)}, y: ${fmt(dy)} } as const;\n`;
  writeFileSync(OUT_FILE, content, "utf8");

  const bytes = statSync(OUT_FILE).size;
  console.log(`✓ world-map.ts: ${geoRings.length} rings, ~${totalPts} pts → ${(bytes / 1024).toFixed(1)}KB (budget 25KB)`);
  if (bytes > BUDGET_BYTES) {
    throw new Error(`Budget exceeded: ${bytes} bytes > ${BUDGET_BYTES}. Raise SIMPLIFY_TOL and re-run.`);
  }
}

if (process.argv[1]?.endsWith("build-world-map.ts")) {
  main();
}
