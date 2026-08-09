import {
  DECLINE_REASONS,
  declineTimelineNote,
  findDeclineReason,
} from "@/lib/decline";

describe("DECLINE_REASONS", () => {
  it("has unique ids", () => {
    const ids = DECLINE_REASONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never puts a snake_case identifier in front of a person", () => {
    for (const reason of DECLINE_REASONS) {
      expect(reason.label).not.toMatch(/_/);
      expect(reason.timelineNote).not.toMatch(/_/);
    }
  });
});

describe("declineTimelineNote", () => {
  it("carries the structured reason on its own", () => {
    expect(declineTimelineNote("capacity_full", "")).toBe(
      "Declined — shop capacity is full for the requested date",
    );
  });

  it("appends the shop's own words when there are any", () => {
    expect(declineTimelineNote("price_too_low", "  Vinyl cost went up.  ")).toBe(
      "Declined — quoted price does not cover this job. Vinyl cost went up.",
    );
  });
});

describe("findDeclineReason", () => {
  it("returns null for anything unknown", () => {
    expect(findDeclineReason("nonsense")).toBeNull();
    expect(findDeclineReason(null)).toBeNull();
  });
});
