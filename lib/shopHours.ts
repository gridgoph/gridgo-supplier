import { dayKeyDateLabel } from "@/lib/day";

/**
 * The shop's hours: when it opens, the dates it is shut, closing for a while,
 * and staying open later today (gridgo-api `docs/SHOP_HOURS_API.md`).
 *
 * GRIDGO counts a job's hour to answer, its production time and its lateness on
 * these hours, so this is the one place that reads `GET /me/shop-hours` and
 * builds every `PATCH`. Three rules shape the screens:
 *
 * - **Every open day has the same hours.** GRIDGO refuses open days of
 *   different lengths for now (a short Saturday is a later decision), so the
 *   editor is one set of days and one opening and closing time.
 * - **Saving the week or the closure dates replaces the base schedule**, and
 *   that clears today's extension. A save keeps it by sending it again when
 *   GRIDGO would still accept it, and says so when it cannot.
 * - **The clock is Manila's.** GRIDGO fixes the shop to UTC+08:00, so "today"
 *   and "now" are read at that offset, never from the phone's own zone.
 */

export const MANILA_OFFSET_MINUTES = 480;
/** The inbox row GRIDGO writes when the shop's hours change; it opens Shop hours. */
export const SHOP_HOURS_NOTICE = "supplier_hours_updated";
export const SHOP_HOURS_ROUTE = "/shop-hours";
const MINUTE = 60_000;
const DAY_MINUTES = 1440;
/** The latest close GRIDGO accepts for an extension: 11:59 PM. */
export const LAST_EXTENSION_MINUTE = 1439;
/** An extension must end at least this long after it is declared. */
export const EXTENSION_LEAD_MINUTES = 30;
/** GRIDGO's limits on closure dates. */
export const MAX_CLOSURE_RANGES = 100;
export const MAX_CLOSED_DAYS = 90;

export type WeekWindow = { weekday: number; opensMinute: number; closesMinute: number };
/** Inclusive Manila calendar dates, `YYYY-MM-DD`. */
export type Closure = { startDay: string; endDay: string };
export type Extension = { day: string; opensMinute: number; closesMinute: number };

export type ShopHours = {
  /** Shared with `/me/supplier-profile`; a stale one is refused. */
  version: number;
  week: WeekWindow[];
  closures: Closure[];
  temporarilyClosed: boolean;
  isOpenNow: boolean;
  /** False when GRIDGO holds an older calendar it cannot schedule against. */
  calendarAvailable: boolean;
  nextOpeningAt: string | null;
  todayExtension: Extension | null;
  /** Today's extension runs past GRIDGO's review and dispatch hours. */
  dispatchWaits: boolean;
};

/** Weekday numbers as GRIDGO sends them (0 is Sunday), in the order a shop reads a week. */
export const WEEKDAYS: readonly { weekday: number; short: string; long: string }[] = [
  { weekday: 1, short: "Mon", long: "Monday" },
  { weekday: 2, short: "Tue", long: "Tuesday" },
  { weekday: 3, short: "Wed", long: "Wednesday" },
  { weekday: 4, short: "Thu", long: "Thursday" },
  { weekday: 5, short: "Fri", long: "Friday" },
  { weekday: 6, short: "Sat", long: "Saturday" },
  { weekday: 0, short: "Sun", long: "Sunday" },
];

/* ------------------------------------------------------------------ reading */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function minuteOf(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= DAY_MINUTES
    ? (value as number)
    : null;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function windowOf(raw: unknown): WeekWindow | null {
  if (!isRecord(raw)) return null;
  const weekday = raw.weekday;
  const opensMinute = minuteOf(raw.opensMinute);
  const closesMinute = minuteOf(raw.closesMinute);
  if (!Number.isInteger(weekday) || (weekday as number) < 0 || (weekday as number) > 6) return null;
  if (opensMinute == null || closesMinute == null || closesMinute <= opensMinute) return null;
  return { weekday: weekday as number, opensMinute, closesMinute };
}

function closureOf(raw: unknown): Closure | null {
  if (!isRecord(raw)) return null;
  const { startDay, endDay } = raw;
  if (typeof startDay !== "string" || typeof endDay !== "string") return null;
  if (!DAY_KEY.test(startDay) || !DAY_KEY.test(endDay) || endDay < startDay) return null;
  return { startDay, endDay };
}

function extensionOf(raw: unknown): Extension | null {
  if (!isRecord(raw) || typeof raw.day !== "string" || !DAY_KEY.test(raw.day)) return null;
  const opensMinute = minuteOf(raw.opensMinute);
  const closesMinute = minuteOf(raw.closesMinute);
  if (opensMinute == null || closesMinute == null) return null;
  return { day: raw.day, opensMinute, closesMinute };
}

/** `{ hours }` from GRIDGO, read defensively. Null when it is not a shop-hours answer at all. */
export function normalizeShopHours(raw: unknown): ShopHours | null {
  const hours = isRecord(raw) && isRecord(raw.hours) ? raw.hours : null;
  if (!hours) return null;
  const schedule = isRecord(hours.schedule) ? hours.schedule : {};
  const week = (Array.isArray(schedule.week) ? schedule.week : [])
    .map(windowOf)
    .filter((row): row is WeekWindow => row !== null);
  const closures = (Array.isArray(schedule.closures) ? schedule.closures : [])
    .map(closureOf)
    .filter((row): row is Closure => row !== null)
    .sort(byStart);
  return {
    version: Number.isInteger(hours.version) ? (hours.version as number) : 1,
    week,
    closures,
    temporarilyClosed: hours.temporarilyClosed === true,
    isOpenNow: hours.isOpenNow === true,
    calendarAvailable: hours.calendarAvailable !== false,
    nextOpeningAt: typeof hours.nextOpeningAt === "string" ? hours.nextOpeningAt : null,
    todayExtension: extensionOf(hours.todayExtension),
    dispatchWaits: hours.dispatchNotice === "review_and_dispatch_in_next_working_window",
  };
}

const byStart = (a: Closure, b: Closure) =>
  a.startDay.localeCompare(b.startDay) || a.endDay.localeCompare(b.endDay);

/* -------------------------------------------------------------- Manila clock */

export type ManilaClock = {
  /** Today's Manila date. */
  dayKey: string;
  /** 0 is Sunday, as GRIDGO numbers them. */
  weekday: number;
  /** Minutes since Manila midnight, with the seconds kept as a fraction. */
  minute: number;
};

export function manilaClock(at: Date): ManilaClock {
  const shifted = new Date(at.getTime() + MANILA_OFFSET_MINUTES * MINUTE);
  const dayKey = shifted.toISOString().slice(0, 10);
  const midnight = Date.parse(`${dayKey}T00:00:00Z`);
  return { dayKey, weekday: shifted.getUTCDay(), minute: (shifted.getTime() - midnight) / MINUTE };
}

function addDayKeys(dayKey: string, days: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + days * DAY_MINUTES * MINUTE)
    .toISOString()
    .slice(0, 10);
}

/** "8:00 AM", "12:00 PM" for noon, "11:59 PM". */
export function timeLabel(minute: number): string {
  const whole = Math.round(minute) % DAY_MINUTES;
  const hour = Math.floor(whole / 60);
  const rest = whole % 60;
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(rest).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

/** "9 hours", "9½ hours", "8 hours 15 minutes". */
export function dayLengthLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  if (rest === 30) return `${hours}½ hours`;
  if (hours === 0) return `${rest} minutes`;
  return `${hours} ${hours === 1 ? "hour" : "hours"} ${rest} minutes`;
}

/* ------------------------------------------------------------- weekly hours */

export type WeekDraft = {
  /** Open weekdays, GRIDGO numbering. */
  days: number[];
  opensMinute: number;
  closesMinute: number;
};

export const DEFAULT_WEEK_DRAFT: WeekDraft = {
  days: [1, 2, 3, 4, 5, 6],
  opensMinute: 8 * 60,
  closesMinute: 18 * 60,
};

/**
 * The editor's starting point: the days GRIDGO has open, at the hours most of
 * them keep. `uneven` says the saved week did not fit one shared time — older
 * hours, or hours set by GRIDGO Team — so the screen can say a save evens it.
 */
export function weekDraftOf(week: WeekWindow[]): { draft: WeekDraft; uneven: boolean } {
  if (!week.length) return { draft: DEFAULT_WEEK_DRAFT, uneven: false };
  const counts = new Map<string, { row: WeekWindow; count: number }>();
  for (const row of week) {
    const key = `${row.opensMinute}-${row.closesMinute}`;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { row, count: 1 });
  }
  const common = [...counts.values()].sort((a, b) => b.count - a.count)[0].row;
  const days = [...new Set(week.map((row) => row.weekday))].sort((a, b) => a - b);
  return {
    draft: { days, opensMinute: common.opensMinute, closesMinute: common.closesMinute },
    uneven: counts.size > 1 || days.length !== week.length,
  };
}

export function weekFromDraft(draft: WeekDraft): WeekWindow[] {
  return [...draft.days]
    .sort((a, b) => a - b)
    .map((weekday) => ({ weekday, opensMinute: draft.opensMinute, closesMinute: draft.closesMinute }));
}

export function weekDraftChanged(week: WeekWindow[], draft: WeekDraft): boolean {
  const saved = weekFromDraft(weekDraftOf(week).draft);
  const next = weekFromDraft(draft);
  return weekDraftOf(week).uneven || JSON.stringify(saved) !== JSON.stringify(next);
}

export function validateWeekDraft(draft: WeekDraft): string | null {
  if (!draft.days.length) return "Pick at least one day your shop opens.";
  if (draft.closesMinute <= draft.opensMinute) return "Pick a closing time later than the opening time.";
  return null;
}

/** "Mon–Sat", "Every day", "Mon, Wed, Fri", "Closed every day". */
export function openDaysLabel(days: number[]): string {
  const open = WEEKDAYS.filter((day) => days.includes(day.weekday));
  if (!open.length) return "No open days";
  if (open.length === 7) return "Every day";
  const runs: string[][] = [];
  let index = -2;
  for (const day of open) {
    const at = WEEKDAYS.indexOf(day);
    if (at === index + 1) runs[runs.length - 1].push(day.short);
    else runs.push([day.short]);
    index = at;
  }
  return runs
    .map((run) => (run.length > 2 ? `${run[0]}–${run[run.length - 1]}` : run.join(", ")))
    .join(", ");
}

/** Half-hour choices across a day, keeping an odd time GRIDGO already holds. */
export function timeChoices(keep?: number): number[] {
  const choices: number[] = [];
  for (let minute = 0; minute < DAY_MINUTES; minute += 30) choices.push(minute);
  if (keep != null && keep < DAY_MINUTES && !choices.includes(keep)) choices.push(keep);
  return choices.sort((a, b) => a - b);
}

/* ------------------------------------------------------------ closure dates */

function dayCount(closure: Closure): number {
  return Math.round((Date.parse(closure.endDay) - Date.parse(closure.startDay)) / (DAY_MINUTES * MINUTE)) + 1;
}

/** Distinct closed dates across every range — GRIDGO's 90-day budget. */
export function closedDayCount(closures: Closure[]): number {
  const days = new Set<string>();
  for (const closure of closures) {
    for (let index = 0; index < dayCount(closure); index += 1) days.add(addDayKeys(closure.startDay, index));
  }
  return days.size;
}

export function sameClosure(a: Closure, b: Closure): boolean {
  return a.startDay === b.startDay && a.endDay === b.endDay;
}

/** Why this closure cannot be saved, naming the fix. Null when GRIDGO should take it. */
export function validateClosure(
  candidate: Closure,
  closures: Closure[],
  replacing: Closure | null = null,
): string | null {
  if (!DAY_KEY.test(candidate.startDay) || !DAY_KEY.test(candidate.endDay)) {
    return "Pick a first and a last closed date.";
  }
  if (candidate.endDay < candidate.startDay) {
    return "The last closed date is before the first. Move it later.";
  }
  const others = closures.filter((closure) => !(replacing && sameClosure(closure, replacing)));
  const clash = others.find(
    (closure) => closure.startDay <= candidate.endDay && candidate.startDay <= closure.endDay,
  );
  if (clash) {
    return `This overlaps your closure on ${closureLabel(clash)}. Change that one instead.`;
  }
  if (others.length + 1 > MAX_CLOSURE_RANGES) {
    return `GRIDGO keeps up to ${MAX_CLOSURE_RANGES} closures. Remove a past one first.`;
  }
  if (closedDayCount([...others, candidate]) > MAX_CLOSED_DAYS) {
    return `Closures can cover ${MAX_CLOSED_DAYS} dates in total. Remove or shorten one first.`;
  }
  return null;
}

export function withClosure(closures: Closure[], next: Closure, replacing: Closure | null = null): Closure[] {
  return [...closures.filter((closure) => !(replacing && sameClosure(closure, replacing))), next].sort(byStart);
}

export function withoutClosure(closures: Closure[], gone: Closure): Closure[] {
  return closures.filter((closure) => !sameClosure(closure, gone));
}

/** The closure covering a Manila date, or null. */
export function closureOnDay(closures: Closure[], dayKey: string): Closure | null {
  return closures.find((closure) => closure.startDay <= dayKey && dayKey <= closure.endDay) ?? null;
}

/** "Thu 24 Dec" for one day, "Thu 24 Dec – Sat 26 Dec" for a run. */
export function closureLabel(closure: Closure): string {
  if (closure.startDay === closure.endDay) return dayKeyDateLabel(closure.startDay);
  return `${dayKeyDateLabel(closure.startDay)} – ${dayKeyDateLabel(closure.endDay)}`;
}

/** "1 day", "3 days". */
export function closureLengthLabel(closure: Closure): string {
  const days = dayCount(closure);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** Monday-first open flags for the schedule calendar. */
export function openWeekdaysMondayFirst(week: WeekWindow[]): boolean[] {
  return WEEKDAYS.map((day) => week.some((row) => row.weekday === day.weekday));
}

/* --------------------------------------------------------------- open status */

export type ShopStatus = {
  state: "open" | "closed" | "temporarily_closed" | "unreadable";
  title: string;
  detail: string;
};

function todayWindow(hours: ShopHours, clock: ManilaClock): WeekWindow | null {
  return hours.week.find((row) => row.weekday === clock.weekday) ?? null;
}

/** "today at 8:00 AM", "tomorrow at 8:00 AM", "Mon 19 Oct at 8:00 AM". */
export function openingLabel(iso: string, now: Date): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const when = manilaClock(at);
  const today = manilaClock(now).dayKey;
  const day =
    when.dayKey === today
      ? "today"
      : when.dayKey === addDayKeys(today, 1)
        ? "tomorrow"
        : dayKeyDateLabel(when.dayKey);
  return `${day} at ${timeLabel(Math.floor(when.minute))}`;
}

/** Open now, closed now, or closed for a while — and what happens next. */
export function shopStatus(hours: ShopHours, now: Date): ShopStatus {
  if (hours.temporarilyClosed) {
    return {
      state: "temporarily_closed",
      title: "Temporarily closed",
      detail: "No reopening date is set. You reopen when you switch this off.",
    };
  }
  if (!hours.calendarAvailable) {
    return {
      state: "unreadable",
      title: "Hours need setting",
      detail: "GRIDGO cannot read the hours saved for your shop. Set your open days and times below.",
    };
  }
  const clock = manilaClock(now);
  if (hours.isOpenNow) {
    const extension = hours.todayExtension?.day === clock.dayKey ? hours.todayExtension : null;
    const close = extension?.closesMinute ?? todayWindow(hours, clock)?.closesMinute;
    return {
      state: "open",
      title: "Open now",
      detail: close != null
        ? `Until ${timeLabel(close)} today${extension ? ", with your extension" : ""}.`
        : "Open on your usual hours.",
    };
  }
  const next = hours.nextOpeningAt ? openingLabel(hours.nextOpeningAt, now) : null;
  const closureToday = closureOnDay(hours.closures, clock.dayKey) ? "Today is a closure date. " : "";
  return {
    state: "closed",
    title: "Closed now",
    detail: `${closureToday}${next ? `Opens ${next}.` : "No opening is set in the coming year. Add open days below."}`,
  };
}

/** One line for the Account row. */
export function shopHoursSummary(hours: ShopHours, now: Date): string {
  const status = shopStatus(hours, now);
  if (status.state === "temporarily_closed") return "Temporarily closed";
  if (status.state === "unreadable") return "Set your open days and times";
  const { draft } = weekDraftOf(hours.week);
  const week = `${openDaysLabel(draft.days)}, ${timeLabel(draft.opensMinute)}–${timeLabel(draft.closesMinute)}`;
  return `${status.title} · ${week}`;
}

/* ---------------------------------------------------------- today's extension */

export type ExtensionState =
  | { kind: "unavailable"; reason: string }
  | { kind: "available"; normalClose: number; choices: number[]; current: Extension | null };

/**
 * Whether today can run later, and to which times — GRIDGO's own rules: an open
 * day without a closure date, a shop that is not closed for a while, a close
 * later than the usual one, before midnight, and at least 30 minutes away.
 */
export function extensionState(hours: ShopHours, now: Date): ExtensionState {
  if (hours.temporarilyClosed) {
    return { kind: "unavailable", reason: "Reopen your shop first. A temporarily closed shop cannot extend its hours." };
  }
  const clock = manilaClock(now);
  const row = todayWindow(hours, clock);
  if (!row) {
    return { kind: "unavailable", reason: "Today is not one of your open days. You can extend only a day you open." };
  }
  if (closureOnDay(hours.closures, clock.dayKey)) {
    return { kind: "unavailable", reason: "Today is one of your closure dates. Remove it first if you are opening after all." };
  }
  const earliest = Math.max(row.closesMinute + 30, Math.ceil((clock.minute + EXTENSION_LEAD_MINUTES) / 30) * 30);
  const choices: number[] = [];
  for (let minute = earliest; minute < DAY_MINUTES; minute += 30) choices.push(minute);
  if (clock.minute + EXTENSION_LEAD_MINUTES <= LAST_EXTENSION_MINUTE && row.closesMinute < LAST_EXTENSION_MINUTE) {
    choices.push(LAST_EXTENSION_MINUTE);
  }
  const current = hours.todayExtension?.day === clock.dayKey ? hours.todayExtension : null;
  const usable = [...new Set(choices)].filter((minute) => minute > row.closesMinute).sort((a, b) => a - b);
  if (!usable.length && !current) {
    return {
      kind: "unavailable",
      reason: "It is too late to extend today. The new closing time has to be at least 30 minutes away and before midnight.",
    };
  }
  return { kind: "available", normalClose: row.closesMinute, choices: usable, current };
}

/** GRIDGO would still accept this close as today's extension, from `now`. */
export function extensionStillValid(closesMinute: number, now: Date): boolean {
  return closesMinute <= LAST_EXTENSION_MINUTE && closesMinute - manilaClock(now).minute >= EXTENSION_LEAD_MINUTES;
}

/**
 * Whether an extension to this time runs past GRIDGO's own hours today, from
 * the platform's operating hours in `GET /settings`. Null when they are not
 * known; GRIDGO's own `dispatchNotice` is the answer once it is saved.
 */
export function extensionPastGridgoHours(closesMinute: number, operatingWeek: WeekWindow[] | null, now: Date): boolean | null {
  if (!operatingWeek) return null;
  const clock = manilaClock(now);
  const rows = operatingWeek.filter((row) => row.weekday === clock.weekday);
  if (!rows.length) return true;
  const closes = Math.max(...rows.map((row) => row.closesMinute));
  return closesMinute > closes || clock.minute >= closes;
}

/** `settings.operatingHours.schedule.week`, read defensively. */
export function operatingWeekOf(settings: unknown): WeekWindow[] | null {
  if (!isRecord(settings) || !isRecord(settings.operatingHours)) return null;
  const schedule = settings.operatingHours.schedule;
  if (!isRecord(schedule) || !Array.isArray(schedule.week)) return null;
  return schedule.week.map(windowOf).filter((row): row is WeekWindow => row !== null);
}

/** What the shop reads when an extension runs past GRIDGO's hours. */
export const DISPATCH_WAITS_COPY =
  "This runs past GRIDGO's review and delivery hours. Work you finish after they close is reviewed and dispatched in the next working window.";

/* ------------------------------------------------------------------- writes */

export type ShopHoursPatch = {
  schedule?: { utcOffsetMinutes: number; week: WeekWindow[]; closures: Closure[] };
  temporarilyClosed?: boolean;
  extension?: { closesMinute: number } | null;
};

/**
 * A new base schedule — the week, the closure dates, or both. GRIDGO clears
 * today's extension on any base change, so it is sent again when it would
 * still be accepted. `dropsExtension` tells the caller to say so first.
 */
export function schedulePatch(
  hours: ShopHours,
  change: { week?: WeekWindow[]; closures?: Closure[] },
  now: Date,
): { patch: ShopHoursPatch; dropsExtension: boolean } {
  const week = change.week ?? hours.week;
  const closures = change.closures ?? hours.closures;
  const patch: ShopHoursPatch = {
    schedule: { utcOffsetMinutes: MANILA_OFFSET_MINUTES, week, closures },
  };
  const clock = manilaClock(now);
  const extension = hours.todayExtension?.day === clock.dayKey ? hours.todayExtension : null;
  if (!extension) return { patch, dropsExtension: false };
  const row = week.find((window) => window.weekday === clock.weekday);
  const keeps =
    !hours.temporarilyClosed &&
    row != null &&
    extension.closesMinute > row.closesMinute &&
    !closureOnDay(closures, clock.dayKey) &&
    extensionStillValid(extension.closesMinute, now);
  if (keeps) patch.extension = { closesMinute: extension.closesMinute };
  return { patch, dropsExtension: !keeps };
}
