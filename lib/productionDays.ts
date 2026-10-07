/**
 * Production time, in working days (gridgoph/gridgo-supplier#122).
 *
 * Shops used to type hours, and GRIDGO counted those hours on the shop's open
 * hours — so "48 hours", meant as two days, became most of a working week. A
 * shop now says days, and one day is one of its working days on its own open
 * hours (GRIDGO's default is Monday to Saturday, 8 AM to 6 PM).
 *
 * This is the only place a production time is read off GRIDGO or written back,
 * so the field names live here and nowhere else. A payload that still carries
 * only hours is an older GRIDGO: it is read the way GRIDGO's own migration
 * converts it — divided by a working day and rounded **up** — so a phone never
 * shows a listing as quicker than the date a client is promised.
 */

export const PRODUCTION_DAYS = { min: 1, max: 30 } as const;

/** GRIDGO's default working day, 8 AM to 6 PM. What an old hour figure is divided by. */
export const DEFAULT_WORKDAY_HOURS = 10;

/** Monday to Saturday, as `Date#getUTCDay` numbers them on the shop's wall clock. */
const DEFAULT_WORKDAYS = [1, 2, 3, 4, 5, 6];
const OPENS_MINUTE = 8 * 60;
const CLOSES_MINUTE = 18 * 60;
/** The Philippines keeps one offset all year, and GRIDGO stores it the same way. */
const MANILA_OFFSET_MINUTES = 8 * 60;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Raw = Record<string, unknown>;

/** A whole number of working days, never below one. Null when nothing usable was sent. */
export function wholeDays(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.max(PRODUCTION_DAYS.min, Math.ceil(value));
}

/**
 * An older GRIDGO's hours, as the days the migration turns them into: divided
 * by the shop's working day (`productionDayMinutes` when GRIDGO sends it, else
 * its default ten hours) and rounded up.
 */
export function daysFromHours(hours: unknown, dayMinutes?: unknown): number | null {
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0) return null;
  const dayHours =
    typeof dayMinutes === "number" && Number.isFinite(dayMinutes) && dayMinutes > 0
      ? dayMinutes / 60
      : DEFAULT_WORKDAY_HOURS;
  return Math.max(PRODUCTION_DAYS.min, Math.ceil(hours / dayHours));
}

function first(raw: Raw, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (raw[key] != null) return raw[key];
  }
  return undefined;
}

/** Days if GRIDGO sent days; otherwise its hours, converted. */
function readDays(raw: Raw, dayKeys: readonly string[], hourKeys: readonly string[]): number | null {
  const days = wholeDays(first(raw, dayKeys));
  if (days != null) return days;
  return daysFromHours(first(raw, hourKeys), first(raw, ["productionDayMinutes", "production_day_minutes"]));
}

/** A listing's own window. Both are null while it follows its category line. */
export function readListingDays(raw: Raw): { minDays: number | null; maxDays: number | null } {
  return {
    maxDays: readDays(raw, ["turnaroundDays", "turnaround_days"], ["turnaroundHours", "turnaround_hours"]),
    minDays: readDays(
      raw,
      ["minimumTurnaroundDays", "minimum_turnaround_days"],
      ["minimumTurnaroundHours", "minimum_turnaround_hours"],
    ),
  };
}

/** A speed the shop sells, a listing starter's default, or a category line's usual time. */
export function readSpeedTierDays(raw: Raw): number | null {
  return readDays(raw, ["turnaroundDays", "turnaround_days"], ["turnaroundHours", "turnaround_hours"]);
}

export function readStarterDays(raw: Raw): number | null {
  return readDays(
    raw,
    ["defaultTurnaroundDays", "default_turnaround_days", "turnaroundDays"],
    ["defaultTurnaroundHours", "default_turnaround_hours", "turnaroundHours"],
  );
}

export function readServiceLineDays(raw: Raw): number | null {
  return readDays(
    raw,
    ["turnaroundDays", "standardTurnaroundDays", "turnaround_days"],
    ["turnaroundHours", "standardTurnaroundHours", "turnaround_hours"],
  );
}

/** What a listing save sends for its window. Null clears it back to the category line. */
export function listingDaysFields(minDays: number | null, maxDays: number | null) {
  return { minimumTurnaroundDays: minDays, turnaroundDays: maxDays };
}

/** What a speed tier is sent as. */
export function speedTierDaysField(days: number) {
  return { turnaroundDays: days };
}

/** "1 working day", "3 working days". */
export function workingDaysLabel(days: number): string {
  return days === 1 ? "1 working day" : `${days} working days`;
}

/** What a client reads on the listing: "Ready in 2–3 working days". */
export function readyInLine(maxDays: number | null, minDays?: number | null): string {
  if (maxDays == null || maxDays <= 0) return "Ready-in not set";
  if (minDays != null && minDays > 0 && minDays < maxDays) {
    return `Ready in ${minDays}–${maxDays} working days`;
  }
  return `Ready in ${workingDaysLabel(maxDays)}`;
}

/** The soonest and latest, kept in order and inside the bounds. */
export function clampWindow(minDays: number, maxDays: number): { minDays: number; maxDays: number } {
  const clamp = (value: number) =>
    Math.min(PRODUCTION_DAYS.max, Math.max(PRODUCTION_DAYS.min, Math.round(value)));
  const soonest = clamp(Math.min(minDays, maxDays));
  return { minDays: soonest, maxDays: Math.max(soonest, clamp(maxDays)) };
}

/** Why a window cannot be saved, in the shop's words. Null when it can. */
export function windowProblem(minDays: number | null, maxDays: number | null): string | null {
  if (maxDays == null) return "Set how many working days this takes.";
  if (!Number.isInteger(maxDays) || maxDays < PRODUCTION_DAYS.min) {
    return "Production time is at least 1 working day.";
  }
  if (maxDays > PRODUCTION_DAYS.max) {
    return `Production time is at most ${PRODUCTION_DAYS.max} working days.`;
  }
  if (minDays != null && (!Number.isInteger(minDays) || minDays < PRODUCTION_DAYS.min)) {
    return "Production time is at least 1 working day.";
  }
  if (minDays != null && minDays > maxDays) {
    return "The soonest can't be later than the latest.";
  }
  return null;
}

/**
 * When a job that starts at `from` is ready, counted on GRIDGO's default open
 * hours: each day is one full working day of the shop's time, so a job started
 * Tuesday at 11 AM with two days is ready Thursday at 11 AM, and Sunday does
 * not count. An example for the shop, not a promise — GRIDGO's own date also
 * weighs the shop's real hours, closures and the jobs already ahead.
 */
export function readyAfter(days: number, from: Date): Date {
  let remaining = days * DEFAULT_WORKDAY_HOURS * 60;
  const offsetMs = MANILA_OFFSET_MINUTES * MINUTE_MS;
  const wall = from.getTime() + offsetMs;
  let dayStart = Math.floor(wall / DAY_MS) * DAY_MS;
  let cursor = Math.floor((wall - dayStart) / MINUTE_MS);

  for (let step = 0; step < 366; step += 1) {
    const weekday = new Date(dayStart).getUTCDay();
    if (DEFAULT_WORKDAYS.includes(weekday)) {
      const opens = Math.max(OPENS_MINUTE, cursor);
      if (opens < CLOSES_MINUTE) {
        const available = CLOSES_MINUTE - opens;
        if (remaining <= available) {
          return new Date(dayStart + (opens + remaining) * MINUTE_MS - offsetMs);
        }
        remaining -= available;
      }
    }
    dayStart += DAY_MS;
    cursor = 0;
  }
  return new Date(dayStart - offsetMs);
}

/** "Thu 9 Oct", on the shop's own calendar. */
export function shopDateLabel(at: Date): string {
  const wall = new Date(at.getTime() + MANILA_OFFSET_MINUTES * MINUTE_MS);
  return `${WEEKDAYS[wall.getUTCDay()]} ${wall.getUTCDate()} ${MONTHS[wall.getUTCMonth()]}`;
}

/** "A job that starts now is ready by Thu 9 Oct", or between two dates. */
export function readyExampleLine(minDays: number, maxDays: number, now: Date): string {
  const soonest = shopDateLabel(readyAfter(minDays, now));
  const latest = shopDateLabel(readyAfter(maxDays, now));
  return soonest === latest
    ? `A job that starts now is ready by ${latest}.`
    : `A job that starts now is ready between ${soonest} and ${latest}.`;
}
