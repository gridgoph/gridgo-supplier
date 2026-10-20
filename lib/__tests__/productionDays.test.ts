import {
  choiceFromWindow,
  choiceLine,
  choiceProblem,
  choiceWindow,
  productionTimeBody,
  readDayMinutes,
  readProductionChoice,
  readProductionTimeReview,
  readListingTime,
  readServiceLineTime,
  readSpeedTierTime,
  readStarterTime,
  readyInLine,
  reviewLines,
  MAX_PRODUCTION_MINUTES,
  sameDayPastOneDay,
  sameChoice,
  sameDay,
  sameDayLadder,
  sameDayMaxMinutes,
  shopClockLabel,
  shopDateLabel,
  shopDateTimeLabel,
  singleTimeProblem,
  timeFields,
  timeLabel,
  timeLadder,
  timeMinutes,
  timeParts,
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
    expect(timeFields("turnaround", null)).toEqual({ turnaroundDays: null });
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

  it("names what a speed or a category line's time would be refused for", () => {
    expect(singleTimeProblem(workingDays(2))).toBeNull();
    expect(singleTimeProblem(sameDay(0))).toContain("hours");
    expect(singleTimeProblem(sameDay(600), 600)).toContain("working days");
  });
});

describe("the shop's calendar", () => {
  it("says the date on the shop's calendar, with the hour for same-day work", () => {
    expect(shopDateLabel(manila("2026-10-08T23:30:00"))).toBe("Thu 8 Oct");
    expect(shopDateTimeLabel(manila("2026-10-08T15:30:00"))).toBe("Thu 8 Oct, 3:30 PM");
    expect(shopDateTimeLabel(manila("2026-10-08T00:05:00"))).toBe("Thu 8 Oct, 12:05 AM");
    expect(shopClockLabel(manila("2026-10-08T13:00:00"))).toBe("1:00 PM");
  });
});

describe("How long does this take?", () => {
  it("reads GRIDGO's productionTime, Same day in exact minutes", () => {
    expect(readProductionChoice({ productionTime: { mode: "same_day", hours: 2 } })).toEqual({ mode: "same_day", minutes: 120 });
    expect(readProductionChoice({ productionTime: { mode: "same_day", hours: 1.5 } })).toEqual({ mode: "same_day", minutes: 90 });
    expect(readProductionChoice({ productionTime: { mode: "days", minDays: 1, maxDays: 3 } })).toEqual({
      mode: "days",
      minDays: 1,
      maxDays: 3,
    });
  });

  it("reads nothing it cannot hold, rather than guessing", () => {
    expect(readProductionChoice({ productionTime: null })).toBeNull();
    expect(readProductionChoice({})).toBeNull();
    expect(readProductionChoice({ productionTime: { mode: "same_day", hours: 0 } })).toBeNull();
    expect(readProductionChoice({ productionTime: { mode: "days", minDays: 3, maxDays: 1 } })).toBeNull();
    expect(readProductionChoice({ productionTime: { mode: "days", minDays: 1.5, maxDays: 2 } })).toBeNull();
    expect(readProductionChoice({ productionTime: { mode: "weeks" } })).toBeNull();
  });

  it("sends GRIDGO hours for Same day and whole days for Days", () => {
    expect(productionTimeBody({ mode: "same_day", minutes: 90 })).toEqual({ mode: "same_day", hours: 1.5 });
    expect(productionTimeBody({ mode: "days", minDays: 1, maxDays: 3 })).toEqual({ mode: "days", minDays: 1, maxDays: 3 });
  });

  it("is the same window the rest of the app reads", () => {
    expect(choiceWindow({ mode: "same_day", minutes: 120 })).toEqual({ min: sameDay(120), max: sameDay(120) });
    expect(choiceWindow({ mode: "days", minDays: 1, maxDays: 3 })).toEqual({ min: workingDays(1), max: workingDays(3) });
  });

  it("reads an older window as one answer", () => {
    expect(choiceFromWindow(null, null)).toBeNull();
    expect(choiceFromWindow(sameDay(60), sameDay(180))).toEqual({ mode: "same_day", minutes: 180 });
    expect(choiceFromWindow(workingDays(2), workingDays(4))).toEqual({ mode: "days", minDays: 2, maxDays: 4 });
    expect(choiceFromWindow(sameDay(60), workingDays(2))).toEqual({ mode: "days", minDays: 1, maxDays: 2 });
    expect(choiceFromWindow(null, workingDays(2))).toEqual({ mode: "days", minDays: 2, maxDays: 2 });
  });

  it("says the answer in the dashboard's words", () => {
    expect(choiceLine({ mode: "same_day", minutes: 120 })).toBe("Same day, ready in 2 hours");
    expect(choiceLine({ mode: "same_day", minutes: 90 })).toBe("Same day, ready in 1½ hours");
    expect(choiceLine({ mode: "days", minDays: 1, maxDays: 3 })).toBe("1 to 3 working days");
    expect(choiceLine({ mode: "days", minDays: 2, maxDays: 2 })).toBe("2 working days");
  });

  it("tells answers apart", () => {
    expect(sameChoice(null, null)).toBe(true);
    expect(sameChoice({ mode: "same_day", minutes: 60 }, null)).toBe(false);
    expect(sameChoice({ mode: "same_day", minutes: 60 }, { mode: "same_day", minutes: 60 })).toBe(true);
    expect(sameChoice({ mode: "days", minDays: 1, maxDays: 2 }, { mode: "days", minDays: 1, maxDays: 3 })).toBe(false);
    expect(sameChoice({ mode: "same_day", minutes: 600 }, { mode: "days", minDays: 1, maxDays: 1 })).toBe(false);
  });

  it("refuses what GRIDGO would refuse, in the dashboard's sentences", () => {
    expect(choiceProblem(null)).toBe("Choose how long this takes.");
    expect(choiceProblem({ mode: "same_day", minutes: 0 })).toBe("Choose how many hours this takes.");
    expect(choiceProblem({ mode: "same_day", minutes: 90.5 })).toBe("Choose how many hours this takes.");
    expect(choiceProblem({ mode: "same_day", minutes: MAX_PRODUCTION_MINUTES + 1 })).toBe(
      "Choose how many hours this takes.",
    );
    expect(choiceProblem({ mode: "days", minDays: 0, maxDays: 2 })).toBe("Production time is at least 1 working day.");
    expect(choiceProblem({ mode: "days", minDays: 1, maxDays: 1.5 })).toBe("Production time is at least 1 working day.");
    expect(choiceProblem({ mode: "days", minDays: 1, maxDays: 31 })).toBe("Production time is at most 30 working days.");
    expect(choiceProblem({ mode: "days", minDays: 3, maxDays: 2 })).toBe("The soonest can't be later than the latest.");
    expect(choiceProblem({ mode: "days", minDays: 1, maxDays: 3 })).toBeNull();
  });

  it("round-trips any whole number of minutes GRIDGO returns as fractional hours", () => {
    // 31 minutes arrives as 31 / 60 hours; GRIDGO takes that same number back.
    const choice = readProductionChoice({ productionTime: { mode: "same_day", hours: 31 / 60 } });
    expect(choice).toEqual({ mode: "same_day", minutes: 31 });
    expect(choiceProblem(choice, 600)).toBeNull();
    expect(productionTimeBody(choice!)).toEqual({ mode: "same_day", hours: 31 / 60 });
    expect(sameDayLadder(600, 31)).toContain(31);
  });

  it("takes exact hours of a working day or more as they are (gridgo-api#299)", () => {
    // 12 hours on a 10-hour working day: an older or converted Express time.
    expect(choiceProblem({ mode: "same_day", minutes: 720 }, 600)).toBeNull();
    expect(choiceProblem({ mode: "same_day", minutes: 600 }, 600)).toBeNull();
    expect(sameDayPastOneDay({ mode: "same_day", minutes: 720 }, 600)).toBe(true);
    expect(sameDayPastOneDay({ mode: "same_day", minutes: 570 }, 600)).toBe(false);
    expect(sameDayPastOneDay({ mode: "days", minDays: 1, maxDays: 2 }, 600)).toBe(false);
  });

  it("steps Same day in half hours inside the working day, keeping an off-step time GRIDGO holds", () => {
    expect(sameDayLadder(600).slice(0, 3)).toEqual([30, 60, 90]);
    expect(sameDayLadder(600).at(-1)).toBe(570);
    expect(sameDayLadder(600, 75)).toContain(75);
    // An exact legacy hour time longer than a day is still shown as it is.
    expect(sameDayLadder(600, 3000).at(-1)).toBe(3000);
  });
});

describe("Check your production time", () => {
  it("reads GRIDGO's reminder, and an older GRIDGO's silence as clear", () => {
    expect(
      readProductionTimeReview({
        productionTimeReview: { required: true, reasons: ["legacy_one_working_day"], message: "Check your production time" },
      }),
    ).toEqual({ required: true, reasons: ["legacy_one_working_day"] });
    expect(readProductionTimeReview({})).toEqual({ required: false, reasons: [] });
  });

  it("says why for each reason it knows, and nothing for one it does not, as on the dashboard", () => {
    expect(reviewLines({ required: true, reasons: ["legacy_one_working_day"] })).toEqual([
      "This listing has an older 1-working-day setting. Confirm it, or set the time it really takes.",
    ]);
    expect(reviewLines({ required: true, reasons: ["express_missing_hours"] })).toEqual([
      "This was an Express listing with no production time. Express is now Same day: say how many hours it takes.",
    ]);
    expect(reviewLines({ required: true, reasons: ["something_new"] })).toEqual([]);
  });
});
