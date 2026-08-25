/**
 * scripts/generate-taxonomy.ts
 * ----------------------------------------------------------------------------
 * Regenerates database/data/taxonomy.json from the canonical architecture
 * tree file (database/data/bcs_syllabus/BCS_Question_Bank_Detailed_*.txt).
 *
 * The .txt is a standard `tree` listing: connector prefixes ("├── ", "└── ")
 * under 4-char indent groups ("│   " / "    "). Folder names carry a trailing
 * "/" which is stripped. Node depth = number of segments below the root.
 *
 * Output node shape (matches scripts/taxonomy.ts TaxonomyNode):
 *   { name, children, path: "/BCS_Question_Bank_Detailed/<segments>",
 *     depth, leaf?: true }   // leaf present only when children is empty
 *
 * Run after editing the architecture file:
 *   npx tsx scripts/generate-taxonomy.ts
 * ----------------------------------------------------------------------------
 */
import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT_NAME = "BCS_Question_Bank_Detailed";
const ARCH_DIR = join(process.cwd(), "database", "data", "bcs_syllabus");
const OUT_FILE = join(process.cwd(), "database", "data", "taxonomy.json");

type TaxonomyNode = {
  name: string;
  path: string;
  depth: number;
  children: TaxonomyNode[];
  leaf?: boolean;
};

type ParsedLine = { depth: number; name: string };

/** Parse one architecture line into (depth, name); null for non-entry lines. */
function parseLine(line: string): ParsedLine | null {
  // Strip BOM and trailing whitespace; ignore blank/box-art-only lines.
  const cleaned = line.replace(/^\uFEFF/, "").trimEnd();
  if (!cleaned.trim()) return null;

  const match = cleaned.match(
    /^((?:\u2502   |    )*)(?:\u251c\u2500\u2500 |\u2514\u2500\u2500 )?(.+?)\/?\s*$/,
  );
  if (!match) return null;
  const [, indent, rawName] = match;
  const name = rawName.trim();
  if (!name || name === "\u2502") return null; // bare box-drawing line

  // Each indent level is exactly 4 characters.
  const depth = indent.length / 4;
  if (!Number.isInteger(depth)) {
    throw new Error(`Irregular indent in architecture line: "${line}"`);
  }
  return { depth, name };
}

/** Find the newest architecture tree file in bcs_syllabus/. */
function findArchitectureFile(): string {
  const candidates = readdirSync(ARCH_DIR)
    .filter((f) => f.startsWith(`${ROOT_NAME}_`) && f.endsWith(".txt"))
    .sort();
  if (candidates.length === 0) {
    throw new Error(`No "${ROOT_NAME}_*.txt" architecture file found in ${ARCH_DIR}`);
  }
  return join(ARCH_DIR, candidates[candidates.length - 1]);
}

function buildTaxonomy(): TaxonomyNode {
  const lines = readFileSync(findArchitectureFile(), "utf8").split(/\r?\n/);
  return buildTaxonomyFromLines(lines);
}

/** Core parser — exported (pure) so tests can exercise it without fixtures on disk. */
export function buildTaxonomyFromLines(lines: string[]): TaxonomyNode {
  const root: TaxonomyNode = {
    name: ROOT_NAME,
    path: `/${ROOT_NAME}`,
    depth: 0,
    children: [],
  };
  // stack[d+1] is the most recent node at depth d; children attach to it.
  const stack: TaxonomyNode[] = [root];

  let started = false;
  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;

    if (!started) {
      if (parsed.name !== ROOT_NAME) {
        throw new Error(`Expected root "${ROOT_NAME}", found "${parsed.name}"`);
      }
      started = true;
      continue;
    }

    const parent = stack[parsed.depth];
    if (!parent) {
      throw new Error(`Depth skipped in architecture file at line: ${line.trim()}`);
    }
    // Depth counts segments below the root (subject = 1), per the
    // TaxonomyNode contract in scripts/taxonomy.ts.
    const node: TaxonomyNode = {
      name: parsed.name,
      path: `${parent.path}/${parsed.name}`,
      depth: parsed.depth + 1,
      children: [],
    };
    parent.children.push(node);
    stack.length = parsed.depth + 2;
    stack[parsed.depth + 1] = node;
  }

  if (!started) throw new Error("Architecture file had no entries");

  // Mark leaves (no children) — matches the existing taxonomy.json contract.
  const markLeaves = (n: TaxonomyNode): number => {
    if (n.children.length === 0) {
      n.leaf = true;
      return 1;
    }
    return n.children.reduce((acc, c) => acc + markLeaves(c), 0);
  };
  markLeaves(root);
  return root;
}

// Field order stays stable per node: name, children, path, depth, leaf.
function ordered(node: TaxonomyNode): Record<string, unknown> {
  return node.children.length > 0
    ? {
        name: node.name,
        children: node.children.map(ordered),
        path: node.path,
        depth: node.depth,
      }
    : {
        name: node.name,
        children: [],
        path: node.path,
        depth: node.depth,
        leaf: true,
      };
}

function main() {
  const taxonomy = buildTaxonomy();
  writeFileSync(OUT_FILE, `${JSON.stringify(ordered(taxonomy), null, 2)}\n`, "utf8");
  const leaves = (function count(n: TaxonomyNode): number {
    return n.children.length === 0 ? 1 : n.children.reduce((a, c) => a + count(c), 0);
  })(taxonomy);
  console.log(`✓ taxonomy.json regenerated from ${findArchitectureFile()}`);
  console.log(`  ${leaves} leaves across ${taxonomy.children.length} subjects`);
}

if (process.argv[1]?.endsWith("generate-taxonomy.ts")) {
  main();
}
