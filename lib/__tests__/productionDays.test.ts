import {
  clampWindow,
  listingTimeFields,
  readDayMinutes,
  readListingTime,
  readServiceLineTime,
  readSpeedTierTime,
  readStarterTime,
  readyAfter,
  readyExampleLine,
  readyInLine,
  sameDay,
  sameDayMaxMinutes,
  shopDateLabel,
  shopDateTimeLabel,
  singleTimeProblem,
  timeFields,
  timeLabel,
  timeLadder,
  timeMinutes,
  timeParts,
  windowProblem,
  workingDays,
} from "@/lib/productionDays";

/** Manila wall clock, as an instant. The Philippines keeps +08:00 all year. */
const manila = (iso: string) => new Date(`${iso}+08:00`);

describe("reading a production time off GRIDGO", () => {
  it("reads days when GRIDGO sends days, and they win over minutes and hours", () => {
    expect(
      readListingTime({
        turnaroundDays: 2,
        turnaroundMinutes: 1200,
        minimumTurnaroundDays: 1,
        minimumTurnaroundMinutes: 600,
        turnaroundHours: 20,
      }),
    ).toEqual({ min: workingDays(1), max: workingDays(2) });
    expect(readSpeedTierTime({ turnaroundDays: 1, turnaroundMinutes: 600 })).toEqual(workingDays(1));
    expect(readStarterTime({ defaultTurnaroundDays: 4, defaultTurnaroundMinutes: 2400 })).toEqual(workingDays(4));
    expect(readServiceLineTime({ standardTurnaroundDays: 3 })).toEqual(workingDays(3));
  });

  it("reads a same-day time as exact minutes when days are null (report 39853344)", () => {
    expect(
      readListingTime({
        turnaroundDays: null,
        turnaroundMinutes: 60,
        turnaroundHours: 1,
        minimumTurnaroundDays: null,
        minimumTurnaroundMinutes: null,
      }),
    ).toEqual({ min: null, max: sameDay(60) });
    expect(readSpeedTierTime({ turnaroundDays: null, turnaroundMinutes: 75 })).toEqual(sameDay(75));
    expect(readStarterTime({ default_turnaround_minutes: 120 })).toEqual(sameDay(120));
    expect(readServiceLineTime({ standardTurnaroundMinutes: 90 })).toEqual(sameDay(90));
  });

  it("reads an older GRIDGO's hours exactly, never rounding them up into a working day", () => {
    expect(readListingTime({ turnaroundHours: 3 })).toEqual({ min: null, max: sameDay(180) });
    expect(readListingTime({ turnaround_hours: 48 })).toEqual({ min: null, max: sameDay(2880) });
    expect(readListingTime({})).toEqual({ min: null, max: null });
    expect(readListingTime({ turnaroundDays: 0, turnaroundMinutes: -5 })).toEqual({ min: null, max: null });
  });

  it("reads the shop's working day when GRIDGO sends it", () => {
    expect(readDayMinutes({ productionDayMinutes: 480 })).toBe(480);
    expect(readDayMinutes({ productionDayMinutes: null })).toBeNull();
  });
});

describe("writing a production time back", () => {
  it("sends only the chosen unit's field", () => {
    expect(timeFields("turnaround", workingDays(3))).toEqual({ turnaroundDays: 3 });
    expect(timeFields("turnaround", sameDay(60))).toEqual({ turnaroundMinutes: 60 });
    expect(listingTimeFields(sameDay(60), workingDays(2))).toEqual({
      minimumTurnaroundMinutes: 60,
      turnaroundDays: 2,
    });
  });

  it("clears both ends when the listing follows its category", () => {
    expect(listingTimeFields(null, null)).toEqual({
      minimumTurnaroundDays: null,
      turnaroundDays: null,
    });
  });
});

describe("saying a production time", () => {
  it("says hours, half hours and working days in a shop's words", () => {
    expect(timeLabel(sameDay(30))).toBe("30 minutes");
    expect(timeLabel(sameDay(60))).toBe("1 hour");
    expect(timeLabel(sameDay(90))).toBe("1½ hours");
    expect(timeLabel(sameDay(75))).toBe("1¼ hours");
    expect(timeLabel(sameDay(70))).toBe("1 h 10 min");
    expect(timeLabel(sameDay(180))).toBe("3 hours");
    expect(timeLabel(workingDays(1))).toBe("1 working day");
    expect(timeLabel(workingDays(2))).toBe("2 working days");
    expect(timeParts(sameDay(150))).toEqual({ value: "2½", unit: "hours" });
  });

  it("says the wait the way a client reads it", () => {
    expect(readyInLine(workingDays(1))).toBe("Ready in 1 working day");
    expect(readyInLine(workingDays(2), workingDays(1))).toBe("Ready in 1–2 working days");
    expect(readyInLine(workingDays(2), workingDays(2))).toBe("Ready in 2 working days");
    expect(readyInLine(sameDay(60))).toBe("Ready in 1 hour");
    expect(readyInLine(sameDay(180), sameDay(60))).toBe("Ready in 1–3 hours");
    expect(readyInLine(workingDays(1), sameDay(240))).toBe("Ready in 4 hours to 1 working day");
    expect(readyInLine(null)).toBe("Ready-in not set");
  });
});

describe("the picker", () => {
  it("steps in half hours to the end of a working day, then in working days", () => {
    const ladder = timeLadder(600);
    expect(ladder[0]).toEqual(sameDay(30));
    expect(ladder[18]).toEqual(sameDay(570));
    expect(ladder[19]).toEqual(workingDays(1));
    expect(ladder.at(-1)).toEqual(workingDays(30));
    // A shop with an eight-and-a-half-hour day stops at eight hours.
    expect(sameDayMaxMinutes(510)).toBe(480);
  });

  it("slots an off-step time GRIDGO holds in where it belongs", () => {
    const ladder = timeLadder(600, sameDay(75));
    const at = ladder.findIndex((step) => step.unit === "hours" && step.minutes === 75);
    expect(ladder[at - 1]).toEqual(sameDay(60));
    expect(ladder[at + 1]).toEqual(sameDay(90));
  });

  it("orders hours under days on the shop's own working day", () => {
    expect(timeMinutes(workingDays(1), 480)).toBe(480);
    expect(timeMinutes(sameDay(90))).toBe(90);
  });

  it("keeps the soonest no later than the latest", () => {
    expect(clampWindow(workingDays(4), workingDays(2))).toEqual({ min: workingDays(2), max: workingDays(2) });
    expect(clampWindow(workingDays(1), sameDay(60))).toEqual({ min: sameDay(60), max: sameDay(60) });
    expect(clampWindow(sameDay(60), workingDays(2))).toEqual({ min: sameDay(60), max: workingDays(2) });
  });

  it("refuses a window GRIDGO would refuse, naming the fix", () => {
    expect(windowProblem(workingDays(1), workingDays(3))).toBeNull();
    expect(windowProblem(null, workingDays(2))).toBeNull();
    expect(windowProblem(sameDay(60), sameDay(120))).toBeNull();
    expect(windowProblem(null, null)).toContain("how long");
    expect(windowProblem(null, workingDays(0))).toContain("at least 1 working day");
    expect(windowProblem(null, workingDays(1.5))).toContain("at least 1 working day");
    expect(windowProblem(null, workingDays(31))).toContain("at most 30");
    expect(windowProblem(workingDays(3), workingDays(2))).toContain("soonest");
    // A same-day time is shorter than the shop's working day.
    expect(windowProblem(null, sameDay(600), 600)).toContain("working days");
    expect(windowProblem(null, sameDay(450), 480)).toBeNull();
    expect(singleTimeProblem(sameDay(0))).toContain("hours");
  });
});

describe("the ready-date example", () => {
  it("lands at the same time a working day later, inside open hours", () => {
    // Tuesday 11 AM, two days: Thursday 11 AM.
    expect(readyAfter(workingDays(2), manila("2026-10-06T11:00:00")).toISOString()).toBe(
      manila("2026-10-08T11:00:00").toISOString(),
    );
  });

  it("skips Sunday", () => {
    // Saturday 2 PM, one day: four hours Saturday, six Monday — Monday 2 PM.
    expect(readyAfter(workingDays(1), manila("2026-10-10T14:00:00")).toISOString()).toBe(
      manila("2026-10-12T14:00:00").toISOString(),
    );
  });

  it("starts counting at opening when the job arrives after hours", () => {
    // Tuesday 8 PM, one day: all of Wednesday, ready at 6 PM.
    expect(readyAfter(workingDays(1), manila("2026-10-06T20:00:00")).toISOString()).toBe(
      manila("2026-10-07T18:00:00").toISOString(),
    );
  });

  it("finishes a same-day job the same day, or the next morning across closing", () => {
    expect(readyAfter(sameDay(60), manila("2026-10-06T11:00:00")).toISOString()).toBe(
      manila("2026-10-06T12:00:00").toISOString(),
    );
    // Tuesday 5:30 PM, one hour: half an hour Tuesday, half Wednesday from 8.
    expect(readyAfter(sameDay(60), manila("2026-10-06T17:30:00")).toISOString()).toBe(
      manila("2026-10-07T08:30:00").toISOString(),
    );
  });

  it("says the date on the shop's calendar, with the hour for same-day work", () => {
    expect(shopDateLabel(manila("2026-10-08T23:30:00"))).toBe("Thu 8 Oct");
    expect(shopDateTimeLabel(manila("2026-10-08T15:30:00"))).toBe("Thu 8 Oct, 3:30 PM");
    expect(shopDateTimeLabel(manila("2026-10-08T00:05:00"))).toBe("Thu 8 Oct, 12:05 AM");
    const now = manila("2026-10-06T11:00:00");
    expect(readyExampleLine(workingDays(2), workingDays(2), now)).toBe("A job that starts now is ready by Thu 8 Oct.");
    expect(readyExampleLine(workingDays(1), workingDays(3), now)).toBe(
      "A job that starts now is ready between Wed 7 Oct and Fri 9 Oct.",
    );
    expect(readyExampleLine(sameDay(60), sameDay(120), now)).toBe(
      "A job that starts now is ready between 12:00 PM and 1:00 PM on Tue 6 Oct.",
    );
    expect(readyExampleLine(sameDay(60), sameDay(60), now)).toBe("A job that starts now is ready by Tue 6 Oct, 12:00 PM.");
    expect(readyExampleLine(sameDay(60), workingDays(1), manila("2026-10-06T17:00:00"))).toBe(
      "A job that starts now is ready between Tue 6 Oct, 6:00 PM and Wed 7 Oct, 5:00 PM.",
    );
  });
});
