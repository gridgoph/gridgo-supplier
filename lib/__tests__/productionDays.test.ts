import {
  clampWindow,
  daysFromHours,
  listingDaysFields,
  readListingDays,
  readServiceLineDays,
  readSpeedTierDays,
  readStarterDays,
  readyAfter,
  readyExampleLine,
  readyInLine,
  shopDateLabel,
  windowProblem,
  wholeDays,
} from "@/lib/productionDays";

/** Manila wall clock, as an instant. The Philippines keeps +08:00 all year. */
const manila = (iso: string) => new Date(`${iso}+08:00`);

describe("production time in working days", () => {
  it("reads days when GRIDGO sends days, and they win over hours", () => {
    expect(
      readListingDays({
        turnaroundDays: 2,
        minimumTurnaroundDays: 1,
        turnaroundHours: 20,
        minimumTurnaroundHours: 10,
      }),
    ).toEqual({ minDays: 1, maxDays: 2 });
    expect(readSpeedTierDays({ turnaroundDays: 1, turnaroundHours: 10 })).toBe(1);
    expect(readStarterDays({ defaultTurnaroundDays: 4, defaultTurnaroundHours: 40 })).toBe(4);
    expect(readServiceLineDays({ standardTurnaroundDays: 3 })).toBe(3);
  });

  it("converts an older GRIDGO's hours the way the migration does: up, never below a day", () => {
    // The default working day is 8 AM to 6 PM, ten hours.
    expect(daysFromHours(48)).toBe(5);
    expect(daysFromHours(24)).toBe(3);
    expect(daysFromHours(20)).toBe(2);
    expect(daysFromHours(12)).toBe(2);
    // Same-day work becomes one day; there is no hours option any more.
    expect(daysFromHours(3)).toBe(1);
    expect(daysFromHours(0)).toBeNull();
    expect(daysFromHours(null)).toBeNull();
    // A shop with an eight-hour day divides by eight.
    expect(daysFromHours(48, 480)).toBe(6);
    expect(readListingDays({ turnaroundHours: 48, productionDayMinutes: 480 })).toEqual({
      minDays: null,
      maxDays: 6,
    });
    expect(readListingDays({ turnaround_hours: 120 })).toEqual({ minDays: null, maxDays: 12 });
  });

  it("never reads a fraction of a day", () => {
    expect(wholeDays(1.5)).toBe(2);
    expect(wholeDays(0)).toBeNull();
    expect(wholeDays("2")).toBeNull();
  });

  it("writes days, and clears both when the listing follows its category", () => {
    expect(listingDaysFields(1, 3)).toEqual({ minimumTurnaroundDays: 1, turnaroundDays: 3 });
    expect(listingDaysFields(null, null)).toEqual({
      minimumTurnaroundDays: null,
      turnaroundDays: null,
    });
  });

  it("says days the way a client reads them", () => {
    expect(readyInLine(1)).toBe("Ready in 1 working day");
    expect(readyInLine(2, 1)).toBe("Ready in 1–2 working days");
    expect(readyInLine(2, 2)).toBe("Ready in 2 working days");
    expect(readyInLine(null)).toBe("Ready-in not set");
  });

  it("keeps the soonest no later than the latest, inside the bounds", () => {
    expect(clampWindow(4, 2)).toEqual({ minDays: 2, maxDays: 2 });
    expect(clampWindow(0, 0)).toEqual({ minDays: 1, maxDays: 1 });
    expect(clampWindow(1, 99)).toEqual({ minDays: 1, maxDays: 30 });
  });

  it("refuses a window GRIDGO would refuse, naming the fix", () => {
    expect(windowProblem(1, 3)).toBeNull();
    expect(windowProblem(null, 2)).toBeNull();
    expect(windowProblem(null, null)).toContain("working days");
    expect(windowProblem(null, 0)).toContain("at least 1 working day");
    expect(windowProblem(null, 1.5)).toContain("at least 1 working day");
    expect(windowProblem(null, 31)).toContain("at most 30");
    expect(windowProblem(3, 2)).toContain("soonest");
  });
});

describe("the ready-date example", () => {
  it("lands at the same time a working day later, inside open hours", () => {
    // Tuesday 11 AM, two days: Thursday 11 AM.
    expect(readyAfter(2, manila("2026-10-06T11:00:00")).toISOString()).toBe(
      manila("2026-10-08T11:00:00").toISOString(),
    );
  });

  it("skips Sunday", () => {
    // Saturday 2 PM, one day: four hours Saturday, six Monday — Monday 2 PM.
    expect(readyAfter(1, manila("2026-10-10T14:00:00")).toISOString()).toBe(
      manila("2026-10-12T14:00:00").toISOString(),
    );
  });

  it("starts counting at opening when the job arrives after hours", () => {
    // Tuesday 8 PM, one day: all of Wednesday, ready at 6 PM.
    expect(readyAfter(1, manila("2026-10-06T20:00:00")).toISOString()).toBe(
      manila("2026-10-07T18:00:00").toISOString(),
    );
  });

  it("says the date on the shop's calendar", () => {
    expect(shopDateLabel(manila("2026-10-08T23:30:00"))).toBe("Thu 8 Oct");
    const now = manila("2026-10-06T11:00:00");
    expect(readyExampleLine(2, 2, now)).toBe("A job that starts now is ready by Thu 8 Oct.");
    expect(readyExampleLine(1, 3, now)).toBe(
      "A job that starts now is ready between Wed 7 Oct and Fri 9 Oct.",
    );
  });
});
