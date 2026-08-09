import {
  addDays,
  dayKeyLabel,
  dayKeyRange,
  daysBetween,
  fromDayKey,
  toDayKey,
} from "@/lib/day";

describe("toDayKey", () => {
  it("uses the local calendar day, not UTC", () => {
    // 08:00 in Manila is 00:00 UTC on the same date; a UTC-based key would be
    // right here but wrong for anything before 08:00 local.
    const morning = new Date(2026, 7, 8, 8, 0, 0);
    expect(toDayKey(morning)).toBe("2026-08-08");
  });

  it("pads single-digit months and days", () => {
    expect(toDayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("returns an empty key for an unusable value", () => {
    expect(toDayKey("not a date")).toBe("");
  });
});

describe("fromDayKey", () => {
  it("round-trips a key", () => {
    const date = fromDayKey("2026-08-08");
    expect(date && toDayKey(date)).toBe("2026-08-08");
  });

  it("rejects anything that is not a day key", () => {
    expect(fromDayKey("2026-8-8")).toBeNull();
    expect(fromDayKey("")).toBeNull();
  });
});

describe("daysBetween", () => {
  it("counts whole days in both directions", () => {
    expect(daysBetween("2026-08-08", "2026-08-11")).toBe(3);
    expect(daysBetween("2026-08-11", "2026-08-08")).toBe(-3);
  });

  it("is unaffected by a daylight-saving style hour shift", () => {
    expect(daysBetween("2026-08-08", "2026-08-09")).toBe(1);
  });
});

describe("dayKeyRange", () => {
  it("is inclusive of both ends", () => {
    expect(dayKeyRange("2026-08-08", "2026-08-10")).toEqual([
      "2026-08-08",
      "2026-08-09",
      "2026-08-10",
    ]);
  });

  it("returns nothing when the end is before the start", () => {
    expect(dayKeyRange("2026-08-10", "2026-08-08")).toEqual([]);
  });

  it("caps a runaway range", () => {
    expect(dayKeyRange("2026-01-01", "2030-01-01", 5)).toHaveLength(5);
  });
});

describe("dayKeyLabel", () => {
  const now = new Date(2026, 7, 8);

  it("names the days a shop thinks in", () => {
    expect(dayKeyLabel("2026-08-08", now)).toBe("Today");
    expect(dayKeyLabel("2026-08-09", now)).toBe("Tomorrow");
    expect(dayKeyLabel("2026-08-07", now)).toBe("Yesterday");
  });

  it("falls back to a calendar date further out", () => {
    expect(dayKeyLabel("2026-08-15", now)).not.toBe("Today");
    expect(dayKeyLabel("2026-08-15", now)).toContain("Aug");
  });
});

describe("addDays", () => {
  it("crosses a month boundary", () => {
    expect(toDayKey(addDays(new Date(2026, 7, 30), 3))).toBe("2026-09-02");
  });
});
