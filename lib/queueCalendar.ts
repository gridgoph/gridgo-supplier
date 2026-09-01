/**
 * A month of the shop's own queue, one state per day.
 *
 * The question a shop opens this to answer is "which days am I already spoken
 * for", and until now that lived across three screens: capacity held the
 * numbers, the agenda held the jobs, and closures held the days off. None of
 * them said it in one look.
 *
 * The deciding factor is the platform's own. A day is full when what is
 * promised on it reaches the daily capacity the shop set — the same number
 * `projectFinish` uses to decide whether this shop can make a client's date.
 * So the board a shop reads and the promise a client is given cannot disagree,
 * which they would the moment this screen invented a busyness of its own.
 *
 * Four states, not three. A closed Sunday is not a free Tuesday, and a
 * calendar that paints them alike offers work nobody can take.
 */

import type { Order, SupplierService } from "@/lib/api";
import { blackoutOnDay, blackoutReasonLabel, type Blackout } from "@/lib/blackouts";
import { capacityForDay, loadByDay, shopDailyCapacity } from "@/lib/capacity";
import { addDays, startOfDay, toDayKey } from "@/lib/day";

export type DayState = "vacant" | "ongoing" | "full" | "closed";

export type CalendarDay = {
  dayKey: string;
  /** Day of the month, 1–31. */
  day: number;
  state: DayState;
  /** Null on a day outside this month, which the grid still has to fill. */
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  jobCount: number;
  committedUnits: number;
  capacityUnits: number | null;
  /** 0–1 against the shop's daily capacity, or null when none is set. */
  fraction: number | null;
  /** Why the shop is shut, when it is. */
  closedReason: string | null;
};

/** The days a shop works. Sunday closed is the platform's own default. */
export type WorkingDays = readonly boolean[];

/** Monday through Sunday. Mirrors `defaultShopSchedule()` in gridgo-api. */
export const DEFAULT_WORKING_DAYS: WorkingDays = [true, true, true, true, true, true, false];

/**
 * How full a day has to be before it stops being "ongoing".
 *
 * At capacity, not near it. A shop that set 500 a day meant 500, and calling
 * 460 full would refuse work it can do — which on this platform means losing
 * the job to another shop rather than merely looking wrong.
 */
export function stateFor({
  closedReason,
  fraction,
  committedUnits,
}: {
  closedReason: string | null;
  fraction: number | null;
  committedUnits: number;
}): DayState {
  if (closedReason) return "closed";
  if (!committedUnits) return "vacant";
  // No capacity set: the shop has work on but has never said what full means,
  // so this can only honestly be "something is booked".
  if (fraction == null) return "ongoing";
  return fraction >= 1 ? "full" : "ongoing";
}

/** Sunday-first index from a Date, remapped to a Monday-first week. */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * Every cell of the month's grid, Monday first.
 *
 * Leading and trailing cells belong to the neighbouring months and are drawn
 * quiet rather than omitted: a grid that starts mid-row loses the column a
 * weekday header names, and Wednesday stops meaning Wednesday.
 */
export function monthGrid({
  month,
  jobs,
  services,
  blackouts = [],
  workingDays = DEFAULT_WORKING_DAYS,
  now = new Date(),
}: {
  /** Any date inside the month to draw. */
  month: Date;
  jobs: Order[];
  services: SupplierService[];
  blackouts?: Blackout[];
  workingDays?: WorkingDays;
  now?: Date;
}): CalendarDay[] {
  const capacity = shopDailyCapacity(services);
  const load = loadByDay(jobs);
  const todayKey = toDayKey(now);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = addDays(startOfDay(first), -mondayIndex(first));

  const cells: CalendarDay[] = [];
  // Six rows always. A month that fits in five would otherwise resize the
  // grid between months, and the whole page would jump on every swipe.
  for (let index = 0; index < 42; index += 1) {
    const date = addDays(start, index);
    const dayKey = toDayKey(date);
    const inMonth = date.getMonth() === first.getMonth();

    const blackout = blackoutOnDay(blackouts, dayKey);
    const closedReason = blackout
      ? blackout.note || blackoutReasonLabel(blackout.reason)
      : workingDays[mondayIndex(date)]
        ? null
        : "Not a working day";

    const dayLoad = load.get(dayKey);
    const dayCapacity = capacityForDay(dayLoad, capacity);

    cells.push({
      dayKey,
      day: date.getDate(),
      inMonth,
      isToday: dayKey === todayKey,
      isPast: dayKey < todayKey,
      state: stateFor({
        closedReason,
        fraction: dayCapacity.fraction,
        committedUnits: dayCapacity.committedUnits,
      }),
      jobCount: dayLoad?.jobCount ?? 0,
      committedUnits: dayCapacity.committedUnits,
      capacityUnits: dayCapacity.capacityUnits,
      fraction: dayCapacity.fraction,
      closedReason,
    });
  }
  return cells;
}

/**
 * What a day says when a shop taps it.
 *
 * Numbers before adjectives. "420 of 500 units" is something a shop can act
 * on; "quite busy" is not, and a shop deciding whether to take a rush job
 * needs the first.
 */
export function dayDetail(day: CalendarDay): string {
  if (day.closedReason) return day.closedReason;
  if (!day.jobCount) return "Nothing booked";

  const jobs = `${day.jobCount} ${day.jobCount === 1 ? "job" : "jobs"}`;
  if (day.capacityUnits == null) {
    // Worth saying, because the colour on this day is a guess without it and
    // setting a capacity is what makes the rest of the calendar mean anything.
    return `${jobs} · ${day.committedUnits} units · no daily limit set`;
  }
  return `${jobs} · ${day.committedUnits} of ${day.capacityUnits} units`;
}

/** The word for a state, so the calendar never reads by colour alone. */
export function stateLabel(state: DayState): string {
  switch (state) {
    case "vacant":
      return "Open";
    case "ongoing":
      return "Work on";
    case "full":
      return "Full";
    case "closed":
      return "Closed";
  }
}

/** How many days of this month sit in each state, for the month's summary. */
export function monthTally(days: CalendarDay[]): Record<DayState, number> {
  const tally: Record<DayState, number> = { vacant: 0, ongoing: 0, full: 0, closed: 0 };
  for (const day of days) {
    if (day.inMonth) tally[day.state] += 1;
  }
  return tally;
}

/**
 * How a day is drawn. The four shop states stay the same; this is only the
 * disc the month paints so a shop can read the board in one look.
 *
 * - Neighbouring-month padding → quiet grey
 * - Closed, or an empty day that has already gone → deep red
 * - Work on, not yet at the shop's own limit → yellow liquid
 * - At capacity → solid gold
 * - Open and still ahead → solid white
 */
export type DayDiscKind = "placeholder" | "shut" | "progress" | "full" | "open";

export function dayDiscKind(day: CalendarDay): DayDiscKind {
  if (!day.inMonth) return "placeholder";
  if (day.state === "closed") return "shut";
  if (day.state === "full") return "full";
  if (day.state === "ongoing") return "progress";
  if (day.isPast) return "shut";
  return "open";
}

/**
 * How far the yellow liquid rises on a day that is being worked.
 *
 * Null on every solid disc — those are a colour, not a gauge. A day with work
 * on and no daily limit set gets a fixed half: GRIDGO knows something is
 * booked and honestly cannot say how much.
 */
export function dayDiscLiquid(day: CalendarDay): number | null {
  if (dayDiscKind(day) !== "progress") return null;
  if (day.fraction == null) return 0.5;
  return Math.min(1, Math.max(0, day.fraction));
}

/**
 * A short place name from the shop's own pin, or nothing.
 *
 * The masthead may show the city the shop already gave GRIDGO. It must not
 * invent one, and it must not dump a street address into a caption.
 */
export function calendarPlaceLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const parts = label
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const candidate = parts.length > 1 ? parts[parts.length - 1] : (parts[0] ?? "");
  if (!candidate || candidate.length > 18) return null;
  return candidate;
}
