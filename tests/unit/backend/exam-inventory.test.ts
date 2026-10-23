import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getEcosystemInventory,
  materializeScope,
  pathMatchesPrefixes,
  resolveDbSubjectId,
  suffixMatchesPrefixes,
  type EcosystemInventory,
} from "~backend/services/exam-inventory";
import {
  BCS_PRELIMINARY_CONFIG,
  BANK_PRELIMINARY_CONFIG,
} from "~backend/services/exam-config";
import { prisma } from "~backend/db";

const BANGLA = "01_বাংলা_ভাষা_ও_সাহিত্য";
const BANK_BANGLA = "01_Bangla_Language_and_Literature";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveDbSubjectId", () => {
  it("prefers an exact nameBn match", () => {
    const id = resolveDbSubjectId(BCS_PRELIMINARY_CONFIG.subjects[0], [
      { id: 601, nameBn: "বাংলা ভাষা ও সাহিত্য" },
      { id: 1, nameBn: "01_বাংলা_ভাষা_ও_সাহিত্য" },
    ]);
    expect(id).toBe(601);
  });

  it("falls back to the root segment (Bank subjects are named by root)", () => {
    const id = resolveDbSubjectId(BANK_PRELIMINARY_CONFIG.subjects[1], [
      { id: 4958, nameBn: "01_Bangla_Language_and_Literature" },
    ]);
    expect(id).toBe(4958);
  });

  it("returns null when unbound", () => {
    expect(resolveDbSubjectId(BCS_PRELIMINARY_CONFIG.subjects[0], [])).toBeNull();
  });
});

describe("path matching", () => {
  it("matches exact and subtree absolute prefixes", () => {
    expect(pathMatchesPrefixes(`${BANGLA}/ভাষা`, [BANGLA])).toBe(true);
    expect(pathMatchesPrefixes(`${BANGLA}/ভাষা/বানান`, [`${BANGLA}/ভাষা`])).toBe(true);
    expect(pathMatchesPrefixes(`${BANGLA}/সাহিত্য/x`, [`${BANGLA}/ভাষা`])).toBe(false);
  });

  it("treats an empty prefix list as the whole subject", () => {
    expect(pathMatchesPrefixes("any/path", [])).toBe(true);
  });

  it("matches sibling Bangla leaves by relative suffix", () => {
    // A Bank request prefix ("01_Bangla…/ভাষা") should match BCS leaf suffixes.
    expect(suffixMatchesPrefixes(`${BANGLA}/ভাষা/বানান`, [`${BANK_BANGLA}/ভাষা`])).toBe(true);
    expect(suffixMatchesPrefixes(`${BANGLA}/সাহিত্য/x`, [`${BANK_BANGLA}/ভাষা`])).toBe(false);
  });
});

function inventory(rows: EcosystemInventory["rows"], subjects: EcosystemInventory["subjects"]): EcosystemInventory {
  return { ecosystemCode: "BCS", ecosystemId: 1, subjects, rows };
}

describe("materializeScope", () => {
  const subjects = [
    { id: 601, nameBn: "বাংলা ভাষা ও সাহিত্য" },
    { id: 602, nameBn: "English Language and Literature" },
  ];

  it("aggregates capacities bottom-up and binds leaves", () => {
    const inv = inventory(
      [
        { subjectId: 601, path: `${BANGLA}/ভাষা/বানান`, count: 4 },
        { subjectId: 601, path: `${BANGLA}/ভাষা/সন্ধি`, count: 6 },
        { subjectId: 601, path: `${BANGLA}/সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/x`, count: 10 },
      ],
      subjects,
    );
    const scope = materializeScope(BCS_PRELIMINARY_CONFIG, inv, null);
    const bangla = scope.subjects.find((s) => s.id === "bcs.bangla");
    expect(bangla).toBeDefined();
    // language (10) + literature (10) = 20
    expect(bangla?.capacity).toBe(20);
    const language = bangla?.children.find((c) => c.id === "bcs.bangla.language");
    expect(language?.capacity).toBe(10);
    const binding = scope.bindings.get("bcs.bangla.language");
    expect(binding?.leaves.map((l) => l.path).sort()).toEqual([
      `${BANGLA}/ভাষা/বানান`,
      `${BANGLA}/ভাষা/সন্ধি`,
    ]);
  });

  it("prunes to explicit topic selections while keeping ancestors", () => {
    const inv = inventory(
      [
        { subjectId: 601, path: `${BANGLA}/ভাষা/বানান`, count: 4 },
        { subjectId: 601, path: `${BANGLA}/সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/x`, count: 10 },
      ],
      subjects,
    );
    const scope = materializeScope(BCS_PRELIMINARY_CONFIG, inv, null, {
      subjects: [{ subjectId: "bcs.bangla", topics: ["bcs.bangla.language"] }],
    });
    const bangla = scope.subjects.find((s) => s.id === "bcs.bangla");
    expect(bangla?.children.map((c) => c.id)).toEqual(["bcs.bangla.language"]);
    expect(bangla?.capacity).toBe(4);
  });

  it("drops subjects that are filtered out entirely", () => {
    const inv = inventory([{ subjectId: 601, path: `${BANGLA}/ভাষা/বানান`, count: 4 }], subjects);
    const scope = materializeScope(BCS_PRELIMINARY_CONFIG, inv, null, {
      subjects: [{ subjectId: "bcs.english" }],
    });
    expect(scope.subjects.map((s) => s.id)).toEqual(["bcs.english"]);
  });

  it("folds the cross-ecosystem Bangla pool into a Bangla subject by suffix", () => {
    // Bank scope sees BCS Bangla rows (sibling pool) matched by suffix.
    const bankSubjects = [{ id: 4958, nameBn: "01_Bangla_Language_and_Literature" }];
    const inv: EcosystemInventory = {
      ecosystemCode: "BANGLADESH_BANK",
      ecosystemId: 2,
      subjects: bankSubjects,
      rows: [
        { subjectId: 4958, path: `${BANK_BANGLA}/ভাষা/x`, count: 3 },
        { subjectId: 601, path: `${BANGLA}/ভাষা/বানান`, count: 7 },
      ],
    };
    const bangla = { ids: [601, 4958], names: new Map([[601, "বাংলা ভাষা ও সাহিত্য"], [4958, BANK_BANGLA]]) };
    const scope = materializeScope(BANK_PRELIMINARY_CONFIG, inv, bangla);
    const bankBangla = scope.subjects.find((s) => s.id === "bank.bangla");
    const language = bankBangla?.children.find((c) => c.id === "bank.bangla.language");
    // own 3 (Bank) + sibling 7 (BCS) = 10
    expect(language?.capacity).toBe(10);
    const binding = scope.bindings.get("bank.bangla.language");
    expect(binding?.leaves).toEqual(
      expect.arrayContaining([
        { subjectId: 4958, path: `${BANK_BANGLA}/ভাষা/x`, count: 3 },
        { subjectId: 601, path: `${BANGLA}/ভাষা/বানান`, count: 7 },
      ]),
    );
  });
});

describe("getEcosystemInventory", () => {
  it("maps the groupBy rows and subject list", async () => {
    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      { id: 601, nameBn: "বাংলা ভাষা ও সাহিত্য" },
    ] as never);
    vi.mocked(prisma.question.groupBy).mockResolvedValue([
      { subjectId: 601, path: `${BANGLA}/ভাষা/বানান`, _count: { _all: 4 } },
    ] as never);

    const inv = await getEcosystemInventory("BCS", 1);
    expect(inv.subjects).toEqual([{ id: 601, nameBn: "বাংলা ভাষা ও সাহিত্য" }]);
    expect(inv.rows).toEqual([{ subjectId: 601, path: `${BANGLA}/ভাষা/বানান`, count: 4 }]);
  });
});
