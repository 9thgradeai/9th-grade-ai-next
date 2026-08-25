// Unit tests for scripts/generate-taxonomy.ts — the architecture .txt parser.
// Verifies depth resolution, path building, leaf marking, and junk-line
// tolerance so regenerated taxonomy.json files always match the source tree.

import { describe, it, expect } from "vitest";
import { buildTaxonomyFromLines } from "~scripts/generate-taxonomy";

const MINI_TREE = [
  "BCS_Question_Bank_Detailed/",
  "│",
  "├── 01_subject/",
  "│   ├── sectionA/",
  "│   │   ├── leafA1/",
  "│   │   └── leafA2/",
  "│   └── sectionB/",
  "│       └── leafB1/",
  "└── 02_other/",
  "    └── flat_leaf/",
].join("\n");

describe("buildTaxonomyFromLines", () => {
  it("parses connector/indent structure into a nested tree", () => {
    const root = buildTaxonomyFromLines(MINI_TREE.split("\n"));
    expect(root.name).toBe("BCS_Question_Bank_Detailed");
    expect(root.children.map((c) => c.name)).toEqual(["01_subject", "02_other"]);

    const s1 = root.children[0];
    expect(s1.depth).toBe(1);
    expect(s1.path).toBe("/BCS_Question_Bank_Detailed/01_subject");
    expect(s1.leaf).toBeUndefined(); // non-leaf carries no leaf flag

    const sectionB = s1.children[1];
    expect(sectionB.name).toBe("sectionB");
    expect(sectionB.depth).toBe(2);
    expect(sectionB.children[0].name).toBe("leafB1");
    expect(sectionB.children[0].depth).toBe(3);
  });

  it("marks leaves only for childless nodes", () => {
    const root = buildTaxonomyFromLines(MINI_TREE.split("\n"));
    expect(root.children[0].children[0].children[0]).toMatchObject({
      name: "leafA1",
      leaf: true,
      children: [],
    });
    // 02_other's single child is both a section-level node and a leaf
    expect(root.children[1].children[0]).toMatchObject({ name: "flat_leaf", leaf: true });
  });

  it("tolerates BOM, blank and box-art-only lines, and trailing slashes", () => {
    const root = buildTaxonomyFromLines([
      "\uFEFFBCS_Question_Bank_Detailed/",
      "│",
      "",
      "├── subject_x/",
      "│   └── leaf/",
      "└── y/",
    ]);
    expect(root.children.length).toBe(2);
    expect(root.children[0].children[0].name).toBe("leaf");
  });

  it("throws when the first entry is not the canonical root", () => {
    expect(() => buildTaxonomyFromLines(["Something_Else/", "└── x/"])).toThrow(/Expected root/);
  });

  it("round-trips: re-parsing the emitted tree text yields the same paths", () => {
    const root = buildTaxonomyFromLines(MINI_TREE.split("\n"));
    const collect = (n: { name: string; path: string; children: unknown[] }): string[] =>
      n.name === "BCS_Question_Bank_Detailed"
        ? n.children.flatMap(collect)
        : [n.path, ...n.children.flatMap(collect as never)];
    const paths = collect(root);
    expect(paths).toEqual([
      "/BCS_Question_Bank_Detailed/01_subject",
      "/BCS_Question_Bank_Detailed/01_subject/sectionA",
      "/BCS_Question_Bank_Detailed/01_subject/sectionA/leafA1",
      "/BCS_Question_Bank_Detailed/01_subject/sectionA/leafA2",
      "/BCS_Question_Bank_Detailed/01_subject/sectionB",
      "/BCS_Question_Bank_Detailed/01_subject/sectionB/leafB1",
      "/BCS_Question_Bank_Detailed/02_other",
      "/BCS_Question_Bank_Detailed/02_other/flat_leaf",
    ]);
  });
});
