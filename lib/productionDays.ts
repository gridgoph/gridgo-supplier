/**
 * Production time: hours for same-day work, working days for anything longer
 * (gridgo-api `docs/SUPPLIER_CATALOG_API.md`, "Production time").
 *
 * Shops used to type hours, and GRIDGO counted those hours on the shop's open
 * hours — so "48 hours", meant as two days, became most of a working week.
 * Then a shop said days (gridgo-supplier#122), and the shortest it could say
 * was one whole working day: a job finished in an hour was promised to the
 * client a day later (report 39853344). A shop now picks the unit. A working
 * day is one of its working days on its own open hours (GRIDGO's default is
 * Monday to Saturday, 8 AM to 6 PM); a same-day time is exact minutes of open
 * time, always shorter than one of those days.
 *
 * This is the only place a production time is read off GRIDGO or written back,
 * so the field names live here and nowhere else. GRIDGO sends days for
 * day-based work and exact minutes for everything (`*Minutes`), with hours
 * (`*Hours`) kept for older apps. Days win, because they keep their calendar
 * meaning; minutes are next; a payload with hours only is an older GRIDGO and
 * its hours are read exactly — never rounded up into a day, which is how a
 * quick job came to be promised a day late.
 */

export type ProductionTime =
  | { unit: "days"; days: number }
  | { unit: "hours"; minutes: number };

export const PRODUCTION_DAYS = { min: 1, max: 30 } as const;

/** GRIDGO's default working day, 8 AM to 6 PM, in minutes. */
export const DEFAULT_DAY_MINUTES = 600;

/** The same-day picker moves in half hours; an odd time GRIDGO holds is still shown exactly. */
export const SAME_DAY_STEP_MINUTES = 30;

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

export function workingDays(days: number): ProductionTime {
  return { unit: "days", days };
}

export function sameDay(minutes: number): ProductionTime {
  return { unit: "hours", minutes };
}

/* --------------------------------------------------------------------------
   Reading
   -------------------------------------------------------------------------- */

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function first(raw: Raw, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (raw[key] != null) return raw[key];
  }
  return undefined;
}

/** `turnaround` → turnaroundDays / turnaround_days, and the same for minutes and hours. */
function keysFor(prefix: string, suffix: "Days" | "Minutes" | "Hours"): string[] {
  const snake = `${prefix}${suffix}`.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  return [`${prefix}${suffix}`, snake];
}

/** Days if GRIDGO sent days; otherwise its exact minutes; otherwise an older GRIDGO's hours, exactly. */
function readTime(raw: Raw, prefixes: readonly string[]): ProductionTime | null {
  const days = positive(first(raw, prefixes.flatMap((prefix) => keysFor(prefix, "Days"))));
  if (days != null) return workingDays(Math.max(PRODUCTION_DAYS.min, Math.ceil(days)));
  const minutes = positive(first(raw, prefixes.flatMap((prefix) => keysFor(prefix, "Minutes"))));
  if (minutes != null) return sameDay(Math.round(minutes));
  const hours = positive(first(raw, prefixes.flatMap((prefix) => keysFor(prefix, "Hours"))));
  return hours != null ? sameDay(Math.round(hours * 60)) : null;
}

/** The divisor GRIDGO counts a working day by for this shop. Null when it did not say. */
export function readDayMinutes(raw: Raw): number | null {
  return positive(first(raw, ["productionDayMinutes", "production_day_minutes"]));
}

/** A listing's own window. Both are null while it follows its category line. */
export function readListingTime(raw: Raw): { min: ProductionTime | null; max: ProductionTime | null } {
  return { max: readTime(raw, ["turnaround"]), min: readTime(raw, ["minimumTurnaround"]) };
}

/** A speed the shop sells. */
export function readSpeedTierTime(raw: Raw): ProductionTime | null {
  return readTime(raw, ["turnaround"]);
}

/** A listing starter's default. */
export function readStarterTime(raw: Raw): ProductionTime | null {
  return readTime(raw, ["defaultTurnaround", "turnaround"]);
}

/** A category line's usual time. */
export function readServiceLineTime(raw: Raw): ProductionTime | null {
  return readTime(raw, ["turnaround", "standardTurnaround"]);
}

/* --------------------------------------------------------------------------
   Writing — only the chosen unit's field is sent, as GRIDGO asks
   -------------------------------------------------------------------------- */

/** One duration as GRIDGO takes it. Null clears an optional one. */
export function timeFields<P extends string>(
  prefix: P,
  time: ProductionTime | null,
): Partial<Record<`${P}Days` | `${P}Minutes`, number | null>> {
  const fields: Record<string, number | null> = !time
    ? { [`${prefix}Days`]: null }
    : time.unit === "days"
      ? { [`${prefix}Days`]: time.days }
      : { [`${prefix}Minutes`]: time.minutes };
  return fields as Partial<Record<`${P}Days` | `${P}Minutes`, number | null>>;
}

/** What a listing save sends for its window. Nulls clear it back to the category line. */
export function listingTimeFields(min: ProductionTime | null, max: ProductionTime | null) {
  return { ...timeFields("minimumTurnaround", min), ...timeFields("turnaround", max) };
}

/* --------------------------------------------------------------------------
   Comparing
   -------------------------------------------------------------------------- */

/** How much open time it takes, so a day and an hour can be put in order. */
export function timeMinutes(time: ProductionTime, dayMinutes: number = DEFAULT_DAY_MINUTES): number {
  return time.unit === "days" ? time.days * dayMinutes : time.minutes;
}

/** "d2", "m90": one string per distinct time, for keys and equality. */
export function timeKey(time: ProductionTime | null | undefined): string {
  if (!time) return "-";
  return time.unit === "days" ? `d${time.days}` : `m${time.minutes}`;
}

export function sameTime(left: ProductionTime | null | undefined, right: ProductionTime | null | undefined): boolean {
  return timeKey(left) === timeKey(right);
}

/** The longest same-day time a shop's day allows, on the half hour: 9½ hours on a ten-hour day. */
export function sameDayMaxMinutes(dayMinutes: number = DEFAULT_DAY_MINUTES): number {
  return Math.max(SAME_DAY_STEP_MINUTES, Math.floor((dayMinutes - 1) / SAME_DAY_STEP_MINUTES) * SAME_DAY_STEP_MINUTES);
}

/* --------------------------------------------------------------------------
   Words
   -------------------------------------------------------------------------- */

const FRACTIONS: Record<number, string> = { 15: "¼", 30: "½", 45: "¾" };

/**
 * A time split for a stepper: the figure, and the word beside it. "1½" and
 * "hours"; "2" and "working days"; "45" and "minutes" under an hour.
 */
export function timeParts(time: ProductionTime): { value: string; unit: string } {
  if (time.unit === "days") {
    return { value: String(time.days), unit: time.days === 1 ? "working day" : "working days" };
  }
  const whole = Math.floor(time.minutes / 60);
  const rest = time.minutes % 60;
  if (whole === 0) return { value: String(rest), unit: rest === 1 ? "minute" : "minutes" };
  if (rest === 0) return { value: String(whole), unit: whole === 1 ? "hour" : "hours" };
  if (FRACTIONS[rest]) return { value: `${whole}${FRACTIONS[rest]}`, unit: "hours" };
  return { value: `${whole} h ${rest}`, unit: "min" };
}

/** "1 working day", "3 working days", "1½ hours", "45 minutes". */
export function timeLabel(time: ProductionTime): string {
  const { value, unit } = timeParts(time);
  return `${value} ${unit}`;
}

/** What a client reads on the listing: "Ready in 2–3 working days", "Ready in 1–2 hours". */
export function readyInLine(max: ProductionTime | null, min?: ProductionTime | null): string {
  if (!max) return "Ready-in not set";
  if (!min || sameTime(min, max) || timeMinutes(min) > timeMinutes(max)) {
    return `Ready in ${timeLabel(max)}`;
  }
  const low = timeParts(min);
  const high = timeParts(max);
  // One word for both ends ("1–2 hours"); a range across words says both ("45 minutes to 2 hours").
  if (low.unit.replace(/s$/, "") === high.unit.replace(/s$/, "")) {
    return `Ready in ${low.value}–${high.value} ${high.unit}`;
  }
  return `Ready in ${timeLabel(min)} to ${timeLabel(max)}`;
}

/* --------------------------------------------------------------------------
   The picker
   -------------------------------------------------------------------------- */

/**
 * Every time the picker offers, shortest first: half hours up to the last one
 * inside a working day, then working days. A time GRIDGO holds that is off
 * the steps (75 minutes, from the web) is slotted in where it belongs, so the
 * stepper shows it exactly and moves from it to its neighbours.
 */
export function timeLadder(dayMinutes: number = DEFAULT_DAY_MINUTES, current?: ProductionTime | null): ProductionTime[] {
  const ladder: ProductionTime[] = [];
  for (let minutes = SAME_DAY_STEP_MINUTES; minutes <= sameDayMaxMinutes(dayMinutes); minutes += SAME_DAY_STEP_MINUTES) {
    ladder.push(sameDay(minutes));
  }
  for (let days = PRODUCTION_DAYS.min; days <= PRODUCTION_DAYS.max; days += 1) ladder.push(workingDays(days));
  if (current && !ladder.some((step) => sameTime(step, current))) {
    const at = ladder.findIndex((step) => timeMinutes(step, dayMinutes) > timeMinutes(current, dayMinutes));
    ladder.splice(at < 0 ? ladder.length : at, 0, current);
  }
  return ladder;
}

/** Where a unit switch lands when the shop has not been there yet. */
export const DEFAULT_SAME_DAY = sameDay(60);
export const DEFAULT_WORKING_DAYS = workingDays(2);

/** The soonest and latest, kept in order: a soonest past the latest comes back to it. */
export function clampWindow(
  min: ProductionTime,
  max: ProductionTime,
  dayMinutes: number = DEFAULT_DAY_MINUTES,
): { min: ProductionTime; max: ProductionTime } {
  return timeMinutes(min, dayMinutes) > timeMinutes(max, dayMinutes) ? { min: max, max } : { min, max };
}

function timeProblem(time: ProductionTime, dayMinutes: number): string | null {
  if (time.unit === "days") {
    if (!Number.isInteger(time.days) || time.days < PRODUCTION_DAYS.min) return "Production time is at least 1 working day.";
    if (time.days > PRODUCTION_DAYS.max) return `Production time is at most ${PRODUCTION_DAYS.max} working days.`;
    return null;
  }
  if (!Number.isInteger(time.minutes) || time.minutes <= 0) return "Choose how many hours this takes.";
  if (time.minutes >= dayMinutes) {
    return `Hours are for work done inside one working day (under ${timeLabel(sameDay(dayMinutes))}). Use working days for anything longer.`;
  }
  return null;
}

/** Why a window cannot be saved, in the shop's words. Null when it can. */
export function windowProblem(
  min: ProductionTime | null,
  max: ProductionTime | null,
  dayMinutes: number = DEFAULT_DAY_MINUTES,
): string | null {
  if (!max) return "Set how long this takes.";
  const problem = timeProblem(max, dayMinutes) ?? (min ? timeProblem(min, dayMinutes) : null);
  if (problem) return problem;
  if (min && timeMinutes(min, dayMinutes) > timeMinutes(max, dayMinutes)) {
    return "The soonest can't be later than the latest.";
  }
  return null;
}

/** Why one time (a speed, a category line's usual time) cannot be saved. Null when it can. */
export function singleTimeProblem(time: ProductionTime, dayMinutes: number = DEFAULT_DAY_MINUTES): string | null {
  return timeProblem(time, dayMinutes);
}

/* --------------------------------------------------------------------------
   The ready-date example
   -------------------------------------------------------------------------- */

/**
 * When a job that starts at `from` is ready, counted on GRIDGO's default open
 * hours: a working day is a full day of the shop's open time, so a job started
 * Tuesday at 11 AM with two days is ready Thursday at 11 AM, an hour's job
 * started at 5:30 PM is ready at 8:30 the next morning, and Sunday does not
 * count. An example for the shop, not a promise — GRIDGO's own date also weighs
 * the shop's real hours, closures and the jobs already ahead.
 */
export function readyAfter(time: ProductionTime, from: Date): Date {
  let remaining = timeMinutes(time, DEFAULT_DAY_MINUTES);
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

/** "3:30 PM" on the shop's wall clock. */
function shopClockLabel(at: Date): string {
  const wall = new Date(at.getTime() + MANILA_OFFSET_MINUTES * MINUTE_MS);
  const hours = wall.getUTCHours();
  const minutes = String(wall.getUTCMinutes()).padStart(2, "0");
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

/** "Thu 9 Oct, 3:30 PM": a same-day time needs the hour, or it says nothing. */
export function shopDateTimeLabel(at: Date): string {
  return `${shopDateLabel(at)}, ${shopClockLabel(at)}`;
}

/** "A job that starts now is ready by Thu 9 Oct", or between two times. */
export function readyExampleLine(min: ProductionTime, max: ProductionTime, now: Date): string {
  const soonest = readyAfter(min, now);
  const latest = readyAfter(max, now);
  if (min.unit === "days" && max.unit === "days") {
    const [from, to] = [shopDateLabel(soonest), shopDateLabel(latest)];
    return from === to
      ? `A job that starts now is ready by ${to}.`
      : `A job that starts now is ready between ${from} and ${to}.`;
  }
  if (soonest.getTime() === latest.getTime()) return `A job that starts now is ready by ${shopDateTimeLabel(latest)}.`;
  // One day for both ends: say it once.
  if (shopDateLabel(soonest) === shopDateLabel(latest)) {
    return `A job that starts now is ready between ${shopClockLabel(soonest)} and ${shopClockLabel(latest)} on ${shopDateLabel(latest)}.`;
  }
  return `A job that starts now is ready between ${shopDateTimeLabel(soonest)} and ${shopDateTimeLabel(latest)}.`;
}
