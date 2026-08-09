import {
  blackoutOnDay,
  blackoutReasonLabel,
  blackoutSpanLabel,
  closedDayKeys,
  MAX_BLACKOUT_DAYS,
  validateBlackout,
  type Blackout,
} from "@/lib/blackouts";

function closure(partial: Partial<Blackout> & Pick<Blackout, "id">): Blackout {
  return {
    startDay: "2026-08-10",
    endDay: "2026-08-12",
    reason: "holiday",
    note: "",
    ...partial,
  };
}

describe("validateBlackout", () => {
  it("accepts a single day", () => {
    expect(validateBlackout({ startDay: "2026-08-10", endDay: "2026-08-10" })).toBeNull();
  });

  it("names the fix when the end is before the start", () => {
    const problem = validateBlackout({ startDay: "2026-08-12", endDay: "2026-08-10" });
    expect(problem).toContain("end date later");
  });

  it("rejects an unusable date instead of saving it", () => {
    expect(validateBlackout({ startDay: "", endDay: "2026-08-10" })).not.toBeNull();
  });

  it("caps the span so a mis-set year is caught", () => {
    const problem = validateBlackout({ startDay: "2026-08-10", endDay: "2027-08-10" });
    expect(problem).toContain(`${MAX_BLACKOUT_DAYS} days`);
  });

  it("points at the existing closure it would overlap", () => {
    const existing = [closure({ id: "a" })];
    const problem = validateBlackout(
      { startDay: "2026-08-11", endDay: "2026-08-14" },
      existing,
    );
    expect(problem).toContain("overlaps");
  });

  it("lets a closure be edited without clashing with itself", () => {
    const existing = [closure({ id: "a" })];
    expect(
      validateBlackout({ startDay: "2026-08-10", endDay: "2026-08-13" }, existing, "a"),
    ).toBeNull();
  });
});

describe("blackoutOnDay", () => {
  const list = [closure({ id: "a" })];

  it("matches the whole inclusive run", () => {
    expect(blackoutOnDay(list, "2026-08-10")?.id).toBe("a");
    expect(blackoutOnDay(list, "2026-08-12")?.id).toBe("a");
  });

  it("does not match the day either side", () => {
    expect(blackoutOnDay(list, "2026-08-09")).toBeNull();
    expect(blackoutOnDay(list, "2026-08-13")).toBeNull();
  });
});

describe("closedDayKeys", () => {
  it("expands every closure into its days", () => {
    const keys = closedDayKeys([
      closure({ id: "a", startDay: "2026-08-10", endDay: "2026-08-11" }),
      closure({ id: "b", startDay: "2026-09-01", endDay: "2026-09-01" }),
    ]);
    expect([...keys].sort()).toEqual(["2026-08-10", "2026-08-11", "2026-09-01"]);
  });
});

describe("labels", () => {
  it("never shows a raw reason id", () => {
    expect(blackoutReasonLabel("maintenance")).toBe("Equipment maintenance");
  });

  it("says one day as one date and a run as a range", () => {
    expect(
      blackoutSpanLabel(closure({ id: "a", startDay: "2026-08-10", endDay: "2026-08-10" })),
    ).not.toContain("–");
    expect(blackoutSpanLabel(closure({ id: "a" }))).toContain("–");
  });
});
