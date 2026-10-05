import type { Notification, Order, Settings } from "@/lib/api";
import { formatDeadlineFull } from "@/lib/dates";
import { formatPhp } from "@/lib/money";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";

/**
 * Late production, as far as it is this shop's business (gridgo-api
 * `docs/PRODUCTION_PENALTIES_API.md`).
 *
 * GRIDGO measures a job against its ready-by time — the one the shop accepted,
 * or a renewed one the shop and the client agreed — and files one record per
 * late job. The record is always a **warning first**, and it is the only
 * place this app reads lapses, tiers and deductions from. Three rules shape
 * every screen built on it:
 *
 * - **The words are this app's, never the platform's message.** GRIDGO's
 *   warning text carries a raw timestamp and is written for every recipient,
 *   so screens and alerts read the record's fields and say them here.
 * - **A deduction is never more than what was still owed** on that one job,
 *   and nothing carries over. The display is capped too, so a record that
 *   ever disagreed with that rule could not show it.
 * - **Calm, not blame.** Lateness has causes a shop cannot control; the copy
 *   states the fact, how it was measured, what applies and what to do next.
 *   Deductions are a Super Admin switch that starts off, so "warning only" is
 *   a real, common state and is said plainly.
 */

export type LapseTier = "minor" | "moderate" | "severe";

/**
 * `warning_only`: deductions were off when GRIDGO first warned, and stay off
 * for this job. `warned`: a deduction may follow once assessed. `applied`: it
 * was taken. `closed`: a refund or a cancellation closed it without one.
 */
export type LapseStatus = "warning_only" | "warned" | "applied" | "closed";

export type LapseWarning = {
  tier: LapseTier;
  at: string;
  /** Moderate and severe warnings go on the shop's record. */
  formal: boolean;
};

export type ProductionLapse = {
  id: string;
  orderId: string;
  /** The ready-by time lateness was measured against. */
  deadlineAt: string;
  detectedAt: string;
  tier: LapseTier;
  /** The rate for this tier, in basis points (500 = 5%). */
  rateBps: number;
  warnings: LapseWarning[];
  /** What GRIDGO still owed on the job when the deduction was worked out. */
  remainingBalanceMinor: number;
  deductionMinor: number;
  appliedAt: string | null;
  closedAt: string | null;
  reassignmentEligible: boolean;
  status: LapseStatus;
};

const TIERS: readonly LapseTier[] = ["minor", "moderate", "severe"];
const STATUSES: readonly LapseStatus[] = ["warning_only", "warned", "applied", "closed"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function minor(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function tierOf(value: unknown): LapseTier | null {
  return TIERS.find((tier) => tier === value) ?? null;
}

function normalizeLapse(raw: unknown): ProductionLapse | null {
  if (!isRecord(raw)) return null;
  const id = text(raw.id);
  const orderId = text(raw.orderId);
  const tier = tierOf(raw.tier);
  if (!id || !orderId || !tier) return null;
  const appliedAt = text(raw.appliedAt) || null;
  const closedAt = text(raw.closedAt) || null;
  const declared = STATUSES.find((status) => status === raw.status);
  // An older or partial record without a status is read from its own dates.
  const status: LapseStatus =
    declared ?? (appliedAt ? "applied" : closedAt ? "closed" : "warning_only");
  const warnings = (Array.isArray(raw.warnings) ? raw.warnings : []).flatMap((warning) => {
    if (!isRecord(warning)) return [];
    const warningTier = tierOf(warning.tier);
    const at = text(warning.at);
    if (!warningTier || !at) return [];
    return [{ tier: warningTier, at, formal: warning.formal === true || warningTier !== "minor" }];
  });
  return {
    id,
    orderId,
    deadlineAt: text(raw.deadlineAt),
    detectedAt: text(raw.detectedAt),
    tier,
    rateBps: typeof raw.rateBps === "number" && Number.isInteger(raw.rateBps) ? raw.rateBps : 0,
    warnings,
    remainingBalanceMinor: minor(raw.remainingBalanceMinor),
    deductionMinor: minor(raw.deductionMinor),
    appliedAt,
    closedAt,
    reassignmentEligible: raw.reassignmentEligible === true || tier === "severe",
    status,
  };
}

/** `GET /me/production-lapses` in this app's shape, newest first. Null when unreadable. */
export function normalizeLapses(raw: unknown): ProductionLapse[] | null {
  if (!isRecord(raw) || !Array.isArray(raw.lapses)) return null;
  return raw.lapses
    .map(normalizeLapse)
    .filter((lapse): lapse is ProductionLapse => lapse !== null)
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}

/** The record for one job, or null when it was on time (or GRIDGO has not looked yet). */
export function lapseForOrder(
  lapses: readonly ProductionLapse[] | null | undefined,
  orderId: string | null | undefined,
): ProductionLapse | null {
  if (!lapses || !orderId) return null;
  return lapses.find((lapse) => lapse.orderId === orderId) ?? null;
}

// ---------------------------------------------------------------------------
// Tiers and rates
// ---------------------------------------------------------------------------

export type TierDefinition = {
  tier: LapseTier;
  label: string;
  /** How late, in the shop's words. */
  range: string;
  tone: StatusTone;
  icon: StatusIconName;
};

/** Every tier, in order. The bands GRIDGO classifies by (`latenessTier`). */
export const LATENESS_TIERS: readonly TierDefinition[] = [
  { tier: "minor", label: "Minor", range: "Up to 6 hours late", tone: "warning", icon: "clock" },
  { tier: "moderate", label: "Moderate", range: "6 to 24 hours late", tone: "warning", icon: "triangle-alert" },
  {
    tier: "severe",
    label: "Severe",
    range: "Over 24 hours late, or late with no word to GRIDGO",
    tone: "error",
    icon: "triangle-alert",
  },
];

export function tierDefinition(tier: LapseTier): TierDefinition {
  return LATENESS_TIERS.find((definition) => definition.tier === tier) ?? LATENESS_TIERS[0];
}

/** "5%", "12.5%". Basis points are GRIDGO's unit; a shop reads percent. */
export function formatRate(bps: number): string {
  const percent = bps / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1).replace(/\.0$/, "")}%`;
}

export type PenaltyRates = {
  /** False while Super Admin has deductions switched off: warnings only. */
  deductionsEnabled: boolean;
  rates: Record<LapseTier, number>;
};

/** The current policy from `GET /settings`, or null on an API older than penalties. */
export function penaltyRates(settings: Pick<Settings, "productionPenalty"> | null | undefined): PenaltyRates | null {
  const policy = settings?.productionPenalty;
  if (!policy) return null;
  const valid = (bps: unknown): bps is number => typeof bps === "number" && Number.isInteger(bps) && bps >= 0;
  if (!valid(policy.minorBps) || !valid(policy.moderateBps) || !valid(policy.severeBps)) return null;
  return {
    deductionsEnabled: policy.deductionsEnabled === true,
    rates: { minor: policy.minorBps, moderate: policy.moderateBps, severe: policy.severeBps },
  };
}

// ---------------------------------------------------------------------------
// One late job, in words
// ---------------------------------------------------------------------------

/** "3 hours 20 minutes", "2 days 4 hours", "45 minutes". */
export function formatLateness(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (days > 0) return hours > 0 ? `${part(days, "day")} ${part(hours, "hour")}` : part(days, "day");
  if (hours > 0) return mins > 0 ? `${part(hours, "hour")} ${part(mins, "minute")}` : part(hours, "hour");
  return part(mins, "minute");
}

/**
 * What came off, capped at what was still owed. GRIDGO already caps it; the
 * screen does too, because "never more than what is still owed" is a promise
 * this app makes in words right beside the figure.
 */
export function cappedDeductionMinor(lapse: Pick<ProductionLapse, "deductionMinor" | "remainingBalanceMinor">): number {
  return Math.min(lapse.deductionMinor, lapse.remainingBalanceMinor);
}

export type DeductionView = {
  /** What GRIDGO still owed on the job when it was worked out. */
  owedBeforeMinor: number;
  deductionMinor: number;
  /** What is left to come on the job after the deduction. */
  owedAfterMinor: number;
  rate: string;
};

export type LapseNotice = {
  chipLabel: string;
  tone: StatusTone;
  icon: StatusIconName;
  tier: LapseTier;
  title: string;
  /** How late, and measured against what. */
  measured: string;
  /** What applies for this tier, in this record's state. */
  penalty: string;
  /** Present once a deduction was taken. */
  deduction: DeductionView | null;
  /** The record and ranking consequences, one sentence each. */
  consequences: string[];
  /** What the shop can do now. */
  next: string;
};

type LapseOrder = Pick<Order, "readyBy" | "readyAt" | "productionReassignmentEligible">;

/**
 * The panel a late job carries, from the record and the live job.
 *
 * `now` only matters while the job is unfinished: how late it is keeps
 * growing until the shop marks it ready, and then it is fixed.
 *
 * `held` is a job the shop has been told to stop — a declined deadline, a
 * refund. The record still stands, but "finish the job" would contradict the
 * hold drawn above it, so the next step yields to it.
 */
export function lapseNotice(
  lapse: ProductionLapse,
  order: LapseOrder,
  now: Date = new Date(),
  held = false,
): LapseNotice {
  const definition = tierDefinition(lapse.tier);
  const finished = Boolean(order.readyAt);
  const deadline = Date.parse(lapse.deadlineAt);
  const end = finished ? Date.parse(order.readyAt as string) : now.getTime();
  const lateMs = Number.isFinite(deadline) && Number.isFinite(end) ? end - deadline : NaN;
  const howLate = lateMs > 0 ? formatLateness(lateMs) : null;

  // A record measured against a time other than the job's own ready-by is a
  // renewed one the shop and the client agreed. Say which, so the shop can
  // check the arithmetic against the date it remembers.
  const original = order.readyBy ? Date.parse(order.readyBy) : NaN;
  const renewed = Number.isFinite(original) && Number.isFinite(deadline) && original !== deadline;
  const against = renewed
    ? `the renewed ready-by time you agreed with the client, ${formatDeadlineFull(lapse.deadlineAt)}`
    : `the ready-by time on this job, ${formatDeadlineFull(lapse.deadlineAt)}`;
  const measured = howLate
    ? `${finished ? "Ready" : "Now"} ${howLate} ${finished ? "after" : "past"} ${against}.`
    : `Measured against ${against}.`;

  const rate = formatRate(lapse.rateBps);
  const share = `${rate} of what GRIDGO still owes you on this job`;
  // Unfinished and below severe, the tier — and its rate — can still rise.
  const canRise = !finished && lapse.tier !== "severe" && lapse.status !== "closed" && lapse.status !== "applied";

  let penalty: string;
  let deduction: DeductionView | null = null;
  switch (lapse.status) {
    case "warning_only":
      penalty = `This is a warning only — nothing comes off your payout for this job. When deductions apply, ${definition.label.toLowerCase()} lateness takes ${share}.`;
      break;
    case "warned":
      // Severe is worked out straight away; any other tier once the job is ready.
      penalty = `${share[0].toUpperCase()}${share.slice(1)} comes off once GRIDGO works it out${
        finished || lapse.tier === "severe" ? "" : ", after the job is ready"
      }. Never more than what is still owed, and nothing carries over to another job.`;
      break;
    case "applied": {
      const taken = cappedDeductionMinor(lapse);
      deduction = {
        owedBeforeMinor: lapse.remainingBalanceMinor,
        deductionMinor: taken,
        owedAfterMinor: lapse.remainingBalanceMinor - taken,
        rate,
      };
      penalty = `${formatPhp(taken)} came off what GRIDGO still owed you on this job. Money already sent to you was not touched, and nothing carries over to another job.`;
      break;
    }
    case "closed":
      penalty = "This record was closed without a deduction, because the job was cancelled or settled.";
      break;
  }

  const consequences: string[] = [];
  if (lapse.tier !== "minor" && lapse.status !== "closed") {
    consequences.push("A formal warning is on your shop's record.");
  }
  if (lapse.status !== "closed") {
    consequences.push("Jobs ready late in the last 30 days lower your place when GRIDGO matches clients with shops.");
  }
  if (!finished && lapse.status !== "closed" && (lapse.reassignmentEligible || order.productionReassignmentEligible)) {
    consequences.push("Operations may now hand this job to another shop.");
  }
  if (canRise) {
    consequences.push(
      lapse.tier === "minor"
        ? "Past 6 hours late it becomes moderate, with a larger share."
        : "Past 24 hours late it becomes severe, with a larger share.",
    );
  }

  return {
    chipLabel: `${definition.label} lateness`,
    tone: definition.tone,
    icon: definition.icon,
    tier: lapse.tier,
    title: lapse.status === "closed" ? "This job was late" : finished ? "This job was ready late" : "This job is past its ready-by time",
    measured,
    penalty,
    deduction,
    consequences,
    next:
      lapse.status === "closed"
        ? "Nothing more is needed from your shop on this."
        : finished
          ? "If something outside your shop caused the delay, tell Operations from this job."
          : held
            ? "Work on this job is on hold, so there is nothing to finish for now. Follow the note above; this record stays as it is."
            : "Finish the job and mark it ready. If something outside your shop is holding it up, tell Operations now.",
  };
}

/** One line for a list of late jobs: where the record stands. */
export function lapseStandingLine(lapse: ProductionLapse): string {
  switch (lapse.status) {
    case "warning_only":
      return "Warning only, no deduction";
    case "warned":
      return `${formatRate(lapse.rateBps)} to come off, once worked out`;
    case "applied":
      return `${formatPhp(cappedDeductionMinor(lapse))} off ${formatPhp(lapse.remainingBalanceMinor)} still owed`;
    case "closed":
      return "Closed, no deduction";
  }
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

export const LAPSE_WARNING_ALERT = "production_lapse_warning";
export const LAPSE_DEDUCTION_ALERT = "production_lapse_deduction";

export function isLapseAlert(type: string | undefined): boolean {
  return type === LAPSE_WARNING_ALERT || type === LAPSE_DEDUCTION_ALERT;
}

/**
 * A late-production notice in the shop's words, or null when the alert is not
 * one. GRIDGO's body names the tier and the amount, so those are read out of
 * it; everything else is said here, without the raw timestamp it carries.
 */
export function presentLapseAlert(
  alert: Pick<Notification, "type" | "body">,
): { title: string; body: string } | null {
  if (alert.type === LAPSE_WARNING_ALERT) {
    const tier = tierOf(/\bthis is (minor|moderate|severe) lateness\b/i.exec(alert.body ?? "")?.[1]?.toLowerCase());
    const warningOnly = /\bwarning only\b/i.test(alert.body ?? "");
    const label = tier ? tierDefinition(tier).label : null;
    return {
      title: label ? `Late production: ${label.toLowerCase()}` : "Late production warning",
      body: `This job is past its ready-by time. ${
        warningOnly ? "This is a warning only — nothing comes off your payout. " : ""
      }Open it to see how it was measured and what applies.`,
    };
  }
  if (alert.type === LAPSE_DEDUCTION_ALERT) {
    const amount = /deduction of (.+?) was applied/i.exec(alert.body ?? "")?.[1]?.trim();
    return {
      title: "Late production deduction",
      body: `${amount ? `${amount} came off` : "A deduction came off"} what GRIDGO still owes you on this job. Nothing carries over to another job.`,
    };
  }
  return null;
}
