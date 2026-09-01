import type { Order } from "@/lib/api";
import { addDays, daysBetween, startOfDay, toDayKey } from "@/lib/day";
import { loadByDay, type DayLoad } from "@/lib/capacity";

/**
 * The working agenda: what is due, what is late, what is next.
 *
 * A print shop reads this standing at a press, so the grouping is one row per
 * calendar day rather than vague buckets. Late work is never hidden further
 * down the list — it is lifted to the top and counted.
 */

export type ScheduleRange = "today" | "week" | "all";

export const SCHEDULE_RANGES: readonly { value: ScheduleRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "7 days" },
  { value: "all", label: "All" },
] as const;

export type ScheduleDay = {
  dayKey: string;
  jobs: Order[];
  load: DayLoad | undefined;
  /** Days from today. Negative in the past. */
  offset: number;
};

export type ScheduleSummary = {
  late: number;
  today: number;
  week: number;
};

export type Schedule = {
  days: ScheduleDay[];
  /** Promised before now and still in the shop's hands. */
  lateJobs: Order[];
  /** Accepted work with no date, which cannot be planned around. */
  undatedJobs: Order[];
  summary: ScheduleSummary;
};

/** Accepted (or later) jobs that the shop has committed to produce. */
export function isAgendaEligible(job: Pick<Order, "state">): boolean {
  const blocked = new Set([
    "draft",
    "submitted",
    "needs_qa",
    "client_correction",
    "proof_approval",
    "approved_for_matching",
    "supplier_assigned",
  ]);
  return !blocked.has(job.state);
}

/** Work that has left the shop is history, not agenda. */
export function isStillInShop(job: Pick<Order, "state">): boolean {
  return ![
    "picked_up",
    "out_for_delivery",
    "awaiting_collection",
    "delivered",
    "issue_window_open",
    "completed",
    "payout_released",
  ].includes(
    job.state,
  );
}

export function buildSchedule(
  jobs: Order[],
  range: ScheduleRange = "week",
  now: Date = new Date(),
): Schedule {
  const eligible = jobs.filter(isAgendaEligible);
  const todayKey = toDayKey(now);
  const load = loadByDay(eligible);

  const dated: Order[] = [];
  const undatedJobs: Order[] = [];
  for (const job of eligible) {
    const when = job.promisedDate || job.deadline;
    const key = when ? toDayKey(when) : "";
    if (!key) undatedJobs.push(job);
    else dated.push(job);
  }

  const lateJobs = dated
    .filter((job) => isStillInShop(job) && whenOf(job) < now.getTime())
    .sort(byWhen);

  const grouped = new Map<string, Order[]>();
  for (const job of dated) {
    const key = toDayKey(job.promisedDate || job.deadline || "");
    const list = grouped.get(key) ?? [];
    list.push(job);
    grouped.set(key, list);
  }

  const horizon = range === "today" ? 0 : range === "week" ? 7 : null;
  const days: ScheduleDay[] = [];

  // Always show every day in the window, even empty ones: an empty Wednesday is
  // information a shop uses when it decides what to accept.
  const windowDays = horizon == null ? 7 : horizon;
  for (let offset = 0; offset <= windowDays; offset += 1) {
    const dayKey = toDayKey(addDays(startOfDay(now), offset));
    days.push({
      dayKey,
      offset,
      jobs: (grouped.get(dayKey) ?? []).sort(byWhen),
      load: load.get(dayKey),
    });
    grouped.delete(dayKey);
  }

  if (horizon == null) {
    // "All" also shows anything beyond the window, in date order.
    const rest = [...grouped.keys()]
      .filter((key) => (daysBetween(todayKey, key) ?? 0) > windowDays)
      .sort();
    for (const dayKey of rest) {
      days.push({
        dayKey,
        offset: daysBetween(todayKey, dayKey) ?? 0,
        jobs: (grouped.get(dayKey) ?? []).sort(byWhen),
        load: load.get(dayKey),
      });
    }
  }

  const dayStart = startOfDay(now).getTime();
  const weekEnd = addDays(startOfDay(now), 8).getTime();
  const summary: ScheduleSummary = {
    late: lateJobs.length,
    today: dated.filter((job) => toDayKey(job.promisedDate || job.deadline || "") === todayKey)
      .length,
    week: dated.filter((job) => {
      const at = whenOf(job);
      return at >= dayStart && at < weekEnd;
    }).length,
  };

  return { days, lateJobs, undatedJobs, summary };
}

function whenOf(job: Order): number {
  const raw = job.promisedDate || job.deadline;
  const at = raw ? new Date(raw).getTime() : Number.NaN;
  return Number.isNaN(at) ? Number.POSITIVE_INFINITY : at;
}

function byWhen(a: Order, b: Order): number {
  return whenOf(a) - whenOf(b);
}
