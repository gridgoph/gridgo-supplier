/**
 * Local-calendar day keys (`YYYY-MM-DD`).
 *
 * A print shop's day is the day it is standing in, not UTC. Every schedule and
 * closure comparison goes through here so a job promised at 8 AM never lands on
 * the previous day because of a timezone offset.
 */

export function toDayKey(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Midnight at the start of the day a key names, in local time. */
export function fromDayKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfDay(value: Date): Date {
  const out = new Date(value);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function addDays(value: Date, days: number): Date {
  const out = new Date(value);
  out.setDate(out.getDate() + days);
  return out;
}

/** Whole local days between two day keys. Negative when `b` is earlier. */
export function daysBetween(a: string, b: string): number | null {
  const from = fromDayKey(a);
  const to = fromDayKey(b);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** Inclusive run of day keys, capped so a typo cannot generate a huge list. */
export function dayKeyRange(startKey: string, endKey: string, max = 366): string[] {
  const start = fromDayKey(startKey);
  const end = fromDayKey(endKey);
  if (!start || !end || end < start) return [];
  const keys: string[] = [];
  for (let cursor = start; cursor <= end && keys.length < max; cursor = addDays(cursor, 1)) {
    keys.push(toDayKey(cursor));
  }
  return keys;
}

/** "Today", "Tomorrow", else "Mon 11 Aug". */
export function dayKeyLabel(key: string, now: Date = new Date()): string {
  const date = fromDayKey(key);
  if (!date) return "No date";
  const diff = daysBetween(toDayKey(now), key);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return date.toLocaleDateString("en-PH", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** "Mon 11 Aug" — always the calendar date, for pairing with a relative label. */
export function dayKeyDateLabel(key: string): string {
  const date = fromDayKey(key);
  if (!date) return "";
  return date.toLocaleDateString("en-PH", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
