import type { Href } from "expo-router";

import type { Notification } from "@/lib/api";
import { formatDeadlineFull } from "@/lib/dates";
import { formatLateness, tierDefinition, type LapseTier } from "@/lib/productionLapse";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";

/**
 * The shop's performance, as far as it is the shop's business (gridgo-api
 * `docs/SUPPLIER_PERFORMANCE_API.md`, `GET /me/performance`).
 *
 * GRIDGO counts what happened to the shop's jobs over the last 30 days —
 * late finishes, declines, offers left unanswered, cancellations after
 * accepting, jobs already packed when the rider arrived — and turns the
 * counts into warnings, a written notice for every late finish, and a spell
 * out of Top Pick. Three rules shape every screen built on it:
 *
 * - **Warnings only.** No warning, notice or Top Pick change takes money from
 *   the shop, and every screen says so. Nothing here may name a deduction,
 *   a rate or a fee.
 * - **The words are this app's.** GRIDGO's `message` and its alert body are
 *   written for Operations as well, with the raw order key and tier code in
 *   them, so screens read the record's fields and say them here.
 * - **Top Pick hiding is a demotion, not a ban.** A hidden shop still shows
 *   in a client's other choices, and is still offered first when every shop
 *   that could take the job is hidden too.
 */

export type PerformanceKind =
  | "late_finish"
  | "on_time_finish"
  | "declined"
  | "timed_out"
  | "cancelled"
  | "arrived_packed"
  | "no_fault";

export type PerformanceEvent = {
  id: string;
  orderId: string;
  kind: PerformanceKind;
  /** When it happened. */
  at: string;
  /** The reason on the record: GRIDGO's for a finish, the shop's own for a decline. */
  reason: string;
  tier: LapseTier | null;
  /** The ready-by time a finish was measured against. */
  deadlineAt: string | null;
  /** Open shop time past the ready-by. The exact figure; never rounded for comparison. */
  workingLateMs: number | null;
  exempt: boolean;
  exemptionReason: string | null;
  /** The warnings this incident raised when it happened. */
  warningCodes: string[];
};

export type PerformanceCounts = {
  declines: number;
  timeouts: number;
  lateFinishes: number;
  cancellations: number;
  arrivedPacked: number;
};

export type Performance = {
  asOf: string;
  windowDays: number;
  graceMinutes: number;
  counts: PerformanceCounts;
  /** Operations is looking at the shop's record. A flag, never a suspension. */
  rosterReview: boolean;
  topPick: { hidden: boolean; hiddenUntil: string | null };
  onTime: { completed: number; onTime: number; late: number; rate: number | null };
  /** Warnings recorded in the window, newest first. */
  warnings: PerformanceEvent[];
  /** Every written late-finish notice, newest first. */
  notices: PerformanceEvent[];
};

/** The notification GRIDGO writes for a notice, a warning or a no-fault decision. */
export const PERFORMANCE_ALERT = "supplier_performance_notice";

export const PERFORMANCE_ROUTE = "/performance";

/** The Performance page, opened at one order's notice when there is one. */
export function performanceHref(orderId?: string | null): Href {
  return (orderId ? `${PERFORMANCE_ROUTE}?orderId=${encodeURIComponent(orderId)}` : PERFORMANCE_ROUTE) as Href;
}

const KINDS: readonly PerformanceKind[] = [
  "late_finish",
  "on_time_finish",
  "declined",
  "timed_out",
  "cancelled",
  "arrived_packed",
  "no_fault",
];
const TIERS: readonly LapseTier[] = ["minor", "moderate", "severe"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function normalizeEvent(raw: unknown): PerformanceEvent | null {
  if (!isRecord(raw)) return null;
  const id = text(raw.id);
  const orderId = text(raw.orderId);
  const kind = KINDS.find((candidate) => candidate === raw.kind);
  const at = text(raw.at);
  if (!id || !orderId || !kind || !at) return null;
  const late = typeof raw.workingLateMs === "number" && Number.isFinite(raw.workingLateMs) && raw.workingLateMs >= 0;
  return {
    id,
    orderId,
    kind,
    at,
    reason: text(raw.reason),
    tier: TIERS.find((tier) => tier === raw.tier) ?? null,
    deadlineAt: text(raw.deadlineAt) || null,
    workingLateMs: late ? (raw.workingLateMs as number) : null,
    exempt: raw.exempt === true,
    exemptionReason: text(raw.exemptionReason) || null,
    warningCodes: Array.isArray(raw.warningCodes) ? raw.warningCodes.map(text).filter(Boolean) : [],
  };
}

function events(raw: unknown): PerformanceEvent[] {
  return (Array.isArray(raw) ? raw : []).flatMap((event) => normalizeEvent(event) ?? []);
}

/** `GET /me/performance`, or null when the body is not that shape. */
export function normalizePerformance(body: unknown): Performance | null {
  const raw = isRecord(body) && isRecord(body.performance) ? body.performance : null;
  if (!raw || !isRecord(raw.counts) || !isRecord(raw.topPick) || !isRecord(raw.onTime)) return null;
  const counts = raw.counts;
  const onTime = raw.onTime;
  const rate = typeof onTime.rate === "number" && onTime.rate >= 0 && onTime.rate <= 1 ? onTime.rate : null;
  return {
    asOf: text(raw.asOf),
    windowDays: count(raw.windowDays) || 30,
    graceMinutes: count(raw.graceMinutes) || 60,
    counts: {
      declines: count(counts.declines),
      timeouts: count(counts.timeouts),
      lateFinishes: count(counts.lateFinishes),
      cancellations: count(counts.cancellations),
      arrivedPacked: count(counts.arrivedPacked),
    },
    rosterReview: raw.rosterReview === true,
    topPick: {
      hidden: raw.topPick.hidden === true,
      hiddenUntil: raw.topPick.hidden === true ? text(raw.topPick.hiddenUntil) || null : null,
    },
    onTime: {
      completed: count(onTime.completed),
      onTime: count(onTime.onTime),
      late: count(onTime.late),
      rate,
    },
    warnings: events(raw.warnings),
    notices: events(raw.notices).filter((event) => event.kind === "late_finish"),
  };
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/** "92%", or null when no job has finished in the window. */
export function onTimeRateLabel(performance: Pick<Performance, "onTime">): string | null {
  const { rate } = performance.onTime;
  return rate === null ? null : `${Math.round(rate * 100)}%`;
}

export function onTimeLine(performance: Pick<Performance, "onTime" | "windowDays">): string {
  const { completed, onTime } = performance.onTime;
  if (!completed) return `No finished jobs in the last ${performance.windowDays} days yet.`;
  return `${onTime} of ${completed} finished ${completed === 1 ? "job was" : "jobs were"} ready on time in the last ${performance.windowDays} days.`;
}

/** How the grace window is measured, in the shop's words. */
export function graceLine(graceMinutes: number): string {
  const grace = graceMinutes === 60 ? "an hour" : formatLateness(graceMinutes * 60_000);
  return `A job is on time when it is ready within ${grace} of its ready-by time. Only the hours your shop is open count.`;
}

export type TopPickView = { tone: StatusTone; icon: StatusIconName; label: string; title: string; body: string };

export function topPickView(performance: Pick<Performance, "topPick">): TopPickView {
  if (performance.topPick.hidden) {
    const until = performance.topPick.hiddenUntil;
    return {
      tone: "warning",
      icon: "circle-pause",
      label: "Hidden from Top Pick",
      title: until ? `Back on ${formatDeadlineFull(until)}` : "For seven days",
      body:
        "Clients see another shop as Top Pick first while this lasts. Your listings still show in their other choices, and you are still the Top Pick when no other shop can take the job.",
    };
  }
  return {
    tone: "success",
    icon: "circle-check",
    label: "Shown for Top Pick",
    title: "Nothing is holding your shop back",
    body: "Your shop can be the Top Pick a client sees first whenever it is the best fit for the job.",
  };
}

/** One row per thing GRIDGO counts, in the order a shop meets them on a job. */
export function countRows(counts: PerformanceCounts): { key: keyof PerformanceCounts; label: string; value: number }[] {
  return [
    { key: "timeouts", label: "Offers not answered within the hour", value: counts.timeouts },
    { key: "declines", label: "Offers declined", value: counts.declines },
    { key: "cancellations", label: "Jobs cancelled after accepting", value: counts.cancellations },
    { key: "lateFinishes", label: "Jobs ready late", value: counts.lateFinishes },
    { key: "arrivedPacked", label: "Jobs already packed when the rider arrived", value: counts.arrivedPacked },
  ];
}

/** What each count leads to within the window. GRIDGO's rule, said once here. */
export const PERFORMANCE_RULES: readonly string[] = [
  "3 declined offers: a warning.",
  "2 offers not answered within the hour: a warning. At 3, your shop is hidden from Top Pick for 7 days.",
  "Every job ready late: a written notice. At 2, hidden from Top Pick for 7 days. At 3, Operations reviews your shop.",
  "A job cancelled after accepting: a warning straight away. At 2, Operations reviews your shop.",
  "2 jobs already packed when the rider arrived: a warning.",
];

const WARNING_LABELS: Record<string, string> = {
  late_finish: "Ready late",
  repeated_declines: "Several offers declined",
  repeated_timeouts: "Several offers not answered",
  accepted_order_cancelled: "Cancelled after accepting",
  repeated_arrived_packed: "Packed before the rider arrived",
};

/** A warning's name. An unknown code gets neutral words, never another code's. */
export function warningLabel(code: string): string {
  return WARNING_LABELS[code] ?? "Warning";
}

const KIND_LINES: Record<PerformanceKind, string> = {
  late_finish: "The job was ready after its ready-by time.",
  on_time_finish: "The job was ready on time.",
  declined: "The offer was declined.",
  timed_out: "The offer was not answered within the hour.",
  cancelled: "The job was cancelled after it was accepted.",
  arrived_packed: "The job was already packed when the rider arrived.",
  no_fault: "GRIDGO decided this job was not your shop's fault.",
};

/** What happened, in one sentence. */
export function eventLine(event: Pick<PerformanceEvent, "kind">): string {
  return KIND_LINES[event.kind];
}

const TIER_RANGES: Record<LapseTier, string> = {
  minor: "More than an hour, up to 6 hours",
  moderate: "More than 6 hours, up to a day",
  severe: "More than a day",
};

export type NoticeView = {
  chip: { tone: StatusTone; icon: StatusIconName; label: string };
  /** "Ready 2 hours 15 minutes after its ready-by". */
  lateLine: string;
  deadlineLine: string | null;
  reason: string;
  /** Set when the notice no longer counts. */
  exemptLine: string | null;
};

/** A written late-finish notice: the order, the reason and how late. */
export function noticeView(event: PerformanceEvent): NoticeView {
  const definition = event.tier ? tierDefinition(event.tier) : null;
  const chip = event.exempt
    ? { tone: "neutral" as const, icon: "circle-check" as const, label: "Not counted" }
    : definition
      ? { tone: definition.tone, icon: definition.icon, label: `${definition.label} lateness` }
      : { tone: "warning" as const, icon: "clock" as const, label: "Ready late" };
  const late = event.workingLateMs !== null ? formatLateness(event.workingLateMs) : null;
  const range = event.tier ? ` (${TIER_RANGES[event.tier].toLowerCase()})` : "";
  return {
    chip,
    lateLine: late ? `Ready ${late} of open shop time after its ready-by${range}.` : eventLine(event),
    deadlineLine: event.deadlineAt ? `Ready-by ${formatDeadlineFull(event.deadlineAt)}` : null,
    reason: event.reason,
    exemptLine: event.exempt
      ? `This job does not count toward your warnings or Top Pick${event.exemptionReason ? `: ${event.exemptionReason}` : "."}`
      : null,
  };
}

/** The ids of the notices and warnings that belong to one order. */
export function eventsForOrder(performance: Performance, orderId: string | null | undefined): Set<string> {
  if (!orderId) return new Set();
  return new Set(
    [...performance.notices, ...performance.warnings].filter((event) => event.orderId === orderId).map((event) => event.id),
  );
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

export function isPerformanceAlert(type: string | undefined): boolean {
  return type === PERFORMANCE_ALERT;
}

/**
 * A performance notice in the shop's words, or null when the alert is not one.
 * GRIDGO's body names the raw order key and the tier code; the hours late are
 * read out of it, everything else is said here.
 */
export function presentPerformanceAlert(
  alert: Pick<Notification, "type" | "body">,
): { title: string; body: string } | null {
  if (!isPerformanceAlert(alert.type)) return null;
  const body = alert.body ?? "";
  if (/no-fault event/i.test(body)) {
    return {
      title: "Not counted against your shop",
      body: "GRIDGO decided this job was not your shop's fault. It no longer counts toward your warnings or Top Pick.",
    };
  }
  const hours = /finished ([\d.]+) shop hours after/i.exec(body)?.[1];
  if (hours !== undefined) {
    const late = formatLateness(Number(hours) * 3_600_000);
    return {
      title: "Late-finish notice",
      body: `This job was ready ${late} of open shop time after its ready-by. It is a warning only — no money is taken. Open it to read the notice.`,
    };
  }
  return {
    title: "A warning on your shop's record",
    body: "It is a warning only — no money is taken. Open it to see why, and what it means for Top Pick.",
  };
}
