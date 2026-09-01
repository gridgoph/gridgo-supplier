import type { Order, SupplierService } from "@/lib/api";
import type { Blackout } from "@/lib/blackouts";
import {
  DEFAULT_WORKING_DAYS,
  calendarPlaceLabel,
  dayDetail,
  dayDiscKind,
  dayDiscLiquid,
  monthGrid,
  monthTally,
  stateFor,
  stateLabel,
} from "@/lib/queueCalendar";

const service = (capacityDaily: number | null): SupplierService =>
  ({ id: "svc", state: "live", capacityDaily, capacityWeekly: null } as unknown as SupplierService);

const job = (promisedDate: string, quantity: number): Order =>
  ({ id: `job_${promisedDate}_${quantity}`, promisedDate, quantity } as unknown as Order);

// A Monday, so the grid's first column is a real Monday and nothing is
// off-by-one in the week maths.
const MARCH = new Date(2026, 2, 9);
const NOW = new Date(2026, 2, 9, 10, 0, 0);

function dayOf(days: ReturnType<typeof monthGrid>, key: string) {
  const found = days.find((day) => day.dayKey === key);
  if (!found) throw new Error(`no cell for ${key}`);
  return found;
}

describe("what makes a day full", () => {
  it("is full at the capacity the shop set, not near it", () => {
    // A shop that said 500 meant 500. Calling 460 full refuses work it can do,
    // and on this platform that means the job goes to another shop.
    expect(stateFor({ closedReason: null, fraction: 0.92, committedUnits: 460 })).toBe("ongoing");
    expect(stateFor({ closedReason: null, fraction: 1, committedUnits: 500 })).toBe("full");
    expect(stateFor({ closedReason: null, fraction: 1.4, committedUnits: 700 })).toBe("full");
  });

  it("is vacant only with nothing on it", () => {
    expect(stateFor({ closedReason: null, fraction: 0, committedUnits: 0 })).toBe("vacant");
  });

  it("says work is on, rather than guessing full, when no limit is set", () => {
    // Without a daily capacity there is no honest full. The day has work on it
    // and that is the whole of what GRIDGO knows.
    expect(stateFor({ closedReason: null, fraction: null, committedUnits: 900 })).toBe("ongoing");
  });

  it("lets closed beat everything", () => {
    // A shut day with work promised on it is still shut, and painting it full
    // would suggest the shop merely has no room.
    expect(stateFor({ closedReason: "Holiday", fraction: 1, committedUnits: 500 })).toBe("closed");
  });
});

describe("the month's grid", () => {
  const grid = (jobs: Order[] = [], capacity: number | null = 500, blackouts: Blackout[] = []) =>
    monthGrid({ month: MARCH, jobs, services: [service(capacity)], blackouts, now: NOW });

  it("is always six rows, so the page does not jump between months", () => {
    expect(grid()).toHaveLength(42);
    expect(monthGrid({ month: new Date(2026, 1, 1), jobs: [], services: [service(null)], now: NOW }))
      .toHaveLength(42);
  });

  it("starts on a Monday and keeps every weekday in its own column", () => {
    // A grid that starts mid-row loses the column its header names, and
    // Wednesday stops meaning Wednesday.
    const days = grid();
    expect(new Date(`${days[0].dayKey}T00:00:00`).getDay()).toBe(1);
    expect(days.filter((_, index) => index % 7 === 6)
      .every((day) => new Date(`${day.dayKey}T00:00:00`).getDay() === 0)).toBe(true);
  });

  it("keeps the neighbouring months' days, drawn as not this month", () => {
    const days = grid();
    expect(days.some((day) => !day.inMonth)).toBe(true);
    expect(days.filter((day) => day.inMonth)).toHaveLength(31);
  });

  it("closes Sunday, because the platform's own default week does", () => {
    expect(dayOf(grid(), "2026-03-15").state).toBe("closed");
    expect(dayOf(grid(), "2026-03-15").closedReason).toBe("Not a working day");
    expect(DEFAULT_WORKING_DAYS[6]).toBe(false);
  });

  it("colours a day from what is promised against the shop's capacity", () => {
    const days = grid([job("2026-03-10", 200), job("2026-03-11", 500), job("2026-03-11", 40)]);
    expect(dayOf(days, "2026-03-10").state).toBe("ongoing");
    expect(dayOf(days, "2026-03-11").state).toBe("full");
    expect(dayOf(days, "2026-03-12").state).toBe("vacant");
    expect(dayOf(days, "2026-03-11").committedUnits).toBe(540);
    expect(dayOf(days, "2026-03-11").jobCount).toBe(2);
  });

  it("lets a shop's own closure beat a day that would otherwise be free", () => {
    const holiday: Blackout = {
      id: "b1", startDay: "2026-03-12", endDay: "2026-03-13",
      reason: "holiday", note: "Town fiesta",
    };
    const days = grid([], 500, [holiday]);
    expect(dayOf(days, "2026-03-12").state).toBe("closed");
    expect(dayOf(days, "2026-03-12").closedReason).toBe("Town fiesta");
    expect(dayOf(days, "2026-03-14").state).toBe("vacant");
  });

  it("knows which day is today and which have gone", () => {
    const days = grid();
    expect(dayOf(days, "2026-03-09").isToday).toBe(true);
    expect(dayOf(days, "2026-03-08").isPast).toBe(true);
    expect(dayOf(days, "2026-03-10").isPast).toBe(false);
  });
});

describe("what a day says when a shop taps it", () => {
  const days = monthGrid({
    month: MARCH,
    jobs: [job("2026-03-10", 420)],
    services: [service(500)],
    now: NOW,
  });

  it("leads with numbers, not adjectives", () => {
    // A shop deciding whether to take a rush job can act on "420 of 500".
    // It cannot act on "quite busy".
    expect(dayDetail(dayOf(days, "2026-03-10"))).toBe("1 job · 420 of 500 units");
  });

  it("says plainly when a day is empty or shut", () => {
    expect(dayDetail(dayOf(days, "2026-03-11"))).toBe("Nothing booked");
    expect(dayDetail(dayOf(days, "2026-03-15"))).toBe("Not a working day");
  });

  it("names the missing limit rather than hiding it", () => {
    // The colour on this day is a guess without a capacity, and setting one is
    // what makes the rest of the calendar mean anything.
    const noLimit = monthGrid({
      month: MARCH, jobs: [job("2026-03-10", 420)], services: [service(null)], now: NOW,
    });
    expect(dayDetail(dayOf(noLimit, "2026-03-10"))).toContain("no daily limit set");
  });
});

describe("how a day is drawn", () => {
  const grid = (jobs: Order[] = [], capacity: number | null = 500, blackouts: Blackout[] = []) =>
    monthGrid({ month: MARCH, jobs, services: [service(capacity)], blackouts, now: NOW });

  it("paints neighbouring months quiet, not as this month's work", () => {
    const outside = grid().find((day) => !day.inMonth);
    if (!outside) throw new Error("expected padding cells");
    expect(dayDiscKind(outside)).toBe("placeholder");
    expect(dayDiscLiquid(outside)).toBeNull();
  });

  it("paints a closed Sunday shut even when it is still ahead", () => {
    expect(dayDiscKind(dayOf(grid(), "2026-03-15"))).toBe("shut");
    expect(dayDiscLiquid(dayOf(grid(), "2026-03-15"))).toBeNull();
  });

  it("paints an empty day that has gone shut, and an empty day still ahead open", () => {
    // Monday 9 March is "now". Friday 6 is past and vacant; Tuesday 10 is free.
    expect(dayDiscKind(dayOf(grid(), "2026-03-06"))).toBe("shut");
    expect(dayDiscKind(dayOf(grid(), "2026-03-10"))).toBe("open");
  });

  it("fills a working day as a liquid from the shop's own load", () => {
    const days = grid([job("2026-03-10", 200)]);
    expect(dayDiscKind(dayOf(days, "2026-03-10"))).toBe("progress");
    expect(dayDiscLiquid(dayOf(days, "2026-03-10"))).toBeCloseTo(0.4);
  });

  it("paints a full day solid, so the cup is not a gauge once it is at the limit", () => {
    const days = grid([job("2026-03-11", 500)]);
    expect(dayDiscKind(dayOf(days, "2026-03-11"))).toBe("full");
    expect(dayDiscLiquid(dayOf(days, "2026-03-11"))).toBeNull();
  });

  it("uses a half-cup when work is on and no limit is set", () => {
    const days = monthGrid({
      month: MARCH, jobs: [job("2026-03-10", 420)], services: [service(null)], now: NOW,
    });
    expect(dayDiscKind(dayOf(days, "2026-03-10"))).toBe("progress");
    expect(dayDiscLiquid(dayOf(days, "2026-03-10"))).toBe(0.5);
  });
});

describe("the masthead place", () => {
  it("uses a short shop place and refuses a street dump or an invented city", () => {
    expect(calendarPlaceLabel("Davao City")).toBe("Davao City");
    expect(calendarPlaceLabel("12 Claveria St, Davao City")).toBe("Davao City");
    expect(calendarPlaceLabel("A very long street address without a city comma")).toBeNull();
    expect(calendarPlaceLabel(null)).toBeNull();
    expect(calendarPlaceLabel("")).toBeNull();
  });
});

describe("reading the month without colour", () => {
  it("gives every state a word", () => {
    // Colour never carries meaning alone, and a grid of dots is the easiest
    // place in the product to break that.
    expect(stateLabel("vacant")).toBe("Open");
    expect(stateLabel("ongoing")).toBe("Work on");
    expect(stateLabel("full")).toBe("Full");
    expect(stateLabel("closed")).toBe("Closed");
  });

  it("counts the month, so the shop gets the shape of it in one line", () => {
    const days = monthGrid({
      month: MARCH,
      jobs: [job("2026-03-10", 500), job("2026-03-11", 100)],
      services: [service(500)],
      now: NOW,
    });
    const tally = monthTally(days);
    expect(tally.full).toBe(1);
    expect(tally.ongoing).toBe(1);
    expect(tally.closed).toBe(5); // five Sundays in March 2026
    expect(tally.vacant + tally.ongoing + tally.full + tally.closed).toBe(31);
  });
});
