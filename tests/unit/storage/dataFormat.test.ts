import { describe, it, expect } from "vitest";
import { createEnvelope, verifyEnvelope, computeChecksum, CURRENT_SCHEMA_VERSION } from "~backend/services/storage/dataFormat";

describe("dataFormat", () => {
  it("creates versioned envelope with checksum", () => {
    const env = createEnvelope({ entityType: "BOOKMARKS", id: "u1:BOOKMARKS", userId: "u1", data: { bookmarks: [1, 2, 3] } });
    expect(env.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(env.entityType).toBe("BOOKMARKS");
    expect(env.checksum).toBe(computeChecksum({ bookmarks: [1, 2, 3] }));
    expect(verifyEnvelope(env)).toBe(true);
  });

  it("detects checksum mismatch", () => {
    const env = createEnvelope({ entityType: "BOOKMARKS", id: "u1:BOOKMARKS", userId: "u1", data: { bookmarks: [1] } });
    const tampered = { ...env, data: { bookmarks: [2] } };
    expect(verifyEnvelope(tampered as never)).toBe(false);
  });

  it("normalizes Bangla text deterministically", () => {
    const data = { question: "বাংলা ভাষা", options: ["ক", "খ"] };
    const c1 = computeChecksum(data);
    const c2 = computeChecksum({ question: "বাংলা ভাষা", options: ["ক", "খ"] });
    expect(c1).toBe(c2);
  });
});
