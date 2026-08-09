import {
  evidenceStageLabel,
  isEvidenceBusy,
  newEvidenceItem,
  storedEvidence,
  tooLargeMessage,
  type EvidenceItem,
} from "@/lib/evidence";

function item(partial: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    ...newEvidenceItem({
      key: "ev_1",
      uri: "file:///photo.jpg",
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
    }),
    ...partial,
  };
}

describe("newEvidenceItem", () => {
  it("starts with nothing claimed as stored", () => {
    const fresh = item();
    expect(fresh.stage).toBe("idle");
    expect(fresh.attachmentId).toBeNull();
    expect(fresh.progress).toBe(0);
  });
});

describe("storedEvidence", () => {
  it("counts only files GRIDGO has returned an id for", () => {
    const list = [
      item({ key: "a", stage: "stored", attachmentId: "att_1" }),
      // Transfer finished but the server has not confirmed — not stored.
      item({ key: "b", stage: "processing", progress: 1 }),
      item({ key: "c", stage: "failed", error: "nope" }),
      // A stage without an id must never count, whatever set it.
      item({ key: "d", stage: "stored", attachmentId: null }),
    ];
    expect(storedEvidence(list).map((i) => i.key)).toEqual(["a"]);
  });
});

describe("isEvidenceBusy", () => {
  it("stays busy while bytes move and while the server finishes", () => {
    expect(isEvidenceBusy([item({ stage: "uploading" })])).toBe(true);
    expect(isEvidenceBusy([item({ stage: "processing" })])).toBe(true);
  });

  it("is idle once everything has settled either way", () => {
    expect(
      isEvidenceBusy([
        item({ key: "a", stage: "stored", attachmentId: "att_1" }),
        item({ key: "b", stage: "failed", error: "nope" }),
      ]),
    ).toBe(false);
  });
});

describe("evidenceStageLabel", () => {
  it("separates sending from still being saved", () => {
    expect(evidenceStageLabel(item({ stage: "uploading", progress: 0.42 }))).toBe(
      "Sending 42%",
    );
    expect(evidenceStageLabel(item({ stage: "processing", progress: 1 }))).toContain(
      "still saving",
    );
  });

  it("only says saved once it is", () => {
    expect(evidenceStageLabel(item({ stage: "stored", attachmentId: "att_1" }))).toBe(
      "Saved to this job",
    );
  });

  it("shows the specific failure rather than a generic one", () => {
    expect(
      evidenceStageLabel(item({ stage: "failed", error: "That photo is over the limit." })),
    ).toBe("That photo is over the limit.");
  });
});

describe("tooLargeMessage", () => {
  it("says the size and the fix", () => {
    const message = tooLargeMessage(12.5 * 1024 * 1024);
    expect(message).toContain("12.5 MB");
    expect(message).toContain("10 MB");
  });
});
